// SEEDED FUZZER round 4 (bug-hunt #14) — GUI-WRITE CYCLES, the last unfuzzed writer family:
//   • RESEARCH CUSTOM-FOLDER create→delete cycles (/api/research/create-custom-folder + delete-custom-folder):
//     the delete must be a clean inverse — gui brace-balanced with the folder GONE, folder def + loc stripped,
//     and NO file may grow across repeated cycles (gui / zz-folders / loc / custom gfx).
//   • YEAR-LABEL apply→remove cycles (/api/research/folder-year-labels): remove must restore the gui
//     BYTE-IDENTICAL to the pre-apply text; re-applying the same markers must be idempotent.
//   • FOCUS continuous-position cycles (/api/focus/continuous-position): setting the same position twice is
//     byte-identical; A→B→A restores the A-state bytes.
// Runs against the REAL vanilla countrytechtreeview.gui (materialized into a temp mod by the endpoint).
// Deterministic: `node test-maker-fuzz4.js [seed]` (default 20260709).
"use strict";
const fs = require("fs"), os = require("os"), path = require("path"), http = require("http");
const { createApp } = require("./server.js");

const SEED = parseInt(process.argv[2], 10) || 20260709;
let s = SEED >>> 0;
const rnd = () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-fuzz4-"));
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Fuzz4"\n');
const app = createApp();
const server = http.createServer(app);
const post = (p, body) => new Promise((res, rej) => {
  const data = Buffer.from(JSON.stringify(body));
  const r = http.request({ host: "127.0.0.1", port: server.address().port, path: p, method: "POST", headers: { "Content-Type": "application/json", "Content-Length": data.length } },
    (rs) => { let o = ""; rs.on("data", c => o += c); rs.on("end", () => res({ status: rs.statusCode, body: o, json: (() => { try { return JSON.parse(o); } catch (_) { return null; } })() })); });
  r.on("error", rej); r.write(data); r.end();
});
const okResp = (r) => r.status < 400 && !(r.json && (r.json.ok === false || r.json.error));
const balanced = (txt) => { const t = String(txt).replace(/#.*$/gm, ""); let d = 0; for (const c of t) { if (c === "{") d++; else if (c === "}") { d--; if (d < 0) return false; } } return d === 0; };
const read = (rel) => { try { return fs.readFileSync(path.join(mod, rel), "utf8"); } catch (_) { return null; } };

let pass = 0, fail = 0; const failures = [];
const check = (area, i, name, cond, extra) => { if (cond) { pass++; } else { fail++; failures.push({ area, case: i, name, extra: String(extra == null ? "" : extra).slice(0, 300) }); } };

const GUI = "interface/countrytechtreeview.gui";
const ZZ = "common/technologies/zz_nova_custom_folders.txt";
const LOC = "localisation/english/nova_custom_folders_l_english.yml";
const GFX = "interface/nova_custom_research.gfx";
const sizes = () => [GUI, ZZ, LOC, GFX].map((f) => { const t = read(f); return t == null ? -1 : t.length; });

async function folderCycles(N) {
  for (let i = 0; i < N; i++) {
    const key = `fz4_folder_${i}`;
    let prev = null;
    for (let cyc = 0; cyc < 3; cyc++) {
      const rc = await post("/api/research/create-custom-folder", { modPath: mod, folderKey: key, ledger: pick(["army", "navy", "air"]), name: `Fuzz Tab ${i}` });
      check("folder", i, `c${cyc} create ok`, okResp(rc), rc.body.slice(0, 200));
      const g1 = read(GUI);
      check("folder", i, `c${cyc} gui exists+balanced after create`, g1 != null && balanced(g1));
      check("folder", i, `c${cyc} folder present in gui`, g1 != null && g1.includes(key));
      const rd = await post("/api/research/delete-custom-folder", { modPath: mod, folderKey: key });
      check("folder", i, `c${cyc} delete ok`, okResp(rd), rd.body.slice(0, 200));
      const g2 = read(GUI);
      check("folder", i, `c${cyc} gui balanced after delete`, g2 != null && balanced(g2));
      check("folder", i, `c${cyc} folder GONE from gui`, g2 != null && !g2.includes(key), g2 && (g2.match(new RegExp(`.{0,40}${key}.{0,40}`, "g")) || []).join(" | "));
      const zz = read(ZZ);
      check("folder", i, `c${cyc} folder def stripped`, zz == null || !zz.includes(key));
      const loc = read(LOC);
      check("folder", i, `c${cyc} folder name loc stripped`, loc == null || !loc.includes(key), loc && (loc.match(new RegExp(`.{0,30}${key}.{0,30}`)) || [])[0]);
      const lens = sizes();
      if (prev) check("folder", i, `c${cyc} NO cross-cycle growth`, JSON.stringify(lens) === JSON.stringify(prev), `${JSON.stringify(prev)} -> ${JSON.stringify(lens)}`);
      prev = lens;
    }
  }
}

async function yearCycles(N) {
  // one stable folder to host the year labels
  const key = "fz4_year_host";
  const rc = await post("/api/research/create-custom-folder", { modPath: mod, folderKey: key, ledger: "army", name: "Year Host" });
  check("year", -1, "host folder created", okResp(rc), rc.body.slice(0, 200));
  const pre = read(GUI);
  check("year", -1, "pre-apply gui snapshot", pre != null && balanced(pre));
  for (let i = 0; i < N; i++) {
    const markers = Array.from({ length: int(1, 4) }, (_, k) => ({ id: `yr_${i}_${k}`, year: 1936 + k * int(1, 3), x: 80 + k * int(40, 90), y: 40 + int(0, 60), fontSize: pick([10, 13, 18]), w: pick([null, 40, 60]), h: pick([null, 18]) }));
    const ra = await post("/api/research/folder-year-labels", { modPath: mod, folder: key, markers });
    check("year", i, "apply ok", okResp(ra), ra.body.slice(0, 200));
    const g1 = read(GUI);
    check("year", i, "gui balanced after apply", g1 != null && balanced(g1));
    check("year", i, "labels present", g1 != null && g1.includes("nova_year"), g1 == null ? "no gui" : "no nova_year block");
    const ra2 = await post("/api/research/folder-year-labels", { modPath: mod, folder: key, markers });
    check("year", i, "re-apply ok", okResp(ra2), ra2.body.slice(0, 200));
    const g2 = read(GUI);
    check("year", i, "re-apply IDEMPOTENT (byte-identical)", g1 === g2, g1 && g2 && `${g1.length} vs ${g2.length}`);
    const rr = await post("/api/research/folder-year-labels", { modPath: mod, folder: key, markers: [] });
    check("year", i, "remove ok", okResp(rr), rr.body.slice(0, 200));
    const g3 = read(GUI);
    check("year", i, "remove RESTORES pre-apply bytes", g3 === pre, g3 && pre && `${pre.length} vs ${g3.length}`);
  }
}

async function cfPositionCycles(N) {
  const rel = "common/national_focus/fz4_tree.txt";
  const abs = path.join(mod, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs,
`focus_tree = {
	id = fz4_tree
	country = {
		factor = 0
	}
	focus = {
		id = fz4_a
		x = 0
		y = 0
		cost = 5
	}
}
`, "utf8");
  for (let i = 0; i < N; i++) {
    const x = int(-200, 3000), y = int(-100, 2500), x2 = int(-200, 3000), y2 = int(-100, 2500);
    const r1 = await post("/api/focus/continuous-position", { modPath: mod, relPath: rel, x, y });
    check("cfpos", i, "set ok", okResp(r1), r1.body.slice(0, 200));
    const t1 = read(rel);
    check("cfpos", i, "balanced after set", t1 != null && balanced(t1));
    check("cfpos", i, "position written", t1 != null && new RegExp(`continuous_focus_position\\s*=\\s*\\{\\s*x\\s*=\\s*${x}\\s+y\\s*=\\s*${y}`).test(t1), t1 && (t1.match(/continuous_focus_position[^\n]*/) || [])[0]);
    const r2 = await post("/api/focus/continuous-position", { modPath: mod, relPath: rel, x, y });
    check("cfpos", i, "same-set IDEMPOTENT (byte-identical)", okResp(r2) && read(rel) === t1, `${t1 && t1.length} vs ${(read(rel) || "").length}`);
    const r3 = await post("/api/focus/continuous-position", { modPath: mod, relPath: rel, x: x2, y: y2 });
    check("cfpos", i, "re-set ok", okResp(r3), r3.body.slice(0, 200));
    const r4 = await post("/api/focus/continuous-position", { modPath: mod, relPath: rel, x, y });
    check("cfpos", i, "A→B→A restores bytes", okResp(r4) && read(rel) === t1, `${t1 && t1.length} vs ${(read(rel) || "").length}`);
  }
}

server.listen(0, "127.0.0.1", async () => {
  const t0 = Date.now();
  try {
    await folderCycles(6);
    await yearCycles(6);
    await cfPositionCycles(8);
  } catch (e) { fail++; failures.push({ area: "harness", case: -1, name: "threw", extra: (e && e.stack || String(e)).slice(0, 600) }); }
  finally {
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    console.log(`\nMAKER-FUZZ4 seed=${SEED}: ${pass} checks passed, ${fail} failed (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    for (const f of failures.slice(0, 40)) console.log(`  FAIL [${f.area} #${f.case}] ${f.name} → ${f.extra}`);
    if (failures.length > 40) console.log(`  …and ${failures.length - 40} more`);
    process.exit(fail ? 1 : 0);
  }
});
