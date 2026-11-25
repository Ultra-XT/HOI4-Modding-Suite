// A province building block merged into one the state already holds keeps every sub-block and comment it carries.
// #a-merged-building-block-keeps-its-sub-blocks
//
// THE DEFECT. When a province moved into a state that already held a building block for it, the whole-block carry
// refused a second block for one province, and moveProvince fell back to copying the moved block's flat
// `key = <integer>` pairs into the existing one — then deleted the source's block. Everything that
// is not a flat level went with it: a DLC-gated naval headquarters, a landmark, the author's comments on them. Auto-fix's
// province-in-two-states repair did the same when the state keeping the province already had a block. Reproduced on the
// base commit through the requests the client sends: POST /api/map/move-province left `1 = { bunker = 5 coastal_bunker = 1 }`
// and no naval headquarters anywhere in the mod; POST /api/map/auto-fix left the keeper `3 = { bunker = 9 }` and the
// landmark nowhere.
//
// When does a target already hold a block? A stray one is exactly what province_building_not_in_state reports, and
// Auto-fix meets one whenever two states list a province and both write its buildings.
//
// THE RULE (unchanged from the key-by-key carry): on a real key conflict a MOVE's value wins — it is the value the game
// was applying, since the target's stray block is skipped in game ("Trying to set province building in state that doesn't
// own it", hoi4.exe) — and Auto-fix's KEEPER keeps its own. What the target lacks arrives as written, caption and all.
//
// Section 3 merges every nested province building block the six shipping maps write, derived from the installed corpus.
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

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-mergedblock-"));
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const M = require("./map-data.js");
const { createApp } = require("./server.js");

// ── the test's own reading ───────────────────────────────────────────────────────────────────────────────────────────
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
/** depth-0 statements of a block's inner: { key, value } with the value squashed, comments masked */
const statements = (inner) => {
  const s = mask(inner), out = [];
  let i = 0;
  while (i < s.length) {
    if (/\s/.test(s[i])) { i++; continue; }
    const km = /^[A-Za-z0-9_.:@-]+/.exec(s.slice(i));
    if (!km) return null;
    let j = i + km[0].length;
    while (/\s/.test(s[j] || "")) j++;
    if (s[j] !== "=") return null;
    j++;
    while (/\s/.test(s[j] || "")) j++;
    let end;
    if (s[j] === "{") { const c = closeOf(s, j); if (c < 0) return null; end = c + 1; }
    else if (s[j] === '"') { end = s.indexOf('"', j + 1) + 1; if (!end) return null; }
    else { const vm = /^[^\s{}"]+/.exec(s.slice(j)); if (!vm) return null; end = j + vm[0].length; }
    out.push({ key: km[0], value: s.slice(j, end).replace(/\s+/g, " ").trim() });
    i = end;
  }
  return out;
};
const commentsOf = (t) => (String(t).match(/#[^\r\n]*/g) || []).map((c) => c.trim());
const historyOf = (fileText) => {
  const st = entries(fileText).find((e) => e.key === "state");
  const h = st && entries(st.inner).find((e) => e.key === "history");
  return h ? h.inner : "";
};
const undatedBlocks = (hist, pid) => entries(hist).filter((e) => e.key === "buildings").flatMap((b) => entries(b.inner).filter((p) => p.key === String(pid)));
const balance = (t) => { let d = 0; for (const c of mask(t)) { if (c === "{") d++; else if (c === "}") d--; } return d; };
/** the line above the one that holds `needle`, trimmed — a caption map, not a multiset */
const captionOf = (text, needle) => {
  const lines = String(text).split(/\r?\n/);
  const at = lines.findIndex((l) => mask(l).includes(needle));
  if (at < 1) return null;
  return lines[at - 1].trim();
};

// ── fixtures ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const mkMod = (name, states) => {
  const MOD = path.join(ROOT, name);
  const mk = (rel, c) => { const p = path.join(MOD, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
  // history/countries is replaced too: the endpoints layer the installed game underneath.
  mk("descriptor.mod", `name="${name}"\nsupported_version="1.19.*"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n`);
  const ids = [1, 2, 3, 4, 5];
  mk("map/definition.csv", ["0;0;0;0;land;false;unknown;0", ...ids.map((i) => `${i};${i * 10};0;0;land;false;plains;1`)].join("\n") + "\n");
  mk("map/adjacencies.csv", "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n-1;-1;-1;-1;-1;-1;-1;-1;-1\n");
  mk("map/strategicregions/1-R.txt", `strategic_region={\n\tid=1\n\tname="R1"\n\tprovinces={ ${ids.join(" ")} }\n}\n`);
  mk("history/countries/ZZZ - Z.txt", "capital = 5\n");
  for (const [f, t] of Object.entries(states)) mk("history/states/" + f, t);
  return MOD;
};
const stateText = (MOD, f) => { try { return fs.readFileSync(path.join(MOD, "history", "states", f), "utf8"); } catch (_) { return ""; } };
const model = (MOD) => M.buildMapModel({ modRoot: MOD, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [], cacheStableLayers: false });

const SOURCE = `state = {
	id = 1
	name = "STATE_1"
	manpower = 1000
	state_category = rural
	provinces = { 1 2 4 }
	history = {
		owner = AAA
		buildings = {
			infrastructure = 3
			1 = {
				bunker = 5
				# the headquarters the author gated on a DLC
				naval_headquarters = { level = 1 allowed = { has_dlc = "No Compromise, No Surrender" } }
				naval_base = 3 # rebuilt 1935
			}
			2 = { landmark_big_ben = { allowed = { has_dlc = "Gotterdammerung" } level = 1 } }
		}
	}
}
`;
// The target already holds a stray block for provinces 1 (written across lines, ending in a comment) and 2 (on one line).
const TARGET = `state = {
	id = 2
	name = "STATE_2"
	manpower = 1000
	state_category = rural
	provinces = { 3 }
	history = {
		owner = BBB
		buildings = {
			1 = { bunker = 2 coastal_bunker = 1 # the target's own note
			}
			2 = { bunker = 2 }
			3 = { bunker = 1 }
		}
	}
}
`;
const STATE5 = 'state = {\n\tid = 3\n\tname = "STATE_3"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 5 }\n\thistory = {\n\t\towner = ZZZ\n\t}\n}\n';

const server = createApp().listen(0, async () => {
  const PORT = server.address().port;
  // Exactly what public/map.js sends: queueWrite("/api/map/move-province", { provinceId, toStateId }, { fromStateId }) keeps
  // fromStateId in META, and flushMapSaves posts Object.assign({}, w.body, { modPath }). Auto-fix posts { modPath }.
  const post = (ep, body) => fetch(`http://127.0.0.1:${PORT}${ep}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  try {
    console.log("[control] the test's own walkers read the fixtures the way they are written");
    {
      const hs = historyOf(SOURCE), ht = historyOf(TARGET);
      rec("the source's block for province 1 holds the headquarters, captioned", undatedBlocks(hs, 1).length === 1 && captionOf(undatedBlocks(hs, 1)[0].text, "naval_headquarters") === "# the headquarters the author gated on a DLC");
      rec("the target already holds one block for province 1 and one for province 2", undatedBlocks(ht, 1).length === 1 && undatedBlocks(ht, 2).length === 1);
      rec("statements() splits the source block into three", (statements(undatedBlocks(hs, 1)[0].inner) || []).map((x) => x.key).join(",") === "bunker,naval_headquarters,naval_base");
    }

    console.log("\n1. Move provinces 1 and 2 into a state that already holds a block for each  (POST /api/map/move-province)");
    {
      const MOD = mkMod("move", { "1-A.txt": SOURCE, "2-B.txt": TARGET, "3-C.txt": STATE5 });
      const r1 = await post("/api/map/move-province", { provinceId: 1, toStateId: 2, modPath: MOD });
      rec("moving province 1 succeeded", r1.s === 200 && r1.b && r1.b.ok === true, r1.b);
      const r2 = await post("/api/map/move-province", { provinceId: 2, toStateId: 2, modPath: MOD });
      rec("moving province 2 succeeded", r2.s === 200 && r2.b && r2.b.ok === true, r2.b);
      const a = stateText(MOD, "1-A.txt"), b = stateText(MOD, "2-B.txt");
      const ha = historyOf(a), hb = historyOf(b);

      const b1 = undatedBlocks(hb, 1);
      rec("the target holds exactly one block for province 1", b1.length === 1, b1.map((x) => x.text));
      const t1 = b1[0] ? b1[0].text : "";
      rec("⭐⭐⭐ …with the moved naval headquarters in it, which is not a flat level", /naval_headquarters\s*=\s*\{/.test(mask(t1)), t1);
      rec("⭐⭐ …still gated on its DLC", /has_dlc\s*=\s*"No Compromise, No Surrender"/.test(t1), t1);
      rec("⭐⭐ …with the author's caption directly above it (a caption map, not a multiset)", captionOf(t1, "naval_headquarters") === "# the headquarters the author gated on a DLC", t1);
      rec("⭐ …and the moved naval base with its own trailing comment", /naval_base\s*=\s*3[ \t]*# rebuilt 1935/.test(t1), t1);
      rec("…the moved bunker level, as a move always carried (the value the game was applying)", /bunker\s*=\s*5/.test(mask(t1)) && !/(^|[^_])bunker\s*=\s*2/.test(mask(t1)), t1);
      rec("⚠️ …the target's own coastal bunker, which the moved block does not set", /coastal_bunker\s*=\s*1/.test(mask(t1)), t1);
      rec("⚠️ …and the target's own comment", /# the target's own note/.test(t1), t1);

      const b2 = undatedBlocks(hb, 2);
      rec("the target holds exactly one block for province 2", b2.length === 1, b2.map((x) => x.text));
      const t2 = b2[0] ? b2[0].text : "";
      rec("⭐⭐⭐ …with Big Ben in it, DLC gate and level", /landmark_big_ben\s*=\s*\{/.test(t2) && /has_dlc\s*=\s*"Gotterdammerung"/.test(t2) && /level\s*=\s*1/.test(t2), t2);
      rec("⚠️ …beside the target's own bunker, which the moved block does not set", /bunker\s*=\s*2/.test(mask(t2)), t2);
      rec("the target's own province 3 block is untouched", undatedBlocks(hb, 3).length === 1 && /bunker\s*=\s*1/.test(undatedBlocks(hb, 3)[0].text));

      rec("the old state holds no block for province 1 or 2", undatedBlocks(ha, 1).length === 0 && undatedBlocks(ha, 2).length === 0, ha);
      rec("⚠️ …and keeps its state-level infrastructure", /infrastructure\s*=\s*3/.test(ha), ha);
      rec("no file mentions the headquarters or Big Ben twice", (b.match(/naval_headquarters/g) || []).length === 1 && (b.match(/landmark_big_ben/g) || []).length === 1 && !/naval_headquarters|landmark_big_ben/.test(a), { b });
      rec("both files are brace-balanced", balance(a) === 0 && balance(b) === 0, { a: balance(a), b: balance(b) });

      const st2 = (model(MOD).states || []).find((s) => s.id === 2) || {};
      const pb = st2.provinceBuildings || {};
      rec("the model reads province 1's levels in state 2 — moved bunker and naval base, the target's coastal bunker", pb[1] && pb[1].bunker === 5 && pb[1].naval_base === 3 && pb[1].coastal_bunker === 1, pb);
      rec("…and province 2's bunker", pb[2] && pb[2].bunker === 2, pb);
      const probs = M.validateMapModel(model(MOD));
      rec("no province building is left in a state that does not own its province", !probs.some((p) => p.rule === "province_building_not_in_state"), probs.filter((p) => p.rule === "province_building_not_in_state"));
    }

    console.log("\n2. Auto-fix resolves a province two states claim, and the keeper already has a block for it  (POST /api/map/auto-fix)");
    {
      // fixProvinceInTwoStates keeps the province in the state with more provinces. Not a naval block: this fixture has no
      // provinces.bmp, and a whole Auto-fix click also runs the no-coast cleanup.
      const KEEPER = 'state = {\n\tid = 1\n\tname = "STATE_1"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 1 2 3 }\n\thistory = {\n\t\towner = AAA\n\t\tbuildings = {\n\t\t\t3 = { bunker = 9 }\n\t\t}\n\t}\n}\n';
      const LOSER = `state = {
	id = 2
	name = "STATE_2"
	manpower = 1000
	state_category = rural
	provinces = { 3 4 }
	history = {
		owner = BBB
		buildings = {
			3 = {
				bunker = 5
				landmark_test_tower = { level = 1 allowed = { has_dlc = "Gotterdammerung" } } # the tower
			}
		}
	}
}
`;
      const MOD = mkMod("twostates", { "1-Keeper.txt": KEEPER, "2-Loser.txt": LOSER, "3-C.txt": STATE5 });
      const r = await post("/api/map/auto-fix", { modPath: MOD });
      rec("Auto-fix ran", r.s === 200 && r.b && r.b.ok === true, r.b);
      const pc = r.b && r.b.fixes && r.b.fixes.provConflicts;
      rec("…and resolved province 3 into state 1", !!pc && (pc.resolved || []).some((x) => x.province === 3 && x.keptIn === 1 && x.removedFrom === 2), pc);
      const k = stateText(MOD, "1-Keeper.txt"), l = stateText(MOD, "2-Loser.txt");
      const kb = undatedBlocks(historyOf(k), 3);
      const kt = kb[0] ? kb[0].text : "";
      rec("the keeper has one block for province 3", kb.length === 1, kb.map((x) => x.text));
      rec("⭐⭐ …which keeps the keeper's own bunker level", /bunker\s*=\s*9/.test(mask(kt)) && !/bunker\s*=\s*5/.test(mask(kt)), kt);
      rec("⭐⭐⭐ …and gained the loser's landmark, DLC gate and all", /landmark_test_tower\s*=\s*\{/.test(kt) && /has_dlc\s*=\s*"Gotterdammerung"/.test(kt), kt);
      rec("⭐ …with its trailing comment on its own line", /landmark_test_tower[^\r\n]*# the tower/.test(kt), kt);
      rec("the loser holds no block for province 3", undatedBlocks(historyOf(l), 3).length === 0, l);
      rec("both files are brace-balanced", balance(k) === 0 && balance(l) === 0, { k: balance(k), l: balance(l) });

      const dir = path.join(MOD, "history", "states");
      const hash = () => fs.readdirSync(dir).sort().map((f) => f + ":" + crypto.createHash("sha1").update(fs.readFileSync(path.join(dir, f))).digest("hex")).join("|");
      const before = hash();
      const r2 = await post("/api/map/auto-fix", { modPath: MOD });
      rec("a second Auto-fix click ran", r2.s === 200 && r2.b && r2.b.ok === true, r2.b);
      rec("⭐ …and left history/states byte-identical", hash() === before, { before, after: hash() });
    }

    console.log("\n3. Every nested province building block the shipping maps write, merged into a stray flat block (derived from the installed corpus)");
    {
      const VAN = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
      const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
      const roots = [["vanilla", VAN], ["Millennium Dawn", path.join(WS, "2777392649")], ["Road to 56", path.join(WS, "820260968")], ["Old World Blues", path.join(WS, "2265420196")], ["Novum Vexillum", path.join(WS, "1827273767")], ["Rise of Nations", path.join(WS, "2026448968")]];
      const merge = M.mergeProvinceBuildingEntry;
      rec("map-data exports mergeProvinceBuildingEntry", typeof merge === "function", typeof merge);
      let ran = 0, total = 0;
      for (const [label, root] of roots) {
        const sdir = path.join(root, "history", "states");
        if (!fs.existsSync(sdir)) { skip(`${label} is not installed — its nested blocks were NOT merged`); continue; }
        if (typeof merge !== "function") continue;
        const found = [];
        for (const f of fs.readdirSync(sdir).filter((x) => /\.txt$/i.test(x))) {
          let raw; try { raw = fs.readFileSync(path.join(sdir, f), "utf8"); } catch (_) { continue; }
          const st = entries(raw).find((e) => e.key === "state");
          if (!st) continue;
          const h = historyOf(raw);
          const ctxs = [h, ...entries(h).filter((e) => isDate(e.key)).map((e) => e.inner)];
          for (const c of ctxs) for (const b of entries(c).filter((e) => e.key === "buildings")) for (const p of entries(b.inner)) {
            if (/^\d+$/.test(p.key) && mask(p.inner).includes("{")) found.push({ f, pid: p.key, text: p.text, inner: p.inner });
          }
        }
        let bad = { unmerged: [], missing: [], keeperMissing: [], comments: [], unbalanced: [], notIdempotent: [] };
        for (const blk of found) {
          const own = statements(blk.inner);
          if (!own) continue;   // this test's own splitter cannot read it either: not a statement list
          const stray = `${blk.pid} = { bunker = 1 }`;
          const moved = merge(stray, blk.text, { keeperWins: false });
          const kept = merge(stray, blk.text, { keeperWins: true });
          if (moved == null || kept == null) { bad.unmerged.push(`${blk.f}:${blk.pid}`); continue; }
          if (balance(moved) || balance(kept)) bad.unbalanced.push(`${blk.f}:${blk.pid}`);
          const mOpen = mask(moved).indexOf("{"), kOpen = mask(kept).indexOf("{");
          const mSt = statements(moved.slice(mOpen + 1, mask(moved).lastIndexOf("}"))) || [];
          const kSt = statements(kept.slice(kOpen + 1, mask(kept).lastIndexOf("}"))) || [];
          const has = (list, s) => list.some((x) => x.key === s.key && x.value === s.value);
          for (const s of own) if (!has(mSt, s)) { bad.missing.push(`${blk.f}:${blk.pid}:${s.key}`); break; }
          for (const s of own) {
            if (s.key === "bunker") { if (!kSt.some((x) => x.key === "bunker" && x.value === "1")) bad.keeperMissing.push(`${blk.f}:${blk.pid}:bunker`); continue; }
            if (!has(kSt, s)) { bad.keeperMissing.push(`${blk.f}:${blk.pid}:${s.key}`); break; }
          }
          const cm = commentsOf(blk.text);
          if (cm.some((c) => !commentsOf(moved).includes(c))) bad.comments.push(`${blk.f}:${blk.pid}`);
          const again = merge(moved, blk.text, { keeperWins: false });
          if (again == null || again.replace(/\s+/g, " ") !== moved.replace(/\s+/g, " ")) bad.notIdempotent.push(`${blk.f}:${blk.pid}`);
        }
        ran++; total += found.length;
        rec(`${label}: merged all ${found.length} nested blocks`, bad.unmerged.length === 0, bad.unmerged.slice(0, 6));
        rec(`${label}: ⭐⭐⭐ a move's merge carries every statement of each, as written`, bad.missing.length === 0, bad.missing.slice(0, 6));
        rec(`${label}: ⭐⭐ a keeper's merge carries every statement it lacks, and keeps its own bunker`, bad.keeperMissing.length === 0, bad.keeperMissing.slice(0, 6));
        rec(`${label}: ⭐ every comment in each block survives the merge`, bad.comments.length === 0, bad.comments.slice(0, 6));
        rec(`${label}: every merge is brace-balanced`, bad.unbalanced.length === 0, bad.unbalanced.slice(0, 6));
        rec(`${label}: merging the same block twice changes nothing the second time`, bad.notIdempotent.length === 0, bad.notIdempotent.slice(0, 6));
      }
      if (!ran && typeof merge === "function") skip("no shipping map is installed — section 3 did NOT run");
      else console.log(`  (${total} nested blocks across ${ran} maps)`);
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    console.log(`\n=== a merged building block keeps its sub-blocks: ${checks} checks, ${fails.length} failed, ${skips} skipped ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });
