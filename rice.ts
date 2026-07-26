#!/usr/bin/env bun
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

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
    console.log(`${t.meta.name}: 0 surfaces applied`);
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
