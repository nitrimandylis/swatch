import { expect, test } from "bun:test";
import { parseTheme, isHex, loadTheme, listThemes, replaceLine, ghosttyTheme, btopTheme, inject, argb } from "./rice";

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
  const rc = "options=(\n\t# rice:start\n\told=1\n\t# rice:end\n)\n";
  const out = inject(rc, "a=1\nb=2");
  expect(out).toBe("options=(\n\t# rice:start\n\ta=1\n\tb=2\n\t# rice:end\n)\n");
});

test("inject is idempotent", () => {
  const rc = "# rice:start\nx\n# rice:end\n";
  expect(inject(inject(rc, "a=1"), "a=1")).toBe(inject(rc, "a=1"));
});

test("inject refuses a file without markers", () => {
  expect(() => inject("options=()\n", "a=1")).toThrow(/markers/);
});

test("batman-jazz loads from disk", () => {
  expect(listThemes()).toContain("batman-jazz");
  const t = loadTheme("batman-jazz");
  expect(t.meta.name).toBe("Batman Jazz");
  expect(t.extras.orange).toBe("#cf8a5a");
});
