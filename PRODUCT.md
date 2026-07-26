# rice

## What it is

A CLI that applies one palette across every themed surface on a macOS desktop.
A theme is a directory: `palette.toml` plus a wallpaper. `rice use <theme>`
writes thirteen surfaces from it.

The problem it solves is duplication. Before this, the hex `#e85a9c` appeared in
fourteen config files, and changing it meant finding all fourteen. Now it
appears once.

## Where it came from

Started as a docs folder for a single hand-tuned theme called Batman Jazz, with
a `PALETTE.md` table that had already drifted out of sync with the configs it
described. The switcher exists so that drift is structurally impossible: every
color document is generated, including the per-theme README.

## Principles

- **Rice owns theme files and one pointer line. Dovetail owns the configs.**
  The two writers overlap as little as possible, so `dt undo <app>` always works.
- **Hard-fail over guess.** A pointer edit that matches zero or two lines is an
  error. Silently editing the wrong line is worse than stopping.
- **Extraction recovers structure, never identity.** `rice new` reads the
  wallpaper for base/surface/overlay/muted/text/deep and leaves the accent as
  `TODO`. The loudest color in a rice is a decision, not a measurement.
- **Explicit palette, nothing derived.** Hand-tuned green and cyan are not in
  the Batman Jazz image at all. Taste beats a color formula.
- **Say what needs a restart.** VS Code and Zen only pick up a theme after
  relaunching; borders needs a service restart. Rice prints that rather than
  pretending it applied.

## State

Working. Thirteen surfaces, one theme, 28 tests, compiled to `~/.bun/bin/rice`.

| surface | mechanism |
|---|---|
| ghostty, btop, glow, zed, vscode, vicinae, yazi | pointer flip |
| borders, cava, lazygit, zen | marker injection |
| wallpaper | osascript |
| p10k, fastfetch | free, inherit terminal ANSI |

## Known gaps

- **Only one finished theme.** Light variants are supported by the schema and
  untested until one exists.
- **`~/.vscode/extensions/` is not in dovetail's manifest**, so the generated
  theme extension is unversioned. `dt add` would fix it.
- **Vicinae isn't installed** on this machine, so that surface has never run
  against a real app. It skips cleanly.
- **`replaceInBlock` stops at the first `}`**, which is correct for flat JSON
  blocks only. Nested blocks would need brace counting.
- **`deep` extraction picks maximum chroma in the lower luminance half**, which
  found a blue in the Batman Jazz wallpaper where the hand-tuned palette chose
  crimson. Both are defensible; the human overrides.

## Next

- A second theme, ideally light, to prove the variant literals.
- `dt add vscode ~/.vscode/extensions` so the theme extension is versioned.
- Publish: `publish-repo` (README and LICENSE both exist).
