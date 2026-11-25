// A province that changes state takes the statements its old state's history makes about it alone — its province modifiers
// and its names, in the dates they are written for. #a-moved-province-keeps-its-modifiers-and-names
//
// Measured on the six shipping maps' history/states:
//     add_province_modifier = { static_modifiers = { terrain_leeds } province = { id = 9379 } }
//         Millennium Dawn 1,737, every one naming exactly one province, 1,736 of them a province of that same state
//     1924.1.25 = { set_province_name = { id = 3151 name = RON_LENINGRAD } }
//         Rise of Nations 23, Novum Vexillum 1 — all dated, all one id, all a province of that same state
//     neither, on vanilla, Road to 56 or Old World Blues
//
// THE DEFECT, reproduced on the base commit through the requests the client sends. Moving every province of every shipping
// state out and back through moveProvince's transforms left 1,723 Millennium Dawn provinces' modifiers and 12 Rise of Nations /
// Novum Vexillum provinces' names in the state they had left (the only history still stranded once buildings and victory
// points were carried). POST /api/map/move-province left them there; POST /api/map/merge-state deleted them with the old
// state's file — a Millennium Dawn city's terrain, a Rise of Nations city's name for sixty years of bookmarks, gone.
//
// ⚠️ NOT EVERYTHING THAT MENTIONS THE PROVINCE IS ITS OWN: a statement naming two provinces stays where it is (section 1).
//
// The walkers below are this test's own, so it does not grade the implementation with the implementation.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

let checks = 0, skips = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 600)));
  if (!ok) fails.push(label);
};
const skip = (label) => { skips++; console.log("  SKIP " + label); };

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-modsnames-"));
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const M = require("./map-data.js");
const { createApp } = require("./server.js");

// ── the test's own reading of a state file ───────────────────────────────────────────────────────────────────────────
const mask = (t) => String(t).replace(/#[^\r\n]*/g, (m) => " ".repeat(m.length));
const closeOf = (s, open) => { let d = 0; for (let i = open; i < s.length; i++) { if (s[i] === "{") d++; else if (s[i] === "}") { d--; if (d === 0) return i; } } return -1; };
const isDate = (k) => /^\d+\.\d+\.\d+(\.\d+)?$/.test(k);
const entries = (raw) => {
  const s = mask(raw), out = [];
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "}") { depth--; continue; }
    if (c !== "{") continue;
    if (depth > 0) { depth++; continue; }
    let k = i, key = "";
    while (k > 0 && /\s/.test(s[k - 1])) k--;
    if (s[k - 1] === "=") { k--; while (k > 0 && /\s/.test(s[k - 1])) k--; const e = k; while (k > 0 && /[A-Za-z0-9_.]/.test(s[k - 1])) k--; key = s.slice(k, e); }
    const close = closeOf(s, i);
    if (close < 0) break;
    out.push({ key, inner: raw.slice(i + 1, close), text: raw.slice(k, close + 1) });
    i = close;
  }
  return out;
};
const historyOf = (fileText) => {
  const st = entries(fileText).find((e) => e.key === "state");
  const h = st && entries(st.inner).find((e) => e.key === "history");
  return h ? h.inner : "";
};
const ctxs = (hist, date) => (date ? entries(hist).filter((e) => e.key === date).map((e) => e.inner) : [hist]);
const allDates = (hist) => [null, ...new Set(entries(hist).map((e) => e.key).filter(isDate))];
const idsIn = (inner) => [...mask(inner).matchAll(/(?:^|[^A-Za-z0-9_])id\s*=\s*(\d+)/g)].map((m) => Number(m[1]));
const KEYS = ["add_province_modifier", "set_province_name"];
/** statements about exactly this province, in one context, squashed */
const ownStatements = (hist, pid, date) => ctxs(hist, date).flatMap((c) => entries(c).filter((e) => KEYS.includes(e.key) && idsIn(e.inner).length === 1 && idsIn(e.inner)[0] === pid).map((e) => mask(e.text).replace(/\s+/g, " ").trim()));
const ownAnywhere = (hist, pid) => allDates(hist).reduce((n, d) => n + ownStatements(hist, pid, d).length, 0);
const dateEntries = (hist, date) => entries(hist).filter((e) => e.key === date);
const balance = (t) => { let d = 0; for (const c of mask(t)) { if (c === "{") d++; else if (c === "}") d--; } return d; };
const squash = (t) => mask(t).replace(/\s+/g, " ").trim();

