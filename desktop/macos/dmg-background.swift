// Draws the background of the Badr installer window (Badr.dmg): Badr's cream, a soft arrow from the app
// to the Applications folder, and one line telling you what to do. Writes a 1x and a 2x PNG.
//   swift desktop/macos/dmg-background.swift <out-dir>
import AppKit

let out = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "."
let size = NSSize(width: 640, height: 400)

func draw(scale: CGFloat, to path: String) {
    let px = NSSize(width: size.width * scale, height: size.height * scale)
    guard let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(px.width), pixelsHigh: Int(px.height), bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0) else { return }
    rep.size = size
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)

    // Cream ground with a faint dot grid, like the website.
    NSColor(srgbRed: 0.992, green: 0.965, blue: 0.925, alpha: 1).setFill()
    NSRect(origin: .zero, size: size).fill()
    NSColor(srgbRed: 0.87, green: 0.80, blue: 0.70, alpha: 0.35).setFill()
    var y: CGFloat = 12
    while y < size.height { var x: CGFloat = 12; while x < size.width { NSBezierPath(ovalIn: NSRect(x: x, y: y, width: 2.2, height: 2.2)).fill(); x += 22 }; y += 22 }

    // Arrow between the two icons (icons sit at x 170 and 470, y 190 from the top).
    let midY = size.height - 190
    let clay = NSColor(srgbRed: 0.71, green: 0.29, blue: 0.20, alpha: 1)
    clay.setStroke()
    let shaft = NSBezierPath()
    shaft.lineWidth = 5; shaft.lineCapStyle = .round
    shaft.move(to: NSPoint(x: 262, y: midY)); shaft.line(to: NSPoint(x: 372, y: midY))
    shaft.stroke()
    let head = NSBezierPath()
    head.lineWidth = 5; head.lineCapStyle = .round; head.lineJoinStyle = .round
    head.move(to: NSPoint(x: 352, y: midY + 18)); head.line(to: NSPoint(x: 376, y: midY)); head.line(to: NSPoint(x: 352, y: midY - 18))
    head.stroke()

    // The instruction.
    let para = NSMutableParagraphStyle(); para.alignment = .center
    let title: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 22, weight: .heavy), .foregroundColor: NSColor(srgbRed: 0.13, green: 0.11, blue: 0.09, alpha: 1), .paragraphStyle: para]
    let sub: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 13, weight: .semibold), .foregroundColor: NSColor(srgbRed: 0.42, green: 0.37, blue: 0.32, alpha: 1), .paragraphStyle: para]
    NSAttributedString(string: "Drag Badr into Applications", attributes: title).draw(in: NSRect(x: 0, y: size.height - 84, width: size.width, height: 34))
    NSAttributedString(string: "Then open it from Applications or Launchpad.", attributes: sub).draw(in: NSRect(x: 0, y: 46, width: size.width, height: 22))

    NSGraphicsContext.restoreGraphicsState()
    try? rep.representation(using: .png, properties: [:])?.write(to: URL(fileURLWithPath: path))
}

draw(scale: 1, to: "\(out)/background.png")
draw(scale: 2, to: "\(out)/background@2x.png")
print("wrote \(out)/background.png and background@2x.png")
