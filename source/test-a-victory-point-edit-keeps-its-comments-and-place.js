// Editing victory points in the state panel changes only the victory points it changes, where they stand, with their comments.
// #a-victory-point-edit-keeps-its-comments-and-place
//
// Found in the owner's torture build (nova_torture_0917, through the real endpoints): adding a victory point on province 517 in
// vanilla's 1032 - Yanan.txt rewrote
//         victory_points = {
//             8049 3 # Yanan
//         }
// as `victory_points = { 8049 3 }` — the city's name gone — and moved it, with the new `{ 517 5 }`, to the END of history,
// after the dated `1938.10.25 = { … }` entry. setVictoryPointsInHistory stripped every victory_points block in history and
// re-appended the panel's whole list: rebuild, not splice. Any change to any victory point did it to every one in the state.
// Measured on the six shipping maps below (section 5, on 21808ba's source): adding one victory point to each state that
// already has some rewrote the others in every one of them — vanilla 909 of 909, Millennium Dawn 1,037, Road to 56 994, Old
// World Blues 1,181, Novum Vexillum 1,111, Rise of Nations 760 — and changing one value changed more than that number in
// vanilla 898, MD 740, R56 994, OWB 1,181, NV 1,111, RoN 760.
//
// Now the panel's list is matched against the pairs already written, in order: a pair that stays is left as written, a
// changed value is replaced in place, a removed pair goes with its own comments (the block with its caption when it was the
// block's only pair), and a new one is written on its own line right after the state's last undated victory_points block.
// A save that changes nothing still changes no byte. Requests are the client's: public/map.js stageStateWrite →
// queueWrite("/api/map/set-state", { stateId, nameKey, fields }) with the WHOLE panel (fields read out of map.html below);
// flushMapSaves adds modPath.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0, skips = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900)));
  if (!ok) fails.push(label);
};
const skip = (label) => { skips++; console.log("  SKIP " + label); };

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-vpedit-"));
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const M = require("./map-data.js");
const { createApp } = require("./server.js");

// The state panel's inputs, derived from public/map.html, and stageStateWrite's reading of them.
const html = fs.readFileSync(path.join(__dirname, "public", "map.html"), "utf8");
const BLD = [...new Set([...html.matchAll(/data-bld="([a-z_]+)"/g)].map((m) => m[1]))];
const RES = [...new Set([...html.matchAll(/data-res="([a-z_]+)"/g)].map((m) => m[1]))];
function panelFields(st, pid, edit) {
  const f = {
    displayName: String(st.displayName || st.name || "").trim(), owner: st.owner || "", clearOwner: false,
    cores: (st.cores || []).map((s) => String(s).trim().toUpperCase()).filter(Boolean),
    manpower: String(st.manpower || 0), category: String(st.category || "").trim(),
    victoryPoints: (st.victoryPoints || []).map((v) => ({ province: parseInt(v.province, 10), value: parseInt(v.value, 10) })).filter((v) => Number.isFinite(v.province) && Number.isFinite(v.value) && v.value > 0),
    buildings: {}, resources: {},
  };
  for (const b of BLD) f.buildings[b] = parseInt((st.buildings && st.buildings[b]) || 0, 10) || 0;
  for (const r of RES) f.resources[r] = parseFloat((st.resources && st.resources[r]) || 0) || 0;
  const pb = st.provinceBuildings && st.provinceBuildings[pid];
  f.provinceBuildings = [{ province: pid, building: "naval_base", level: parseInt((pb && pb.naval_base) || 0, 10) || 0 }];
  if (edit) edit(f);
  return f;
}

const YANAN = `state = {
	id = 1
	name = "STATE_1"
	manpower = 4670800
	state_category = town

	history = {

		owner = AAA
		add_core_of = AAA

		1936.1.1 = {
			IF = {
				limit = {
					has_dlc = "No Compromise, No Surrender"
				}
				add_core_of = BBB
			}
		}

		victory_points = {
			8049 3 # Yanan
		}

		buildings = {
			infrastructure = 1
		}

		1938.10.25 = {
			owner = AAA
			add_victory_points = {
				province = 8049
				value = 2
			}
		}

	}

	provinces = {
		517 5007 8049
	}
}
`;
const PORTS = `state = {
	id = 2
	name = "STATE_2"
	manpower = 1000
	state_category = town
	history = {
		owner = AAA
		# the port
		victory_points = { 11 5 }
		victory_points = {
			12 1 # Inland Town
		}
		victory_points = { 13 2 14 4 } # the twin cities
		buildings = {
			infrastructure = 2
		}
	}
	provinces = { 11 12 13 14 }
}
`;

