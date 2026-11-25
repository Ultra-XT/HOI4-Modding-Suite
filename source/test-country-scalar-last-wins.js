// #scalar-edit-lands-on-overridden-statement — CHANGING A COUNTRY'S STABILITY APPEARED TO WORK AND THE GAME
// STILL USED THE OLD NUMBER.
//
// A country history file is an ordered effect list, so when the same scalar is declared twice at TOP LEVEL
// the second overwrites the first. Vanilla's CAN - Canada.txt says `set_stability = 0.8` at line 41 and
// `set_stability = 0.75` at line 308 — Canada starts at 0.75.
//
// Nova read the FIRST and edited the FIRST. So the box showed 0.8 (a number the game never uses), and asking
// for 0.9 wrote 0.9 over that first statement while the second went on setting 0.75. The box updated, the
// file changed, the reader read the new number back, and nothing was different in game.
//
// Six vanilla countries are shaped this way: BEL, CAN and HOL for set_stability; COL, GRE and POR for
// set_convoys. Millennium Dawn has none, which is why this never showed up there.
//
// Reader and writer now both take the LAST unconditional statement — what the game will use. The existing
// #gated-country-scalar behaviour is untouched: a key that exists ONLY inside a DLC gate or a dated block is
// still never edited in place, and a genuine change still gets a new unconditional statement.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-lastwin-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700));
  }
}

