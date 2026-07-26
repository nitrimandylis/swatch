# rice — multi-theme switcher

Turn this repo from a one-theme docs folder into a switcher. Batman Jazz becomes
theme one of many. `rice` is a compiled Bun CLI following the same shape as
`juke`, `dt`, and `jazz`.

## Decisions

| # | Decision | Why |
|---|---|---|
| 1 | Switcher, not archive | the point is authoring several rices |
| 2 | Explicit palette schema, nothing derived | hand-tuned green/cyan aren't in the image; taste beats a formula |
| 3 | Hybrid apply: pointer flip, migrate-then-flip, marker injection | one mechanism per surface class |
| 4 | rice owns theme files + one pointer line; `dt` owns the rest | minimal overlap between two writers |
| 5 | Theme = colors + wallpaper | palette is derived *from* the wallpaper |
| 6 | Compiled Bun CLI, zero runtime deps | matches juke/dt/jazz; Bun imports TOML natively |
| 7 | Regex line replacement, hard-fail unless exactly 1 match | zed/vscode settings are JSONC; parsing destroys comments |
| 8 | Hardcoded surface table, `dt backup` before writing | manifest stores dirs, rice needs files and lines |
| 9 | Variant-aware (dark/light) from the start | dark assumptions fail silently, not loudly |
| 10 | Explicit `on_fill`; variant drives 4 literals | contrast math would pick inconsistent text on adjacent pills |
| 11 | `background-opacity` optional per-theme key | it tracks the wallpaper, not the eye |
| 12 | `rice new <name> <image>` scaffolds, marks accent TODO | extraction recovers structure, never identity |
| 13 | All 14 surfaces, commit per step | full coverage, checkpointed |
| 14 | Repo owns the wallpaper file | scaffolding needs guaranteed local read; Drive evicts cold files |
| 15 | `new` / `use` / `list` / `status` | `dt diff` and `dt undo` already exist; don't wrap them |
| 16 | Global README + PRODUCT.md, generated per-theme pages | hand-written palette docs already drifted |
| 17 | Risk-first build order | first 4 commits prove all 3 mechanisms |

## Layout

```
rice/
  rice.ts              # entry: new | use | list | status
  surfaces.ts          # the per-surface table (split if rice.ts grows)
  rice.test.ts         # pure logic: hex conv, BMP parse, chroma rank, regex match
  package.json         # bin: rice, script: compile
  man/rice.1           # hand-written roff
  README.md            # banner, badges, Run it, Under the hood
  PRODUCT.md
  SHOWCASE.md          # pane grid — theme-independent, stays global
  LICENSE              # MIT
  themes/
    batman-jazz/
      palette.toml     # source of truth
      wallpaper.jpg
      README.md        # GENERATED swatch table — never hand-edit
      screenshots/
```

`package.json` per the shipping convention:

```json
{
  "name": "rice",
  "version": "0.1.0",
  "private": true,
  "license": "MIT",
  "bin": { "rice": "./rice.ts" },
  "scripts": {
    "compile": "bun build --compile rice.ts --outfile ~/.bun/bin/rice && mkdir -p $(brew --prefix)/share/man/man1 && cp man/rice.1 $(brew --prefix)/share/man/man1/"
  },
  "devDependencies": { "@types/bun": "^1.3.14" }
}
```

## Palette schema

```toml
[meta]
name = "Batman Jazz"          # display name — zed, vscode, vicinae labels
variant = "dark"              # dark | light — drives 4 literals
description = "Near-black room, steel-blue midtones, a neon-pink bat-signal accent."

[roles]
base     = "#09090b"
surface  = "#122031"
overlay  = "#294a6d"
text     = "#c5d3e0"
muted    = "#5f7897"
accent   = "#e85a9c"
deep     = "#8f2a3a"          # was `crimson` — renamed to a role, not an image fact
on_fill  = "#09090b"          # text sitting on any saturated fill

[extras]
orange   = "#cf8a5a"          # vicinae needs it; was undocumented before

[ansi]
black   = ["#20252f", "#5f7897"]   # [normal, bright]
red     = ["#a23a4a", "#c85566"]
green   = ["#7d9b6f", "#94b586"]
yellow  = ["#c9a76a", "#dcc088"]
blue    = ["#4e749e", "#678dae"]
magenta = ["#b06a8f", "#e85a9c"]
cyan    = ["#4a8f9e", "#67aab8"]
white   = ["#c5d3e0", "#e8eef5"]

[render]
opacity = 0.92                # optional; defaults by variant
```

