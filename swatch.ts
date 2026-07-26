#!/usr/bin/env bun
import { readdirSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

// Colour documents live in templates/ rather than in this file: they are long,
// they must stay diffable against the originals, and `with { type: "text" }`
// bakes them into the compiled binary so nothing is read from disk at runtime.
import zedTpl from "./templates/zed.json" with { type: "text" };
import glowTpl from "./templates/glow.json" with { type: "text" };
import vscodeTpl from "./templates/vscode.json" with { type: "text" };
import yaziTpl from "./templates/yazi.toml" with { type: "text" };
import lazygitTpl from "./templates/lazygit.yml" with { type: "text" };
import zenCssTpl from "./templates/zen-userChrome.css" with { type: "text" };

// Themes are yours, not the tool's: they hold wallpapers and taste, and they
// outlive any one checkout of this repo. So they live in a normal config
// directory rather than next to the binary, and SWATCH_THEMES points somewhere
// else if you keep them in a repo of their own.
// ponytail: a function, not a const, so the env var is read per call. A const is
// evaluated at import time, which no test can get in front of.
export const themesDir = () =>
  process.env.SWATCH_THEMES ?? join(homedir(), ".config", "swatch", "themes");

export type Theme = {
  slug: string;
  dir: string;
  meta: { name: string; variant: "dark" | "light"; description: string };
  roles: Record<Role, string>;
  extras: Record<string, string>;
  ansi: Record<AnsiName, [string, string]>;
  render: { opacity: number };
};

export type Role =
  | "base" | "surface" | "overlay" | "text" | "muted" | "accent" | "deep" | "on_fill";
export type AnsiName =
  | "black" | "red" | "green" | "yellow" | "blue" | "magenta" | "cyan" | "white";

const ROLES: Role[] = ["base", "surface", "overlay", "text", "muted", "accent", "deep", "on_fill"];
const ANSI: AnsiName[] = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"];

/** Parse and validate a palette. Throws with a human message on any problem. */
export function parseTheme(slug: string, dir: string, raw: string): Theme {
  // ponytail: substring check, not a recursive walk. A TODO anywhere in the
  // file — value or comment — means the palette is not finished.
  if (raw.includes("TODO")) throw new Error(`${slug}: palette has TODOs, finish it before applying`);

  const t = Bun.TOML.parse(raw) as any;
  if (t?.meta?.variant !== "dark" && t?.meta?.variant !== "light")
    throw new Error(`${slug}: meta.variant must be "dark" or "light"`);
  if (!t?.meta?.name) throw new Error(`${slug}: meta.name is required`);

  for (const r of ROLES) {
    if (!isHex(t?.roles?.[r])) throw new Error(`${slug}: roles.${r} missing or not #rrggbb`);
  }
  for (const a of ANSI) {
    const pair = t?.ansi?.[a];
    if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(isHex))
      throw new Error(`${slug}: ansi.${a} must be [normal, bright] hex pair`);
  }

  return {
    slug,
    dir,
    meta: t.meta,
    roles: t.roles,
    extras: t.extras ?? {},
    ansi: t.ansi,
    render: { opacity: t.render?.opacity ?? (t.meta.variant === "dark" ? 0.92 : 1) },
  };
}

export function isHex(v: unknown): v is string {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
}

export function loadTheme(slug: string): Theme {
  const dir = join(themesDir(), slug);
  const file = join(dir, "palette.toml");
  if (!existsSync(file)) throw new Error(`no theme "${slug}" — try: swatch list`);
  return parseTheme(slug, dir, readFileSync(file, "utf8"));
}

export function listThemes(): string[] {
  if (!existsSync(themesDir())) return [];
  return readdirSync(themesDir(), { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(themesDir(), e.name, "palette.toml")))
    .map((e) => e.name)
    .sort();
}

// ── surfaces ────────────────────────────────────────────────────────────────
// A surface returns its name when it applied the theme, or null when the app
// isn't set up on this machine. Nothing here rewrites a whole config: swatch
// owns theme files plus one pointer line, dovetail owns the rest.

const CONFIG = join(homedir(), ".config");

type Surface = { name: string; apply: (t: Theme) => string | null };

// `swatch status` is `swatch use` with the writes turned off: every surface computes
// exactly what it would put on disk and we report the files that differ. That
// keeps one code path instead of a second set of per-surface readers.
// ponytail: module-level flag, not a threaded context — there is one CLI run per
// process. Thread it if swatch ever applies two themes concurrently.
let CHECK = false;
let PENDING: string[] = [];

function put(path: string, content: string) {
  if (CHECK) {
    if (!existsSync(path) || readFileSync(path, "utf8") !== content) PENDING.push(path);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function run(cmd: string[]) {
  if (!CHECK) Bun.spawnSync(cmd);
}

/** Swap the one line matching `re`. Hard-fails unless the match count is exactly 1. */
export function replaceLine(text: string, re: RegExp, line: string): string {
  const found = text.match(new RegExp(re.source, "gm"));
  if (found?.length !== 1)
    throw new Error(`expected 1 line matching ${re.source}, found ${found?.length ?? 0}`);
  // ponytail: function replacement so $& and friends in `line` stay literal.
  return text.replace(new RegExp(re.source, "m"), () => line);
}

/**
 * Same as replaceLine, but only inside `"<key>": { ... }`. Zed's settings.json
 * has a `"dark"` under both `theme` and `icon_theme`, so the bare line match is
 * ambiguous.
 * ponytail: stops at the first `}`, which is correct for flat blocks only —
 * switch to brace counting if a nested block ever needs this.
 */
export function replaceInBlock(text: string, key: string, re: RegExp, line: string): string {
  const start = text.indexOf(`"${key}": {`);
  if (start === -1) throw new Error(`no "${key}" block`);
  const end = text.indexOf("}", start);
  if (end === -1) throw new Error(`unterminated "${key}" block`);
  return text.slice(0, start) + replaceLine(text.slice(start, end), re, line) + text.slice(end);
}

/**
 * Replace whatever sits between `<comment> swatch:start` and `<comment> swatch:end`.
 * Body lines inherit the start marker's indentation, which YAML needs and the
 * bash arrays look better for.
 */
export function inject(text: string, body: string, comment = "#", close = ""): string {
  const tail = close ? ` ${close}` : "";
  const START = `${comment} swatch:start${tail}`;
  const END = `${comment} swatch:end${tail}`;
  const i = text.indexOf(START);
  const j = text.indexOf(END);
  if (i === -1 || j === -1 || j < i) throw new Error(`missing "${START}" / "${END}" markers`);
  const indent = text.slice(text.lastIndexOf("\n", i) + 1, i);
  const lines = body.split("\n").map((l) => (l ? indent + l : l)).join("\n");
  return `${text.slice(0, i)}${START}\n${lines}\n${indent}${text.slice(j)}`;
}

/**
 * Fill a template: `${r.accent}` role, `${a.cyan[1]}` ansi, `${x.orange}` extra,
 * `${m.name}` metadata. An alpha suffix survives, so `${r.overlay}80` works.
 * Unknown references throw rather than emitting "undefined" into a live config.
 */
export function render(tpl: string, t: Theme): string {
  const scope: Record<string, any> = { r: t.roles, a: t.ansi, x: t.extras, m: t.meta };
  return tpl.replace(/\$\{([a-z]+)\.([a-z_]+)(?:\[([01])\])?\}/g, (all, ns, key, idx) => {
    const v = scope[ns]?.[key];
    const out = idx === undefined ? v : v?.[Number(idx)];
    if (typeof out !== "string") throw new Error(`template references unknown ${all}`);
    return out;
  });
}

const bare = (hex: string) => hex.slice(1);

/** 0xAARRGGBB — what borders and sketchybar want. */
export const argb = (hex: string, alpha = "ff") => `0x${alpha}${bare(hex)}`;

/** A ghostty theme file: everything except `theme` and `config-file` is allowed. */
export function ghosttyTheme(t: Theme): string {
  return [
    `# ${t.meta.name} — generated by swatch, do not edit`,
    `background = ${bare(t.roles.base)}`,
    `foreground = ${bare(t.roles.text)}`,
    `cursor-color = ${bare(t.roles.accent)}`,
    `cursor-text = ${bare(t.roles.on_fill)}`,
    `selection-background = ${bare(t.roles.overlay)}`,
    `selection-foreground = ${bare(t.ansi.white[1])}`,
    `background-opacity = ${t.render.opacity}`,
    ...ANSI.map((n, i) => `palette = ${i}=${t.ansi[n][0]}`),
    ...ANSI.map((n, i) => `palette = ${i + 8}=${t.ansi[n][1]}`),
    "",
  ].join("\n");
}

/** A btop `.theme` file. Gradients run cool → accent so load reads as heat. */
export function btopTheme(t: Theme): string {
  const r = t.roles, a = t.ansi;
  const pairs: [string, string][] = [
    ["main_bg", r.base], ["main_fg", r.text], ["title", r.text],
    ["hi_fg", r.accent], ["selected_bg", r.overlay], ["selected_fg", r.accent],
    ["inactive_fg", r.muted], ["graph_text", r.text], ["meter_bg", a.black[0]],
    ["proc_misc", a.yellow[0]],
    ["cpu_box", r.muted], ["mem_box", r.muted], ["net_box", r.muted],
    ["proc_box", r.muted], ["div_line", a.black[0]],
    ["cpu_start", a.blue[0]], ["cpu_mid", a.blue[1]], ["cpu_end", r.accent],
    ["temp_start", a.green[0]], ["temp_mid", a.yellow[0]], ["temp_end", a.red[0]],
    ["free_start", r.overlay], ["free_mid", a.blue[0]], ["free_end", a.blue[1]],
    ["cached_start", a.cyan[0]], ["cached_mid", a.cyan[1]], ["cached_end", a.green[1]],
    ["available_start", a.green[0]], ["available_mid", a.green[1]], ["available_end", a.yellow[0]],
    ["used_start", r.deep], ["used_mid", a.red[0]], ["used_end", r.accent],
    ["download_start", a.blue[0]], ["download_mid", a.blue[1]], ["download_end", a.cyan[1]],
    ["upload_start", r.deep], ["upload_mid", a.magenta[0]], ["upload_end", r.accent],
    ["process_start", a.blue[0]], ["process_mid", a.magenta[0]], ["process_end", r.accent],
  ];
  return [
    `# ${t.meta.name} — generated by swatch, do not edit`,
    ...pairs.map(([k, v]) => `theme[${k}]="${v}"`),
    "",
  ].join("\n");
}

/** Blend two hexes. `ratio` is how much of `b` to take. */
export function mix(a: string, b: string, ratio: number): string {
  const ch = (i: number) => {
    const av = parseInt(a.slice(1 + i * 2, 3 + i * 2), 16);
    const bv = parseInt(b.slice(1 + i * 2, 3 + i * 2), 16);
    return Math.round(av + (bv - av) * ratio).toString(16).padStart(2, "0");
  };
  return `#${ch(0)}${ch(1)}${ch(2)}`;
}

/** cava's 8-stop gradient, cool floor rising to a hot accent tip. */
export function cavaGradient(t: Theme): string {
  const r = t.roles, a = t.ansi;
  const stops = [
    r.overlay, a.blue[0], a.blue[1], a.cyan[1],
    a.magenta[0], a.red[1], r.accent, mix(r.accent, a.white[1], 0.35),
  ];
  return ["gradient = 1", ...stops.map((c, i) => `gradient_color_${i + 1} = '${c}'`)].join("\n");
}

/** The exported shell vars sketchybarrc and its plugins read. */
export function sketchybarColors(t: Theme): string {
  const r = t.roles;
  return [
    `export BASE=${argb(r.base)}`,
    `export BAR_BG=0x00000000`, // pills float on the wallpaper, no backdrop
    `export SURFACE=${argb(r.surface)}`,
    `export OVERLAY=${argb(r.overlay)}`,
    `export TEXT=${argb(r.text)}`,
    `export MUTED=${argb(r.muted)}`,
    `export ACCENT=${argb(r.accent)}`,
    `export DEEP=${argb(r.deep)}`,
    `export RED=${argb(t.ansi.red[0])}`,
    `export ON_FILL=${argb(r.on_fill)}`,
    `export TRANSPARENT=0x00000000`,
  ].join("\n");
}

/**
 * Zen's live profile directory, or null if Zen isn't installed.
 * The `[InstallXXX] Default=` key is the profile Zen actually launches. The
 * `Default=1` flag under a `[ProfileN]` section can point somewhere else
 * entirely — here it names an empty profile with no chrome/ directory.
 */
export function zenDefaultProfile(ini: string): string | null {
  return ini.match(/^\[Install[^\]]*\][^[]*?^Default=(.+)$/m)?.[1]?.trim() ?? null;
}

export function zenProfile(): string | null {
  const root = join(homedir(), "Library", "Application Support", "zen");
  const ini = join(root, "profiles.ini");
  if (!existsSync(ini)) return null;
  const rel = zenDefaultProfile(readFileSync(ini, "utf8"));
  if (!rel) return null;
  const dir = join(root, rel);
  return existsSync(dir) ? dir : null;
}

// ponytail: JSON.stringify quotes the path well enough for AppleScript; theme
// dirs are slugs, so there are no quotes or backslashes to escape.
const SET_PICTURE = (p: string) =>
  `tell application "System Events" to set picture of every desktop to ${JSON.stringify(p)}`;

/** Poll `check` until it holds. Returns false on timeout rather than throwing. */
function waitFor(check: () => boolean, timeoutMs = 3000, stepMs = 100): boolean {
  for (let waited = 0; waited < timeoutMs; waited += stepMs) {
    if (check()) return true;
    Bun.sleepSync(stepMs);
  }
  return check();
}

function focusedSpace(): number | undefined {
  const q = Bun.spawnSync(["yabai", "-m", "query", "--spaces"]);
  if (q.exitCode !== 0) return undefined;
  return (JSON.parse(q.stdout.toString()) as any[]).find((s) => s["has-focus"])?.index;
}

export function currentWallpaper(): string {
  return Bun.spawnSync([
    "osascript", "-e", 'tell application "System Events" to get picture of desktop 1',
  ]).stdout.toString().trim();
}

/**
 * Set the wallpaper on every Space, not just the focused one.
 *
 * System Events' "desktop" means *display*, so `set picture of every desktop`
 * touches one wallpaper per monitor and leaves the other Spaces alone — on a
 * one-monitor machine with five Spaces that is one out of five. There is no
 * scriptable per-Space API, so walk the Spaces with yabai and set each in turn,
 * then put the focus back.
 *
 * ponytail: falls back to the focused Space when yabai isn't running, and says
 * so rather than pretending. The alternative is writing
 * com.apple.wallpaper/Store/Index.plist directly, which is undocumented and one
 * macOS release away from corrupting the wallpaper store.
 */
export function setWallpaper(path: string): string {
  const osa = () => {
    const r = Bun.spawnSync(["osascript", "-e", SET_PICTURE(path)]);
    if (r.exitCode !== 0) throw new Error(`wallpaper: ${r.stderr.toString().trim()}`);
  };

  const q = Bun.spawnSync(["yabai", "-m", "query", "--spaces"]);
  if (q.exitCode !== 0) {
    osa();
    return "focused space only, yabai not running";
  }

  const spaces = JSON.parse(q.stdout.toString()) as { index: number; "has-focus": boolean }[];
  const back = spaces.find((s) => s["has-focus"])?.index;
  let done = 0;

  for (const s of spaces) {
    Bun.spawnSync(["yabai", "-m", "space", "--focus", String(s.index)]);
    // Two asynchronous steps, both observable, so poll rather than sleep. The
    // Space switch is animated, and WallpaperAgent commits the write after
    // osascript returns — switching away before it lands silently drops it.
    // Fixed delays looked fine and then missed two Spaces out of five.
    if (!waitFor(() => focusedSpace() === s.index)) continue;
    osa();
    if (waitFor(() => currentWallpaper() === path)) done++;
  }

  if (back !== undefined) Bun.spawnSync(["yabai", "-m", "space", "--focus", String(back)]);
  return done === spaces.length
    ? `${done} spaces`
    : `${done} of ${spaces.length} spaces — rerun to catch the rest`;
}

export const SURFACES: Surface[] = [
  {
    name: "ghostty",
    apply(t) {
      const dir = join(CONFIG, "ghostty");
      const cfg = join(dir, "config");
      if (!existsSync(cfg)) return null;
      put(join(dir, "themes", t.slug), ghosttyTheme(t));
      put(cfg,
        replaceLine(readFileSync(cfg, "utf8"), /^theme = .*$/, `theme = ${t.slug}`),
      );
      return "ghostty (supacode reads this config; p10k + fastfetch inherit its ANSI)";
    },
  },
  {
    name: "btop",
    apply(t) {
      const dir = join(CONFIG, "btop");
      const cfg = join(dir, "btop.conf");
      if (!existsSync(cfg)) return null;
      put(join(dir, "themes", `${t.slug}.theme`), btopTheme(t));
      put(cfg,
        replaceLine(readFileSync(cfg, "utf8"), /^color_theme = .*$/, `color_theme = "${t.slug}"`),
      );
      return "btop";
    },
  },
  {
    name: "borders",
    apply(t) {
      const rc = join(CONFIG, "borders", "bordersrc");
      if (!existsSync(rc)) return null;
      const opts = [
        `active_color=${argb(t.roles.accent)}`,
        `inactive_color=${argb(t.ansi.black[0])}`,
      ];
      put(rc, inject(readFileSync(rc, "utf8"), opts.join("\n")));
      // bordersrc is only read at launch, so the file alone changes nothing
      // until the service restarts. JankyBorders applies options to an instance
      // that is already running, which is the live reload — but invoking it with
      // none running starts one in the foreground and blocks, hence the pgrep.
      if (Bun.spawnSync(["pgrep", "-x", "borders"]).exitCode === 0) run(["borders", ...opts]);
      return "borders";
    },
  },
  {
    name: "wallpaper",
    apply(t) {
      const file = readdirSync(t.dir).find((f) => f.startsWith("wallpaper."));
      if (!file) return null;
      const want = join(t.dir, file);
      if (CHECK) {
        if (currentWallpaper() !== want) PENDING.push("desktop picture");
        return `wallpaper (${file})`;
      }
      return `wallpaper (${file}, ${setWallpaper(want)})`;
    },
  },
  {
    name: "sketchybar",
    apply(t) {
      const f = join(CONFIG, "sketchybar", "colors.sh");
      if (!existsSync(f)) return null;
      put(f, inject(readFileSync(f, "utf8"), sketchybarColors(t)));
      run(["sketchybar", "--reload"]);
      return "sketchybar";
    },
  },
  {
    name: "yazi",
    apply(t) {
      const dir = join(CONFIG, "yazi");
      const theme = join(dir, "theme.toml");
      if (!existsSync(theme)) return null;
      const flavor = join(dir, "flavors", `${t.slug}.yazi`);
      put(join(flavor, "flavor.toml"), render(yaziTpl, t));
      const key = t.meta.variant === "dark" ? "dark" : "light";
      put(theme,
        replaceLine(readFileSync(theme, "utf8"), new RegExp(`^${key} = .*$`), `${key} = "${t.slug}"`),
      );
      return "yazi";
    },
  },
  {
    name: "glow",
    apply(t) {
      const dir = join(CONFIG, "glow");
      const yml = join(dir, "glow.yml");
      if (!existsSync(yml)) return null;
      const style = join(dir, `${t.slug}.json`);
      put(style, render(glowTpl, t));
      put(yml,
        replaceLine(readFileSync(yml, "utf8"), /^style: .*$/, `style: "${style}"`),
      );
      return "glow";
    },
  },
  {
    name: "zed",
    apply(t) {
      const dir = join(CONFIG, "zed");
      const settings = join(dir, "settings.json");
      if (!existsSync(settings)) return null;
      put(join(dir, "themes", `${t.slug}.json`), render(zedTpl, t));
      // ponytail: settings.json is JSONC — regex the one line, never parse and
      // re-serialise, which would drop every comment in the file.
      const key = t.meta.variant === "dark" ? "dark" : "light";
      put(settings,
        replaceInBlock(
          readFileSync(settings, "utf8"),
          "theme",
          new RegExp(`^\\s*"${key}": ".*",?$`),
          `    "${key}": "${t.meta.name}",`,
        ),
      );
      return "zed";
    },
  },
  {
    name: "vscode",
    apply(t) {
      const settings = join(
        homedir(), "Library", "Application Support", "Code", "User", "settings.json",
      );
      if (!existsSync(settings)) return null;
      const ext = join(homedir(), ".vscode", "extensions", `${t.slug}-theme`);
      put(join(ext, "package.json"),
        JSON.stringify(
          {
            name: `${t.slug}-theme`,
            displayName: t.meta.name,
            version: "1.0.0",
            publisher: "swatch",
            engines: { vscode: "^1.0.0" },
            categories: ["Themes"],
            contributes: {
              themes: [
                {
                  label: t.meta.name,
                  uiTheme: t.meta.variant === "dark" ? "vs-dark" : "vs",
                  path: `./themes/${t.slug}-color-theme.json`,
                },
              ],
            },
          },
          null,
          2,
        ) + "\n",
      );
      put(join(ext, "themes", `${t.slug}-color-theme.json`), render(vscodeTpl, t));
      put(settings,
        replaceLine(
          readFileSync(settings, "utf8"),
          /^(\s*)"workbench\.colorTheme": ".*",?$/,
          `  "workbench.colorTheme": "${t.meta.name}",`,
        ),
      );
      return "vscode (restart VS Code to pick it up)";
    },
  },
  {
    name: "cava",
    apply(t) {
      const f = join(CONFIG, "cava", "config");
      if (!existsSync(f)) return null;
      put(f, inject(readFileSync(f, "utf8"), cavaGradient(t)));
      return "cava";
    },
  },
  {
    name: "lazygit",
    apply(t) {
      const f = join(CONFIG, "lazygit", "config.yml");
      if (!existsSync(f)) return null;
      put(f, inject(readFileSync(f, "utf8"), render(lazygitTpl, t)));
      return "lazygit";
    },
  },
  {
    name: "zen",
    apply(t) {
      const dir = zenProfile();
      if (!dir) return null;
      const js = join(dir, "user.js");
      const css = join(dir, "chrome", "userChrome.css");
      if (!existsSync(js) || !existsSync(css)) return null;
      put(js,
        inject(
          readFileSync(js, "utf8"),
          `user_pref("zen.theme.accent-color", "${t.roles.accent}");`,
          "//",
        ),
      );
      put(css,
        inject(readFileSync(css, "utf8"), render(zenCssTpl, t), "/*", "*/"),
      );
      return "zen (restart Zen to pick it up)";
    },
  },
];

// ── extraction ──────────────────────────────────────────────────────────────
// `sips` shrinks any image macOS can open to a small BMP, which is a header
// plus raw pixels — no image library needed for either step.

export type Px = { r: number; g: number; b: number };

/** Read pixels out of an uncompressed 24/32-bit BMP. */
export function readBmp(buf: ArrayBuffer): Px[] {
  const d = new DataView(buf);
  if (d.getUint8(0) !== 0x42 || d.getUint8(1) !== 0x4d) throw new Error("not a BMP");
  const offset = d.getUint32(10, true);
  const width = d.getInt32(18, true);
  const rawHeight = d.getInt32(22, true);
  const bpp = d.getUint16(28, true);
  if (bpp !== 24 && bpp !== 32) throw new Error(`BMP is ${bpp}-bit, expected 24 or 32`);
  const bytes = bpp / 8;
  // A negative height means the rows are stored top-down. sips writes them that
  // way; the row order does not matter to us, but the magnitude does.
  const height = Math.abs(rawHeight);
  const stride = Math.ceil((width * bytes) / 4) * 4; // rows pad to 4 bytes
  const out: Px[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = offset + y * stride + x * bytes;
      out.push({ b: d.getUint8(i), g: d.getUint8(i + 1), r: d.getUint8(i + 2) });
    }
  }
  return out;
}

const lum = (p: Px) => 0.2126 * p.r + 0.7152 * p.g + 0.0722 * p.b;
/**
 * Absolute chroma, not relative. `(max - min) / max` ranks a #030100 pixel above
 * a strong mid-tone, so near-black noise wins every time; the plain spread does
 * not have that failure mode.
 */
const chroma = (p: Px) => Math.max(p.r, p.g, p.b) - Math.min(p.r, p.g, p.b);
const hex = (p: Px) =>
  "#" + [p.r, p.g, p.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

/** Average a bucket of pixels into one colour. */
function mean(px: Px[]): Px {
  const s = px.reduce((a, p) => ({ r: a.r + p.r, g: a.g + p.g, b: a.b + p.b }), { r: 0, g: 0, b: 0 });
  return { r: s.r / px.length, g: s.g / px.length, b: s.b / px.length };
}

/**
 * Pull structural roles out of an image. Accent is deliberately NOT extracted:
 * the loudest colour in a rice is usually a deliberate choice that the source
 * image does not contain. Callers mark it TODO.
 */
export function extractRoles(px: Px[]) {
  const sorted = [...px].sort((a, b) => lum(a) - lum(b));
  const at = (f: number) =>
    sorted[Math.max(0, Math.min(sorted.length - 1, Math.floor(sorted.length * f)))]!;
  // Trim only the extreme tails. A wider trim (2%/98%) lands inside the dark
  // block of a near-black image and collapses the whole range to nothing.
  const lo = lum(at(0.005));
  const hi = lum(at(0.995));
  const span = Math.max(1, hi - lo);

  // Step through the image's luminance RANGE, not its pixel population. A
  // near-black photo has most of its pixels in the shadows, so population
  // percentiles collapse surface and overlay into the same black; walking the
  // range finds the real midtones however few pixels carry them.
  const band = (f: number) => {
    const target = lo + span * f;
    let width = span * 0.05;
    for (let i = 0; i < 5; i++, width *= 2) {
      const near = px.filter((p) => Math.abs(lum(p) - target) <= width);
      if (near.length >= 8) return mean(near);
    }
    return at(f);
  };

  // deep = the most saturated colour in the lower half of the range. Without the
  // ceiling this picks whatever highlight is brightest, which is not a "deep".
  const mid = lo + span * 0.55;
  const cands = px.filter((p) => lum(p) > lo + span * 0.08 && lum(p) < mid);
  const deep = cands.length
    ? cands.reduce((best, p) => (chroma(p) > chroma(best) ? p : best))
    : band(0.4);

  return {
    base: hex(band(0.0)),
    surface: hex(band(0.18)),
    overlay: hex(band(0.42)),
    muted: hex(band(0.62)),
    text: hex(band(1.0)),
    deep: hex(deep),
  };
}

/**
 * The image's real format, from sips rather than its filename. macOS ships
 * dynamic wallpapers as HEIC files named `.jpg`, and copying one under the wrong
 * extension stops macOS treating it as an image it understands.
 */
export function imageFormat(path: string): string {
  const out = Bun.spawnSync(["sips", "-g", "format", path]).stdout.toString();
  const fmt = out.match(/format:\s*(\w+)/)?.[1];
  if (!fmt) throw new Error(`sips could not identify ${path}`);
  return fmt === "jpeg" ? "jpg" : fmt;
}

/** Dynamic wallpapers carry `apple_desktop:solar` or `:h24` and change all day. */
export function isDynamicWallpaper(path: string): boolean {
  return Bun.spawnSync(["strings", "-a", path]).stdout.toString().includes("apple_desktop:");
}

/** Scaffold a palette.toml. Structure comes from the image, identity does not. */
export function scaffoldPalette(name: string, variant: "dark" | "light", roles: ReturnType<typeof extractRoles>): string {
  const ref: [AnsiName, string][] = [
    ["red", "#cc4455"], ["green", "#7d9b6f"], ["yellow", "#c9a76a"],
    ["blue", "#4e749e"], ["magenta", "#b06a8f"], ["cyan", "#4a8f9e"],
  ];
  const ansi = [
    `black   = ["${mix(roles.base, roles.text, 0.12)}", "${roles.muted}"]`,
    ...ref.map(([n, h]) =>
      `${n.padEnd(7)} = ["${mix(h, roles.base, 0.3)}", "${mix(h, roles.text, 0.25)}"]`),
    `white   = ["${roles.text}", "${mix(roles.text, "#ffffff", 0.4)}"]`,
  ];
  const order: AnsiName[] = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"];
  const byName = new Map(ansi.map((l) => [l.split(/\s*=/)[0]!.trim(), l]));
  return `[meta]
name = "${name}"
variant = "${variant}"
description = "TODO: one line, what the room feels like"

[roles]
base    = "${roles.base}"
surface = "${roles.surface}"
overlay = "${roles.overlay}"
text    = "${roles.text}"
muted   = "${roles.muted}"
accent  = "TODO"   # the loud one — pick it, the image will not give it to you
deep    = "${roles.deep}"
on_fill = "${variant === "dark" ? roles.base : roles.text}"

[extras]
# orange = "#..."   # named colours a template can reference as x.<name>

# Seeded from reference hues pulled toward the image. Tune by eye.
[ansi]
${order.map((n) => byName.get(n)).join("\n")}
`;
}

/** A theme's README. Generated, because the hand-written palette tables drifted. */
export function themeReadme(t: Theme): string {
  const swatch = (hex: string) =>
    `![](https://placehold.co/16x16/${hex.slice(1)}/${hex.slice(1)}.png) \`${hex}\``;
  const roleRows = ROLES.map((r) => `| \`${r}\` | ${swatch(t.roles[r])} |`).join("\n");
  const ansiRows = ANSI.map(
    (n) => `| \`${n}\` | ${swatch(t.ansi[n][0])} | ${swatch(t.ansi[n][1])} |`,
  ).join("\n");
  const extras = Object.entries(t.extras);
  return `# ${t.meta.name}

${t.meta.description}

<!-- Generated by \`swatch\`. Edit palette.toml, not this file. -->

![wallpaper](wallpaper.jpg)

Variant \`${t.meta.variant}\`, background opacity \`${t.render.opacity}\`.

## Roles

| role | colour |
|---|---|
${roleRows}
${extras.length ? `\n## Extras\n\n| name | colour |\n|---|---|\n${extras.map(([k, v]) => `| \`${k}\` | ${swatch(v)} |`).join("\n")}\n` : ""}
## ANSI 16

| | normal | bright |
|---|---|---|
${ansiRows}

## Use it

\`\`\`bash
swatch use ${t.slug}
\`\`\`
`;
}

const HELP = `swatch — switch the whole desktop to a theme

usage:
  swatch list                  show available themes
  swatch use <theme>           apply a theme to every surface
  swatch status [theme]        what a re-apply would change, without changing it
  swatch new <name> <image>    scaffold a theme from a wallpaper
  swatch -h, --help            this

themes are read from $SWATCH_THEMES, default ~/.config/swatch/themes
`;

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function main() {
  const [cmd, ...args] = process.argv.slice(2);

  if (!cmd || cmd === "-h" || cmd === "--help") return console.log(HELP);

  // Every reader below sees a missing themes directory as "nothing to do", which
  // reads as success on a fresh install. Say it out loud instead. `new` is
  // exempt because it is how you get your first one.
  if (cmd !== "new" && !existsSync(themesDir()))
    throw new Error(`no themes in ${themesDir()} — clone your themes there, point SWATCH_THEMES at them, or start one with: swatch new <name> <image>`);

  if (cmd === "list") {
    for (const slug of listThemes()) {
      // A theme scaffolded by `swatch new` is unfinished by design, so list has to
      // survive it — refusing to load is `use`'s job, not list's.
      try {
        const t = loadTheme(slug);
        console.log(`${slug.padEnd(16)} ${t.meta.name} (${t.meta.variant}) — ${t.meta.description}`);
      } catch (e) {
        console.log(`${slug.padEnd(16)} unfinished — ${(e as Error).message.replace(`${slug}: `, "")}`);
      }
    }
    return;
  }

  if (cmd === "use") {
    const [slug] = args;
    if (!slug) throw new Error("usage: swatch use <theme>");
    const t = loadTheme(slug);
    console.log(t.meta.name);
    for (const s of SURFACES) {
      const done = s.apply(t);
      console.log(done ? `  ✓ ${done}` : `  · ${s.name} not set up here, skipped`);
    }
    // The theme's own page is generated from the palette it just applied, so it
    // cannot drift the way the hand-written table did.
    writeFileSync(join(t.dir, "README.md"), themeReadme(t));
    return;
  }

  if (cmd === "status") {
    const slug = args[0] ?? listThemes()[0];
    if (!slug) throw new Error("no themes yet — try: swatch new <name> <image>");
    const t = loadTheme(slug);
    CHECK = true;
    console.log(`${t.meta.name}: what "swatch use ${slug}" would change`);
    for (const s of SURFACES) {
      PENDING = [];
      const present = s.apply(t);
      if (!present) console.log(`  · ${s.name} not set up here`);
      else if (!PENDING.length) console.log(`  ✓ ${s.name} in sync`);
      else for (const p of PENDING) console.log(`  ✗ ${s.name} would rewrite ${p.replace(homedir(), "~")}`);
    }
    return;
  }

  if (cmd === "new") {
    const [name, image] = args;
    if (!name || !image) throw new Error("usage: swatch new <name> <image>");
    if (!existsSync(image)) throw new Error(`no such image: ${image}`);
    const slug = slugify(name);
    const dir = join(themesDir(), slug);
    if (existsSync(dir)) throw new Error(`theme "${slug}" already exists`);

    const bmp = join("/tmp", `swatch-${slug}.bmp`);
    const r = Bun.spawnSync(["sips", "-s", "format", "bmp", "-Z", "96", image, "--out", bmp]);
    if (r.exitCode !== 0) throw new Error(`sips: ${r.stderr.toString().trim()}`);
    const px = readBmp(readFileSync(bmp).buffer as ArrayBuffer);
    const roles = extractRoles(px);
    const bg = { r: parseInt(roles.base.slice(1, 3), 16), g: parseInt(roles.base.slice(3, 5), 16), b: parseInt(roles.base.slice(5, 7), 16) };
    const variant = lum(bg) > 128 ? "light" : "dark";

    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `wallpaper.${imageFormat(image)}`), readFileSync(image));
    writeFileSync(join(dir, "palette.toml"), scaffoldPalette(name, variant, roles));
    console.log(`themes/${slug}/ scaffolded (${variant})`);
    for (const [k, v] of Object.entries(roles)) console.log(`  ${k.padEnd(8)} ${v}`);
    if (isDynamicWallpaper(image))
      console.log(
        `\n  ! this is a dynamic wallpaper — it changes through the day, but the` +
        `\n    palette above is sampled from one frame. Flatten it, or accept that` +
        `\n    the colours only match at one time of day.`,
      );
    console.log(`\n  accent is TODO — pick it by hand, then: swatch use ${slug}`);
    return;
  }

  throw new Error(`unknown command "${cmd}"\n\n${HELP}`);
}

if (import.meta.main) {
  try {
    main();
  } catch (e) {
    console.error(`swatch: ${(e as Error).message}`);
    process.exit(1);
  }
}
