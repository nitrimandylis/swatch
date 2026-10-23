// Builds a fake HOME for the README demo (tapes/swatch.tape). Nothing here is
// real: three synthetic themes, a few app configs that point at the active
// one, and stub binaries so no command can reach the real desktop.
// Run: bun tapes/fixture.ts   (writes tapes/fixtures/home, safe to re-run)
import { mkdirSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";

const home = join(import.meta.dir, "fixtures", "home");
rmSync(join(import.meta.dir, "fixtures"), { recursive: true, force: true });

function write(path: string, text: string) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text);
}

function palette(name: string, variant: string, description: string, c: string[]) {
  const [base, surface, overlay, text, muted, accent, deep, onFill] = c;
  const ansi = c.slice(8).map((hex, i) => `["${hex}", "${c[8 + ((i + 3) % 8)]}"]`);
  const names = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"];
  return `[meta]
name = "${name}"
variant = "${variant}"
description = "${description}"

[roles]
base = "${base}"
surface = "${surface}"
overlay = "${overlay}"
text = "${text}"
muted = "${muted}"
accent = "${accent}"
deep = "${deep}"
on_fill = "${onFill}"

[ansi]
${names.map((n, i) => `${n} = ${ansi[i]}`).join("\n")}
`;
}

const themes = {
  dusk: ["Dusk", "dark", "Violet hour over a grey harbour.",
    ["#14121c", "#1d1a28", "#2a2639", "#e4e0f0", "#8a84a3", "#b48ead", "#4b3a63", "#14121c",
     "#2a2639", "#c86b7a", "#8fae86", "#cdb27a", "#7f9bb8", "#b48ead", "#82adad", "#c9c5d8"]],
  paper: ["Paper", "light", "Warm newsprint with black ink.",
    ["#f4efe6", "#ebe4d6", "#ddd4c2", "#1f1c17", "#7a7466", "#b0452f", "#e8c9bf", "#f4efe6",
     "#ddd4c2", "#b0452f", "#4f7a45", "#9a7a2c", "#3f6a96", "#80577a", "#3d7a7a", "#4a463d"]],
  ember: ["Ember", "dark", "Coals, low and orange.",
    ["#161110", "#201817", "#2d2220", "#efe3da", "#9a8579", "#e0833c", "#5a2f17", "#161110",
     "#2d2220", "#d9604c", "#8fae86", "#e0b25c", "#6f8fb0", "#b0788f", "#6aa5a0", "#d3c4b8"]],
};

for (const [slug, [name, variant, description, colours]] of Object.entries(themes)) {
  const dir = join(home, ".config", "swatch", "themes", slug);
  write(join(dir, "palette.toml"), palette(name, variant, description, colours));
  // Wallpapers are only counted and listed, never decoded, so empty files do.
  const count = slug === "dusk" ? 3 : slug === "paper" ? 2 : 4;
  for (let i = 1; i <= count; i++) write(join(dir, "wallpapers", `${slug}-${i}.png`), "");
}

// App configs that exist, so those surfaces report instead of "not set up".
const cfg = join(home, ".config");
write(join(cfg, "ghostty", "config"), "font-size = 14\ntheme = dusk\n");
write(join(cfg, "fzf", "colors.sh"), "# old colours\n");
write(join(cfg, "btop", "btop.conf"), 'color_theme = "Default"\n');
write(join(cfg, "yazi", "theme.toml"), '[flavor]\ndark = "default"\nlight = "default"\n');
write(join(cfg, "glow", "glow.yml"), 'style: "dark"\n');

// Stubs first on PATH: even a surface that shells out cannot touch the real
// desktop, wallpaper, defaults or running bar.
const bin = join(home, "bin");
for (const tool of ["osascript", "defaults", "yabai", "pgrep", "sketchybar", "borders"]) {
  write(join(bin, tool), "#!/bin/sh\nexit 1\n");
  chmodSync(join(bin, tool), 0o755);
}
