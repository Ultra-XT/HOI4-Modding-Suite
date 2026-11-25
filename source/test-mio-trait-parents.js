// #mio-any-parent-dropped — opening a military industrial organization and saving it deleted every trait
// prerequisite.
//
// mioTraitLines writes a trait's prerequisites as `any_parent = { … }` from the model's `parent`, and
// any_parent is listed in MIO_TRAIT_OWNED_KEYS — meaning it is REGENERATED from the model on every save
// rather than preserved verbatim. But /api/mio/detail never parsed any_parent, so the model came back empty
// and the regeneration produced nothing. A save reported ok:true and the prerequisites were gone.
//
// The editor UI has no field for prerequisites at all, so it could not put them back: it rebuilds each trait
// from token/name/x/y/relativeTo/icon/bonuses. Loading an organization and pressing Save was enough.
//
// In game a trait with no parent is available from the start, so this silently unlocked the whole trait tree.
//
// It hid because the loss is asymmetric: `all_parents` sitting right beside it is NOT an owned key, so it was
// preserved and looked fine, while `any_parent` beside it vanished.
//
// Measured before the fix: any_parent 1 -> 0, all_parents 1 -> 1, response ok:true.
// Corpus: vanilla has 289 any_parent across 27 files, Millennium Dawn 773 across 13.
//
// any_parent takes a LIST, so the model carries the whole list, not one token: 127 of vanilla's 282
// any_parent blocks name 2+ parents (up to 3), and 226 of Millennium Dawn's 721 (up to 5).
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-mio-parents-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "probe");
const ORGDIR = path.join(MOD, "common", "military_industrial_organization", "organizations");
fs.mkdirSync(ORGDIR, { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="MIOP"\nsupported_version="1.18.*"\n');

const FILE = path.join(ORGDIR, "probe_mio.txt");
const ORIGINAL = `probe_organization = {
	icon = GFX_idea_generic_infantry_equipment_manufacturer_1
	allowed = { original_tag = GER }
	equipment_type = { infantry_equipment }
	initial_trait = {
		name = probe_organization_initial
		equipment_bonus = {
			build_cost_ic = -0.05
		}
	}
	trait = {
		token = probe_root
		name = probe_root
		icon = GFX_generic_mio_trait_icon_production_capacity
		position = { x=0 y=0 }
		production_bonus = {
			production_capacity_factor = 0.05
		}
	}
	trait = {
		token = probe_one_parent
		name = probe_one_parent
		icon = GFX_generic_mio_trait_icon_reliability
		position = { x=2 y=0 }
		relative_position_id = probe_root
		any_parent = { probe_root }
		equipment_bonus = {
			reliability = 0.05
		}
	}
	trait = {
		token = probe_many_parents
		name = probe_many_parents
		icon = GFX_generic_mio_trait_icon_soft_attack
		position = { x=4 y=0 }
		relative_position_id = probe_root
		any_parent = { probe_root probe_one_parent }
		all_parents = { probe_root }
		equipment_bonus = {
			soft_attack = 0.05
		}
	}
}
`;
fs.writeFileSync(FILE, ORIGINAL, "utf8");

const anyParentsOf = (txt) => (txt.match(/any_parent\s*=\s*\{[^}]*\}/g) || []).map((s) => s.replace(/\s+/g, " ").trim());

// Map token -> that trait's OWN any_parent, by brace-matching each trait block. A character-window regex
// ("token = np_a" followed by any_parent within N chars) reaches into the NEXT trait's block and reports a
// prerequisite the trait does not have — it claimed np_a had gained one when the file plainly showed it had not.
function parentsByToken(txt) {
  const out = {};
  const re = /\btrait\s*=\s*\{/g; let m;
  while ((m = re.exec(txt)) !== null) {
    const open = txt.indexOf("{", m.index);
    let depth = 0, end = -1;
    for (let j = open; j < txt.length; j++) {
      if (txt[j] === "{") depth++;
      else if (txt[j] === "}") { depth--; if (depth === 0) { end = j; break; } }
    }
    if (end === -1) break;
    const body = txt.slice(open + 1, end);
    re.lastIndex = end;
    const tok = (/token\s*=\s*(\w+)/.exec(body) || [])[1];
    if (!tok) continue;
    const ap = (/any_parent\s*=\s*\{([^}]*)\}/.exec(body) || [])[1];
    out[tok] = ap === undefined ? null : (ap.match(/[A-Za-z_][A-Za-z0-9_]*/g) || []);
  }
  return out;
}

const PORT = 39905, app = createApp();
const server = app.listen(PORT, async () => {
  const detail = (id) => fetch(`http://127.0.0.1:${PORT}/api/mio/detail?modPath=${encodeURIComponent(MOD)}&id=${id}`).then((r) => r.json());
  const save = (body) => fetch(`http://127.0.0.1:${PORT}/api/mio`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }).then((r) => r.json());

  try {
    // ── the reader must actually hand the prerequisites back ────────────────────────────────────────
    const d = await detail("probe_organization");
    const m = d.mio || d;
    const byTok = Object.fromEntries((m.traits || []).map((t) => [t.token, t]));
    ok("detail returns a parents list for a single-parent trait",
      JSON.stringify((byTok.probe_one_parent || {}).parents) === '["probe_root"]', byTok.probe_one_parent);
    ok("…and every parent when there are several",
      JSON.stringify((byTok.probe_many_parents || {}).parents) === '["probe_root","probe_one_parent"]', byTok.probe_many_parents);
    ok("…and an empty list, not junk, for a trait with none",
      Array.isArray((byTok.probe_root || {}).parents) && byTok.probe_root.parents.length === 0, byTok.probe_root);

    // ── open and save unchanged: the whole point ────────────────────────────────────────────────────
    const r = await save({
      modPath: MOD, fileName: "probe_mio.txt", id: m.id, icon: m.icon, allowedTag: m.allowedTag,
      include: m.include, equipmentType: m.equipmentType, researchCategories: m.researchCategories,
      initial: m.initial, traits: m.traits,
    });
    ok("the re-save succeeds", r && r.ok, r);

    const after = fs.readFileSync(FILE, "utf8");
    const aps = anyParentsOf(after);
    ok("both any_parent blocks survive the round-trip", aps.length === 2, aps);
    ok("…the single parent is intact", aps.includes("any_parent = { probe_root }"), aps);
    ok("…and the multi-parent list keeps EVERY parent", aps.includes("any_parent = { probe_root probe_one_parent }"), aps);
    ok("the un-owned all_parents is still preserved too", /all_parents\s*=\s*\{\s*probe_root\s*\}/.test(after), "all_parents lost");
    ok("no trait gained a prerequisite it never had", parentsByToken(after).probe_root === null, parentsByToken(after));

    // Semantically unchanged: same trait tokens, same prerequisite edges. (Key ORDER inside a trait block is
    // meaningless to HOI4 and the preserve pass appends un-owned keys last, so bytes may legitimately differ.)
    ok("every trait is still present", ["probe_root", "probe_one_parent", "probe_many_parents"].every((t) => after.includes("token = " + t)), after.slice(0, 120));

    // ── and a save that genuinely sets parents still writes them ────────────────────────────────────
    const created = await save({
      modPath: MOD, fileName: "probe_mio.txt", id: "probe_new_organization",
      icon: "GFX_idea_generic_infantry_equipment_manufacturer_1", allowedTag: "GER",
      equipmentType: ["infantry_equipment"], researchCategories: [], include: [],
      initial: { equipmentBonus: {}, productionBonus: {} },
      traits: [
        { token: "np_a", name: "A", icon: "", x: 0, y: 0, equipmentBonus: { reliability: 0.05 }, productionBonus: {} },
        { token: "np_b", name: "B", icon: "", x: 2, y: 0, parents: ["np_a"], equipmentBonus: { reliability: 0.05 }, productionBonus: {} },
        { token: "np_c", name: "C", icon: "", x: 4, y: 0, parents: ["np_a", "np_b"], equipmentBonus: { reliability: 0.05 }, productionBonus: {} },
      ],
    });
    ok("a new organization with prerequisites saves", created && created.ok, created);
    const txt2 = fs.readFileSync(FILE, "utf8");
    ok("…writing a single parent", /any_parent = \{ np_a \}/.test(txt2), anyParentsOf(txt2));
    ok("…and a multi-parent list", /any_parent = \{ np_a np_b \}/.test(txt2), anyParentsOf(txt2));
    const byTok2 = parentsByToken(txt2);
    ok("…and no any_parent for the root trait", byTok2.np_a === null, byTok2);
    ok("…each trait carries exactly its own prerequisites",
      JSON.stringify(byTok2.np_b) === '["np_a"]' && JSON.stringify(byTok2.np_c) === '["np_a","np_b"]', byTok2);

    console.log("\ntest-mio-trait-parents: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 15 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
