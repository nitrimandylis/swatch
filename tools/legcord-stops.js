#!/usr/bin/env bun
// Regenerate templates/legcord-stops.json from Discord's live design-token sheet.
//
// Discord builds every one of its ~560 theme tokens out of a handful of colour
// ramps defined once on `:root` as `--<family>-<stop>-hsl: H S% L%`. Overriding
// those primitives reaches both the legacy `.theme-dark` block and the newer
// `@supports (color-mix)` one, which is why swatch never touches a semantic
// token. What it needs from Discord is each stop's *lightness*, so a palette
// colour can be placed at the same point on the ramp.
//
// Run when Discord reshuffles a ramp:  bun tools/legcord-stops.js
import { writeFileSync } from "node:fs";

// `primary` is the background ramp under Discord's Dark and Light themes; Darker
// and Midnight swap in `plum` for the same tokens. Both are carried so the
// surface works whichever of the four the account is set to.
const FAMILIES = ["neutral", "primary", "plum", "blurple", "red-new", "green-new", "yellow-new", "blue-new", "teal-new"];

const app = await (await fetch("https://discord.com/app", {
  headers: { "user-agent": "Mozilla/5.0" },
})).text();

const sheets = [...new Set([...app.matchAll(/\/assets\/[^"]+\.css/g)].map((m) => m[0]))];
const stops = {};

for (const path of sheets) {
  const css = await (await fetch(`https://discord.com${path}`)).text();
  // `--neutral-73-hsl: 230 calc(var(--saturation-factor, 1)*6.383%) 18.431%`
  // The saturation is wrapped in a calc so Discord's accessibility slider can
  // scale it, and that calc contains its own parentheses — so the value is taken
  // whole and the lightness read off its end, rather than parsed positionally.
  for (const [, family, stop, value] of css.matchAll(/--([a-z-]+?)-(\d+)-hsl:([^;}]+)/g)) {
    if (!FAMILIES.includes(family)) continue;
    const l = value.match(/([\d.]+)%\s*$/);
    if (l) stops[`${family}-${stop}`] = Number(l[1]);
  }
}

const sorted = Object.fromEntries(
  Object.entries(stops).sort(([a], [b]) => {
    const [fa, sa] = [a.slice(0, a.lastIndexOf("-")), +a.slice(a.lastIndexOf("-") + 1)];
    const [fb, sb] = [b.slice(0, b.lastIndexOf("-")), +b.slice(b.lastIndexOf("-") + 1)];
    return fa === fb ? sa - sb : FAMILIES.indexOf(fa) - FAMILIES.indexOf(fb);
  }),
);

writeFileSync(
  new URL("../templates/legcord-stops.json", import.meta.url),
  `${JSON.stringify(sorted, null, 0).replace(/,"/g, ',\n  "').replace("{", "{\n  ").replace("}", "\n}")}\n`,
);
console.log(`${Object.keys(sorted).length} stops across ${FAMILIES.length} families, from ${sheets.length} sheets`);
