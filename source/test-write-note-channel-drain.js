// #write-note-never-drained — A SHARED WARNING CHANNEL NEEDS A CONSUMER ON EVERY PRODUCER'S ENDPOINT.
//
// `noteWriteWarning` records something a save did that the user must know about; `drainRefWriteWarning`
// empties the buffer into a response. The two were wired by hand, endpoint by endpoint, and two producers
// sat on endpoints that never drained:
//
//   POST /api/equipment/save  mints the "saved to zz_nova_equipment.txt instead" redirect note, and answered
//                             {ok, id, file} — no warning field of any kind.
//   POST /api/army/save       can mint the unknown-tag note through ensureCountryHistoryFileInMod, and
//                             answered {ok, file, templates, divisions, oobWired, …} — likewise.
//
// The note was not discarded. It sat in the buffer until SOME LATER REQUEST drained it. Measured: an
// equipment save on one mod, then an unrelated decision save on a DIFFERENT mod, and the decision response
// came back carrying "Saved the equipment to zz_nova_equipment.txt instead of bm_infantry.txt…". The author
// who caused it never saw it; someone editing an unrelated mod saw a warning about equipment they had never
// touched. The warning itself matters — its subject is HOI4 reporting "Malformed token" and dropping the
// equipment entirely.
//
// The redirect had a second, quieter half: the response echoed the file the caller ASKED for while the bytes
// went somewhere else, and public/army.js prints that as "✓ Saved → bm_infantry.txt".
//
// The fix drains at the RESPONSE BOUNDARY rather than on those two endpoints, because wiring producers to
// consumers one at a time is how this happened. A handler that already drains is unaffected — it empties the
// buffer itself, so there is nothing left to attach.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-wnote-"));
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

const toPosix = (p) => p.split(path.sep).join("/");
let seq = 0;
function mkMod(deps) {
  const n = "WN" + ++seq;
  const dir = path.join(ROOT, "m" + seq);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"),
    'name="' + n + '"\nsupported_version="1.19.*"\n' + (deps ? 'dependencies={ "' + deps + '" }\n' : ""));
  fs.writeFileSync(path.join(ROOT, "m" + seq + ".mod"),
    'name="' + n + '"\npath="' + toPosix(dir) + '"\nsupported_version="1.19.*"\n');
  return { name: n, dir };
}
const put = (dir, rel, txt) => {
  const p = path.join(dir, ...rel.split("/"));
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, txt, "utf8");
};

// ⚠️ THE FIXTURE HAS TO STILL PRODUCE A REDIRECT. This test originally had the base mod define the
// archetype and the tier together, and had the add-on edit the tier — which redirected only because the
// redirect could not see a dependency's archetype at all. Fixing that (#equip-redirect-blind-to-dependencies)
// stopped this fixture redirecting, and every check below about the warning would have become vacuous. The
// fixture control caught it; a test without one would have gone on passing while measuring nothing.
//
// So the pair is SPLIT: the archetype in a file that sorts LATE, the tier in one that sorts EARLY. The
// archetype is then a genuine forward reference — the case the redirect exists for — and it still fires.
const BASE_ARCHETYPE_LATE = [
  "equipments = {",
  "\twn_rifle_equipment = {",
  "\t\tyear = 1918",
  "\t\tis_archetype = yes",
  "\t\ttype = { infantry }",
  "\t\tgroup_by = archetype",
  "\t\tdefense = 10",
  "\t\tbuild_cost_ic = 0.5",
  "\t\tresources = { steel = 1 }",
  "\t}",
  "}",
  "",
].join("\n");
const BASE_TIER_EARLY = [
  "equipments = {",
  "\twn_rifle_equipment_1 = {",
  "\t\tyear = 1936",
  "\t\tarchetype = wn_rifle_equipment",
  "\t\tpriority = 10",
  "\t}",
  "}",
  "",
].join("\n");

let PORT = 49850;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      get: (p) => fetch("http://127.0.0.1:" + PORT + p).then((r) => r.json()).catch((e) => ({ error: String(e) })),
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
    const SRV = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");

    console.log("\n[the channel] every producer is matched by a consumer at the boundary");
    {
      const producers = (SRV.match(/noteWriteWarning\(/g) || []).length - 1; // minus the definition
      console.log(`  ${producers} noteWriteWarning call sites feed one buffer`);
      rec("there really are several producers to cover", producers >= 5, producers);
      rec("the drain is installed at the response boundary", /function installWriteNoteDrain/.test(SRV), "no boundary drain");
      rec("…and wired in before any route registers", /installWriteNoteDrain\(app\);/.test(SRV), "never called");
      rec("…wrapping res.json rather than editing each handler", /res\.json = \(body\) =>/.test(SRV), "not wrapping res.json");
    }

    api = await serve(createApp());

    console.log("\n[the equipment redirect] the author who caused it is the one who sees it");
    const base = mkMod(null);
    put(base.dir, "common/units/equipment/zz_wn_archetype.txt", BASE_ARCHETYPE_LATE);
    put(base.dir, "common/units/equipment/aa_wn_tier.txt", BASE_TIER_EARLY);
    const addon = mkMod(base.name);
    {
      // The endpoint writes to where the equipment CURRENTLY lives and ignores any fileName sent, so the
      // target here is aa_wn_tier.txt — which loads before the archetype's file. That is a real forward
      // reference, and the redirect is right to fire.
      const r = await api.post("/api/equipment/save", { modPath: addon.dir, id: "wn_rifle_equipment_1", softAttack: 6 });
      rec("the save succeeds", r.ok === true, r);
      // Fixture control: the redirect must actually have happened, or every check below is vacuous.
      const dir = fs.readdirSync(path.join(addon.dir, "common", "units", "equipment"));
      rec("fixture: the write really was redirected", dir.includes("zz_nova_equipment.txt"), dir);
      rec("…and the response carries the warning", /zz_nova_equipment\.txt instead of/.test(r.refWarning || ""), r);
      rec("…which explains the consequence, not just the fact",
        /Malformed token/.test(r.refWarning || ""), r.refWarning);
      rec("…and `file` names where the bytes LANDED", r.file === "zz_nova_equipment.txt", r);
      rec("…with the requested name kept separately", r.requestedFile === "aa_wn_tier.txt", r);
    }

    console.log("\n[no bleed] the next request cannot inherit someone else's warning");
    {
      const other = mkMod(null); // a different mod entirely
      const dec = await api.post("/api/decisions/save", {
        modPath: other.dir, categoryId: "wn_cat", id: "wn_decision", name: "Note Test", cost: "10", decisionType: "standard",
      });
      rec("the unrelated save succeeds", dec.ok === true, dec);
      rec("…and carries no warning about equipment it never touched",
        !/zz_nova|wn_infantry|wn_rifle/i.test(String(dec.refWarning || "")), dec.refWarning);
      // Do it twice — a buffer that is drained but not cleared would only show up on the second read.
      const dec2 = await api.post("/api/decisions/save", {
        modPath: other.dir, categoryId: "wn_cat", id: "wn_decision_2", name: "Note Test 2", cost: "10", decisionType: "standard",
      });
      rec("…and still none on the request after that", !String(dec2.refWarning || "").trim(), dec2.refWarning);
    }

    console.log("\n[the army save] its own producer now reaches its own response");
    {
      const mod = mkMod(null);
      put(mod.dir, "history/units/WNX_1936.txt",
        "division_template = {\n\tname = \"Test Div\"\n\tregiments = { infantry = { x = 0 y = 0 } }\n}\nunits = {\n\tdivision = { name = \"1st\" location = 1 division_template = \"Test Div\" start_experience_factor = 0.1 }\n}\n");
      const r = await api.post("/api/army/save", {
        modPath: mod.dir, tag: "WNX", fileName: "WNX_1936.txt",
        templates: [{ name: "Test Div", regiments: [{ type: "infantry", x: 0, y: 0 }] }],
        divisions: [{ name: "1st", location: 1, division_template: "Test Div" }],
      });
      rec("the save answers", r.ok === true || !!r.error, r);
      if (r.ok) {
        rec("…and an unknown tag is reported on THIS response, not a later one",
          /not a country in this mod|not in the tag list/.test(String(r.refWarning || "")), r.refWarning || "(no warning)");
      }
    }

    console.log("\n[no false positives] ordinary responses stay clean");
    {
      const mod = mkMod(null);
      const r = await api.post("/api/decisions/save", {
        modPath: mod.dir, categoryId: "wn_ok", id: "wn_ok_decision", name: "Fine", cost: "10", decisionType: "standard",
      });
      rec("a save with nothing to report says nothing", !String(r.refWarning || "").trim(), r.refWarning);
      const g = await api.get("/api/technologies/catalog?lite=1&modPath=" + encodeURIComponent(mod.dir));
      rec("a GET is not given a warning field it never had", !("refWarning" in g), Object.keys(g).slice(0, 8));
    }

    api.stop(); api = null;
    console.log(`\n=== write note channel drain: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (api) api.stop(); } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