const server = createApp().listen(0, async () => {
  const PORT = server.address().port;
  const post = (ep, body) => fetch(`http://127.0.0.1:${PORT}${ep}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const MOD = path.join(ROOT, "mod");
  const mk = (rel, c) => { const p = path.join(MOD, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
  mk("descriptor.mod", 'name="vp edit"\nsupported_version="1.19.*"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n');
  mk("map/definition.csv", ["0;0;0;0;land;false;unknown;0", ...[517, 5007, 8049, 11, 12, 13, 14].map((q, i) => `${q};${i + 1};0;0;land;false;plains;1`)].join("\n") + "\n");
  mk("history/states/1-Yanan.txt", YANAN);
  mk("history/states/2-Ports.txt", PORTS);
  const file = (f) => fs.readFileSync(path.join(MOD, "history", "states", f), "utf8");
  const stateOf = async (id) => ((await fetch(`http://127.0.0.1:${PORT}/api/map/model?modPath=${encodeURIComponent(MOD)}`).then((r) => r.json())).states || []).find((s) => s.id === id);
  const save = async (id, edit) => { const st = await stateOf(id); return post("/api/map/set-state", { stateId: id, nameKey: st.name, fields: panelFields(st, (st.provinces || [])[0], edit), modPath: MOD }); };
  try {
    console.log("1. Add a victory point on 517 to a state that already has one  (POST /api/map/set-state)");
    {
      const before = file("1-Yanan.txt");
      const r = await save(1, (f) => { f.victoryPoints.push({ province: 517, value: 5 }); });
      rec("the save succeeded", r.s === 200 && r.b.ok === true && r.b.changed === true, r.b);
      const after = file("1-Yanan.txt");
      rec("⭐⭐⭐ `8049 3 # Yanan` is still written as it was, comment and all", /\n\t\t\t8049 3 # Yanan\n/.test(after), after);
      const at = (re) => { const m = re.exec(after); return m ? m.index : -1; };
      const vp8049 = at(/victory_points = \{\s*8049 3/), vp517 = at(/victory_points = \{ 517 5 \}/), bld = at(/\n\t\tbuildings = \{/), dated = at(/1938\.10\.25 = \{/);
      rec("⭐⭐⭐ …and still stands where it was, before the buildings and the dated 1938.10.25 entry", vp8049 > 0 && vp8049 < bld && vp8049 < dated, { vp8049, bld, dated });
      rec("⭐⭐ the new victory point is written right after it, not after the dated entry", vp517 > vp8049 && vp517 < bld && vp517 < dated, { vp8049, vp517, bld, dated });
      const removedNew = after.replace(/^[ \t]*victory_points = \{ 517 5 \}\r?\n/m, "");
      rec("⭐⭐ nothing else in the file changed: take the new line out and it is byte-identical", removedNew === before, removedNew);
      const st = await stateOf(1);
      rec("the map model reads both victory points", JSON.stringify((st.victoryPoints || []).map((v) => [v.province, v.value]).sort()) === JSON.stringify([[517, 5], [8049, 3]]), st.victoryPoints);
    }

    console.log("\n2. Change a value  (POST /api/map/set-state)");
    {
      const before = file("1-Yanan.txt");
      const r = await save(1, (f) => { f.victoryPoints = f.victoryPoints.map((v) => (v.province === 8049 ? { province: 8049, value: 4 } : v)); });
      rec("the save succeeded", r.s === 200 && r.b.ok === true && r.b.changed === true, r.b);
      const after = file("1-Yanan.txt");
      rec("⭐⭐⭐ the value changed in place, the comment stayed", after === before.replace("8049 3 # Yanan", "8049 4 # Yanan"), after);
    }

    console.log("\n3. Remove victory points  (POST /api/map/set-state)");
    {
      const before = file("2-Ports.txt");
      const r = await save(2, (f) => { f.victoryPoints = f.victoryPoints.filter((v) => v.province !== 11); });
      rec("removing 11's victory point succeeded", r.s === 200 && r.b.ok === true && r.b.changed === true, r.b);
      const after = file("2-Ports.txt");
      rec("⭐⭐⭐ its block went with the comment above it, and nothing else changed", after === before.replace("\t\t# the port\n\t\tvictory_points = { 11 5 }\n", ""), after);
      const r2 = await save(2, (f) => { f.victoryPoints = f.victoryPoints.filter((v) => v.province !== 13); });
      rec("removing 13's pair from a shared block succeeded", r2.s === 200 && r2.b.ok === true && r2.b.changed === true, r2.b);
      const after2 = file("2-Ports.txt");
      rec("⭐⭐ only the pair went; the block and its comment stay", after2 === after.replace("victory_points = { 13 2 14 4 } # the twin cities", "victory_points = { 14 4 } # the twin cities"), after2);
      rec("⚠️ `12 1 # Inland Town` is untouched", /\n\t\t\t12 1 # Inland Town\n/.test(after2), after2);
    }

    console.log("\n4. A save that changes nothing  (POST /api/map/set-state)");
    {
      const before = file("1-Yanan.txt");
      const r = await save(1);
      rec("the save ran", r.s === 200 && r.b.ok === true, r.b);
      rec("⚠️ …and changed no byte", file("1-Yanan.txt") === before);
    }

    console.log("\n5. The shipping maps' own states: add one victory point, and change one (derived from the installed corpus)");
    {
      const VAN = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
      const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
      const roots = [["vanilla", VAN], ["Millennium Dawn", path.join(WS, "2777392649")], ["Road to 56", path.join(WS, "820260968")], ["Old World Blues", path.join(WS, "2265420196")], ["Novum Vexillum", path.join(WS, "1827273767")], ["Rise of Nations", path.join(WS, "2026448968")]];
      let ran = 0;
      for (const [label, root] of roots) {
        const sdir = path.join(root, "history", "states");
        if (!fs.existsSync(sdir)) { skip(`${label} is not installed`); continue; }
        ran++;
        let tried = 0;
        const addBad = [], changeBad = [];
        for (const f of fs.readdirSync(sdir).filter((x) => /\.txt$/i.test(x))) {
          const raw = fs.readFileSync(path.join(sdir, f), "utf8");
          const parsed = M.parseStatesText(raw);
          if (parsed.length !== 1) continue;
          const st = parsed[0];
          const vps = (st.victoryPoints || []).filter((v) => Number.isInteger(v.province) && Number.isInteger(v.value) && v.value > 0);
          if (!vps.length || vps.length !== (st.victoryPoints || []).length) continue;
          const spare = (st.provinces || []).find((p) => !vps.some((v) => v.province === p));
          if (spare == null) continue;
          tried++;
          const want = vps.map((v) => ({ province: v.province, value: v.value }));
          const added = M.setStateFieldsInBlock(raw, { victoryPoints: [...want, { province: spare, value: 1 }] });
          const back = added.replace(new RegExp(`^[ \\t]*victory_points = \\{ ${spare} 1 \\}\\r?\\n`, "m"), "");
          const readBack = (M.parseStatesText(added)[0] || {}).victoryPoints || [];
          if (back !== raw || readBack.length !== want.length + 1) { if (addBad.length < 3) addBad.push({ f, readBack: readBack.length }); else addBad.push(null); }
          const bumped = want.map((v, i) => (i === 0 ? { province: v.province, value: v.value + 1 } : v));
          const changed = M.setStateFieldsInBlock(raw, { victoryPoints: bumped });
          const rb = (M.parseStatesText(changed)[0] || {}).victoryPoints || [];
          const sameLength = changed.length - raw.length === String(want[0].value + 1).length - String(want[0].value).length;
          if (!sameLength || JSON.stringify(rb.map((v) => [v.province, v.value])) !== JSON.stringify(bumped.map((v) => [v.province, v.value]))) { if (changeBad.length < 3) changeBad.push({ f }); else changeBad.push(null); }
        }
        rec(`${label}: ⭐⭐⭐ adding a victory point to each of ${tried} states changed nothing but the new line`, addBad.length === 0, { bad: addBad.length, samples: addBad.filter(Boolean) });
        rec(`${label}: ⭐⭐ changing one value changed nothing but that number`, changeBad.length === 0, { bad: changeBad.length, samples: changeBad.filter(Boolean) });
      }
      if (!ran) skip("no shipping map is installed — section 5 did NOT run");
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    console.log(`\n=== a victory point edit keeps its comments and place: ${checks} checks, ${fails.length} failed, ${skips} skipped ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });
