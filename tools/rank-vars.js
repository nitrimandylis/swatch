// Paste into the page console. Ranks a page's CSS custom properties by how much
// of the viewport they actually paint, which is the expensive half of adding a
// site to swatch's web surface: Notion ships 757 properties and ~38 matter.
//
// Run it twice — once before writing a block, to find the names; once after
// applying the theme, to get the coverage number.
(() => {
  const W = innerWidth, H = innerHeight;

  // Canonicalise a colour string through the engine, so #fff, white and
  // rgb(255,255,255) all compare equal.
  const probe = document.createElement("span");
  probe.style.display = "none";
  document.body.appendChild(probe);
  const norm = (v) => {
    probe.style.color = "";
    probe.style.color = v;
    return getComputedStyle(probe).color;
  };

  // Every custom property declared anywhere that could carry a theme.
  const roots = new Set([document.documentElement, document.body]);
  for (const el of document.querySelectorAll(
    "[data-color-mode],[data-theme],[data-dark-theme],[dark],[class*='theme']",
  ))
    roots.add(el);

  const byColour = new Map(); // normalised colour -> Set of var names
  for (const el of roots) {
    const cs = getComputedStyle(el);
    for (const name of cs) {
      if (!name.startsWith("--")) continue;
      const raw = cs.getPropertyValue(name).trim();
      // Load-bearing guard. Design systems mix sizes and colours under one
      // prefix (reMarkable has --text-12: .75rem beside --text-* colours).
      // Assigning an invalid colour is ignored by the engine, so norm() would
      // return the *inherited* colour and file the size under it.
      if (!/^(#|rgba?\(|hsla?\(|oklch\(|color\()/.test(raw)) continue;
      const c = norm(raw);
      if (!c) continue;
      if (!byColour.has(c)) byColour.set(c, new Set());
      byColour.get(c).add(name);
    }
  }

  // Clip each element's box to the viewport and attribute its area to whatever
  // colour it paints. Nested boxes double-count on purpose: an opaque child
  // really does cover its parent, and the ranking only needs relative weight.
  const bg = new Map(), fg = new Map();
  const bump = (m, c, a) => m.set(c, (m.get(c) ?? 0) + a);
  let painted = 0;
  for (const el of document.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    const a =
      Math.max(0, Math.min(r.right, W) - Math.max(r.left, 0)) *
      Math.max(0, Math.min(r.bottom, H) - Math.max(r.top, 0));
    if (a < 1) continue;
    painted = Math.max(painted, a);
    const cs = getComputedStyle(el);
    if (cs.backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)")
      bump(bg, cs.backgroundColor, a);
    // Only leaves carry text worth measuring; a wrapper's colour is inherited
    // by children that are counted on their own.
    if (!el.firstElementChild && el.textContent.trim()) bump(fg, cs.color, a);
  }
  probe.remove();

  // Self-check: *some* element must cover most of the viewport, or the clipping
  // is wrong and every share below is wrong with it. Deliberately not measured
  // on <html>: single-page apps scroll an inner container and leave <html> at
  // height 0, which made this cry wolf on YouTube.
  if (painted < W * H * 0.5)
    console.error(
      "rank-vars: no element covers half the viewport — clipping may be wrong",
      painted, "of", W * H,
    );

  // Plain text, not console.table. The table renders as a devtools widget that
  // selects and copies as nothing, so a report pasted back into a chat arrives
  // empty — which reads exactly like the snippet having failed to run.
  const report = (label, m) => {
    const rows = [...m].sort((x, y) => y[1] - x[1]);
    const total = rows.reduce((s, [, a]) => s + a, 0);
    let cum = 0, out = `\n${label} — ${rows.length} colours\n`;
    for (const [c, a] of rows.slice(0, 20)) {
      cum += a;
      const vars = [...(byColour.get(c) ?? [])].join(" ") || "(literal — no variable reaches this)";
      out += `${((a / total) * 100).toFixed(1).padStart(5)}%  ${((cum / total) * 100).toFixed(1).padStart(5)}%  ${c.padEnd(22)}  ${vars}\n`;
    }
    return out;
  };
  // Which element actually declares the top background's variables. A block
  // scoped to :root loses silently to a descendant that redefines the set:
  // getComputedStyle reports the new value while the page paints the old one,
  // and an override that lost looks identical to a variable nobody reads.
  // An element declares a property when its computed value differs from its
  // parent's — custom properties inherit, so anything else came from a rule.
  const path = (el) =>
    el.tagName.toLowerCase() +
    (el.id ? `#${el.id}` : "") +
    [...el.attributes].filter((a) => ["dark", "light", "class"].includes(a.name) || a.name.startsWith("data-"))
      .map((a) => (a.value ? `[${a.name}="${a.value.slice(0, 40)}"]` : `[${a.name}]`)).join("");

  const top = [...bg].sort((x, y) => y[1] - x[1])[0];
  const names = [...(byColour.get(top?.[0]) ?? [])].slice(0, 6);
  let where = `\ndeclared on (top background's vars)\n`;
  for (const name of names) {
    const hits = [];
    for (const el of document.querySelectorAll("*")) {
      const v = getComputedStyle(el).getPropertyValue(name);
      const p = el.parentElement ? getComputedStyle(el.parentElement).getPropertyValue(name) : "";
      if (v && v !== p) hits.push(`${path(el)} = ${v.trim()}`);
      if (hits.length > 3) break;
    }
    where += `  ${name}\n${hits.map((h) => `    ${h}\n`).join("") || "    (only on the root)\n"}`;
  }

  const out = `${location.host}\n` + report("background", bg) + report("text", fg) + where;
  console.log(out);
  // Firefox and Chrome both expose copy() in the console. Straight to clipboard.
  try { copy(out); console.log("(copied to clipboard)"); } catch {}
})();
