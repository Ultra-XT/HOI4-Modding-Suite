// 🈯 #token-interior-hyphen — A VALIDATOR THAT REFUSES SHIPPING CONTENT BLOCKS A SAVE.
//
// An interior hyphen is legal in a Clausewitz bareword, and so are dots and non-ASCII letters. Only a
// LEADING digit genuinely breaks a file (HOI4 lexes it as a number). Nova has learned that one validator at
// a time — `AST_curtiss-wright_organization`, `AST_florence_v._mckenzie`, `göteborg_shipyard_organization`,
// `CHL_jorge_gonzález_von_marées` — and each time another guard was still too strict.
//
// Two were, and both refused content the game ships or a mod uses:
//
//     shared focus id       `GEF_Begin_Industrial_Build-up` and 6 more in an installed mod, so
//                           /api/focus/shared-connection could not wire any of them into a tree
//     decision category id  `ETH_italo-ethiopian_empire_decisions` — VANILLA'S OWN, in
//                           common/decisions/categories/ETH_decision_categories.txt
//
// ⚠️ THIS TEST READS THE REGEXES OUT OF server.js. The sweep that found this typed them out of the error
// MESSAGES instead, and reported a third validator — the character token — as broken when it had already
// been widened. That was the probe, not Nova. Deriving them from the source is the difference between a
// finding and a false alarm, and it keeps this test honest as the guards change.
"use strict";

const fs = require("fs");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};

