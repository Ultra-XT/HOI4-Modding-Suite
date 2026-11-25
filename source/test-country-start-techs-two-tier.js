// #country-tech-save-deletes-unconditional-start-techs — TOUCHING A COUNTRY'S STARTING TECHNOLOGIES DELETED
// THE ONES HOI4 GRANTS IT AT THE 1936 START.
//
// A country history file is an ordered effect list, and a `YYYY.M.D = { … }` block only runs when the
// campaign starts on or after that date. So a tech in the unconditional head is granted at the 1936 bookmark
// and the SAME tech inside `1939.1.1 = { … }` is granted at the 1939 one. Vanilla writes both deliberately —
// HUN - Hungary.txt declares infantry_weapons at top level for 1936 and again inside 1939.1.1 for 1939 — and
// 20 of vanilla's 364 countries share at least one tech across the two tiers.
//
// The dated-tech filter was written for the OPPOSITE shape: Millennium Dawn grants everything inside
// 2000.1.1, so echoing the reader's full list back at top level duplicated it (#remove-tech-removes-nothing).
// That fix did not distinguish "this tech is only in a dated block" from "this tech is in BOTH". Because the
// head's own set_technology blocks are stripped before the filter runs, any id in both places was dropped
// and never re-emitted. Hungary went from EIGHT starting technologies to ZERO on a save that changed
// nothing, and the response carried no note — the note is only computed for techs the user is REMOVING.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-2tier-"));
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
const MOD = path.join(ROOT, "twotier");
fs.mkdirSync(path.join(MOD, "history", "countries"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="TwoTier"\nsupported_version="1.19.*"\n', "utf8");

const depthAt = (t, off) => {
  let d = 0, q = false;
  for (let i = 0; i < off; i++) {
    const c = t[i];
    if (c === '"') q = !q;
    else if (!q && c === "#") { while (i < t.length && t[i] !== "\n") i++; }
    else if (!q && c === "{") d++;
    else if (!q && c === "}") d--;
  }
  return d;
};
const idsIn = (s) => [...s.matchAll(/(^|\n)\s*([a-z0-9_]+)\s*=\s*1\b/g)].map((m) => m[2]);
const headOf = (text) => {
  const dm = /(^|\n)[ \t]*\d{4}\.\d{1,2}\.\d{1,2}\s*=\s*\{/.exec(text);
  return dm ? text.slice(0, dm.index + (dm[1] ? dm[1].length : 0)) : text;
};
const headTechs = (text) => {
  const head = headOf(text);
  const ids = new Set();
  for (const m of head.matchAll(/\bset_technology\s*=\s*\{/g)) {
    if (depthAt(head, m.index) !== 0) continue;
    const open = head.indexOf("{", m.index);
    let d = 0, close = -1;
    for (let i = open; i < head.length; i++) {
      if (head[i] === "{") d++;
      else if (head[i] === "}") { d--; if (!d) { close = i; break; } }
    }
    if (close > 0) idsIn(head.slice(open + 1, close)).forEach((x) => ids.add(x));
  }
  return ids;
};

// Which vanilla countries actually have the two-tier shape? Measured, not listed by hand — if the game
// changes, this test follows it instead of going quietly vacuous.
const candidates = [];
let countryFiles = [];
try { countryFiles = fs.readdirSync(path.join(V, "history", "countries")).filter((f) => /\.txt$/i.test(f)); } catch (_) {}
for (const f of countryFiles) {
  const t = fs.readFileSync(path.join(V, "history", "countries", f), "utf8");
  const head = headOf(t);
  if (head === t) continue;                       // no dated block at all
  const hIds = headTechs(t);
  if (!hIds.size) continue;
  const tailIds = new Set(idsIn(t.slice(head.length)));
  const shared = [...hIds].filter((x) => tailIds.has(x));
  if (shared.length) candidates.push({ file: f, tag: f.slice(0, 3), head: hIds.size, shared: shared.length });
}
for (const c of candidates) {
  fs.copyFileSync(path.join(V, "history", "countries", c.file), path.join(MOD, "history", "countries", c.file));
}

const PORT = 43401;
const srv = createApp().listen(PORT, async () => {
  const get = (u) => fetch(`http://127.0.0.1:${PORT}${u}`).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const post = (u, b) => fetch(`http://127.0.0.1:${PORT}${u}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

  try {
    console.log("\n[ground truth] vanilla grants the same tech in two tiers, on purpose");
    rec("the country corpus was readable", countryFiles.length > 300, countryFiles.length);
    rec("…and many countries use the two-tier shape", candidates.length >= 15,
      candidates.slice(0, 10).map((c) => `${c.tag}(${c.head}/${c.shared})`));
    const hun = candidates.find((c) => c.tag === "HUN");
    rec("Hungary is the extreme case — every head tech repeated in 1939",
      hun && hun.head === hun.shared && hun.head >= 8, hun);
    // …and the two tiers really are different bookmarks, which is why deleting one is not de-duplication.
    const hunText = fs.readFileSync(path.join(V, "history", "countries", "HUN - Hungary.txt"), "utf8");
    rec("…with the second copy inside a dated block", /1939\.1\.1\s*=\s*\{[\s\S]*infantry_weapons/.test(hunText),
      "the 1939 block does not carry it");

    console.log("\n[the bug] a NO-EDIT save must not lose a single starting technology");
    let lost = 0, checkedN = 0;
    const rows = [];
    for (const c of candidates) {
      const before = headTechs(fs.readFileSync(path.join(MOD, "history", "countries", c.file), "utf8"));
      const g = await get(`/api/technologies/country-techs?tag=${c.tag}&modPath=${encodeURIComponent(MOD)}`);
      const techIds = (g.b && (g.b.techs || g.b.technologies)) || [];
      if (!Array.isArray(techIds) || !techIds.length) { rows.push(`${c.tag}: could not read`); continue; }
      const s = await post("/api/technologies/save-country-techs", { modPath: MOD, tag: c.tag, techIds });
      if (s.s !== 200 || s.b.error) { rows.push(`${c.tag}: save failed ${s.s}`); continue; }
      checkedN++;
      const after = headTechs(fs.readFileSync(path.join(MOD, "history", "countries", c.file), "utf8"));
      const gone = [...before].filter((x) => !after.has(x));
      if (gone.length) { lost++; rows.push(`${c.tag}: ${before.size} -> ${after.size}, lost ${gone.join(",")}`); }
    }
    rec("every two-tier country was exercised", checkedN === candidates.length, { checkedN, want: candidates.length, rows });
    rec("NOT ONE of them lost a starting technology", lost === 0, rows.slice(0, 8));

    console.log("\n[control] the shape the dated-tech filter was written for still works");
    // Millennium Dawn's shape: everything inside 2000.1.1 and nothing at top level. Echoing the reader's list
    // back must NOT re-declare those at top level (#remove-tech-removes-nothing).
    const MDF = path.join(MOD, "history", "countries", "ZZZ - Md Shape.txt");
    fs.writeFileSync(MDF, [
      "capital = 1",
      "",
      "2000.1.1 = {",
      "\tset_technology = {",
      "\t\tinfantry_weapons = 1",
      "\t\tgw_artillery = 1",
      "\t}",
      "}",
      "",
    ].join("\n"), "utf8");
    const g2 = await get(`/api/technologies/country-techs?tag=ZZZ&modPath=${encodeURIComponent(MOD)}`);
    const ids2 = (g2.b && (g2.b.techs || g2.b.technologies)) || [];
    rec("the reader sees the dated techs", ids2.includes("infantry_weapons"), ids2);
    const s2 = await post("/api/technologies/save-country-techs", { modPath: MOD, tag: "ZZZ", techIds: ids2 });
    rec("the save succeeded", s2.s === 200 && !s2.b.error, s2.b || s2.s);
    const mdAfter = fs.readFileSync(MDF, "utf8");
    rec("…and NOTHING was re-declared at top level", headTechs(mdAfter).size === 0, mdAfter);
    rec("…while the dated block is untouched", /2000\.1\.1\s*=\s*\{[\s\S]*infantry_weapons/.test(mdAfter), mdAfter);
    rec("…and it is reported as unmanaged, so the UI can say why",
      Array.isArray(s2.b.unmanagedTechs) ? s2.b.unmanagedTechs.includes("infantry_weapons") : true, s2.b);

    console.log("\n[control] adding a genuinely new tech still lands at top level");
    const g3 = await get(`/api/technologies/country-techs?tag=HUN&modPath=${encodeURIComponent(MOD)}`);
    const ids3 = (g3.b && (g3.b.techs || g3.b.technologies)) || [];
    const s3 = await post("/api/technologies/save-country-techs", {
      modPath: MOD, tag: "HUN", techIds: [...ids3, "radio_detection"],
    });
    rec("the save succeeded", s3.s === 200 && !s3.b.error, s3.b || s3.s);
    const hunAfter = fs.readFileSync(path.join(MOD, "history", "countries", "HUN - Hungary.txt"), "utf8");
    rec("the new tech is in the unconditional head",
      headTechs(hunAfter).has("radio_detection"), [...headTechs(hunAfter)]);
    rec("…and the eight originals are still there too", headTechs(hunAfter).size >= 9, [...headTechs(hunAfter)]);

    console.log(`\n=== country start techs, two tiers: ${checks} checks, ${fails.length} failed ===`);
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
