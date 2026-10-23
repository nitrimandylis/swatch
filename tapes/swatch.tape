# The README hero. Record with:  vhs tapes/swatch.tape   (from the repo root)
# Runs against tapes/fixture.ts, not your real machine: a fake HOME with three
# synthetic themes and a few app configs, plus stub osascript/defaults/yabai
# first on PATH. Only read-only commands are shown (list, status), so nothing
# is written or reloaded either way.
# Terminal settings match ghostty on the machine this was shot on:
# Cascadia Code NF at 19, padding 12, swatch theme creation.
Output .github/assets/swatch.gif
Set Shell "zsh"
Set FontFamily "Cascadia Code NF"
Set FontSize 19
Set Width 1200
Set Height 630
Set Padding 12
Set TypingSpeed 55ms
Set Theme { "name": "creation", "background": "#000000", "foreground": "#d6d6d6", "cursor": "#ffffff", "selection": "#1c1c1c", "black": "#1c1c1c", "red": "#d07a7a", "green": "#8fae86", "yellow": "#cdb27a", "blue": "#7f9bb8", "magenta": "#b391a8", "cyan": "#82adad", "white": "#b3b3b3", "brightBlack": "#4d4d4d", "brightRed": "#e39a9a", "brightGreen": "#a8c69f", "brightYellow": "#e0c895", "brightBlue": "#9db6cf", "brightMagenta": "#c9abbf", "brightCyan": "#9fc5c5", "brightWhite": "#ffffff" }

Hide
Type "SWATCH=$PWD && bun tapes/fixture.ts > /dev/null && export HOME=$SWATCH/tapes/fixtures/home && export PATH=$HOME/bin:$PATH && swatch() { bun $SWATCH/swatch.ts $@ } && export PS1='%F{5}❯%f ' && cd ~ && clear"
Enter
Sleep 3s
Show

Type "swatch list"
Sleep 500ms
Enter
Sleep 2s

Type "swatch status ember | grep -v 'not set up'"
Sleep 500ms
Enter
Sleep 4s
