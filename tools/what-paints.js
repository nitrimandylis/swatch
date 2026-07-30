// Paste into the page console. For each pane of a typical app layout, names the
// element actually painting that pixel and every opaque ancestor above it.
//
// This is the companion to rank-vars.js and the one to reach for FIRST when an
// override applies and nothing moves. rank-vars ranks by box area, and the
// element with the largest box is routinely not the element you can see: on
// DuckDuckGo it blamed <html>, which was already painting the right colour
// underneath a wrapper that covered it.
//
// Pierces shadow roots. A rule in userContent.css cannot match inside one, so a
// hit reported with inShadow=true is unreachable by any selector and has to be
// driven by an inherited custom property or left alone.
(() => {
  const W = innerWidth, H = innerHeight;
  const panes = [
    ["top bar", W / 2, 30],
    ["left rail", 40, H / 2],
    ["content", W / 2, H / 2],
    ["right gutter", W - 40, H / 2],
    ["bottom", W / 2, H - 30],
  ];

  // document.elementFromPoint stops at the shadow host, so walk down through
  // each root in turn to reach what is really on top at that pixel.
  const deepest = (x, y) => {
    let el = document.elementFromPoint(x, y);
    while (el?.shadowRoot) {
      const inner = el.shadowRoot.elementFromPoint(x, y);
      if (!inner || inner === el) break;
      el = inner;
    }
    return el;
  };

  const name = (el) =>
    el.tagName.toLowerCase() +
    (el.id ? `#${el.id}` : "") +
    (el.classList.length ? `.${[...el.classList].slice(0, 2).join(".")}` : "");

  let out = `${location.host}\n`;
  for (const [label, x, y] of panes) {
    let el = deepest(x, y);
    out += `\n${label} (${Math.round(x)},${Math.round(y)})\n`;
    if (!el) { out += "  (nothing)\n"; continue; }
    let depth = 0;
    while (el && depth < 12) {
      const cs = getComputedStyle(el);
      const bg = cs.backgroundColor;
      // Transparent ancestors are noise: they are not what you are looking at.
      if (bg && bg !== "rgba(0, 0, 0, 0)") {
        const root = el.getRootNode();
        out += `  ${name(el).padEnd(44)} ${bg}${root.host ? `  inShadow of ${name(root.host)}` : ""}\n`;
      }
      el = el.parentElement ?? el.getRootNode().host;
      depth++;
    }
  }
  console.log(out);
  try { copy(out); console.log("(copied to clipboard)"); } catch {}
})();
