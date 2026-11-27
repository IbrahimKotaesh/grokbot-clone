import AVFoundation
import ExpoModulesCore

/// Live call audio for Badr. One AVAudioEngine with Apple's voice processing (echo cancellation, so Badr
/// never hears itself through the speaker): the mic is converted to mono PCM16 at the call's sample rate
/// and sent to JS as base64 frames; base64 PCM16 chunks from the voice service are queued on a player node.
public class BadrVoiceModule: Module {
  private var engine: AVAudioEngine?
  private var player: AVAudioPlayerNode?
  private var converter: AVAudioConverter?
  private var micFormat = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 24000, channels: 1, interleaved: true)!
  private var playFormat = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 24000, channels: 1, interleaved: false)!
  private let lock = NSLock()
  private var muted = false
  private var micLevel: Float = 0
  private var outLevel: Float = 0
  private var pending = 0
  private var generation = 0
  private var micChunk = Data()
  private var observers: [NSObjectProtocol] = []

  public func definition() -> ModuleDefinition {
    Name("BadrVoice")
    Events("onAudio", "onPlaybackIdle", "onInterrupted")

    AsyncFunction("start") { (sampleRate: Double) throws -> [String: Any] in
      try self.startEngine(sampleRate: sampleRate > 0 ? sampleRate : 24000)
    }
    Function("play") { (b64: String) in self.play(b64) }
    Function("clear") { self.clearPlayback() }
    Function("setMuted") { (m: Bool) in
      self.lock.lock(); self.muted = m; self.micChunk.removeAll(); if m { self.micLevel = 0 }; self.lock.unlock()
    }
    Function("setSpeaker") { (on: Bool) in
      try? AVAudioSession.sharedInstance().overrideOutputAudioPort(on ? .speaker : .none)
    }
    Function("levels") { () -> [String: Any] in
      self.lock.lock(); defer { self.lock.unlock() }
      return ["mic": self.micLevel, "out": self.outLevel, "playing": self.pending > 0]
    }
    Function("stop") { self.stopEngine() }
    OnDestroy { self.stopEngine() }
  }

  // MARK: - engine

  private func startEngine(sampleRate: Double) throws -> [String: Any] {
    stopEngine()
    let session = AVAudioSession.sharedInstance()
    try session.setCategory(.playAndRecord, mode: .voiceChat, options: [AVAudioSession.CategoryOptions(rawValue: 0x4)]) // 0x4 = Bluetooth headsets (HFP)
    try? session.setPreferredIOBufferDuration(0.02)
    try session.setActive(true)
    try? session.overrideOutputAudioPort(.speaker)

    micFormat = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: sampleRate, channels: 1, interleaved: true)!
    playFormat = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: sampleRate, channels: 1, interleaved: false)!

    let engine = AVAudioEngine()
    let input = engine.inputNode
    var voiceProcessing = false
    do { try input.setVoiceProcessingEnabled(true); voiceProcessing = true } catch { NSLog("[BadrVoice] voice processing unavailable: \(error)") }

    let player = AVAudioPlayerNode()
    engine.attach(player)
    engine.connect(player, to: engine.mainMixerNode, format: playFormat)

    let inFormat = input.outputFormat(forBus: 0)
    guard inFormat.sampleRate > 0, inFormat.channelCount > 0 else {
      throw Exception(name: "NoMicrophone", description: "No microphone is available.")
    }
    guard let conv = AVAudioConverter(from: inFormat, to: micFormat) else {
      throw Exception(name: "NoConverter", description: "Can't convert microphone audio.")
    }
    if inFormat.channelCount > 1 { conv.channelMap = [0] }
    converter = conv

    input.installTap(onBus: 0, bufferSize: 1024, format: inFormat) { [weak self] buf, _ in self?.onMic(buf) }
    player.installTap(onBus: 0, bufferSize: 1024, format: nil) { [weak self] buf, _ in self?.onOut(buf) }

    engine.prepare()
    try engine.start()
    player.play()
    self.engine = engine
    self.player = player
    lock.lock(); muted = false; micLevel = 0; outLevel = 0; pending = 0; generation += 1; micChunk.removeAll(); lock.unlock()

    let nc = NotificationCenter.default
    observers.append(nc.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: nil) { [weak self] _ in
      guard let self, let engine = self.engine, !engine.isRunning else { return }
      try? engine.start()
      self.player?.play()
    })
    observers.append(nc.addObserver(forName: AVAudioSession.interruptionNotification, object: session, queue: nil) { [weak self] note in
      let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
      if raw == AVAudioSession.InterruptionType.began.rawValue { self?.sendEvent("onInterrupted", [:]) }
    })
    return ["voiceProcessing": voiceProcessing, "inputRate": inFormat.sampleRate]
  }

  private func stopEngine() {
    for o in observers { NotificationCenter.default.removeObserver(o) }
    observers.removeAll()
    guard let engine else { return }
    engine.inputNode.removeTap(onBus: 0)
    player?.removeTap(onBus: 0)
    player?.stop()
    engine.stop()
    self.engine = nil
    player = nil
    converter = nil
    lock.lock(); pending = 0; generation += 1; micLevel = 0; outLevel = 0; lock.unlock()
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }

  // MARK: - mic → JS

  private func onMic(_ buf: AVAudioPCMBuffer) {
    guard let converter else { return }
    let ratio = micFormat.sampleRate / buf.format.sampleRate
    let cap = AVAudioFrameCount(Double(buf.frameLength) * ratio + 64)
    guard let out = AVAudioPCMBuffer(pcmFormat: micFormat, frameCapacity: cap) else { return }
    var fed = false
    var err: NSError?
    converter.convert(to: out, error: &err) { _, status in
      if fed { status.pointee = .noDataNow; return nil }
      fed = true
      status.pointee = .haveData
      return buf
    }
    guard err == nil, out.frameLength > 0, let samples = out.int16ChannelData?[0] else { return }
    let n = Int(out.frameLength)
    var sum: Float = 0
    for i in 0..<n { let v = Float(samples[i]) / 32768; sum += v * v }
    let level = min(1, sqrtf(sum / Float(n)) * 5)

    lock.lock()
    if muted { micLevel = 0; lock.unlock(); return }
    micLevel = max(level, micLevel * 0.7)
    micChunk.append(Data(bytes: samples, count: n * 2))
    // ~40 ms per frame, like the web client.
    let frameBytes = Int(micFormat.sampleRate * 0.04) * 2
    var ready: Data?
    if micChunk.count >= frameBytes { ready = micChunk; micChunk = Data() }
    lock.unlock()
    if let ready { sendEvent("onAudio", ["data": ready.base64EncodedString()]) }
  }

  // MARK: - JS → speaker

  private func play(_ b64: String) {
    guard let player, let data = Data(base64Encoded: b64), data.count >= 2 else { return }
    let n = data.count / 2
    guard let buf = AVAudioPCMBuffer(pcmFormat: playFormat, frameCapacity: AVAudioFrameCount(n)), let dst = buf.floatChannelData?[0] else { return }
    buf.frameLength = AVAudioFrameCount(n)
    data.withUnsafeBytes { raw in
      let src = raw.bindMemory(to: Int16.self)
      for i in 0..<n { dst[i] = Float(Int16(littleEndian: src[i])) / 32768 }
    }
    lock.lock(); pending += 1; let gen = generation; lock.unlock()
    player.scheduleBuffer(buf, completionCallbackType: .dataPlayedBack) { [weak self] _ in
      guard let self else { return }
      self.lock.lock()
      var idle = false
      if gen == self.generation { self.pending = max(0, self.pending - 1); idle = self.pending == 0 }
      self.lock.unlock()
      if idle { self.sendEvent("onPlaybackIdle", [:]) }
    }
    if !player.isPlaying { player.play() }
  }

  private func clearPlayback() {
    lock.lock(); let had = pending > 0; pending = 0; generation += 1; outLevel = 0; lock.unlock()
    player?.stop()
    player?.play()
    if had { sendEvent("onPlaybackIdle", [:]) }
  }

  private func onOut(_ buf: AVAudioPCMBuffer) {
    guard let s = buf.floatChannelData?[0], buf.frameLength > 0 else { return }
    let n = Int(buf.frameLength)
    var sum: Float = 0
    for i in 0..<n { sum += s[i] * s[i] }
    let level = min(1, sqrtf(sum / Float(n)) * 4)
    lock.lock(); outLevel = max(level, outLevel * 0.7); lock.unlock()
  }
}
