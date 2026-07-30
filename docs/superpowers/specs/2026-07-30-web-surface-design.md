# Design: the `web` surface

2026-07-30. Supersedes the `notion` surface added earlier the same day.

## Problem

Notion shipped as surface 18: a generated `chrome/swatch-notion.css` that Zen's
`userContent.css` `@import`s, restyling the web app through the CSS custom
properties Notion already builds its UI from. The mechanism turned out to be
general. Every variable-driven site is the same work: find the semantic core,
map the eight roles onto it, scope it with `@-moz-document`.

Four more sites are worth covering: GitHub, YouTube, Wikipedia and the Vercel
dashboard.

## Decision

One surface, `web`, replacing `notion`. It writes one file,
`chrome/swatch-web.css`, containing one `@-moz-document` block per site.

The surface count stays at **18**. This is a rename plus four blocks, not an
addition.

### Why one surface and not five

`@-moz-document domain(...)` already scopes each block, so a site you never
visit costs nothing but bytes in a file that is never parsed for it. Five
surfaces would mean five `status` entries, five templates and five `@import`
lines the user has to add by hand, buying granularity nobody asked for.

### Why not keep `swatch-notion.css` alongside

Two generated files doing identical work, forever, to avoid one hand edit to a
file the user hand-created in the first place.

## Shape

- `WEB_FRAGMENT = "swatch-web.css"`. `NOTION_FRAGMENT` is deleted.
- `templates/web-userContent.css`, baked in with
  `import x from "./f.css" with { type: "text" }` like every other long colour
  document, rendered through the existing `render(tpl, t)`.
- Guard, unchanged in shape from `notion`: a Zen profile resolves **and**
  `chrome/userContent.css` contains the string `swatch-web.css`. Otherwise the
  surface returns null.

This is the generated file + static include mechanism, opt-in, already used by
fzf, git and notion. The generated file's name never changes, so there is no
pointer line to rewrite.

## Rules every block follows

These are carried over from the Notion block because they were each paid for
with a wrong screenshot.

1. **Variables only.** No element selectors. The one exception the codebase
   allows — Cider's `.new-shell-page-container`, Notion's `body.notion-body` —
   is for a pane whose colour is a literal no variable can reach. If a site
   needs one it gets exactly one, with a comment naming why.
2. **`!important` on every declaration.** `userContent.css` is a *user origin*
   stylesheet; the cascade ranks it below author styles for normal
   declarations. Leaving it off fails as a partial success: the accent lands
   and the backgrounds do not.
3. **Scope to wherever the site declares its theme vars, not just `:root`.**
   A `:root`-only rule loses silently when a descendant redefines the whole
   set — `getComputedStyle` reports the new value while the page paints the old
   one. GitHub declares on `[data-color-mode]` / `[data-dark-theme]` wrappers,
   YouTube on `html[dark]`.
4. **Light and dark selectors both get the same palette**, so the site reads as
   the theme whatever its own toggle says. Notion's block already does this.
5. **Check the mapping against nord first.** Nord is low-contrast by design and
   is the palette that exposes a role used one tier too dim. `roles.muted` is
   the comment colour by palette convention and measures 1.69:1 against nord's
   base; it belongs on tertiary and disabled tiers, never on secondary text
   that has to be read.

## Variable discovery

Names are read live, never recalled. Per site: open it in Zen, enumerate the
custom properties on `document.documentElement` and on whatever element carries
the theme class, find the semantic core, map the eight roles. Notion's 757
properties reduced to ~38 this way.

The mapping for each site is recorded in the template's comment header as it is
found, so nobody re-derives it in a browser session.

## Verification

Per site, in **Zen**, screenshot and sample pixels.

Injecting a `<style>` through the Chrome extension is *author* origin. It
applies cleanly and proves nothing about the user-origin cascade — everything
looked right in Chrome and was broken in Zen when Notion shipped.

A site is done when sampled pixels match `base`, `surface` and `text` for the
active theme.

## Tests

Follows the existing pattern, no new machinery:

- the template renders for a fixture theme and the output contains no `TODO`;
- no unrendered `{{` placeholder survives the render;
- the guard returns null when `userContent.css` lacks the fragment name.

## Migration

One hand edit, in Zen's `chrome/userContent.css`:

```
- @import "swatch-notion.css";
+ @import "swatch-web.css";
```

then delete the stale `chrome/swatch-notion.css`.

## Out of scope

- **Hacker News.** No custom properties at all: hardcoded `#ff6600` and
  `bgcolor` attributes. Themeable only through ~10 element selectors, which
  breaks rule 1 for a page visited rarely.
- **Reddit, Discord.** Both plausible, neither asked for. Each is one more
  block of roughly 20 lines when wanted.
- **X, Gmail.** Colours are injected inline from JavaScript. Nothing to
  override.
- Light-variant palettes remain untested here as everywhere else in swatch:
  `variant = "light"` has never run.