Rice refuses to apply a palette containing `TODO`.

## Surfaces

| Surface | Mechanism | Writes | Pointer |
|---|---|---|---|
| p10k | free | — | inherits ghostty ANSI |
| fastfetch | free | — | inherits ghostty ANSI (0 hex in config) |
| ghostty | migrate → flip | `~/.config/ghostty/themes/<slug>` | `theme = <slug>` |
| btop | flip | `~/.config/btop/themes/<slug>.theme` | `color_theme = "<slug>"` |
| glow | flip | `~/.config/glow/<slug>.json` | `style: "<path>"` in glow.yml |
| zed | flip | `~/.config/zed/themes/<slug>.json` | `"dark": "<Name>"` (JSONC) |
| vscode | flip | `~/.vscode/extensions/<slug>-theme/{package.json,themes/<slug>-color-theme.json}` | `"workbench.colorTheme": "<Name>"` (JSONC) |
| vicinae | flip | `~/.local/share/vicinae/themes/<slug>.toml` | `theme.dark.name` |
| yazi | migrate → flip | `~/.config/yazi/flavors/<slug>.yazi/` | `[flavor] dark = "<slug>"` |
| sketchybar | migrate → flip | `~/.config/sketchybar/colors/<slug>.sh` | `source` line in colors.sh |
| cava | inject | `~/.config/cava/config` `[color]` | — |
| lazygit | inject | `~/.config/lazygit/config.yml` | — |
| borders | inject | `~/.config/borders/bordersrc` | — |
| zen | inject | `<profile>/user.js` + `chrome/userChrome.css` | — |
| wallpaper | osascript | — | `set picture of every desktop` |

Encodings: bare hex (ghostty `background`), `#rrggbb` (most), `0xAARRGGBB`
(borders, sketchybar). One formatter each.

Variant literals: zed `appearance`, vscode `uiTheme` (`vs-dark`/`vs`), vicinae
`variant`, glow style pair.

## Build order

Commit each step. `dt backup` before the first write of each.

1. Scaffold: `rice.ts` skeleton, `package.json`, `man/rice.1`, LICENSE, `themes/batman-jazz/{palette.toml,wallpaper.jpg}`
2. **ghostty** — migrate inline palette to `themes/<slug>`, add `theme =`. Unlocks p10k + fastfetch free.
3. **btop** — plain pointer flip
4. **borders** — marker injection, 3 values, smallest possible test
5. **wallpaper** — osascript
   — *all three mechanisms proven; the rest is repetition* —
6. sketchybar, yazi — remaining migrations
7. glow, vscode, zed, vicinae — pointer flips
8. cava, lazygit — injection
9. zen — last: profile-path resolution, needs browser restart
10. `status`, `list`, `new` (sips → BMP → chroma rank)
11. Docs: generated per-theme pages, README + PRODUCT.md, delete `PALETTE.md` + `vicinae/` + `zed/` + `vscode/`

## Drift to fix in passing

| Bug | Step |
|---|---|
| Zed `theme_overrides` keyed `"Nord Dark"`, active theme is `"Batman Jazz"` — 40 dead lines | 7 |
| Vicinae theme documented as symlinked; `~/.local/share/vicinae/themes/` does not exist | 7 |
| `~/Developer/rice` in ghostty, sketchybar, yazi comments | as touched |
| README's VS Code row describes `colorCustomizations`, removed some time ago | 11 |
| Five screenshots named `Screenshot 2026-07-11 at 8.50.04 PM.png` — name or drop | 11 |

## Verified facts

- Bun 1.3.10 imports TOML natively. Zero deps.
- `sips -s format bmp -Z 96` + Bun `DataView` reads pixels with no image library.
  BMP height is negative (top-down); rows pad to 4 bytes.
- Rank candidates by **absolute chroma with a brightness floor**. `(max-min)/max`
  returns near-black pixels first.
- Extraction against `batman jazz.jpg`: base distance 0, deep 8, text 20,
  **accent 67**. The pink is not in the image. Scaffold structure, TODO identity.
- macOS 26.5.2 honours `osascript ... set picture of every desktop`. Two displays,
  handled by `every desktop`.
- Repo and Drive wallpaper copies are currently identical (`f4ae255f…`).

## Deferred / known gaps

- `~/.vscode/extensions/` is not in dovetail's manifest — theme extension is unversioned.
- VS Code and Zen both need an app restart to pick up a new theme. Rice should say so, not fake it.
- Light themes are supported by the schema but untested until one exists.
- No remote. Publishing runs `publish-repo` (README + LICENSE first).
