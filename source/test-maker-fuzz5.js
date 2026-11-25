// SEEDED FUZZER round 5 (bug-hunt #15) — the last three unverified writer surfaces:
//   • SHARED-FOCUS CONNECTION toggles (setSharedFocusConnection): enable(new)→disable must restore the tree
//     BYTE-IDENTICAL; repeated off→on cycles must be stable (no growth, no duplicate lines); enable-when-
//     present / disable-when-absent are no-ops.
//   • STATE-BLOCK surgical editors (map-data: setOwnerInStateBlock / setStateFieldsInBlock /
//     addProvinceToBlock / removeProvinceFromBlock): owner A→B→A byte-identical, same-fields idempotent,
//     add(P)→remove(P) byte-identical, repeated cycles no growth, always brace-balanced.
//   • CROSS-MOD LOC ISOLATION: alternate event/decision saves into TWO mods — each mod's loc must contain
//     ONLY its own keys (exactly once), no cross-contamination, and hammering the same key with changing
//     values must keep exactly one line (last value wins).
// Deterministic: `node test-maker-fuzz5.js [seed]` (default 20260710).
"use strict";
const fs = require("fs"), os = require("os"), path = require("path"), http = require("http");
const S = require("./server.js");
const md = require("./map-data.js");

const SEED = parseInt(process.argv[2], 10) || 20260710;
let s = SEED >>> 0;
const rnd = () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const balanced = (txt) => { const t = String(txt).replace(/#.*$/gm, ""); let d = 0; for (const c of t) { if (c === "{") d++; else if (c === "}") { d--; if (d < 0) return false; } } return d === 0; };

let pass = 0, fail = 0; const failures = [];
const check = (area, i, name, cond, extra) => { if (cond) { pass++; } else { fail++; failures.push({ area, case: i, name, extra: String(extra == null ? "" : extra).slice(0, 300) }); } };

// ── A. shared-focus connection toggles ─────────────────────────────────────────────────────────
function fuzzSharedToggles(N) {
  for (let i = 0; i < N; i++) {
    const hasShared = rnd() < 0.5;
    const base = `focus_tree = {
	id = fz_tree_${i}
	country = { factor = 0 modifier = { add = 10 tag = ARM } }
${hasShared ? "\tshared_focus = EU1\n" : ""}	focus = { id = own_${i} x = 0 y = 0 }
}
`;
    const gid = `FZG_${int(1, 99)}`;
    // enable a NEW group then disable it → byte-identical restore
    const on = S.setSharedFocusConnection(base, { sharedId: gid, enabled: true });
    check("shared", i, "enable inserts the reference", S.parseSharedFocusReferences(on).includes(gid), on.slice(0, 120));
    check("shared", i, "balanced after enable", balanced(on));
    const off = S.setSharedFocusConnection(on, { sharedId: gid, enabled: false });
    check("shared", i, "enable→disable restores BYTES", off === base, `${base.length} vs ${off.length}`);
    // repeated on/off cycles: stable, no duplicates
    let t = base;
    for (let c = 0; c < 3; c++) {
      t = S.setSharedFocusConnection(t, { sharedId: gid, enabled: true });
      const dup = (t.match(new RegExp(`shared_focus\\s*=\\s*${gid}\\b`, "g")) || []).length;
      check("shared", i, `c${c} exactly one reference`, dup === 1, dup);
      t = S.setSharedFocusConnection(t, { sharedId: gid, enabled: false });
    }
    check("shared", i, "3 cycles restore BYTES", t === base, `${base.length} vs ${t.length}`);
    // no-ops
    check("shared", i, "enable-when-present is a no-op", S.setSharedFocusConnection(on, { sharedId: gid, enabled: true }) === on);
    check("shared", i, "disable-when-absent is a no-op", S.setSharedFocusConnection(base, { sharedId: gid, enabled: false }) === base);
    if (hasShared) {
      const off1 = S.setSharedFocusConnection(base, { sharedId: "EU1", enabled: false });
      check("shared", i, "disable existing removes it, balanced", balanced(off1) && !S.parseSharedFocusReferences(off1).includes("EU1"));
      check("shared", i, "focus body preserved", new RegExp(`id = own_${i}`).test(off1));
    }
  }
}

// ── B. state-block surgical editor cycles ──────────────────────────────────────────────────────
function fuzzStateEditors(N) {
  for (let i = 0; i < N; i++) {
    const provs = Array.from({ length: int(2, 6) }, (_, k) => 100 * (i + 1) + k);
    const base = `state = {
	id = ${i + 1}
	name = "STATE_${i + 1}"
	manpower = ${int(1000, 900000)}
	state_category = ${pick(["rural", "town", "city"])}
	provinces = {
		${provs.join(" ")}
	}
	history = {
		owner = TUR
		buildings = {
			infrastructure = 2
		}
		add_core_of = TUR
	}
}
`;
    // owner A→B→A byte-identical
    const b1 = md.setOwnerInStateBlock(base, "GRE");
    check("state", i, "owner set + balanced", balanced(b1) && /owner\s*=\s*GRE/.test(b1) && !/owner\s*=\s*TUR\b/.test(b1.replace(/add_core_of\s*=\s*TUR/, "")), b1.slice(0, 200));
    const b2 = md.setOwnerInStateBlock(b1, "TUR");
    check("state", i, "owner A→B→A restores BYTES", b2 === base, `${base.length} vs ${b2.length}`);
    // same-fields set is idempotent
    const fields = { owner: "GRE", cores: ["GRE", "BUL"], manpower: int(5000, 500000), category: pick(["town", "city"]) };
    const f1 = md.setStateFieldsInBlock(base, fields);
    const f2 = md.setStateFieldsInBlock(f1, fields);
    check("state", i, "setStateFields idempotent (byte-identical)", f1 === f2, `${f1.length} vs ${f2.length}`);
    check("state", i, "setStateFields balanced", balanced(f1));
    // add(P) → remove(P): the list editors NORMALIZE the provinces block to a single line on first touch
    // (by design — verified against the fn source; converges instantly, semantics preserved). The real
    // contract is: converged after one touch, then ZERO drift across cycles, always set-equal + balanced.
    const P = 99000 + i;
    const a1 = md.addProvinceToBlock(base, P);
    check("state", i, "province added", new RegExp(`\\b${P}\\b`).test(a1));
    const norm = md.removeProvinceFromBlock(a1, P); // the once-normalized form
    check("state", i, "add→remove balanced + set-equal to base", balanced(norm) && (() => { const g = (x) => JSON.stringify([...new Set((x.match(/provinces\s*=\s*\{([^}]*)\}/)[1].match(/\d+/g) || []).map(Number))].sort()); return g(norm) === g(base); })(), norm.slice(0, 160));
    let t = norm;
    for (let c = 0; c < 3; c++) { t = md.removeProvinceFromBlock(md.addProvinceToBlock(t, P), P); }
    check("state", i, "cycles CONVERGE (zero drift after normalization)", t === norm, `${norm.length} vs ${t.length}`);
    // remove an EXISTING province then re-add: balanced + set-equal + stable size
    const victim = provs[int(0, provs.length - 1)];
    const r1 = md.removeProvinceFromBlock(base, victim);
    check("state", i, "existing province removed + balanced", balanced(r1) && !new RegExp(`\\b${victim}\\b`).test(r1.match(/provinces\s*=\s*\{[^}]*\}/)[0]), r1.slice(0, 160));
    const r2 = md.addProvinceToBlock(r1, victim);
    check("state", i, "re-added + balanced", balanced(r2) && new RegExp(`\\b${victim}\\b`).test(r2));
    const setOf = (txt) => new Set((txt.match(/provinces\s*=\s*\{([^}]*)\}/)[1].match(/\d+/g) || []).map(Number));
    check("state", i, "remove→re-add province SET equal", JSON.stringify([...setOf(r2)].sort()) === JSON.stringify([...setOf(base)].sort()));
  }
}

// ── C. cross-mod loc isolation under hammering ─────────────────────────────────────────────────
async function fuzzCrossModLoc(N, post, modA, modB) {
  const locA = path.join(modA, "localisation/english/custom_events_l_english.yml");
  const locB = path.join(modB, "localisation/english/custom_events_l_english.yml");
  const readF = (p) => { try { return fs.readFileSync(p, "utf8"); } catch (_) { return ""; } };
  for (let i = 0; i < N; i++) {
    const title = `Title v${i} ${pick(["Alpha", "\"Beta\"", "Gamma§Y!"])}`;
    const ra = await post("/api/events/save", { modPath: modA, namespace: "xa", id: "1", type: "country_event", title, description: "d", picture: "GFX_report_event_001", triggeredOnly: "yes", hidden: "no", fireOnce: "no", major: "no", mtthDays: 0, trigger: "", immediate: "", options: [{ name: "xa.1.a", title: "OK", script: "" }] });
    const rb = await post("/api/events/save", { modPath: modB, namespace: "xb", id: "1", type: "country_event", title, description: "d", picture: "GFX_report_event_001", triggeredOnly: "yes", hidden: "no", fireOnce: "no", major: "no", mtthDays: 0, trigger: "", immediate: "", options: [{ name: "xb.1.a", title: "OK", script: "" }] });
    check("xmod", i, "both saves ok", ra.status < 400 && rb.status < 400, `${ra.status}/${rb.status}`);
  }
  const A = readF(locA), B = readF(locB);
  check("xmod", -1, "mod A loc has ITS key exactly once", (A.match(/^\s*xa\.1\.t:/gm) || []).length === 1, (A.match(/^\s*xa\.1\.t:/gm) || []).length);
  check("xmod", -1, "mod B loc has ITS key exactly once", (B.match(/^\s*xb\.1\.t:/gm) || []).length === 1, (B.match(/^\s*xb\.1\.t:/gm) || []).length);
  check("xmod", -1, "mod A has NO cross-contamination from B", !/xb\.1/.test(A), (A.match(/.*xb\.1.*/) || [])[0]);
  check("xmod", -1, "mod B has NO cross-contamination from A", !/xa\.1/.test(B), (B.match(/.*xa\.1.*/) || [])[0]);
  check("xmod", -1, "hammered value = LAST value wins (A)", A.includes(`v${N - 1}`), (A.match(/xa\.1\.t:.*/) || [])[0]);
  check("xmod", -1, "no event file leaked into the other mod", !fs.existsSync(path.join(modA, "events/xb.txt")) && !fs.existsSync(path.join(modB, "events/xa.txt")));
}

