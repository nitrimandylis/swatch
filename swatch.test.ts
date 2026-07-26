import { expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseTheme, isHex, loadTheme, listThemes, replaceLine, ghosttyTheme, btopTheme, inject, argb, sketchybarColors, render, replaceInBlock, mix, cavaGradient, zenDefaultProfile, readBmp, extractRoles, scaffoldPalette, imageFormat, isDynamicWallpaper } from "./swatch";

// Templates ship with the CLI, so they sit next to this file. Themes do not, so
// point the loader at a fixture instead of somebody's personal collection.
// themesDir() reads the env per call, which is what lets this land after the
// hoisted import above.
const HERE = import.meta.dir;
process.env.SWATCH_THEMES = join(HERE, "test", "themes");

/** A 1x1 PNG, so the image tests need no binary fixture in the repo. */
const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const GOOD = `
[meta]
name = "Test"
variant = "dark"
description = "d"
[roles]
base = "#000000"
surface = "#111111"
overlay = "#222222"
text = "#eeeeee"
muted = "#888888"
accent = "#ff00aa"
deep = "#8f2a3a"
on_fill = "#000000"
[ansi]
black = ["#20252f", "#5f7897"]
red = ["#a23a4a", "#c85566"]
green = ["#7d9b6f", "#94b586"]
yellow = ["#c9a76a", "#dcc088"]
blue = ["#4e749e", "#678dae"]
magenta = ["#b06a8f", "#e85a9c"]
cyan = ["#4a8f9e", "#67aab8"]
white = ["#c5d3e0", "#e8eef5"]
`;

test("isHex", () => {
  expect(isHex("#09090b")).toBe(true);
  expect(isHex("09090b")).toBe(false);
  expect(isHex("#09090")).toBe(false);
  expect(isHex(undefined)).toBe(false);
});

test("parses a complete palette", () => {
  const t = parseTheme("test", "/tmp", GOOD);
  expect(t.meta.name).toBe("Test");
  expect(t.roles.accent).toBe("#ff00aa");
  expect(t.ansi.magenta[1]).toBe("#e85a9c");
  expect(t.render.opacity).toBe(0.92); // dark default
});

test("refuses a palette with TODO", () => {
  expect(() => parseTheme("t", "/tmp", GOOD.replace("#ff00aa", "TODO"))).toThrow(/TODO/);
});

test("refuses a missing role", () => {
  expect(() => parseTheme("t", "/tmp", GOOD.replace('on_fill = "#000000"', ""))).toThrow(/on_fill/);
});

test("refuses a bad ansi pair", () => {
  expect(() => parseTheme("t", "/tmp", GOOD.replace('["#4a8f9e", "#67aab8"]', '"#4a8f9e"'))).toThrow(/cyan/);
});

test("refuses a bad variant", () => {
  expect(() => parseTheme("t", "/tmp", GOOD.replace('variant = "dark"', 'variant = "neon"'))).toThrow(/variant/);
});

test("replaceLine swaps exactly one line", () => {
  const cfg = "a = 1\ntheme = old\nb = 2\n";
  expect(replaceLine(cfg, /^theme = .*$/, "theme = new")).toBe("a = 1\ntheme = new\nb = 2\n");
});

test("replaceLine refuses zero or many matches", () => {
  expect(() => replaceLine("a = 1\n", /^theme = .*$/, "theme = new")).toThrow(/found 0/);
  expect(() => replaceLine("theme = x\ntheme = y\n", /^theme = .*$/, "theme = new")).toThrow(/found 2/);
});

test("replaceLine keeps $& literal", () => {
  expect(replaceLine("theme = old\n", /^theme = .*$/, "theme = a$&b")).toBe("theme = a$&b\n");
});

test("ghostty theme uses bare hex and orders palette normals then brights", () => {
  const g = ghosttyTheme(parseTheme("test", "/tmp", GOOD));
  expect(g).toContain("background = 000000");
  expect(g).toContain("cursor-text = 000000"); // on_fill, not base by luck
  expect(g).toContain("background-opacity = 0.92");
  expect(g).toContain("palette = 6=#4a8f9e"); // cyan normal
  expect(g).toContain("palette = 14=#67aab8"); // cyan bright
  expect(g).not.toContain("theme ="); // banned inside a ghostty theme file
});

