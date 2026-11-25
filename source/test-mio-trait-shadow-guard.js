// #mio-and-trait-writers-shadow-a-base-file — TWO WRITERS SHORT OF A GUARD SEVEN ALREADY USE.
//
// HOI4 replaces a `common/` file WHOLESALE when a later-loading mod ships one at the same relative path.
// `nonShadowingFileName` renames such a write to `nova_<file>`, and seven writers funnel through it: events,
// decision categories, decisions, characters, ideas, technologies. Two did not:
//
//     writeMioToFile          common/military_industrial_organization/organizations
//     writeLeaderTraitToFile  common/unit_leader
//
// The company editor's filename box is free text, and its ▾ dropdown lists only the mod's OWN files, so
// nothing steers an author away from the obvious name. Measured: `POST /api/mio` with
// fileName "00_generic_organization.txt" — the largest of vanilla's organizations files, 30 companies — left
// the mod holding a file at that path with ONE company in it, and answered {ok:true, refWarning:""}.
//
// The control that settles it is the sibling writer in the same session: `POST /api/characters/save` with
// file "USA.txt" answers "common/characters/nova_USA.txt". Same question, one endpoint over, opposite answer.
//
// The trait writer is API-reachable only today — public/characters.js posts no file field — but it is the
// same missing guard on the same kind of folder (vanilla's common/unit_leader/00_traits.txt defines 174
// commander traits), and leaving it would leave the next caller free to reintroduce the bug.
//
// What the guard must NOT do is redirect a file the mod ALREADY owns: that shadow exists either way and is
// the author's deliberate choice, and redirecting would only define the same content twice. That case has
// its own checks below.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-mioshadow-"));
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
const ORG_REL = ["common", "military_industrial_organization", "organizations"];
const toPosix = (p) => p.split(path.sep).join("/");
let seq = 0;
function mkMod(deps) {
  const n = "MS" + ++seq;
  const dir = path.join(ROOT, "m" + seq);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"),
    'name="' + n + '"\nsupported_version="1.19.*"\n' + (deps ? 'dependencies={ "' + deps + '" }\n' : ""));
  fs.writeFileSync(path.join(ROOT, "m" + seq + ".mod"),
    'name="' + n + '"\npath="' + toPosix(dir) + '"\nsupported_version="1.19.*"\n');
  return { name: n, dir };
}
const orgDir = (mod) => {
  const d = path.join(mod, ...ORG_REL);
  return fs.existsSync(d) ? fs.readdirSync(d).sort() : [];
};
const MIO_BODY = (over) => Object.assign({
  id: "nova_probe_co", name: "Nova Probe Co", allowedTag: "USA",
  equipmentType: ["mio_cat_eq_all_medium_tank"], initial: { equipmentBonus: { reliability: 0.05 } }, traits: [],
}, over);

