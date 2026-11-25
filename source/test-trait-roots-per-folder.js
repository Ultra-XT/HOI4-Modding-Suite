// #trait-roots-decided-for-the-wrong-folder — ONE ROOT LIST PER FOLDER, NOT ONE LIST FOR BOTH.
//
// collectCharacterTraits scans two different folders: common/country_leader (leader + advisor traits) and
// common/unit_leader (general/admiral traits). It resolved its root list ONCE, naming common/unit_leader, and
// then used that same list for the country_leader scan:
//
//     let roots = getActiveRoots(activeRoot, "common/unit_leader");
//     …
//     scan("country_leader", false);   // ← the wrong folder's decision
//     scan("unit_leader", true);
//
// Both directions are wrong, and both are reachable:
//
//   * a mod that replaces common/unit_leader drops the game root, and the COUNTRY_LEADER scan then never
//     looks at vanilla either — traits the game does load go missing from the picker;
//   * a mod that replaces common/country_leader gets no reduction at all — traits the game does NOT load
//     stay on offer.
//
// The first is the live one. Millennium Dawn declares replace_path = "common/unit_leader" and says nothing
// about common/country_leader, so an add-on on MD loads MD's country-leader traits PLUS vanilla's, while Nova
// showed only MD's. The endpoint's own comment says a mistyped trait "silently does nothing in-game" — which
// is what a modder gets when the trait they need is not in the list and they type it by hand.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-traitroots-"));
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

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const toPosix = (p) => p.split(path.sep).join("/");
let seq = 0;
function mkMod(replacePaths) {
  const n = "TR" + ++seq;
  const dir = path.join(ROOT, "m" + seq);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"),
    'name="' + n + '"\nsupported_version="1.19.*"\n'
    + (replacePaths || []).map((p) => 'replace_path="' + p + '"\n').join(""));
  fs.writeFileSync(path.join(ROOT, "m" + seq + ".mod"),
    'name="' + n + '"\npath="' + toPosix(dir) + '"\nsupported_version="1.19.*"\n');
  // One trait of its own in each folder, so "did this mod's content survive" is always answerable.
  fs.mkdirSync(path.join(dir, "common", "country_leader"), { recursive: true });
  fs.writeFileSync(path.join(dir, "common", "country_leader", "zz_own.txt"),
    "leader_traits = {\n\tzz_own_leader_trait = {\n\t\trandom = no\n\t}\n}\n");
  fs.mkdirSync(path.join(dir, "common", "unit_leader"), { recursive: true });
  fs.writeFileSync(path.join(dir, "common", "unit_leader", "zz_own.txt"),
    "leader_traits = {\n\tzz_own_unit_trait = {\n\t\ttype = all\n\t}\n}\n");
  return { name: n, dir };
}

let PORT = 49890;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      traits: (mod) => fetch("http://127.0.0.1:" + PORT + "/api/characters/traits?modPath=" + encodeURIComponent(mod))
        .then((r) => r.json()).catch((e) => ({ error: String(e) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

(async () => {
  let api = null;
  try {
    if (!fs.existsSync(GAME)) { console.log("no HOI4 install — skipped"); return; }

    console.log("\n[the corpus] the two folders are separately populated in vanilla");
    let vLeader = 0, vUnit = 0;
    {
      const count = (sub) => {
        const d = path.join(GAME, "common", sub);
        if (!fs.existsSync(d)) return 0;
        let n = 0;
        for (const f of fs.readdirSync(d)) {
          if (!f.endsWith(".txt")) continue;
          n += (fs.readFileSync(path.join(d, f), "latin1").replace(/#.*$/gm, "").match(/^\s*[A-Za-z_][A-Za-z0-9_]*\s*=\s*\{/gm) || []).length;
        }
        return n;
      };
      vLeader = count("country_leader");
      vUnit = count("unit_leader");
      console.log(`  vanilla ships blocks in common/country_leader (${vLeader}) and common/unit_leader (${vUnit})`);
      rec("both folders really have content to lose", vLeader > 0 && vUnit > 0, { vLeader, vUnit });
    }
    // Millennium Dawn is the live case — record what it actually declares rather than asserting from memory.
    {
      const md = "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649/descriptor.mod";
      if (fs.existsSync(md)) {
        const t = fs.readFileSync(md, "utf8");
        const u = /replace_path\s*=\s*"common\/unit_leader"/.test(t);
        const c = /replace_path\s*=\s*"common\/country_leader"/.test(t);
        console.log(`  Millennium Dawn declares unit_leader=${u} country_leader=${c}`);
        rec("MD replaces one folder and not the other — the shape this bug needs", u && !c, { unit_leader: u, country_leader: c });
      } else console.log("  (MD not installed — its declaration not checked)");
    }

    api = await serve(createApp());

    console.log("\n[baseline] a plain mod sees both layers");
    const plain = mkMod(null);
    const base = await api.traits(plain.dir);
    rec("the endpoint answers", base.ok === true, base);
    rec("…offering vanilla's leader traits", base.leader.length > 100, base.leader.length);
    rec("…and vanilla's unit traits", base.unit.length > 100, base.unit.length);
    rec("…plus the mod's own, in both folders",
      base.leader.includes("zz_own_leader_trait") && base.unit.some((u) => u.name === "zz_own_unit_trait"),
      { leader: base.leader.includes("zz_own_leader_trait"), unit: base.unit.some((u) => u.name === "zz_own_unit_trait") });

    console.log("\n[replace_path on unit_leader only] the OTHER folder must be untouched — this is MD's case");
    {
      const mod = mkMod(["common/unit_leader"]);
      const r = await api.traits(mod.dir);
      rec("the endpoint answers", r.ok === true, r);
      rec("unit traits collapse to the mod's own", r.unit.length === 1 && r.unit[0].name === "zz_own_unit_trait", r.unit.slice(0, 4));
      rec("…and the country_leader folder keeps vanilla's", r.leader.length === base.leader.length,
        { got: r.leader.length, want: base.leader.length });
      rec("…including the mod's own leader trait", r.leader.includes("zz_own_leader_trait"), r.leader.slice(0, 4));
    }

    console.log("\n[replace_path on country_leader only] the mirror case");
    {
      const mod = mkMod(["common/country_leader"]);
      const r = await api.traits(mod.dir);
      rec("the endpoint answers", r.ok === true, r);
      rec("leader traits collapse to the mod's own", r.leader.length === 1 && r.leader[0] === "zz_own_leader_trait", r.leader.slice(0, 4));
      rec("…and the unit_leader folder keeps vanilla's", r.unit.length === base.unit.length,
        { got: r.unit.length, want: base.unit.length });
    }

    console.log("\n[both declared] both collapse");
    {
      const mod = mkMod(["common/country_leader", "common/unit_leader"]);
      const r = await api.traits(mod.dir);
      rec("leader traits collapse", r.leader.length === 1, r.leader.slice(0, 4));
      rec("unit traits collapse", r.unit.length === 1, r.unit.slice(0, 4));
    }

    api.stop(); api = null;
    console.log(`\n=== trait roots per folder: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (api) api.stop(); } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