test("btop theme covers every key btop reads", () => {
  const b = btopTheme(parseTheme("test", "/tmp", GOOD));
  expect(b).toContain('theme[main_bg]="#000000"');
  expect(b).toContain('theme[used_end]="#ff00aa"'); // accent tops the ram gradient
  expect(b.match(/theme\[/g)).toHaveLength(42);
});

test("argb prefixes alpha", () => {
  expect(argb("#e85a9c")).toBe("0xffe85a9c");
  expect(argb("#e85a9c", "80")).toBe("0x80e85a9c");
});

test("inject replaces the marked block and keeps indentation", () => {
  const rc = "options=(\n\t# swatch:start\n\told=1\n\t# swatch:end\n)\n";
  const out = inject(rc, "a=1\nb=2");
  expect(out).toBe("options=(\n\t# swatch:start\n\ta=1\n\tb=2\n\t# swatch:end\n)\n");
});

test("inject is idempotent", () => {
  const rc = "# swatch:start\nx\n# swatch:end\n";
  expect(inject(inject(rc, "a=1"), "a=1")).toBe(inject(rc, "a=1"));
});

test("inject refuses a file without markers", () => {
  expect(() => inject("options=()\n", "a=1")).toThrow(/markers/);
});

test("sketchybar exports every var the plugins read", () => {
  const s = sketchybarColors(parseTheme("test", "/tmp", GOOD));
  for (const v of ["BASE", "BAR_BG", "SURFACE", "OVERLAY", "TEXT", "MUTED", "ACCENT", "DEEP", "RED", "ON_FILL", "TRANSPARENT"])
    expect(s).toContain(`export ${v}=0x`);
});

test("render fills roles, ansi, extras, meta and keeps alpha suffixes", () => {
  const t = parseTheme("test", "/tmp", GOOD);
  expect(render("${r.accent}", t)).toBe("#ff00aa");
  expect(render("${a.cyan[1]}", t)).toBe("#67aab8");
  expect(render("${m.name}/${m.variant}", t)).toBe("Test/dark");
  expect(render("${r.overlay}80", t)).toBe("#22222280");
});

test("render throws rather than emitting undefined into a live config", () => {
  const t = parseTheme("test", "/tmp", GOOD);
  expect(() => render("${r.nope}", t)).toThrow(/unknown/);
  expect(() => render("${x.orange}", t)).toThrow(/unknown/); // GOOD has no [extras]
});

test("replaceInBlock disambiguates zed's two \"dark\" keys", () => {
  const s = `{
  "icon_theme": {
    "dark": "Material"
  },
  "theme": {
    "dark": "Old",
  },
}`;
  const out = replaceInBlock(s, "theme", /^\s*"dark": ".*",?$/, '    "dark": "New",');
  expect(out).toContain('"dark": "Material"');
  expect(out).toContain('"dark": "New",');
  expect(out).not.toContain('"Old"');
});

test("every template renders to a parseable document", () => {
  const t = parseTheme("test", "/tmp", GOOD);
  for (const f of ["zed.json", "glow.json", "vscode.json"])
    expect(() => JSON.parse(render(readFileSync(join(HERE, "templates", f), "utf8"), t))).not.toThrow();
  for (const f of ["yazi.toml"])
    expect(() => Bun.TOML.parse(render(readFileSync(join(HERE, "templates", f), "utf8"), t))).not.toThrow();
});

test("a theme loads off disk", () => {
  expect(listThemes()).toContain("moss");
  const t = loadTheme("moss");
  expect(t.meta.name).toBe("Moss");
  expect(t.extras.orange).toBe("#cf8a5a");
});

test("loadTheme names the theme it could not find", () => {
  expect(() => loadTheme("nope")).toThrow(/no theme "nope"/);
});

test("mix blends toward the second colour", () => {
  expect(mix("#000000", "#ffffff", 0)).toBe("#000000");
  expect(mix("#000000", "#ffffff", 1)).toBe("#ffffff");
  expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
});

test("cava gradient has 8 stops rising to a lightened accent", () => {
  const t = parseTheme("test", "/tmp", GOOD);
  const g = cavaGradient(t);
  expect(g.match(/gradient_color_/g)).toHaveLength(8);
  expect(g).toContain("gradient_color_7 = '#ff00aa'"); // accent
  expect(g).not.toContain("gradient_color_8 = '#ff00aa'"); // tip is lighter than accent
});

test("inject supports paired comment delimiters for CSS", () => {
  const css = "/* swatch:start */\nold\n/* swatch:end */\n";
  const out = inject(css, ":root { color: red }", "/*", "*/");
  expect(out).toBe("/* swatch:start */\n:root { color: red }\n/* swatch:end */\n");
});

test("zen profile resolution prefers the Install section over Default=1", () => {
  // The Default=1 flag names an empty profile; the Install section names the one
  // Zen actually launches. Reading the wrong key themes a profile nobody sees.
  const ini = `[Profile1]
Name=empty
Path=Profiles/aaaaaaaa.default
Default=1

[Profile0]
Name=real
Path=Profiles/bguf1cno.Default

[InstallB8A5F2C1]
Default=Profiles/bguf1cno.Default
Locked=1
`;
  expect(zenDefaultProfile(ini)).toBe("Profiles/bguf1cno.Default");
  expect(zenDefaultProfile("[Profile0]\nDefault=1\n")).toBeNull();
});

test("readBmp reads a hand-built 2x2 24-bit BMP", () => {
  // BGR pixels, rows padded to 4 bytes: 2px * 3 bytes = 6 -> 8 bytes per row
  const header = new Uint8Array(54);
  const d = new DataView(header.buffer);
  header[0] = 0x42; header[1] = 0x4d;
  d.setUint32(10, 54, true); // pixel offset
  d.setInt32(18, 2, true); // width
  d.setInt32(22, -2, true); // height, negative = top-down like sips writes
  d.setUint16(28, 24, true); // bpp
  const rows = new Uint8Array([
    0, 0, 255, 0, 255, 0, 0, 0, // red, green + 2 pad
    255, 0, 0, 255, 255, 255, 0, 0, // blue, white + 2 pad
  ]);
  const buf = new Uint8Array(54 + rows.length);
  buf.set(header); buf.set(rows, 54);
  const px = readBmp(buf.buffer);
  expect(px).toHaveLength(4);
  expect(px[0]).toEqual({ r: 255, g: 0, b: 0 });
  expect(px[1]).toEqual({ r: 0, g: 255, b: 0 });
  expect(px[2]).toEqual({ r: 0, g: 0, b: 255 });
  expect(px[3]).toEqual({ r: 255, g: 255, b: 255 });
});

test("extractRoles walks the luminance range, not the pixel population", () => {
  // 1000 near-black pixels plus a handful of real midtones: percentile-based
  // sampling would return black for surface and overlay.
  const px = [
    ...Array.from({ length: 1000 }, () => ({ r: 8, g: 8, b: 10 })),
    ...Array.from({ length: 10 }, () => ({ r: 18, g: 32, b: 49 })),
    ...Array.from({ length: 10 }, () => ({ r: 41, g: 74, b: 109 })),
    ...Array.from({ length: 10 }, () => ({ r: 197, g: 211, b: 224 })),
  ];
  const roles = extractRoles(px);
  expect(parseInt(roles.base.slice(1, 3), 16)).toBeLessThan(0x20);
  expect(parseInt(roles.text.slice(1, 3), 16)).toBeGreaterThan(0x80);
  expect(roles.surface).not.toBe(roles.base); // the whole point
});

test("scaffolded palettes are refused until the accent is chosen", () => {
  const p = scaffoldPalette("X", "dark", extractRoles([
    { r: 8, g: 8, b: 10 }, { r: 41, g: 74, b: 109 }, { r: 197, g: 211, b: 224 },
  ]));
  expect(p).toContain('accent  = "TODO"');
  expect(() => parseTheme("x", "/tmp", p)).toThrow(/TODO/);
  // every other role and the full ansi set must still be present
  expect(() => parseTheme("x", "/tmp", p.replace('"TODO"', '"#ff00aa"').replace("TODO: one line", "a room")))
    .not.toThrow();
});

test("imageFormat reads the real format, not the filename", () => {
  // macOS ships dynamic wallpapers as HEIC files named .jpg, so the extension
  // lies. Build the same lie here: a JPEG that still calls itself .png.
  const png = join(tmpdir(), "swatch-fixture.png");
  writeFileSync(png, Buffer.from(PNG_1PX, "base64"));
  expect(imageFormat(png)).toBe("png");

  const lying = join(tmpdir(), "swatch-fixture-lying.png");
  Bun.spawnSync(["sips", "-s", "format", "jpeg", png, "--out", lying]);
  expect(imageFormat(lying)).toBe("jpg");
});

test("isDynamicWallpaper spots apple_desktop metadata", () => {
  const plain = join(tmpdir(), "swatch-fixture.png");
  writeFileSync(plain, Buffer.from(PNG_1PX, "base64"));
  expect(isDynamicWallpaper(plain)).toBe(false);

  const faked = join(tmpdir(), "swatch-fixture-dynamic.heic");
  writeFileSync(faked, "....apple_desktop:solar....");
  expect(isDynamicWallpaper(faked)).toBe(true);
});
