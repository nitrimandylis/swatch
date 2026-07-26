#!/usr/bin/env bun
import { readdirSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// Colour documents live in templates/ rather than in this file: they are long,
// they must stay diffable against the originals, and `with { type: "text" }`
// bakes them into the compiled binary so nothing is read from disk at runtime.
import zedTpl from "./templates/zed.json" with { type: "text" };
import glowTpl from "./templates/glow.json" with { type: "text" };
import vscodeTpl from "./templates/vscode.json" with { type: "text" };
import vicinaeTpl from "./templates/vicinae.toml" with { type: "text" };
import yaziTpl from "./templates/yazi.toml" with { type: "text" };
import lazygitTpl from "./templates/lazygit.yml" with { type: "text" };
import zenCssTpl from "./templates/zen-userChrome.css" with { type: "text" };

// ponytail: repo path, not import.meta.dir — the compiled binary outlives its
// build directory but still needs to read themes/ at runtime.
export const RICE_HOME = process.env.RICE_HOME ?? join(homedir(), "cc", "rice");
const THEMES = join(RICE_HOME, "themes");

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
  const dir = join(THEMES, slug);
  const file = join(dir, "palette.toml");
  if (!existsSync(file)) throw new Error(`no theme "${slug}" — try: rice list`);
  return parseTheme(slug, dir, readFileSync(file, "utf8"));
}

export function listThemes(): string[] {
  if (!existsSync(THEMES)) return [];
  return readdirSync(THEMES, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(THEMES, e.name, "palette.toml")))
    .map((e) => e.name)
    .sort();
}

// ── surfaces ────────────────────────────────────────────────────────────────
// A surface returns its name when it applied the theme, or null when the app
// isn't set up on this machine. Nothing here rewrites a whole config: rice
// owns theme files plus one pointer line, dovetail owns the rest.

const CONFIG = join(homedir(), ".config");

type Surface = { name: string; apply: (t: Theme) => string | null };

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
 * Replace whatever sits between `<comment> rice:start` and `<comment> rice:end`.
 * Body lines inherit the start marker's indentation, which YAML needs and the
 * bash arrays look better for.
 */