const V = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const MOD = path.join(ROOT, "lastwin");
const HIST = path.join(MOD, "history", "countries");
fs.mkdirSync(HIST, { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="LastWin"\nsupported_version="1.19.*"\n', "utf8");

const depthAt = (s, at) => {
  let d = 0, q = false;
  for (let i = 0; i < at; i++) {
    const c = s[i];
    if (c === '"') { q = !q; continue; }
    if (q) continue;
    if (c === "#") { while (i < s.length && s[i] !== "\n") i++; continue; }
    if (c === "{") d++;
    else if (c === "}") d--;
  }
  return d;
};
const topValues = (t, key) => {
  const re = new RegExp(`(?:^|\\n)[ \\t]*${key}\\s*=\\s*(-?\\d+(?:\\.\\d+)?)`, "g");
  const out = [];
  let m;
  while ((m = re.exec(t)) !== null) {
    const at = m.index + (t[m.index] === "\n" ? 1 : 0);
    if (depthAt(t, at) === 0) out.push(m[1]);
    re.lastIndex = m.index + m[0].length;
  }
  return out;
};

// Which vanilla countries actually have the shape — measured, so the test follows the game rather than a
// hand-written list that could go quietly vacuous.
const CASES = [];
let countryFiles = [];
try { countryFiles = fs.readdirSync(path.join(V, "history", "countries")).filter((f) => /\.txt$/i.test(f)); } catch (_) {}
for (const f of countryFiles) {
  let t = "";
  try { t = fs.readFileSync(path.join(V, "history", "countries", f), "utf8"); } catch (_) { continue; }
  for (const [key, field, want] of [["set_stability", "stability", 0.42], ["set_convoys", "convoys", 123]]) {
    const vals = topValues(t, key);
    if (vals.length >= 2) {
      CASES.push({ file: f, tag: f.slice(0, 3), key, field, want, vals });
      fs.copyFileSync(path.join(V, "history", "countries", f), path.join(HIST, f));
    }
  }
}

const PORT = 43485;
const srv = createApp().listen(PORT, async () => {
  const get = (u) => fetch(`http://127.0.0.1:${PORT}${u}`).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const post = (u, b) => fetch(`http://127.0.0.1:${PORT}${u}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

  try {
    console.log("\n[ground truth] vanilla declares the same scalar twice at top level");
    rec("the country corpus was readable", countryFiles.length > 300, countryFiles.length);
    rec("…and several countries do it", CASES.length >= 4, CASES.map((c) => `${c.tag}/${c.key}=[${c.vals.join(",")}]`));
    rec("…with the two values genuinely differing in at least one",
      CASES.some((c) => c.vals[0] !== c.vals[c.vals.length - 1]),
      CASES.map((c) => c.vals.join("->")));

    console.log("\n[the bug] the editor must show, and edit, the value the GAME uses");
    for (const c of CASES) {
      const p = path.join(HIST, c.file);
      const effective = c.vals[c.vals.length - 1];
      const d = await get(`/api/history/country-details?tag=${c.tag}&modPath=${encodeURIComponent(MOD)}`);
      const shown = (d.b.details || {})[c.field];
      rec(`${c.tag} ${c.key}: the editor shows the LAST value (${effective}), not the first (${c.vals[0]})`,
        String(shown) === String(Number(effective)), { shown, effective, vals: c.vals });
      const r = await post("/api/history/save-country-details", {
        tag: c.tag, modPath: MOD, details: Object.assign({}, d.b.details, { [c.field]: c.want }),
      });
      rec(`${c.tag}: the save succeeded`, r.s === 200 && !r.b.error, r.b || r.s);
      const after = topValues(fs.readFileSync(p, "utf8"), c.key);
      rec(`${c.tag}: the EFFECTIVE statement now holds the new value`,
        Number(after[after.length - 1]) === c.want, { after, want: c.want });
      rec(`${c.tag}: …and the earlier, overridden one is untouched`,
        after[0] === c.vals[0], { after, before: c.vals });
    }

    console.log("\n[control] a country with ONE declaration behaves exactly as before");
    const ONE = path.join(HIST, "ZZO - Oneland.txt");
    fs.writeFileSync(ONE, "capital = 1\nset_stability = 0.5\n", "utf8");
    let d1 = await get(`/api/history/country-details?tag=ZZO&modPath=${encodeURIComponent(MOD)}`);
    rec("it reads back", (d1.b.details || {}).stability === 0.5, d1.b.details);
    let r1 = await post("/api/history/save-country-details", {
      tag: "ZZO", modPath: MOD, details: Object.assign({}, d1.b.details, { stability: 0.61 }),
    });
    rec("the save succeeded", r1.s === 200 && !r1.b.error, r1.b || r1.s);
    rec("…and the one statement was edited in place",
      topValues(fs.readFileSync(ONE, "utf8"), "set_stability").join() === "0.61",
      fs.readFileSync(ONE, "utf8"));

    console.log("\n[control] #gated-country-scalar is untouched — a DLC-gated value is never edited in place");
    const GATED = path.join(HIST, "ZZG - Gateland.txt");
    fs.writeFileSync(GATED, [
      "capital = 2",
      "if = {",
      "\tlimit = { has_dlc = \"By Blood Alone\" }",
      "\tset_stability = 0.6",
      "}",
      "",
    ].join("\n"), "utf8");
    const gBefore = fs.readFileSync(GATED, "utf8");
    const dg = await get(`/api/history/country-details?tag=ZZG&modPath=${encodeURIComponent(MOD)}`);
    rec("the gated value is surfaced", (dg.b.details || {}).stability === 0.6, dg.b.details);
    // Only the SCALAR is asserted here: the details payload also carries a politics object, and this
    // fixture has no set_politics at all, so one is legitimately created. Different code path.
    await post("/api/history/save-country-details", {
      tag: "ZZG", modPath: MOD, details: { stability: 0.6 },
    });
    rec("a no-edit save leaves the gated statement exactly as written",
      /has_dlc = "By Blood Alone"[\s\S]*?set_stability = 0\.6/.test(fs.readFileSync(GATED, "utf8"))
      && topValues(fs.readFileSync(GATED, "utf8"), "set_stability").length === 0,
      fs.readFileSync(GATED, "utf8"));
    const rg2 = await post("/api/history/save-country-details", {
      tag: "ZZG", modPath: MOD, details: { stability: 0.9 },
    });
    rec("a real change adds an UNCONDITIONAL statement", rg2.s === 200
      && topValues(fs.readFileSync(GATED, "utf8"), "set_stability").join() === "0.9",
      fs.readFileSync(GATED, "utf8"));
    rec("…and leaves the modder's gate exactly as written",
      /has_dlc = "By Blood Alone"[\s\S]*set_stability = 0\.6/.test(fs.readFileSync(GATED, "utf8")),
      fs.readFileSync(GATED, "utf8"));

    console.log(`\n=== country scalar last-wins: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { srv.closeAllConnections(); } catch (_) {}
    srv.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
srv.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });
