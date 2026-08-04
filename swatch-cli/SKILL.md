---
name: swatch-cli
description: Drive the swatch CLI — the macOS desktop theming tool that writes 19 app surfaces from one palette.toml. Use whenever the user wants to change or check their desktop theme, mentions swatch, a palette, a wallpaper, or theming Ghostty/btop/sketchybar/Zen/Cider/Legcord/yazi/zed/vscode, asks why a surface looks wrong after a theme change, or wants to build a new theme from an image.
---

# swatch

`swatch` applies one `palette.toml` across 19 macOS surfaces. Compiled Bun binary at `~/.bun/bin/swatch`.
Full offline reference: `man swatch`.

Themes live in `$SWATCH_THEMES`, default `~/.config/swatch/themes`. Each theme is a directory holding
`palette.toml` plus a `wallpapers/` pool. Editing a palette is editing a file; nothing is hidden in the
binary.

## Reading, always safe

```bash
swatch list                  # every theme, with wallpaper counts; unfinished scaffolds marked
swatch list <theme>          # that theme's wallpapers, numbered
swatch status                # what a re-apply would change, writes disabled
swatch status <theme>        # same, against a theme that isn't currently applied
```

`swatch status` is the same code path as `use` with writes turned off. Run it before and after any
change: it is how you tell drift from a real difference.

## Applying

```bash
swatch use <theme>                     # opens an fzf wallpaper menu if the theme has several
swatch use <theme> --pick 2            # number from `swatch list <theme>`
swatch use <theme> --pick dusk.jpg     # filename, survives the pool growing
```

**Always pass `--pick` when you invoke this yourself.** Without a wallpaper choice and without a real
terminal, swatch silently keeps whatever is on screen or takes the first image, which is a decision the
user did not make. Run `swatch list <theme>` first, show them the numbered pool, and let them name the
one they want.

Apply skips apps that aren't installed and regenerates the theme's own README. Escaping the fzf menu
changes nothing at all: the menu runs before any file is written.

## Building a theme

```bash
swatch new "Copper Dusk" ~/Pictures/dusk.jpg    # samples the image into a palette scaffold
swatch add copper-dusk ~/Pictures/dusk-*.jpg    # more wallpapers into the same palette
fzf -m --preview 'chafa {}' | swatch add copper-dusk -   # "-" reads paths from stdin
```

**Extraction leaves `accent` as the literal string `TODO`, and swatch refuses to apply any palette
containing `TODO`.** This is deliberate, not a bug to work around. Sampling recovers structure — base,
surface, overlay, muted, text, deep — from the image's luminance range. It cannot recover identity: on
the Firewatch wallpaper the two accent candidates are 0.137% and 4% of the pixels, and picking between
them is a judgement about what the picture is *of*. Hand the choice back to the user; do not fill it in
with the most saturated pixel and call it done.

## Things that will bite you

- **Four surfaces are opt-in and write nothing until wired up once:** fzf needs a shell rc sourcing
  `~/.config/fzf/colors.sh`, git needs `include.path = ~/.config/git/swatch.gitconfig`, the web
  surface needs Zen's `chrome/userContent.css` to `@import "swatch-web.css"`, and legcord needs
  `/* swatch:start */` and `/* swatch:end */` in Legcord's `quickCss.css`. A surface that "doesn't
  work" is usually one of these four, not a swatch bug.
- **legcord needs no restart, unlike Cider.** Legcord watches `quickCss.css` and re-injects it about
  300 ms after a write. If Discord looks unthemed anyway, check `quickCss: true` in Legcord's
  `storage/settings.json` — with it off the file is never read, and swatch skips the surface.
- **Quit Cider before applying.** Cider re-serialises the whole of `spa-config.yml` from memory on every
  save, so an edit made while it is running is reverted with no error. swatch checks `pgrep -x Cider`
  and tells you.
- **Some surfaces need a restart to show up:** VS Code, Zen, and glow/lazygit-style apps that read the
  file at launch. `swatch use` prints which ones. Don't chase a "failed" apply that just needs a relaunch.
- **A theme applies but one app looks untouched → run `swatch status` first.** If status is green, the
  file on disk is correct and the problem is the app's cache or launch cycle, not the palette.
- **swatch owns its own blocks and nothing else.** Marker surfaces get the region between
  `swatch:start` and `swatch:end`; pointer surfaces get one line swapped. A pointer edit matching zero
  or two lines is an error, not a guess. If you are hand-editing a themed config, stay outside the markers.
- **Never hand-edit a generated theme file** (the file the pointer points at). It is rewritten wholesale
  on the next apply. Change `palette.toml` instead.
- **Nord is the palette to test a mapping against.** It is low-contrast by design, so a colour choice
  that is too close to its neighbour fails there first and passes everywhere else.

## Web-surface debugging, if you end up there

The Zen user stylesheet is *user origin*, which loses the cascade to author styles for normal
declarations. Every line needs `!important`, and skipping it fails as a **partial** success: the accent
lands and the backgrounds do not, which reads like a palette bug and is not one. You also cannot verify
it from a devtools `<style>` injection, because that is author origin and applies cleanly regardless.
Screenshot the real browser and sample the pixels.

When an override applies and nothing moves, use the repo's `tools/what-paints.js` to walk ancestors up
from a coordinate. Do not reach for `tools/rank-vars.js` — area-ranking is for discovering variable
names on a site nobody has themed yet, and pointed at an "applied, nothing moved" symptom it blames the
biggest box, which is usually already correct and sitting under the wrapper that covers it.