export function inject(text: string, body: string, comment = "#", close = ""): string {
  const tail = close ? ` ${close}` : "";
  const START = `${comment} rice:start${tail}`;
  const END = `${comment} rice:end${tail}`;
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
    `# ${t.meta.name} — generated by rice, do not edit`,
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
    `# ${t.meta.name} — generated by rice, do not edit`,
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
export function zenProfile(): string | null {
  const root = join(homedir(), "Library", "Application Support", "zen");
  const ini = join(root, "profiles.ini");
  if (!existsSync(ini)) return null;
  const rel = readFileSync(ini, "utf8").match(/^\[Install[^\]]*\][^[]*?^Default=(.+)$/m)?.[1];
  if (!rel) return null;
  const dir = join(root, rel.trim());
  return existsSync(dir) ? dir : null;
}

export const SURFACES: Surface[] = [
  {
    name: "ghostty",
    apply(t) {
      const dir = join(CONFIG, "ghostty");
      const cfg = join(dir, "config");
      if (!existsSync(cfg)) return null;
      mkdirSync(join(dir, "themes"), { recursive: true });
      writeFileSync(join(dir, "themes", t.slug), ghosttyTheme(t));
      writeFileSync(
        cfg,
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
      mkdirSync(join(dir, "themes"), { recursive: true });
      writeFileSync(join(dir, "themes", `${t.slug}.theme`), btopTheme(t));
      writeFileSync(
        cfg,
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
      const body = [
        `active_color=${argb(t.roles.accent)}`,
        `inactive_color=${argb(t.ansi.black[0])}`,
      ].join("\n");
      writeFileSync(rc, inject(readFileSync(rc, "utf8"), body));
      return "borders (reload: brew services restart borders)";
    },
  },
  {
    name: "wallpaper",
    apply(t) {
      const file = readdirSync(t.dir).find((f) => f.startsWith("wallpaper."));
      if (!file) return null;
      // ponytail: JSON.stringify quotes the path well enough for AppleScript;
      // theme dirs are slugs, so no quotes or backslashes to escape.
      const script = `tell application "System Events" to set picture of every desktop to ${JSON.stringify(join(t.dir, file))}`;
      const r = Bun.spawnSync(["osascript", "-e", script]);
      if (r.exitCode !== 0) throw new Error(`wallpaper: ${r.stderr.toString().trim()}`);
      return `wallpaper (${file})`;
    },
  },
  {
    name: "sketchybar",
    apply(t) {
      const f = join(CONFIG, "sketchybar", "colors.sh");
      if (!existsSync(f)) return null;
      writeFileSync(f, inject(readFileSync(f, "utf8"), sketchybarColors(t)));
      Bun.spawnSync(["sketchybar", "--reload"]);
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
      mkdirSync(flavor, { recursive: true });
      writeFileSync(join(flavor, "flavor.toml"), render(yaziTpl, t));
      const key = t.meta.variant === "dark" ? "dark" : "light";
      writeFileSync(
        theme,
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
      writeFileSync(style, render(glowTpl, t));
      writeFileSync(
        yml,
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
      mkdirSync(join(dir, "themes"), { recursive: true });
      writeFileSync(join(dir, "themes", `${t.slug}.json`), render(zedTpl, t));
      // ponytail: settings.json is JSONC — regex the one line, never parse and
      // re-serialise, which would drop every comment in the file.
      const key = t.meta.variant === "dark" ? "dark" : "light";
      writeFileSync(
        settings,
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
      mkdirSync(join(ext, "themes"), { recursive: true });
      writeFileSync(
        join(ext, "package.json"),
        JSON.stringify(
          {
            name: `${t.slug}-theme`,
            displayName: t.meta.name,
            version: "1.0.0",
            publisher: "rice",
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
      writeFileSync(join(ext, "themes", `${t.slug}-color-theme.json`), render(vscodeTpl, t));
      writeFileSync(
        settings,
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
    name: "vicinae",
    apply(t) {
      const share = join(homedir(), ".local", "share", "vicinae");
      if (!existsSync(share)) return null;
      mkdirSync(join(share, "themes"), { recursive: true });
      writeFileSync(join(share, "themes", `${t.slug}.toml`), render(vicinaeTpl, t));
      return "vicinae";
    },
  },
  {
    name: "cava",
    apply(t) {
      const f = join(CONFIG, "cava", "config");
      if (!existsSync(f)) return null;
      writeFileSync(f, inject(readFileSync(f, "utf8"), cavaGradient(t)));
      return "cava";
    },
  },
  {
    name: "lazygit",
    apply(t) {
      const f = join(CONFIG, "lazygit", "config.yml");
      if (!existsSync(f)) return null;
      writeFileSync(f, inject(readFileSync(f, "utf8"), render(lazygitTpl, t)));
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
      writeFileSync(
        js,
        inject(
          readFileSync(js, "utf8"),
          `user_pref("zen.theme.accent-color", "${t.roles.accent}");`,
          "//",
        ),
      );
      writeFileSync(
        css,
        inject(readFileSync(css, "utf8"), render(zenCssTpl, t), "/*", "*/"),
      );
      return "zen (restart Zen to pick it up)";
    },
  },
];

const HELP = `rice — switch the whole desktop to a theme

usage:
  rice list              show available themes
  rice use <theme>       apply a theme to every surface
  rice -h, --help        this
`;

function main() {
  const [cmd, arg] = process.argv.slice(2);

  if (!cmd || cmd === "-h" || cmd === "--help") return console.log(HELP);

  if (cmd === "list") {
    for (const slug of listThemes()) {
      const t = loadTheme(slug);
      console.log(`${slug.padEnd(16)} ${t.meta.name} (${t.meta.variant}) — ${t.meta.description}`);
    }
    return;
  }

  if (cmd === "use") {
    if (!arg) throw new Error("usage: rice use <theme>");
    const t = loadTheme(arg);
    console.log(t.meta.name);
    for (const s of SURFACES) {
      const done = s.apply(t);
      console.log(done ? `  ✓ ${done}` : `  · ${s.name} not set up here, skipped`);
    }
    return;
  }

  throw new Error(`unknown command "${cmd}"\n\n${HELP}`);
}

if (import.meta.main) {
  try {
    main();
  } catch (e) {
    console.error(`rice: ${(e as Error).message}`);
    process.exit(1);
  }
}
