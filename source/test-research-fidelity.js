// Research fidelity regression: Nova's tech catalog must render a mod's tree 1:1 — every tech at the exact
// @variable-resolved position the mod's files define. Guards the commented-@def-leak class (commit 15383b6,
// where `#@1945 = 18` over the active `@1945 = 2` misplaced ~6 air techs). SKIPS cleanly if Millennium Dawn
// isn't installed, so CI / other machines pass. Run: node test-research-fidelity.js
"use strict";
const fs = require("fs"), path = require("path");
const { createApp } = require("./server.js");
const MD = "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649";
const techDir = path.join(MD, "common", "technologies");

if (!fs.existsSync(techDir)) { console.log("test-research-fidelity: SKIP (Millennium Dawn not installed at " + MD + ")"); process.exit(0); }

// Parse MD ground truth: techId -> [{folder,x,y}] with file-local @vars resolved (comments stripped).
function matchBrace(s, o) { let d = 0; for (let i = o; i < s.length; i++) { if (s[i] === "{") d++; else if (s[i] === "}") { d--; if (d === 0) return i; } } return -1; }
const files = fs.readdirSync(techDir).filter((f) => f.endsWith(".txt"));
const globalVars = {}, fileText = {};
for (const f of files) {
  const t = fs.readFileSync(path.join(techDir, f), "utf8").replace(/#[^\n]*/g, "");
  fileText[f] = t;
  for (const m of t.matchAll(/(?:^|\n)[ \t]*@(\w+)[ \t]*=[ \t]*(-?[\d.]+)/g)) globalVars[m[1]] = parseFloat(m[2]);
}
const resolve = (tok, vars) => { tok = String(tok).trim(); if (tok.startsWith("@")) { const n = tok.slice(1); return (n in vars) ? vars[n] : (n in globalVars ? globalVars[n] : NaN); } const n = parseFloat(tok); return isNaN(n) ? NaN : n; };
const md = {};
for (const f of files) {
  const text = fileText[f], localVars = {};
  for (const m of text.matchAll(/(?:^|\n)[ \t]*@(\w+)[ \t]*=[ \t]*(-?[\d.]+)/g)) localVars[m[1]] = parseFloat(m[2]);
  const tm = /technologies\s*=\s*\{/.exec(text); if (!tm) continue;
  const tOpen = text.indexOf("{", tm.index), tEnd = matchBrace(text, tOpen);
  const body = text.slice(tOpen + 1, tEnd);
  const idRe = /(^|\n)[ \t]*([a-zA-Z][a-zA-Z0-9_]*)[ \t]*=[ \t]*\{/g; let im;
  while ((im = idRe.exec(body))) {
    const id = im[2];
    const bOpen = body.indexOf("{", im.index + im[1].length), bEnd = matchBrace(body, bOpen);
    if (bEnd === -1) break;
    const tb = body.slice(bOpen + 1, bEnd); idRe.lastIndex = bEnd;
    const places = []; const fre = /folder\s*=\s*\{/g; let fm;
    while ((fm = fre.exec(tb))) {
      const fo = tb.indexOf("{", fm.index), fe = matchBrace(tb, fo); if (fe === -1) break;
      const fb = tb.slice(fo + 1, fe); fre.lastIndex = fe;
      const nm = /name\s*=\s*([A-Za-z0-9_]+)/.exec(fb), pm = /position\s*=\s*\{([^}]*)\}/.exec(fb);
      if (!nm || !pm) continue;
      const xm = /x\s*=\s*(@?-?[\w.]+)/.exec(pm[1]), ym = /y\s*=\s*(@?-?[\w.]+)/.exec(pm[1]);
      places.push({ folder: nm[1], x: xm ? resolve(xm[1], localVars) : NaN, y: ym ? resolve(ym[1], localVars) : NaN });
    }
    if (places.length) md[id] = places;
  }
}

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };
const PORT = 39571, app = createApp();
const server = app.listen(PORT, async () => {
  let skip = false;
  try {
    const cat = await fetch(`http://127.0.0.1:${PORT}/api/technologies/catalog?modPath=${encodeURIComponent(MD)}`).then((x) => x.json());
    const techs = cat.technologies || [];
    if (techs.length < 100) { console.log("test-research-fidelity: SKIP (catalog returned " + techs.length + " techs — MD/vanilla not loaded)"); skip = true; return; }
    const nova = {}; for (const t of techs) nova[t.id] = { folder: t.folder, x: t.x, y: t.y };
    let exact = 0; const mismatch = [];
    for (const id in md) {
      const n = nova[id]; if (!n) continue;
      const hit = md[id].find((p) => p.folder === n.folder && p.x === n.x && p.y === n.y);
      if (hit) { exact++; continue; }
      const sf = md[id].find((p) => p.folder === n.folder);
      if (sf && !Number.isNaN(sf.x) && !Number.isNaN(sf.y)) mismatch.push({ id, md: [sf.x, sf.y], nova: [n.x, n.y] });
    }
    ok("MD parsed many techs", Object.keys(md).length >= 400, Object.keys(md).length);
    ok("Nova catalog has many techs", techs.length >= 800, techs.length);
    ok("matched many techs exactly", exact >= 400, exact);
    ok("ZERO position mismatches (1:1 fidelity; guards the commented-@def leak)", mismatch.length === 0, mismatch.slice(0, 6));
    console.log(`\ntest-research-fidelity: ${pass}/${total} checks passed (exact ${exact}/${Object.keys(md).length})`);
  } catch (e) { console.error("ERROR", e); }
  finally {
    process.exitCode = skip ? 0 : (pass === total && total >= 4 ? 0 : 1);
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