const SRC = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
// The regex literal immediately before `.test(` nearest to each guard's message.
const guardRegex = (messageAnchor) => {
  const i = SRC.indexOf(messageAnchor);
  if (i < 0) return null;
  const window = SRC.slice(Math.max(0, i - 400), i + 400);
  const m = /\/\^[^\n]*?\/u?(?=\.test)/.exec(window);
  if (!m) return null;
  try {
    const body = m[0].replace(/^\//, "").replace(/\/u?$/, "");
    return new RegExp(body, /\/u$/.test(m[0]) ? "u" : "");
  } catch (_) { return null; }
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
const roots = [["vanilla", GAME]];
try { for (const d of fs.readdirSync(WS)) roots.push([d, path.join(WS, d)]); } catch (_) {}

const mask = (s) => {
  let o = "", q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') { q = !q; o += c; continue; }
    if (c === "#" && !q) { while (i < s.length && s[i] !== "\n") { o += " "; i++; } o += "\n"; continue; }
    o += c;
  }
  return o;
};
const topLevelKeys = (raw) => {
  const m0 = mask(raw);
  const out = [];
  const re = /(^|\n)([^\s={}#"]+)\s*=\s*\{/g;
  let m;
  while ((m = re.exec(m0))) {
    let i = m0.indexOf("{", m.index), d = 0, j = i;
    for (; j < m0.length; j++) { if (m0[j] === "{") d++; else if (m0[j] === "}") { d--; if (!d) break; } }
    re.lastIndex = j;
    out.push(m[2]);
  }
  return out;
};
const idLinesIn = (raw, key) => {
  const m0 = mask(raw);
  const out = [];
  const re = new RegExp(`(^|\\n)\\s*${key}\\s*=\\s*\\{`, "g");
  let m;
  while ((m = re.exec(m0))) {
    let i = m0.indexOf("{", m.index), d = 0, j = i;
    for (; j < m0.length; j++) { if (m0[j] === "{") d++; else if (m0[j] === "}") { d--; if (!d) break; } }
    re.lastIndex = j;
    const idm = /(^|\n)\s*id\s*=\s*([^\s{}]+)/.exec(m0.slice(i + 1, j));
    if (idm) out.push(idm[2]);
  }
  return out;
};

const CASES = [
  { label: "shared focus id", anchor: "Invalid shared focus id", sub: "common/national_focus",
    ids: (t) => idLinesIn(t, "shared_focus") },
  { label: "decision category id", anchor: "is not a valid category id", sub: "common/decisions/categories",
    ids: topLevelKeys },
  // ⚠️ INDENTED keys. `topLevelKeys` anchors the name straight after `(^|\n)`, which is right for a
  // decision category at column 0 and wrong for a character token under `characters = {` — it found 45
  // where the corpus has 30,035, and a control that scans almost nothing proves almost nothing.
  { label: "character token", anchor: "Character token must start", sub: "common/characters",
    ids: (t) => {
      const m0 = mask(t);
      const w = /(^|\n)\s*characters\s*=\s*\{/.exec(m0);
      if (!w) return [];
      let wi = m0.indexOf("{", w.index), wd = 0, wj = wi;
      for (; wj < m0.length; wj++) { if (m0[wj] === "{") wd++; else if (m0[wj] === "}") { wd--; if (!wd) break; } }
      const inner = m0.slice(wi + 1, wj);
      const out = [];
      const re = /(^|\n)\s*([^\s={}#"]+)\s*=\s*\{/g;
      let m;
      while ((m = re.exec(inner))) {
        let i = inner.indexOf("{", m.index), d = 0, j = i;
        for (; j < inner.length; j++) { if (inner[j] === "{") d++; else if (inner[j] === "}") { d--; if (!d) break; } }
        re.lastIndex = j;
        out.push(m[2]);
      }
      return out;
    } },
];

console.log("1. Every guard was found and reads as a regex");
for (const c of CASES) {
  c.re = guardRegex(c.anchor);
  rec(`the ${c.label} guard was located in server.js`, !!c.re, String(c.re));
}

console.log("\n2. …and none of them refuses an id the corpus actually declares");
for (const c of CASES) {
  if (!c.re) continue;
  let total = 0, rejected = 0, vRejected = 0, digitLed = 0;
  const eg = new Map();
  for (const [rn, root] of roots) {
    const dir = path.join(root, ...c.sub.split("/"));
    let fl = [];
    try { fl = fs.readdirSync(dir).filter((f) => /\.txt$/i.test(f)); } catch (_) { continue; }
    for (const f of fl) {
      let t = "";
      try { const st = fs.statSync(path.join(dir, f)); if (st.size > 4e6) continue; t = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
      for (const id of c.ids(t)) {
        if (!id) continue;
        // ⚠️ A LEADING DIGIT IS THE ONE THING SHIPPING CONTENT CAN GET WRONG. HOI4 lexes it as a number and
        // the file stops parsing, so refusing it is correct even though a mod ships one
        // (`00_missile_decisions`). Counting it as a false refusal would turn a working guard into a
        // "finding" — the opposite mistake to the one this whole test exists to prevent.
        if (/^[0-9]/.test(id)) { digitLed++; continue; }
        total++;
        if (!c.re.test(id)) {
          rejected++;
          if (rn === "vanilla") vRejected++;
          if (!eg.has(id)) eg.set(id, `${rn}/${f}`);
        }
      }
    }
  }
  // ⚠️ CONTROL: the scan actually found ids. Zero rejected out of zero scanned proves nothing.
  rec(`CONTROL: the corpus yields ${c.label}s to check`, total > 20, `${total} scanned`);
  rec(`⭐ the ${c.label} guard refuses none of them`, rejected === 0,
    `${rejected} refused (${vRejected} vanilla): ` + [...eg].slice(0, 3).map(([id, w]) => `${JSON.stringify(id)} in ${w}`).join(" · "));
  if (digitLed) console.log(`         (${digitLed} digit-led id${digitLed === 1 ? "" : "s"} set aside — refusing those is correct)`);
}

console.log("\n3. …while still refusing what genuinely breaks a file");
for (const c of CASES) {
  if (!c.re) continue;
  // A leading digit lexes as a number; whitespace, braces and quotes end the token. Those must stay refused,
  // or "widen the charset" quietly becomes "accept anything".
  const bad = ["0leading_digit", "has space", "has{brace", 'has"quote', "", "has}brace"];
  const accepted = bad.filter((x) => c.re.test(x));
  rec(`⭐ the ${c.label} guard still refuses a leading digit, spaces, braces and quotes`,
    accepted.length === 0, "accepted: " + JSON.stringify(accepted));
  // …and the shapes this fix exists to allow are allowed.
  const good = ["ETH_italo-ethiopian_empire_decisions", "AST_florence_v._mckenzie", "CHL_jorge_gonzález_von_marées"];
  const refused = good.filter((x) => !c.re.test(x));
  rec(`CONTROL: …and accepts hyphens, dots and accented letters`, refused.length === 0, "refused: " + JSON.stringify(refused));
}

console.log(`\n=== an id validator does not refuse shipped content: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) {
  for (const f of fails) console.log("   FAILED: " + f);
  process.exitCode = 1;
}