let PORT = 49990;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      post: (p, b) => fetch("http://127.0.0.1:" + PORT + p, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b),
      }).then((r) => r.json()).catch((e) => ({ error: String(e) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

(async () => {
  let api = null;
  try {
    if (!fs.existsSync(GAME)) { console.log("no HOI4 install — skipped"); return; }

    console.log("\n[the corpus] the filenames an author could collide with");
    let victim = "", victimCount = 0;
    {
      const d = path.join(GAME, ...ORG_REL);
      const files = fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith(".txt")) : [];
      for (const f of files) {
        const n = (fs.readFileSync(path.join(d, f), "latin1").replace(/#.*$/gm, "")
          .match(/(?:^|\n)[A-Za-z_][A-Za-z0-9_]*\s*=\s*\{/g) || []).length;
        if (n > victimCount) { victim = f; victimCount = n; }
      }
      console.log(`  vanilla ships ${files.length} organizations files; the biggest is ${victim} with ${victimCount} companies`);
      rec("fixture: there is a real vanilla file to shadow", !!victim && victimCount > 5, { victim, victimCount });
      const td = path.join(GAME, "common", "unit_leader");
      const traitFiles = fs.existsSync(td) ? fs.readdirSync(td).filter((f) => f.endsWith(".txt")) : [];
      console.log(`  and ${traitFiles.length} common/unit_leader files`);
      rec("…and unit_leader files too", traitFiles.length > 0, traitFiles.length);
    }

    api = await serve(createApp());

    console.log("\n[the MIO writer] a vanilla organizations filename is not taken over");
    {
      const mod = mkMod(null);
      const r = await api.post("/api/mio", MIO_BODY({ modPath: mod.dir, fileName: victim }));
      rec("the save succeeds", r.ok === true, r);
      rec("…redirected away from vanilla's filename", r.file === "nova_" + victim, r);
      rec("…and nothing sits at the shadowing path", !orgDir(mod.dir).includes(victim), orgDir(mod.dir));
      // Read defensively: when the redirect check above fails this file does not exist, and throwing here
      // would hide every remaining section of the test behind a stack trace.
      const wrote = (() => {
        try { return fs.readFileSync(path.join(mod.dir, ...ORG_REL, "nova_" + victim), "utf8"); } catch (e) { return ""; }
      })();
      rec("…while the company really was written", /nova_probe_co\s*=/.test(wrote), wrote ? "no id in file" : "file absent");
    }

    console.log("\n[a dependency's filename] the same rule one layer up");
    {
      const base = mkMod(null);
      const bd = path.join(base.dir, ...ORG_REL);
      fs.mkdirSync(bd, { recursive: true });
      fs.writeFileSync(path.join(bd, "zz_base_orgs.txt"),
        "base_alpha_org = {\n\ticon = GFX_idea_generic_air_manufacturer_3\n\tallowed = { original_tag = USA }\n\tequipment_type = { mio_cat_eq_all_medium_tank }\n}\n");
      const addon = mkMod(base.name);
      const r = await api.post("/api/mio", MIO_BODY({ modPath: addon.dir, fileName: "zz_base_orgs.txt" }));
      rec("the save succeeds", r.ok === true, r);
      rec("…redirected away from the base mod's filename", r.file === "nova_zz_base_orgs.txt", r);
      rec("…and the base mod is untouched",
        /base_alpha_org/.test(fs.readFileSync(path.join(bd, "zz_base_orgs.txt"), "utf8")), "base changed");
    }

    console.log("\n[a file the mod already owns] must NOT be redirected");
    {
      const mod = mkMod(null);
      const r1 = await api.post("/api/mio", MIO_BODY({ modPath: mod.dir, fileName: "my_orgs.txt" }));
      rec("the first save lands where asked", r1.ok === true && r1.file === "my_orgs.txt", r1);
      const r2 = await api.post("/api/mio", MIO_BODY({ modPath: mod.dir, id: "nova_second_co", name: "Second", fileName: "my_orgs.txt" }));
      rec("…and so does a second company in the same file", r2.ok === true && r2.file === "my_orgs.txt", r2);
      const txt = fs.readFileSync(path.join(mod.dir, ...ORG_REL, "my_orgs.txt"), "utf8");
      rec("…both present, one file", /nova_probe_co\s*=/.test(txt) && /nova_second_co\s*=/.test(txt), orgDir(mod.dir));
      rec("…and no second file was minted", orgDir(mod.dir).join() === "my_orgs.txt", orgDir(mod.dir));
    }

    console.log("\n[the sibling that was already right] the control");
    {
      const mod = mkMod(null);
      const c = await api.post("/api/characters/save", {
        modPath: mod.dir, file: "USA.txt", token: "nova_probe_char", name: "Nova Probe",
        roleGeneral: true, generalType: "corps_commander", genSkill: 3,
      });
      rec("the character writer redirects a vanilla filename", /nova_USA\.txt/.test(String(c.file || "")), c);
    }

    console.log("\n[the leader-trait writer] the other one that was short");
    {
      const SRV = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
      rec("writeLeaderTraitToFile now funnels through the guard",
        /nonShadowingFileName\(activeRoot, \["common", "unit_leader"\], safeFile\)/.test(SRV), "still unguarded");
      // …and the MIO one at source level too, so a future refactor cannot quietly drop either.
      rec("writeMioToFile does too",
        /nonShadowingFileName\(activeRoot, \["common", "military_industrial_organization", "organizations"\], safeFile\)/.test(SRV),
        "still unguarded");
      const users = (SRV.match(/nonShadowingFileName\(/g) || []).length - 1; // minus the definition
      console.log(`  ${users} writers now funnel through nonShadowingFileName`);
      rec("…and the guard has many adopters, not two", users >= 8, users);
    }

    api.stop(); api = null;
    console.log(`\n=== mio trait shadow guard: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (api) api.stop(); } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
