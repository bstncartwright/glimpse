Output assets/glimpse-demo.mp4
Output assets/glimpse-demo.gif

Require bun
Require vhs
Require ttyd
Require ffmpeg

Set Shell "zsh"
Set FontFamily "Menlo"
Set FontSize 18
Set Width 1440
Set Height 900
Set Padding 24
Set Framerate 30
Set TypingSpeed 35ms
Set Theme "Catppuccin Mocha"

Sleep 500ms
Type "bun run src/index.ts --file fixtures/large-varied-sample.diff"
Sleep 400ms
Enter
Wait+Screen /glimpse/
Sleep 1800ms

Type "}"
Sleep 900ms
Type "}"
Sleep 900ms
Type "w"
Sleep 900ms

Tab
Sleep 900ms
Tab
Sleep 900ms
Type "c"
Sleep 800ms

Type "s"
Sleep 1200ms
Type "i"
Sleep 900ms
Type "W"
Sleep 1100ms

Type "?"
Sleep 1600ms
Type "q"
Sleep 900ms

Type "G"
Sleep 1000ms
Type "g"
Sleep 100ms
Type "g"
Sleep 900ms
Type "q"
Sleep 500ms
