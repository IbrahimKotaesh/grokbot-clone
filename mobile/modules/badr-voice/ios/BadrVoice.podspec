Pod::Spec.new do |s|
  s.name           = 'BadrVoice'
  s.version        = '1.0.0'
  s.summary        = 'Live voice-call audio for Badr: 24 kHz PCM16 mic frames in, PCM chunks out, with echo cancellation.'
  s.description    = s.summary
  s.author         = ''
  s.homepage       = 'https://finobots.com'
  s.license        = 'MIT'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.{h,m,mm,swift}'
end
