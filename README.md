# rice — Batman Jazz

A single fixed neon-noir theme derived from `batman jazz.jpg`, applied across my
terminal, prompt, TUIs, editors, and browser. Near-black room, steel-blue
midtones, crimson sky, one hot neon-pink bat-signal accent.

- **Palette:** [`PALETTE.md`](./PALETTE.md) — the locked hexes + ANSI-16 set.
- **Source of truth:** this repo holds the palette + wallpaper. The actual
  configs live in their normal locations and are versioned by `dt` (dovetail)
  into `~/.dotfiles`. This repo is docs, not a config mirror.

## What got themed

| Surface | How |
|---|---|
| ghostty | `~/.config/ghostty/config` — 16-color palette, `opacity 0.92` + blur, Cascadia Code NF |
| p10k | `~/.p10k.zsh` — light touch: dir→steel, git→accent family, prompt char→pink (ANSI indices) |
| btop | `~/.config/btop/themes/batman-jazz.theme` + `color_theme` in `btop.conf` |
| cava | `~/.config/cava/config` — gradient steel floor → hot pink |
| fastfetch | `config.jsonc` — logo tinted; keys inherit remapped ANSI |
| zed | `settings.json` — `theme_overrides` chrome over Nord Dark syntax, Cascadia font |
| vscode | `settings.json` — `workbench.colorCustomizations` chrome + terminal ANSI, Cascadia font |
| Zen | `user.js` accent `#e85a9c` + `chrome/userChrome.css` noir tint |

## Not done (yet)

- **yabai window borders** — needs JankyBorders (`borders`), not installed. When
  installed, use active border `#e85a9c`, normal `#20252f`.

## Reproduce / change

Configs are ANSI-index-driven where possible, so ghostty's `palette` is the one
lever that re-tints the whole terminal (p10k, fastfetch, btop TTY, etc. inherit
it). To tweak a color, edit `PALETTE.md`, update the relevant config, then
`dt backup <app>`. Revert any surface with `dt undo <app>`.