// ── fixtures ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const mkMod = (name, states) => {
  const MOD = path.join(ROOT, name);
  const mk = (rel, c) => { const p = path.join(MOD, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
  mk("descriptor.mod", `name="${name}"\nsupported_version="1.19.*"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n`);
  const ids = [1, 2, 3, 4, 5];
  mk("map/definition.csv", ["0;0;0;0;land;false;unknown;0", ...ids.map((i) => `${i};${i * 10};0;0;land;false;plains;1`)].join("\n") + "\n");
  mk("map/adjacencies.csv", "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n-1;-1;-1;-1;-1;-1;-1;-1;-1\n");
  mk("map/strategicregions/1-R.txt", `strategic_region={\n\tid=1\n\tname="R1"\n\tprovinces={ ${ids.join(" ")} }\n}\n`);
  mk("history/countries/ZZZ - Z.txt", "capital = 3\n");
  for (const [f, t] of Object.entries(states)) mk("history/states/" + f, t);
  return MOD;
};
const stateText = (MOD, f) => { try { return fs.readFileSync(path.join(MOD, "history", "states", f), "utf8"); } catch (_) { return ""; } };

// Province 1: a terrain modifier the way Millennium Dawn's 10-Yorkshire and the Humber.txt writes one (with a caption), two
// dated names the way Rise of Nations' 1091-South Ossetia.txt writes them, and a SHARED modifier naming provinces 1 and 2,
// which is not province 1's alone. Province 2 has its own modifier.
const SOURCE = `state = {
	id = 1
	name = "STATE_1"
	manpower = 1000
	state_category = rural
	provinces = { 1 2 }
	history = {
		owner = AAA
		# Leeds
		add_province_modifier = { static_modifiers = { terrain_leeds } province = { id = 1 } }
		add_province_modifier = { static_modifiers = { terrain_sheffield } province = { id = 2 } }
		add_province_modifier = { static_modifiers = { shared_valley } province = { id = 1 id = 2 } }
		1934.1.1 = {
			set_province_name = { id = 1 name = RON_STALINIRI }
		}
		1961.1.1 = {
			owner = AAA
			set_province_name = { id = 1 name = RON_TSHKINVALI }
		}
	}
}
`;
const TARGET = 'state = {\n\tid = 2\n\tname = "STATE_2"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 3 }\n\thistory = {\n\t\towner = BBB\n\t\t1961.1.1 = {\n\t\t\towner = BBB\n\t\t}\n\t}\n}\n';
const EMPTY3 = 'state = {\n\tid = 3\n\tname = "STATE_3"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 4 }\n\thistory = {\n\t\towner = ZZZ\n\t}\n}\n';

const server = createApp().listen(0, async () => {
  const PORT = server.address().port;
  const post = (ep, body) => fetch(`http://127.0.0.1:${PORT}${ep}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  try {
    console.log("[control] the test's own walkers read the fixture the way it is written");
    {
      const h = historyOf(SOURCE);
      rec("province 1 has one modifier of its own and a name in 1934 and 1961; the shared modifier is nobody's alone", ownStatements(h, 1, null).length === 1 && ownStatements(h, 1, "1934.1.1").length === 1 && ownStatements(h, 1, "1961.1.1").length === 1 && ownAnywhere(h, 1) === 3);
    }

    console.log("\n1. Move province 1 into a state that has its own 1961.1.1 entry, and back  (POST /api/map/move-province)");
    {
      const MOD = mkMod("move", { "1-A.txt": SOURCE, "2-B.txt": TARGET, "3-C.txt": EMPTY3 });
      const r = await post("/api/map/move-province", { provinceId: 1, toStateId: 2, modPath: MOD });
      rec("the move succeeded", r.s === 200 && r.b && r.b.ok === true, r.b);
      const a = stateText(MOD, "1-A.txt"), b = stateText(MOD, "2-B.txt");
      const ha = historyOf(a), hb = historyOf(b);
      rec("⭐⭐⭐ the terrain modifier arrived, undated, as written", ownStatements(hb, 1, null).length === 1 && /terrain_leeds/.test(ownStatements(hb, 1, null)[0]), hb);
      rec("⭐ …with its caption directly above it", /# Leeds[ \t]*\r?\n[ \t]*add_province_modifier = \{ static_modifiers = \{ terrain_leeds \}/.test(b), b);
      rec("⭐⭐⭐ the 1934 name arrived in a 1934.1.1 entry", ownStatements(hb, 1, "1934.1.1").length === 1 && /RON_STALINIRI/.test(ownStatements(hb, 1, "1934.1.1")[0]), hb);
      rec("⭐⭐ the 1961 name was spliced into the target's own 1961.1.1 entry", dateEntries(hb, "1961.1.1").length === 1 && ownStatements(hb, 1, "1961.1.1").length === 1 && /owner\s*=\s*BBB/.test(dateEntries(hb, "1961.1.1")[0].inner), hb);
      rec("⭐⭐⭐ the old state makes no statement about province 1 alone, in any date", ownAnywhere(ha, 1) === 0, ha);
      rec("⚠️⚠️ …and still makes the one about provinces 1 AND 2, which was not province 1's to take", /shared_valley/.test(ha) && !/shared_valley/.test(b), { ha, hb });
      rec("⚠️ …and keeps province 2's own modifier and its 1961.1.1 owner change", /terrain_sheffield/.test(ha) && /owner\s*=\s*AAA/.test((dateEntries(ha, "1961.1.1")[0] || {}).inner || ""), ha);
      rec("⭐ …and no 1934.1.1 entry left empty", dateEntries(ha, "1934.1.1").length === 0, ha);
      rec("both files are brace-balanced", balance(a) === 0 && balance(b) === 0, { a: balance(a), b: balance(b) });

      const back = await post("/api/map/move-province", { provinceId: 1, toStateId: 1, modPath: MOD });
      rec("moving it back succeeded", back.s === 200 && back.b && back.b.ok === true, back.b);
      const ha2 = historyOf(stateText(MOD, "1-A.txt")), hb2 = historyOf(stateText(MOD, "2-B.txt"));
      rec("⭐ after moving back, the target makes no statement about province 1 and keeps no 1934.1.1 entry", ownAnywhere(hb2, 1) === 0 && dateEntries(hb2, "1934.1.1").length === 0, hb2);
      rec("⭐ the old state makes all three again, one each, in their dates", ownStatements(ha2, 1, null).length === 1 && ownStatements(ha2, 1, "1934.1.1").length === 1 && ownStatements(ha2, 1, "1961.1.1").length === 1, ha2);
    }

    console.log("\n1b. A statement the state writes twice over goes twice (Millennium Dawn's 522-Red River Delta.txt shape)  (POST /api/map/move-province)");
    {
      const TWICE = 'state = {\n\tid = 1\n\tname = "STATE_1"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 4 5 }\n\thistory = {\n\t\towner = AAA\n\t\tadd_province_modifier = {\n\t\t\tstatic_modifiers = { terrain_haipong }\n\t\t\tprovince = { id = 4 }\n\t\t}\n\t\tadd_province_modifier = {\n\t\t\tstatic_modifiers = { terrain_haipong }\n\t\t\tprovince = { id = 4 }\n\t\t}\n\t\tadd_province_modifier = {\n\t\t\tstatic_modifiers = { terrain_hanoi }\n\t\t\tprovince = { id = 5 }\n\t\t}\n\t}\n}\n';
      const MOD = mkMod("twice", { "1-A.txt": TWICE, "3-C.txt": EMPTY3.replace("provinces = { 4 }", "provinces = { 3 }") });
      const r = await post("/api/map/move-province", { provinceId: 4, toStateId: 3, modPath: MOD });
      rec("the move succeeded", r.s === 200 && r.b && r.b.ok === true, r.b);
      const a = stateText(MOD, "1-A.txt"), c = stateText(MOD, "3-C.txt");
      rec("⭐⭐ the new state gives province 4 the terrain modifier twice, as the old state did", ownStatements(historyOf(c), 4, null).length === 2, c);
      rec("the old state gives province 4 none and keeps province 5's", ownAnywhere(historyOf(a), 4) === 0 && ownStatements(historyOf(a), 5, null).length === 1, a);
      rec("both files are brace-balanced", balance(a) === 0 && balance(c) === 0);
    }

    console.log("\n2. Merge a state away  (POST /api/map/merge-state)");
    {
      const MOD = mkMod("merge", { "1-A.txt": SOURCE, "2-B.txt": TARGET, "3-C.txt": EMPTY3 });
      const r = await post("/api/map/merge-state", { sourceStateId: 1, targetStateId: 3, modPath: MOD });
      rec("the merge succeeded", r.s === 200 && r.b && r.b.ok === true, r.b);
      rec("the merged-away state's file is gone", !fs.existsSync(path.join(MOD, "history", "states", "1-A.txt")));
      const c = stateText(MOD, "3-C.txt"), hc = historyOf(c);
      rec("⭐⭐⭐ both provinces' own terrain modifiers survive the deleted file", ownStatements(hc, 1, null).length === 1 && ownStatements(hc, 2, null).length === 1, c);
      rec("⭐⭐⭐ …and both of province 1's names, each in its date", ownStatements(hc, 1, "1934.1.1").length === 1 && ownStatements(hc, 1, "1961.1.1").length === 1, c);
      rec("the target's file is brace-balanced", balance(c) === 0, balance(c));
    }

    console.log("\n3. Auto-fix resolves a province two states claim  (POST /api/map/auto-fix)");
    {
      const KEEPER = 'state = {\n\tid = 1\n\tname = "STATE_1"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 1 2 3 }\n\thistory = {\n\t\towner = AAA\n\t\tadd_province_modifier = { static_modifiers = { terrain_hull } province = { id = 3 } }\n\t}\n}\n';
      const LOSER = 'state = {\n\tid = 2\n\tname = "STATE_2"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 3 4 }\n\thistory = {\n\t\towner = BBB\n\t\tadd_province_modifier = { static_modifiers = { terrain_hull } province = { id = 3 } }\n\t\t1924.1.25 = {\n\t\t\tset_province_name = { id = 3 name = RON_LENINGRAD }\n\t\t}\n\t}\n}\n';
      const MOD = mkMod("twostates", { "1-Keeper.txt": KEEPER, "2-Loser.txt": LOSER, "3-C.txt": EMPTY3.replace("provinces = { 4 }", "provinces = { 5 }") });
      const r = await post("/api/map/auto-fix", { modPath: MOD });
      rec("Auto-fix ran", r.s === 200 && r.b && r.b.ok === true, r.b);
      const k = stateText(MOD, "1-Keeper.txt"), l = stateText(MOD, "2-Loser.txt");
      const hk = historyOf(k), hl = historyOf(l);
      rec("⭐⭐⭐ the keeper gained the loser's 1924 name for province 3, still dated", ownStatements(hk, 3, "1924.1.25").length === 1, k);
      rec("⭐ …and holds the terrain modifier both states wrote ONCE, not twice", ownStatements(hk, 3, null).length === 1, k);
      rec("⭐⭐ the loser makes no statement about province 3", ownAnywhere(hl, 3) === 0, l);
      rec("both files are brace-balanced", balance(k) === 0 && balance(l) === 0);
      const dir = path.join(MOD, "history", "states");
      const hash = () => fs.readdirSync(dir).sort().map((f) => f + ":" + crypto.createHash("sha1").update(fs.readFileSync(path.join(dir, f))).digest("hex")).join("|");
      const before = hash();
      const r2 = await post("/api/map/auto-fix", { modPath: MOD });
      rec("a second Auto-fix click ran", r2.s === 200 && r2.b && r2.b.ok === true, r2.b);
      rec("⭐ …and left history/states byte-identical", hash() === before, { before, after: hash() });
    }

    console.log("\n4. The shipping maps' own province modifiers and names, moved through moveProvince (derived from the installed corpus)");
    {
      const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
      const roots = [["Millennium Dawn", path.join(WS, "2777392649")], ["Novum Vexillum", path.join(WS, "1827273767")], ["Rise of Nations", path.join(WS, "2026448968")]];
      const PER_MAP = 30;
      let ran = 0, total = 0;
      for (const [label, root] of roots) {
        const sdir = path.join(root, "history", "states");
        if (!fs.existsSync(sdir)) { skip(`${label} is not installed — its modifiers and names were NOT moved`); continue; }
        ran++;
        const picked = [];
        let n = 0, doubled = 0;
        for (const f of fs.readdirSync(sdir).filter((x) => /\.txt$/i.test(x)).sort()) {
          let raw; try { raw = fs.readFileSync(path.join(sdir, f), "utf8"); } catch (_) { continue; }
          if (!/add_province_modifier|set_province_name/.test(raw)) continue;
          const st = entries(raw).find((e) => e.key === "state");
          if (!st) continue;
          const id = Number((/(?:^|[^A-Za-z0-9_])id\s*=\s*(\d+)/.exec(mask(st.inner)) || [])[1]);
          const provs = (((/provinces\s*=\s*\{([^}]*)\}/.exec(mask(st.inner)) || [])[1] || "").match(/\d+/g) || []).map(Number);
          const h = historyOf(raw);
          const want = [];
          for (const pid of provs) {
            const perDate = allDates(h).map((d) => ({ d, s: ownStatements(h, pid, d) })).filter((x) => x.s.length);
            if (!perDate.length) continue;
            // Every province given the same statement twice over (Millennium Dawn's 522-Red River Delta.txt), and the first
            // PER_MAP others.
            if (perDate.some((x) => new Set(x.s).size < x.s.length)) doubled++;
            else if (n >= PER_MAP) continue;
            else n++;
            want.push({ pid, perDate });
          }
          if (want.length) picked.push({ f, raw, id, provs, want });
        }
        if (label === "Millennium Dawn") rec("Millennium Dawn: the corpus gives some provinces the same statement twice (derived, not typed in)", doubled > 0, doubled);
        if (!picked.length) { rec(`${label}: has province modifiers or names to move`, false, "none found"); continue; }
        const MOD = path.join(ROOT, "corpus-" + label.replace(/\W+/g, ""));
        const allProvs = [...new Set(picked.flatMap((p) => p.provs))];
        const targetId = Math.max(...picked.map((p) => p.id)) + 1, targetProv = Math.max(...allProvs) + 1;
        const mk = (rel, c) => { const p = path.join(MOD, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
        mk("descriptor.mod", 'name="corpus"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n');
        mk("map/definition.csv", ["0;0;0;0;land;false;unknown;0", ...[...allProvs, targetProv].map((q, i) => `${q};${((i + 1) >> 16) & 255};${((i + 1) >> 8) & 255};${(i + 1) & 255};land;false;plains;1`)].join("\n") + "\n");
        for (const p of picked) mk("history/states/" + p.f, p.raw);
        const TFILE = `${targetId}-Target.txt`;
        mk("history/states/" + TFILE, `state = {\n\tid = ${targetId}\n\tname = "STATE_${targetId}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${targetProv} }\n\thistory = {\n\t\towner = ZZZ\n\t}\n}\n`);
        const errors = [], wrong = [], stray = [], unbalanced = [];
        for (const p of picked) for (const w of p.want) {
          const res = M.moveProvince({ modRoot: MOD, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [], provinceId: w.pid, toStateId: targetId });
          if (!res || res.error) errors.push({ pid: w.pid, error: res && res.error });
        }
        const tText = stateText(MOD, TFILE), th = historyOf(tText);
        for (const p of picked) {
          const after = stateText(MOD, p.f);
          if (balance(after) !== 0) unbalanced.push(p.f);
          for (const w of p.want) {
            for (const x of w.perDate) if (ownStatements(th, w.pid, x.d).join("|") !== x.s.join("|")) wrong.push({ file: p.f, pid: w.pid, date: x.d, had: x.s, got: ownStatements(th, w.pid, x.d) });
            if (ownAnywhere(historyOf(after), w.pid)) stray.push({ file: p.f, pid: w.pid });
          }
        }
        const moved = picked.reduce((k, p) => k + p.want.length, 0);
        total += moved;
        rec(`${label}: moved all ${moved} provinces`, errors.length === 0, errors.slice(0, 6));
        rec(`${label}: ⭐⭐⭐ each has every statement about it alone, in its date, as written`, wrong.length === 0, wrong.slice(0, 4));
        rec(`${label}: ⭐⭐ …and none left in the state it came from`, stray.length === 0, stray.slice(0, 6));
        rec(`${label}: every file stays brace-balanced`, unbalanced.length === 0 && balance(tText) === 0, unbalanced);
      }
      if (!ran) skip("no shipping map with province modifiers or names is installed — section 4 did NOT run");
      else console.log(`  (${total} provinces across ${ran} maps)`);
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    console.log(`\n=== a moved province keeps its modifiers and names: ${checks} checks, ${fails.length} failed, ${skips} skipped ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });
