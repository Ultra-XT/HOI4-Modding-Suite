// A province that changes state takes every building block it has, each into the date it is written for.
// #a-moved-province-keeps-its-dated-buildings
//
// HOI4's state history is dated: `1939.1.1 = { buildings = { 3686 = { naval_facility = 1 } } }` applies to a bookmark that
// starts on or after that date (wiki, State modding). Measured on the six shipping maps' history/states:
//     dated province building blocks        vanilla 26 (all 1939.1.1, in 16 states) · Rise of Nations 27 (seven dates) ·
//                                           Novum Vexillum 8 · Millennium Dawn, Road to 56, Old World Blues 0
//     one province named by two blocks in   Novum Vexillum 3 — 188-Memel `3288 = { bunker = 1 }` + `3288 = { naval_base = 2 }`,
//     one buildings block                   444-Karachi, 840-Ida-Viru — each pair setting DIFFERENT buildings
//     buildings anywhere else in history    0 on all six (no `if = { buildings = … }`)
//
// THE DEFECTS, reproduced on the base commit through the requests the client sends:
//   1. POST /api/map/move-province read and removed the province's FIRST `buildings` block only. Its dated blocks stayed in
//      the old state, where hoi4.exe logs "State Error: Trying to set province building in state that doesn't own it" and
//      skips the building: every one of vanilla's 26, Rise of Nations' 27 and Novum Vexillum's 5 in-state dated blocks
//      (section 5).
//   2. Of two blocks for one province the first was carried and BOTH were deleted: Memel's naval base was gone.
//   3. POST /api/map/merge-state then deleted the old state's file, and every dated block in it.
//   4. POST /api/map/auto-fix's province-in-two-states repair left the loser's dated block behind.
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

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-datedbuildings-"));
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const M = require("./map-data.js");
const { createApp } = require("./server.js");

// ── the test's own reading of a state file ───────────────────────────────────────────────────────────────────────────
const mask = (t) => String(t).replace(/#[^\r\n]*/g, (m) => " ".repeat(m.length));
const closeOf = (s, open) => { let d = 0; for (let i = open; i < s.length; i++) { if (s[i] === "{") d++; else if (s[i] === "}") { d--; if (d === 0) return i; } } return -1; };
const isDate = (k) => /^\d+\.\d+\.\d+(\.\d+)?$/.test(k);
/** depth-0 `key = { … }` entries of a body: { key, inner, text } */
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
/** undated: history's own entries; dated: the inner of every `<date> = { }` with that key */
const ctxs = (hist, date) => (date ? entries(hist).filter((e) => e.key === date).map((e) => e.inner) : [hist]);
const provinceBlocks = (hist, pid, date) => ctxs(hist, date).flatMap((c) => entries(c).filter((e) => e.key === "buildings").flatMap((b) => entries(b.inner).filter((p) => p.key === String(pid))));
const dateEntries = (hist, date) => entries(hist).filter((e) => e.key === date);
const allDates = (hist) => [null, ...new Set(entries(hist).map((e) => e.key).filter(isDate))];
const blocksAnywhere = (hist, pid) => allDates(hist).reduce((n, d) => n + provinceBlocks(hist, pid, d).length, 0);
const balance = (t) => { let d = 0; for (const c of mask(t)) { if (c === "{") d++; else if (c === "}") d--; } return d; };
const squash = (t) => String(t).replace(/\s+/g, " ").trim();

// ── fixtures ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const mkMod = (name, states) => {
  const MOD = path.join(ROOT, name);
  const mk = (rel, c) => { const p = path.join(MOD, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
  // history/countries is replaced too: the endpoints layer the installed game underneath, and a vanilla capital on state 1
  // would make merge-state refuse (correctly) to merge it away.
  mk("descriptor.mod", `name="${name}"\nsupported_version="1.19.*"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n`);
  const ids = [1, 2, 3, 4, 5, 6, 7];
  mk("map/definition.csv", ["0;0;0;0;land;false;unknown;0", ...ids.map((i) => `${i};${i * 10};0;0;land;false;plains;1`)].join("\n") + "\n");
  mk("map/adjacencies.csv", "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n-1;-1;-1;-1;-1;-1;-1;-1;-1\n");
  mk("map/strategicregions/1-R.txt", `strategic_region={\n\tid=1\n\tname="R1"\n\tprovinces={ ${ids.join(" ")} }\n}\n`);
  mk("history/countries/ZZZ - Z.txt", "capital = 3\n");
  for (const [f, t] of Object.entries(states)) mk("history/states/" + f, t);
  return MOD;
};
const stateText = (MOD, f) => { try { return fs.readFileSync(path.join(MOD, "history", "states", f), "utf8"); } catch (_) { return ""; } };

// Province 1: an undated block, a `1939.1.1` block written the way vanilla's 219-Moscow Area.txt writes one (a comment on the
// brace line), and a `1933.1.1` block (Rise of Nations' 28-Alcase.txt shape). Province 5 shares the 1939 block and stays.
const SOURCE = `state = {
	id = 1
	name = "STATE_1"
	manpower = 1000
	state_category = rural
	provinces = { 1 2 5 }
	history = {
		owner = AAA
		buildings = {
			infrastructure = 3
			1 = { bunker = 5 }
		}
		1939.1.1 = {
			buildings = {
				1 = { land_facility = 1 # Mytischi
				}
				5 = { bunker = 1 }
			}
		}
		1933.1.1 = {
			buildings = {
				1 = { bunker = 10 }
			}
		}
		1938.10.25 = {
			owner = AAA
		}
	}
}
`;
// The target already has a 1939.1.1 entry of its own.
const TARGET = `state = {
	id = 2
	name = "STATE_2"
	manpower = 1000
	state_category = rural
	provinces = { 3 }
	history = {
		owner = BBB
		buildings = {
			3 = { bunker = 1 }
		}
		1939.1.1 = {
			buildings = {
				3 = { land_facility = 1 }
			}
		}
	}
}
`;
const EMPTY3 = 'state = {\n\tid = 3\n\tname = "STATE_3"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 4 }\n\thistory = {\n\t\towner = ZZZ\n\t}\n}\n';

const server = createApp().listen(0, async () => {
  const PORT = server.address().port;
  // Exactly what public/map.js sends: queueWrite("/api/map/move-province", { provinceId, toStateId }, { fromStateId }) keeps
  // fromStateId in META, and flushMapSaves posts Object.assign({}, w.body, { modPath }). merge-state: { sourceStateId,
  // targetStateId }. Auto-fix: { modPath }.
  const post = (ep, body) => fetch(`http://127.0.0.1:${PORT}${ep}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  try {
    console.log("[control] the test's own walkers read the fixture the way it is written");
    {
      const h = historyOf(SOURCE);
      rec("province 1 has one undated block, one 1939.1.1 block and one 1933.1.1 block", provinceBlocks(h, 1, null).length === 1 && provinceBlocks(h, 1, "1939.1.1").length === 1 && provinceBlocks(h, 1, "1933.1.1").length === 1);
      rec("…and province 5 a 1939.1.1 block", provinceBlocks(h, 5, "1939.1.1").length === 1);
      rec("blocksAnywhere() counts province 1's three", blocksAnywhere(h, 1) === 3, blocksAnywhere(h, 1));
    }

    console.log("\n1. Move province 1 into a state that has its own 1939.1.1 entry, and back  (POST /api/map/move-province)");
    {
      const MOD = mkMod("move", { "1-A.txt": SOURCE, "2-B.txt": TARGET, "3-C.txt": EMPTY3 });
      const r = await post("/api/map/move-province", { provinceId: 1, toStateId: 2, modPath: MOD });
      rec("the move succeeded", r.s === 200 && r.b && r.b.ok === true, r.b);
      const a = stateText(MOD, "1-A.txt"), b = stateText(MOD, "2-B.txt");
      const ha = historyOf(a), hb = historyOf(b);

      rec("the undated block arrived undated", provinceBlocks(hb, 1, null).length === 1 && /bunker\s*=\s*5/.test(provinceBlocks(hb, 1, null)[0].text), hb);
      rec("⭐ the target still has exactly ONE 1939.1.1 entry — the dated block was spliced into it", dateEntries(hb, "1939.1.1").length === 1, dateEntries(hb, "1939.1.1").map((e) => e.text));
      const d39 = provinceBlocks(hb, 1, "1939.1.1");
      rec("⭐⭐⭐ …holding province 1's 1939 building", d39.length === 1 && /land_facility\s*=\s*1/.test(d39[0].text), hb);
      rec("⭐ …with the author's comment", /# Mytischi/.test(d39[0] ? d39[0].text : ""), d39[0] && d39[0].text);
      rec("…beside the target's own 1939 building for province 3", provinceBlocks(hb, 3, "1939.1.1").length === 1);
      const d33 = provinceBlocks(hb, 1, "1933.1.1");
      rec("⭐⭐ a 1933.1.1 entry was created for the 1933 building", dateEntries(hb, "1933.1.1").length === 1 && d33.length === 1 && /bunker\s*=\s*10/.test(d33[0].text), hb);
      rec("…and neither dated building became undated", provinceBlocks(hb, 1, null).every((x) => !/land_facility|bunker\s*=\s*10/.test(x.text)), hb);

      rec("⭐⭐⭐ the old state names province 1 in no building block, in any date", blocksAnywhere(ha, 1) === 0, ha);
      rec("⚠️ …and keeps province 5's 1939 block, which is not the province's", provinceBlocks(ha, 5, "1939.1.1").length === 1, ha);
      rec("⚠️ …and its own 1938.10.25 owner change", /owner\s*=\s*AAA/.test((dateEntries(ha, "1938.10.25")[0] || {}).inner || ""), ha);
      rec("⚠️ …and its state-level infrastructure", /infrastructure\s*=\s*3/.test(ha), ha);
      rec("⭐ …and no empty 1933.1.1 entry — the only thing in it went with the province", dateEntries(ha, "1933.1.1").length === 0, ha);
      rec("both files are brace-balanced", balance(a) === 0 && balance(b) === 0, { a: balance(a), b: balance(b) });

      const back = await post("/api/map/move-province", { provinceId: 1, toStateId: 1, modPath: MOD });
      rec("moving it back succeeded", back.s === 200 && back.b && back.b.ok === true, back.b);
      const ha2 = historyOf(stateText(MOD, "1-A.txt")), hb2 = historyOf(stateText(MOD, "2-B.txt"));
      rec("⭐ after moving back, the target names province 1 in no building block", blocksAnywhere(hb2, 1) === 0, hb2);
      rec("⭐ …and keeps no empty 1933.1.1 entry the first move made for it", dateEntries(hb2, "1933.1.1").length === 0, hb2);
      rec("⚠️ …while its own 1939.1.1 entry, which still holds province 3's building, stays", dateEntries(hb2, "1939.1.1").length === 1 && provinceBlocks(hb2, 3, "1939.1.1").length === 1, hb2);
      rec("⭐ the old state holds all three of province 1's blocks again, one each, in their dates",
        provinceBlocks(ha2, 1, null).length === 1 && provinceBlocks(ha2, 1, "1939.1.1").length === 1 && provinceBlocks(ha2, 1, "1933.1.1").length === 1 && blocksAnywhere(ha2, 1) === 3, ha2);
    }

    console.log("\n2. A province named by two blocks in one buildings block (Novum Vexillum's Memel shape)  (POST /api/map/move-province)");
    {
      const TWO = 'state = {\n\tid = 1\n\tname = "STATE_1"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 6 7 }\n\thistory = {\n\t\towner = AAA\n\t\tbuildings = {\n\t\t\tinfrastructure = 2\n\t\t\t6 = { bunker = 1 }\n\t\t\t6 = { naval_base = 2 }\n\t\t\t7 = { bunker = 3 }\n\t\t}\n\t}\n}\n';
      const MOD = mkMod("twoblocks", { "1-A.txt": TWO, "3-C.txt": EMPTY3 });
      const r = await post("/api/map/move-province", { provinceId: 6, toStateId: 3, modPath: MOD });
      rec("the move succeeded", r.s === 200 && r.b && r.b.ok === true, r.b);
      const a = stateText(MOD, "1-A.txt"), c = stateText(MOD, "3-C.txt");
      const got = provinceBlocks(historyOf(c), 6, null).map((x) => squash(mask(x.text))).join(" | ");
      rec("⭐⭐⭐ the new state has province 6's naval base", /naval_base\s*=\s*2/.test(got), c);
      rec("⭐⭐ …and its bunker", /bunker\s*=\s*1/.test(got), c);
      rec("the old state names province 6 in no block", blocksAnywhere(historyOf(a), 6) === 0, a);
      rec("⚠️ …and keeps province 7's", provinceBlocks(historyOf(a), 7, null).length === 1, a);
      rec("both files are brace-balanced", balance(a) === 0 && balance(c) === 0);
    }

    console.log("\n3. Merge a state away  (POST /api/map/merge-state)");
    {
      const SRC = SOURCE.replace("provinces = { 1 2 5 }", "provinces = { 1 5 }");
      const MOD = mkMod("merge", { "1-A.txt": SRC, "2-B.txt": TARGET, "3-C.txt": EMPTY3 });
      const r = await post("/api/map/merge-state", { sourceStateId: 1, targetStateId: 3, modPath: MOD });
      rec("the merge succeeded", r.s === 200 && r.b && r.b.ok === true, r.b);
      rec("the merged-away state's file is gone", !fs.existsSync(path.join(MOD, "history", "states", "1-A.txt")));
      const c = stateText(MOD, "3-C.txt"), hc = historyOf(c);
      rec("⭐⭐⭐ the 1939 buildings of both provinces survive the deleted file, in ONE 1939.1.1 entry", dateEntries(hc, "1939.1.1").length === 1 && provinceBlocks(hc, 1, "1939.1.1").length === 1 && provinceBlocks(hc, 5, "1939.1.1").length === 1, c);
      rec("⭐⭐ …and the 1933 one in a 1933.1.1 entry", provinceBlocks(hc, 1, "1933.1.1").length === 1, c);
      rec("…and the undated one undated", provinceBlocks(hc, 1, null).length === 1 && /bunker\s*=\s*5/.test(provinceBlocks(hc, 1, null)[0].text), c);
      rec("the target's file is brace-balanced", balance(c) === 0, balance(c));
    }

    console.log("\n4. Auto-fix resolves a province two states claim, and the loser wrote a dated block for it  (POST /api/map/auto-fix)");
    {
      const KEEPER = 'state = {\n\tid = 1\n\tname = "STATE_1"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 1 2 3 }\n\thistory = {\n\t\towner = AAA\n\t\tbuildings = {\n\t\t\t3 = { bunker = 9 }\n\t\t}\n\t}\n}\n';
      const LOSER = 'state = {\n\tid = 2\n\tname = "STATE_2"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 3 4 }\n\thistory = {\n\t\towner = BBB\n\t\tbuildings = {\n\t\t\t3 = { bunker = 5 }\n\t\t}\n\t\t1939.1.1 = {\n\t\t\tbuildings = {\n\t\t\t\t3 = { land_facility = 1 }\n\t\t\t}\n\t\t}\n\t}\n}\n';
      const MOD = mkMod("twostates", { "1-Keeper.txt": KEEPER, "2-Loser.txt": LOSER, "3-C.txt": EMPTY3.replace("provinces = { 4 }", "provinces = { 5 }") });
      const r = await post("/api/map/auto-fix", { modPath: MOD });
      rec("Auto-fix ran", r.s === 200 && r.b && r.b.ok === true, r.b);
      const pc = r.b && r.b.fixes && r.b.fixes.provConflicts;
      rec("…and resolved province 3 into state 1", !!pc && (pc.resolved || []).some((x) => x.province === 3 && x.keptIn === 1 && x.removedFrom === 2), pc);
      const k = stateText(MOD, "1-Keeper.txt"), l = stateText(MOD, "2-Loser.txt");
      const hk = historyOf(k), hl = historyOf(l);
      rec("⭐⭐⭐ the keeper has the loser's 1939 block for province 3, in a 1939.1.1 entry", provinceBlocks(hk, 3, "1939.1.1").length === 1 && /land_facility\s*=\s*1/.test(provinceBlocks(hk, 3, "1939.1.1")[0].text), k);
      rec("…and keeps its own undated bunker level", provinceBlocks(hk, 3, null).length === 1 && /bunker\s*=\s*9/.test(mask(provinceBlocks(hk, 3, null)[0].text)), k);
      rec("⭐⭐ the loser names province 3 in no block, in any date", blocksAnywhere(hl, 3) === 0, l);
      rec("both files are brace-balanced", balance(k) === 0 && balance(l) === 0, { k: balance(k), l: balance(l) });

      const dir = path.join(MOD, "history", "states");
      const hash = () => fs.readdirSync(dir).sort().map((f) => f + ":" + crypto.createHash("sha1").update(fs.readFileSync(path.join(dir, f))).digest("hex")).join("|");
      const before = hash();
      const r2 = await post("/api/map/auto-fix", { modPath: MOD });
      rec("a second Auto-fix click ran", r2.s === 200 && r2.b && r2.b.ok === true, r2.b);
      rec("⭐ …and left history/states byte-identical", hash() === before, { before, after: hash() });
    }

    console.log("\n5. The shipping maps' own dated and doubled province blocks, moved through moveProvince (derived from the installed corpus)");
    {
      const VAN = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
      const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
      const roots = [["vanilla", VAN], ["Millennium Dawn", path.join(WS, "2777392649")], ["Road to 56", path.join(WS, "820260968")], ["Old World Blues", path.join(WS, "2265420196")], ["Novum Vexillum", path.join(WS, "1827273767")], ["Rise of Nations", path.join(WS, "2026448968")]];
      let ran = 0, found = 0;
      for (const [label, root] of roots) {
        const sdir = path.join(root, "history", "states");
        if (!fs.existsSync(sdir)) { skip(`${label} is not installed — its blocks were NOT moved`); continue; }
        ran++;
        // Every state with a province (that it lists) named by a dated block, or by two blocks in one context.
        const picked = [];
        for (const f of fs.readdirSync(sdir).filter((x) => /\.txt$/i.test(x))) {
          let raw; try { raw = fs.readFileSync(path.join(sdir, f), "utf8"); } catch (_) { continue; }
          const st = entries(raw).find((e) => e.key === "state");
          if (!st) continue;
          const id = Number((/(?:^|[^A-Za-z0-9_])id\s*=\s*(\d+)/.exec(mask(st.inner)) || [])[1]);
          const provs = (((/provinces\s*=\s*\{([^}]*)\}/.exec(mask(st.inner)) || [])[1] || "").match(/\d+/g) || []).map(Number);
          const h = historyOf(raw);
          const want = [];
          for (const d of allDates(h)) {
            const byPid = new Map();
            for (const b of provinceBlocksAll(h, d)) if (provs.includes(+b.key)) { if (!byPid.has(+b.key)) byPid.set(+b.key, []); byPid.get(+b.key).push(b.text); }
            for (const [pid, texts] of byPid) if (d !== null || texts.length > 1) want.push({ pid, date: d, texts });
          }
          if (want.length) picked.push({ f, raw, id, provs, want });
        }
        if (!picked.length) { rec(`${label}: no dated or doubled province block to move (the census says ${label === "Millennium Dawn" || label === "Road to 56" || label === "Old World Blues" ? "none" : "some"})`, ["Millennium Dawn", "Road to 56", "Old World Blues"].includes(label)); continue; }
        const MOD = path.join(ROOT, "corpus-" + label.replace(/\W+/g, ""));
        const allProvs = [...new Set(picked.flatMap((p) => p.provs))];
        const targetId = Math.max(...picked.map((p) => p.id)) + 1, targetProv = Math.max(...allProvs) + 1;
        const mk = (rel, c) => { const p = path.join(MOD, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
        mk("descriptor.mod", 'name="corpus"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n');
        mk("map/definition.csv", ["0;0;0;0;land;false;unknown;0", ...[...allProvs, targetProv].map((q, i) => `${q};${((i + 1) >> 16) & 255};${((i + 1) >> 8) & 255};${(i + 1) & 255};land;false;plains;1`)].join("\n") + "\n");
        for (const p of picked) mk("history/states/" + p.f, p.raw);
        const TFILE = `${targetId}-Target.txt`;
        mk("history/states/" + TFILE, `state = {\n\tid = ${targetId}\n\tname = "STATE_${targetId}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${targetProv} }\n\thistory = {\n\t\towner = ZZZ\n\t}\n}\n`);
        const moved = new Set(), errors = [];
        for (const p of picked) for (const w of p.want) {
          if (moved.has(w.pid)) continue;
          moved.add(w.pid);
          const res = M.moveProvince({ modRoot: MOD, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [], provinceId: w.pid, toStateId: targetId });
          if (!res || res.error) errors.push({ pid: w.pid, error: res && res.error });
        }
        const th = historyOf(stateText(MOD, TFILE));
        const lost = [], stray = [], undatedNow = [], unbalanced = [];
        for (const p of picked) {
          const after = stateText(MOD, p.f);
          if (balance(after) !== 0) unbalanced.push(p.f);
          for (const w of p.want) {
            const got = provinceBlocks(th, w.pid, w.date).map((x) => squash(x.text));
            for (const t of w.texts) if (got.filter((g) => g === squash(t)).length !== w.texts.filter((x) => squash(x) === squash(t)).length) { lost.push({ file: p.f, pid: w.pid, date: w.date, text: squash(t), got }); break; }
            if (provinceBlocks(historyOf(after), w.pid, w.date).length) stray.push({ file: p.f, pid: w.pid, date: w.date });
            if (w.date) {
              // A dated block must not arrive undated. Count against the undated blocks the province really had: vanilla's
              // 37-Denmark.txt writes `6287 = { naval_base = 8 }` undated AND in 1939.1.1, byte-identical.
              const same = (x) => w.texts.some((t) => squash(x.text) === squash(t));
              if (provinceBlocks(th, w.pid, null).filter(same).length > provinceBlocks(historyOf(p.raw), w.pid, null).filter(same).length) undatedNow.push({ pid: w.pid, date: w.date });
            }
          }
        }
        const n = picked.reduce((k, p) => k + p.want.reduce((j, w) => j + w.texts.length, 0), 0);
        found += n;
        rec(`${label}: moved all ${moved.size} provinces behind its ${n} dated or doubled blocks`, errors.length === 0 && moved.size > 0, errors.slice(0, 6));
        rec(`${label}: ⭐⭐⭐ every one of those blocks is in the new state, under its own date, as written`, lost.length === 0, lost.slice(0, 4));
        rec(`${label}: ⭐⭐ …none left in the state it came from`, stray.length === 0, stray.slice(0, 6));
        rec(`${label}: ⭐ …none turned into an undated block`, undatedNow.length === 0, undatedNow.slice(0, 6));
        rec(`${label}: every file stays brace-balanced`, unbalanced.length === 0 && balance(stateText(MOD, TFILE)) === 0, unbalanced);
      }
      if (!ran) skip("no shipping map is installed — section 5 did NOT run");
      else console.log(`  (${found} blocks across ${ran} maps)`);
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    console.log(`\n=== a moved province keeps its dated buildings: ${checks} checks, ${fails.length} failed, ${skips} skipped ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });

/** every `<pid> = { }` in the buildings blocks of one context, as { key, text } */
function provinceBlocksAll(hist, date) {
  return ctxs(hist, date).flatMap((c) => entries(c).filter((e) => e.key === "buildings").flatMap((b) => entries(b.inner).filter((p) => /^\d+$/.test(p.key))));
}