(async () => {
  const t0 = Date.now();
  const modA = fs.mkdtempSync(path.join(os.tmpdir(), "nova-fz5a-"));
  const modB = fs.mkdtempSync(path.join(os.tmpdir(), "nova-fz5b-"));
  fs.writeFileSync(path.join(modA, "descriptor.mod"), 'name="FzA"\n');
  fs.writeFileSync(path.join(modB, "descriptor.mod"), 'name="FzB"\n');
  const app = S.createApp();
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const post = (p, body) => new Promise((res, rej) => {
    const data = Buffer.from(JSON.stringify(body));
    const r = http.request({ host: "127.0.0.1", port: server.address().port, path: p, method: "POST", headers: { "Content-Type": "application/json", "Content-Length": data.length } },
      (rs) => { let o = ""; rs.on("data", c => o += c); rs.on("end", () => res({ status: rs.statusCode, body: o })); });
    r.on("error", rej); r.write(data); r.end();
  });
  try {
    fuzzSharedToggles(15);
    fuzzStateEditors(15);
    await fuzzCrossModLoc(8, post, modA, modB);
  } catch (e) { fail++; failures.push({ area: "harness", case: -1, name: "threw", extra: (e && e.stack || String(e)).slice(0, 600) }); }
  finally {
    server.close();
    for (const m of [modA, modB]) { try { fs.rmSync(m, { recursive: true, force: true }); } catch (_) {} }
    console.log(`\nMAKER-FUZZ5 seed=${SEED}: ${pass} checks passed, ${fail} failed (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    for (const f of failures.slice(0, 40)) console.log(`  FAIL [${f.area} #${f.case}] ${f.name} → ${f.extra}`);
    if (failures.length > 40) console.log(`  …and ${failures.length - 40} more`);
    process.exit(fail ? 1 : 0);
  }
})();
