// A province that changes state takes its victory points with it — each in the date it is written for, every pair of it, with
// the comments on it — and its add_victory_points. #a-moved-province-keeps-its-victory-points-in-their-dates
//
// Measured on the six shipping maps' history/states:
//     a victory point's own comment        vanilla `victory_points = { #Nuuk` … `12512 1`, `2089 5 # Basrah`; moving every
//                                          province of every state out and back, a move lost a comment or a victory point
//                                          for vanilla 578 provinces, Road to 56 273, Rise of Nations 38, Novum Vexillum 37,
//                                          Millennium Dawn 24, Old World Blues 19 (after dated buildings were carried)
//     two pairs for one province           Novum Vexillum 7 (1251-Punjab.txt `16331 7` and `16331 4`, 4 with different
//                                          values), Millennium Dawn 4, Old World Blues 3, Road to 56 2, Rise of Nations 2
//     add_victory_points in a date         vanilla 1 (1032 - Yanan.txt), Rise of Nations 1
//     victory_points in a date             0 on all six — but it is the wiki's own example (`1939.1.1 = { victory_points = { 5555 15 } }`)
//
// THE DEFECTS, reproduced on the base commit through the requests the client sends: the carry read the FIRST victory point
// anywhere in history and wrote it back undated as `victory_points = { <pid> <value> }`, while
// removeVictoryPointForProvince cleared every one in every date. So POST /api/map/move-province
//   1. deleted a dated victory point outright (the 1939 value of a province that also has an undated one);
//   2. deleted the comment naming the city, and every pair after the first;
//   3. left `add_victory_points = { province = … }` behind in the old state;
// and POST /api/map/merge-state turned a dated victory point into an undated one — applying from the 1936 start — when it
// was the province's only one. Auto-fix's province-in-two-states repair did the same.
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

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-movedvps-"));
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
const dateEntries = (hist, date) => entries(hist).filter((e) => e.key === date);
const allDates = (hist) => [null, ...new Set(entries(hist).map((e) => e.key).filter(isDate))];
const pairsIn = (inner) => { const n = mask(inner).match(/-?\d+(?:\.\d+)?/g) || []; const out = []; for (let i = 0; i + 1 < n.length; i += 2) out.push([Number(n[i]), Number(n[i + 1])]); return out; };
/** the province's victory point values in one context, in file order */
const vps = (hist, pid, date) => ctxs(hist, date).flatMap((c) => entries(c).filter((e) => e.key === "victory_points").flatMap((e) => pairsIn(e.inner).filter(([q]) => q === pid).map(([, v]) => v)));
const vpBlocksOf = (hist, pid, date) => ctxs(hist, date).flatMap((c) => entries(c).filter((e) => e.key === "victory_points" && pairsIn(e.inner).some(([q]) => q === pid)));
const addVps = (hist, pid, date) => ctxs(hist, date).flatMap((c) => entries(c).filter((e) => e.key === "add_victory_points" && Number((/province\s*=\s*(\d+)/.exec(mask(e.inner)) || [])[1]) === pid));
const mentions = (hist, pid) => allDates(hist).reduce((n, d) => n + vps(hist, pid, d).length + addVps(hist, pid, d).length, 0);
const balance = (t) => { let d = 0; for (const c of mask(t)) { if (c === "{") d++; else if (c === "}") d--; } return d; };

// ── fixtures ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const mkMod = (name, states) => {
  const MOD = path.join(ROOT, name);
  const mk = (rel, c) => { const p = path.join(MOD, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
  mk("descriptor.mod", `name="${name}"\nsupported_version="1.19.*"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n`);
  const ids = [1, 2, 3, 4, 5, 6, 7, 8];
  mk("map/definition.csv", ["0;0;0;0;land;false;unknown;0", ...ids.map((i) => `${i};${i * 10};0;0;land;false;plains;1`)].join("\n") + "\n");
  mk("map/adjacencies.csv", "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n-1;-1;-1;-1;-1;-1;-1;-1;-1\n");
  mk("map/strategicregions/1-R.txt", `strategic_region={\n\tid=1\n\tname="R1"\n\tprovinces={ ${ids.join(" ")} }\n}\n`);
  mk("history/countries/ZZZ - Z.txt", "capital = 3\n");
  for (const [f, t] of Object.entries(states)) mk("history/states/" + f, t);
  return MOD;
};
const stateText = (MOD, f) => { try { return fs.readFileSync(path.join(MOD, "history", "states", f), "utf8"); } catch (_) { return ""; } };
const model = (MOD) => M.buildMapModel({ modRoot: MOD, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [], cacheStableLayers: false });

// Province 1: an undated victory point written the way vanilla's 101-Greenland.txt writes one (the comment on the brace line),
// a 1939 one, and an add_victory_points in a date that also changes the owner (vanilla's 1032 - Yanan.txt). Province 2 shares
// a block with province 5, its pair carrying a trailing comment the way 1011-Al Basrah.txt writes one.
const SOURCE = `state = {
	id = 1
	name = "STATE_1"
	manpower = 1000
	state_category = rural
	provinces = { 1 2 5 }
	history = {
		owner = AAA
		victory_points = { #Capital
			1 5
		}
		victory_points = {
			2 3 # Two
			5 7
		}
		1939.1.1 = {
			victory_points = { 1 15 }
		}
		1938.10.25 = {
			owner = AAA
			add_victory_points = { province = 1 value = 2 }
		}
	}
}
`;
const TARGET = `state = {
	id = 2
	name = "STATE_2"
	manpower = 1000
	state_category = rural
	provinces = { 3 }
	history = {
		owner = BBB
		victory_points = { 3 1 }
		1939.1.1 = {
			owner = BBB
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
      rec("province 1: victory point 5 undated, 15 in 1939, an add_victory_points in 1938.10.25", String(vps(h, 1, null)) === "5" && String(vps(h, 1, "1939.1.1")) === "15" && addVps(h, 1, "1938.10.25").length === 1);
      rec("province 2 shares its block with province 5", String(vps(h, 2, null)) === "3" && String(vps(h, 5, null)) === "7" && vpBlocksOf(h, 2, null).length === 1 && vpBlocksOf(h, 2, null)[0].text === (vpBlocksOf(h, 5, null)[0] || {}).text);
      rec("mentions() counts province 1's three", mentions(h, 1) === 3, mentions(h, 1));
    }

    console.log("\n1. Move provinces 1 and 2, then move 1 back  (POST /api/map/move-province)");
    {
      const MOD = mkMod("move", { "1-A.txt": SOURCE, "2-B.txt": TARGET, "3-C.txt": EMPTY3 });
      const r = await post("/api/map/move-province", { provinceId: 1, toStateId: 2, modPath: MOD });
      rec("moving province 1 succeeded", r.s === 200 && r.b && r.b.ok === true, r.b);
      rec("…and reports the victory point it carried", r.b && r.b.carriedVp === 5, r.b && r.b.carriedVp);
      const r2 = await post("/api/map/move-province", { provinceId: 2, toStateId: 2, modPath: MOD });
      rec("moving province 2 succeeded", r2.s === 200 && r2.b && r2.b.ok === true, r2.b);
      const a = stateText(MOD, "1-A.txt"), b = stateText(MOD, "2-B.txt");
      const ha = historyOf(a), hb = historyOf(b);

      rec("the undated victory point arrived undated", String(vps(hb, 1, null)) === "5", { undated: vps(hb, 1, null) });
      rec("⭐⭐ …with the comment on it, in its block (a caption map, not a multiset)", /#Capital/.test((vpBlocksOf(hb, 1, null)[0] || {}).text || ""), hb);
      rec("⭐⭐⭐ the 1939 victory point arrived — inside the target's own 1939.1.1 entry", dateEntries(hb, "1939.1.1").length === 1 && String(vps(hb, 1, "1939.1.1")) === "15", hb);
      rec("⭐⭐ …and did not become an undated one", !vps(hb, 1, null).includes(15), vps(hb, 1, null));
      rec("⭐⭐ the add_victory_points arrived, in a 1938.10.25 entry", addVps(hb, 1, "1938.10.25").length === 1 && addVps(hb, 1, null).length === 0, hb);
      rec("⭐⭐ province 2's pair arrived with its trailing comment on its line", String(vps(hb, 2, null)) === "3" && /(^|[^0-9])2\s+3\s*# Two/.test((vpBlocksOf(hb, 2, null)[0] || {}).text || ""), hb);
      rec("⚠️ the target's own victory point for province 3 is untouched", String(vps(hb, 3, null)) === "1", hb);

      rec("⭐⭐⭐ the old state names provinces 1 and 2 in no victory point or add_victory_points, in any date", mentions(ha, 1) === 0 && mentions(ha, 2) === 0, ha);
      rec("⚠️ …and keeps province 5's pair, in the block it shared", String(vps(ha, 5, null)) === "7", ha);
      rec("⚠️ …and its own 1938.10.25 owner change", /owner\s*=\s*AAA/.test((dateEntries(ha, "1938.10.25")[0] || {}).inner || ""), ha);
      rec("⚠️ …and no 1939.1.1 entry left empty — the only thing in it went with the province", dateEntries(ha, "1939.1.1").length === 0, ha);
      rec("both files are brace-balanced", balance(a) === 0 && balance(b) === 0, { a: balance(a), b: balance(b) });

      const st2 = (model(MOD).states || []).find((s) => s.id === 2) || {};
      const got = (st2.victoryPoints || []).map((v) => v.province + ":" + v.value).sort().join(",");
      rec("the model reads province 1's two and province 2's victory points in state 2", ["1:15", "1:5", "2:3", "3:1"].every((x) => got.split(",").includes(x)), got);

      const back = await post("/api/map/move-province", { provinceId: 1, toStateId: 1, modPath: MOD });
      rec("moving province 1 back succeeded", back.s === 200 && back.b && back.b.ok === true, back.b);
      const ha2 = historyOf(stateText(MOD, "1-A.txt")), hb2 = historyOf(stateText(MOD, "2-B.txt"));
      rec("⭐ after moving back, the target names province 1 nowhere", mentions(hb2, 1) === 0, hb2);
      rec("⭐ …keeps no 1938.10.25 entry the first move made for it", dateEntries(hb2, "1938.10.25").length === 0, hb2);
      rec("⚠️ …and keeps its own 1939.1.1 owner change", /owner\s*=\s*BBB/.test((dateEntries(hb2, "1939.1.1")[0] || {}).inner || ""), hb2);
      rec("⭐ the old state holds all three of province 1's again, one each, in their dates, comment included",
        String(vps(ha2, 1, null)) === "5" && String(vps(ha2, 1, "1939.1.1")) === "15" && addVps(ha2, 1, "1938.10.25").length === 1 && mentions(ha2, 1) === 3 && /#Capital/.test(ha2), ha2);
    }

    console.log("\n2. A province with two pairs, in two blocks (Novum Vexillum's 1251-Punjab.txt shape)  (POST /api/map/move-province)");
    {
      const TWO = 'state = {\n\tid = 1\n\tname = "STATE_1"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 6 7 }\n\thistory = {\n\t\towner = AAA\n\t\tvictory_points = {\n\t\t\t6 7\n\t\t}\n\t\tvictory_points = {\n\t\t\t7 2\n\t\t}\n\t\tvictory_points = {\n\t\t\t6 4\n\t\t}\n\t}\n}\n';
      const MOD = mkMod("twopairs", { "1-A.txt": TWO, "3-C.txt": EMPTY3 });
      const r = await post("/api/map/move-province", { provinceId: 6, toStateId: 3, modPath: MOD });
      rec("the move succeeded", r.s === 200 && r.b && r.b.ok === true, r.b);
      const a = stateText(MOD, "1-A.txt"), c = stateText(MOD, "3-C.txt");
      rec("⭐⭐⭐ the new state has both of province 6's pairs, in the order they were written", String(vps(historyOf(c), 6, null)) === "7,4", c);
      rec("the old state names province 6 nowhere and keeps province 7's", mentions(historyOf(a), 6) === 0 && String(vps(historyOf(a), 7, null)) === "2", a);
      rec("both files are brace-balanced", balance(a) === 0 && balance(c) === 0);
    }

    console.log("\n3. Merge a state away  (POST /api/map/merge-state)");
    {
      // Province 5's only victory point is dated — the base carry read it and wrote it undated.
      const SRC = SOURCE.replace("provinces = { 1 2 5 }", "provinces = { 1 5 }").replace("\t\tvictory_points = {\n\t\t\t2 3 # Two\n\t\t\t5 7\n\t\t}\n", "").replace("victory_points = { 1 15 }", "victory_points = { 1 15 5 7 }");
      const MOD = mkMod("merge", { "1-A.txt": SRC, "2-B.txt": TARGET, "3-C.txt": EMPTY3 });
      const r = await post("/api/map/merge-state", { sourceStateId: 1, targetStateId: 3, modPath: MOD });
      rec("the merge succeeded", r.s === 200 && r.b && r.b.ok === true, r.b);
      rec("the merged-away state's file is gone", !fs.existsSync(path.join(MOD, "history", "states", "1-A.txt")));
      const c = stateText(MOD, "3-C.txt"), hc = historyOf(c);
      rec("⭐⭐⭐ a victory point written for 1939 is still a 1939 victory point — both provinces'", String(vps(hc, 1, "1939.1.1")) === "15" && String(vps(hc, 5, "1939.1.1")) === "7", { d39: [vps(hc, 1, "1939.1.1"), vps(hc, 5, "1939.1.1")], hc });
      rec("⭐⭐ …and not one that now applies from the 1936 start", vps(hc, 5, null).length === 0 && !vps(hc, 1, null).includes(15), { undated5: vps(hc, 5, null), undated1: vps(hc, 1, null) });
      rec("the undated one is undated, with its comment", String(vps(hc, 1, null)) === "5" && /#Capital/.test(c), c);
      rec("⭐ the add_victory_points came along, in its date", addVps(hc, 1, "1938.10.25").length === 1, c);
      rec("the target's file is brace-balanced", balance(c) === 0, balance(c));
    }

    console.log("\n4. Auto-fix resolves a province two states claim  (POST /api/map/auto-fix)");
    {
      const KEEPER = 'state = {\n\tid = 1\n\tname = "STATE_1"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 1 2 3 }\n\thistory = {\n\t\towner = AAA\n\t\tvictory_points = { 3 9 }\n\t}\n}\n';
      const LOSER = 'state = {\n\tid = 2\n\tname = "STATE_2"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 3 4 }\n\thistory = {\n\t\towner = BBB\n\t\tvictory_points = { 3 20 }\n\t\t1939.1.1 = {\n\t\t\tvictory_points = {\n\t\t\t\t3 25 # the 1939 capital\n\t\t\t}\n\t\t}\n\t}\n}\n';
      const MOD = mkMod("twostates", { "1-Keeper.txt": KEEPER, "2-Loser.txt": LOSER, "3-C.txt": EMPTY3.replace("provinces = { 4 }", "provinces = { 5 }") });
      const r = await post("/api/map/auto-fix", { modPath: MOD });
      rec("Auto-fix ran", r.s === 200 && r.b && r.b.ok === true, r.b);
      const pc = r.b && r.b.fixes && r.b.fixes.provConflicts;
      rec("…and resolved province 3 into state 1", !!pc && (pc.resolved || []).some((x) => x.province === 3 && x.keptIn === 1 && x.removedFrom === 2), pc);
      const k = stateText(MOD, "1-Keeper.txt"), l = stateText(MOD, "2-Loser.txt");
      const hk = historyOf(k), hl = historyOf(l);
      rec("⭐⭐ the keeper keeps its own undated victory point", String(vps(hk, 3, null)) === "9", hk);
      rec("⭐⭐⭐ …and gained the loser's 1939 one, still dated, comment and all", String(vps(hk, 3, "1939.1.1")) === "25" && /# the 1939 capital/.test(k), k);
      rec("⭐⭐ the loser names province 3 nowhere", mentions(hl, 3) === 0, l);
      rec("both files are brace-balanced", balance(k) === 0 && balance(l) === 0, { k: balance(k), l: balance(l) });
      const dir = path.join(MOD, "history", "states");
      const hash = () => fs.readdirSync(dir).sort().map((f) => f + ":" + crypto.createHash("sha1").update(fs.readFileSync(path.join(dir, f))).digest("hex")).join("|");
      const before = hash();
      const r2 = await post("/api/map/auto-fix", { modPath: MOD });
      rec("a second Auto-fix click ran", r2.s === 200 && r2.b && r2.b.ok === true, r2.b);
      rec("⭐ …and left history/states byte-identical", hash() === before, { before, after: hash() });
    }

    console.log("\n5. The shipping maps' own commented, doubled and dated victory points, moved through moveProvince (derived from the installed corpus)");
    {
      const VAN = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
      const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
      const roots = [["vanilla", VAN], ["Millennium Dawn", path.join(WS, "2777392649")], ["Road to 56", path.join(WS, "820260968")], ["Old World Blues", path.join(WS, "2265420196")], ["Novum Vexillum", path.join(WS, "1827273767")], ["Rise of Nations", path.join(WS, "2026448968")]];
      const PER_MAP_COMMENTED = 12;
      let ran = 0, total = 0;
      for (const [label, root] of roots) {
        const sdir = path.join(root, "history", "states");
        if (!fs.existsSync(sdir)) { skip(`${label} is not installed — its victory points were NOT moved`); continue; }
        ran++;
        // Per state, the provinces it lists whose victory points carry a comment, come in two pairs, sit in a date, or that have
        // an add_victory_points: every doubled, dated or added one, and the first commented ones.
        const picked = [];
        let commented = 0;
        for (const f of fs.readdirSync(sdir).filter((x) => /\.txt$/i.test(x)).sort()) {
          let raw; try { raw = fs.readFileSync(path.join(sdir, f), "utf8"); } catch (_) { continue; }
          const st = entries(raw).find((e) => e.key === "state");
          if (!st) continue;
          const id = Number((/(?:^|[^A-Za-z0-9_])id\s*=\s*(\d+)/.exec(mask(st.inner)) || [])[1]);
          const provs = (((/provinces\s*=\s*\{([^}]*)\}/.exec(mask(st.inner)) || [])[1] || "").match(/\d+/g) || []).map(Number);
          const h = historyOf(raw);
          const want = [];
          for (const pid of provs) {
            const perDate = allDates(h).map((d) => ({ d, v: vps(h, pid, d), a: addVps(h, pid, d).length, c: vpBlocksOf(h, pid, d).flatMap((e) => (e.text.match(/#[^\r\n]*/g) || []).map((x) => x.trim())) }));
            const special = perDate.some((x) => (x.d && (x.v.length || x.a)) || x.v.length > 1 || (!x.d && x.a));
            const hasComment = perDate.some((x) => x.c.length && vpBlocksOf(h, pid, x.d).every((e) => pairsIn(e.inner).every(([q]) => q === pid)));
            if (special || (hasComment && commented < PER_MAP_COMMENTED)) { if (!special) commented++; want.push({ pid, perDate }); }
          }
          if (want.length) picked.push({ f, raw, id, provs, want });
        }
        if (!picked.length) { rec(`${label}: has victory points to move`, false, "none found"); continue; }
        const MOD = path.join(ROOT, "corpus-" + label.replace(/\W+/g, ""));
        const allProvs = [...new Set(picked.flatMap((p) => p.provs))];
        const targetId = Math.max(...picked.map((p) => p.id)) + 1, targetProv = Math.max(...allProvs) + 1;
        const mk = (rel, c) => { const p = path.join(MOD, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
        mk("descriptor.mod", 'name="corpus"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n');
        mk("map/definition.csv", ["0;0;0;0;land;false;unknown;0", ...[...allProvs, targetProv].map((q, i) => `${q};${((i + 1) >> 16) & 255};${((i + 1) >> 8) & 255};${(i + 1) & 255};land;false;plains;1`)].join("\n") + "\n");
        for (const p of picked) mk("history/states/" + p.f, p.raw);
        const TFILE = `${targetId}-Target.txt`;
        mk("history/states/" + TFILE, `state = {\n\tid = ${targetId}\n\tname = "STATE_${targetId}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${targetProv} }\n\thistory = {\n\t\towner = ZZZ\n\t}\n}\n`);
        const errors = [], wrong = [], stray = [], lostComments = [], unbalanced = [];
        for (const p of picked) for (const w of p.want) {
          const res = M.moveProvince({ modRoot: MOD, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [], provinceId: w.pid, toStateId: targetId });
          if (!res || res.error) errors.push({ pid: w.pid, error: res && res.error });
        }
        const tText = stateText(MOD, TFILE), th = historyOf(tText);
        for (const p of picked) {
          const after = stateText(MOD, p.f);
          if (balance(after) !== 0) unbalanced.push(p.f);
          for (const w of p.want) {
            for (const x of w.perDate) {
              if (String(vps(th, w.pid, x.d)) !== String(x.v) || addVps(th, w.pid, x.d).length !== x.a) wrong.push({ file: p.f, pid: w.pid, date: x.d, had: [x.v, x.a], got: [vps(th, w.pid, x.d), addVps(th, w.pid, x.d).length] });
              for (const cm of x.c) if (!vpBlocksOf(th, w.pid, x.d).some((e) => e.text.includes(cm))) lostComments.push({ file: p.f, pid: w.pid, date: x.d, comment: cm });
            }
            if (mentions(historyOf(after), w.pid)) stray.push({ file: p.f, pid: w.pid });
          }
        }
        const n = picked.reduce((k, p) => k + p.want.length, 0);
        total += n;
        rec(`${label}: moved all ${n} provinces`, errors.length === 0, errors.slice(0, 6));
        rec(`${label}: ⭐⭐⭐ each has every victory point and add_victory_points it had, in its date, in order`, wrong.length === 0, wrong.slice(0, 4));
        rec(`${label}: ⭐⭐ …with the comments on them`, lostComments.length === 0, lostComments.slice(0, 4));
        rec(`${label}: ⭐⭐ …and none left in the state it came from`, stray.length === 0, stray.slice(0, 6));
        rec(`${label}: every file stays brace-balanced`, unbalanced.length === 0 && balance(tText) === 0, unbalanced);
      }
      if (!ran) skip("no shipping map is installed — section 5 did NOT run");
      else console.log(`  (${total} provinces across ${ran} maps)`);
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    console.log(`\n=== a moved province keeps its victory points in their dates: ${checks} checks, ${fails.length} failed, ${skips} skipped ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });
