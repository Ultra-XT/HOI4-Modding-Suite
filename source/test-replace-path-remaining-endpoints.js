// #replace-path — NAME THE DIRECTORY, OR THE replace_path BRANCH NEVER RUNS.
//
// Found by a multi-agent hunt on the dependency axis — the one nothing had ever exercised — then reproduced
// by hand before it was believed.
//
// `getActiveRoots(root, subPath)` consults `chainReplacesPath` only when it is GIVEN a sub-path. Called bare
// it always returns the game root as well, so a mod whose descriptor declares `replace_path = "<dir>"` —
// where HOI4 loads NOTHING from earlier roots for that directory — was still offered every base-game entry.
// Exactly the bug already fixed in `findCountryHistoryFile`; this is the rest of the family.
//
// Eight call sites across five directories, two of which the hunt did not name (`scanHoi4Ideologies` and
// `/api/focus/all-ids` share the shape with the ones it did). Two more built their root list BY HAND and
// never consulted `chainReplacesPath` at all — those now use `getActiveRoots` and keep the hand-built list
// only as a fallback, because a resolver failure emptying a picker would read as "this mod has none".
//
// Measured with two mods identical but for that single descriptor line:
//
//   directory              before   after
//   common/ideologies        22       8   (8 is the endpoint's own hardcoded fallback, below)
//   common/national_focus     7       0
//   history/states        1,081       0
//   common/unit_leader    2,287       0
//
// The technology catalogue is the CONTROL that proves the probe can see a difference at all: it already
// honoured replace_path and reads 552 -> 0 both before and after.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-rpfam-"));
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

let seq = 0;
function mkMod(replaceDir, extra) {
  const dir = path.join(ROOT, "m" + (++seq));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"),
    'name="m"\nsupported_version="1.19.*"\n' + (replaceDir ? `replace_path="${replaceDir}"\n` : ""), "utf8");
  if (typeof extra === "function") extra(dir);
  return dir;
}

let PORT = 47800;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      get: (u) => fetch(`http://127.0.0.1:${PORT}${u}`).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      post: (u, body) => fetch(`http://127.0.0.1:${PORT}${u}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

// The one-probe sweep: two mods, identical but for one descriptor line.
const CASES = [
  { dir: "common/ideologies", what: "leader ideologies",
    url: (m) => `/api/game/leader-ideologies?modPath=${encodeURIComponent(m)}`,
    count: (d) => (Array.isArray(d) ? d.length : (d.ideologies || []).length),
    // the endpoint substitutes 8 hardcoded ones when the scan finds nothing at all
    floor: 8 },
  { dir: "common/national_focus", what: "shared focus groups",
    url: (m) => `/api/focus/shared-available?modPath=${encodeURIComponent(m)}`,
    count: (d) => (d.groups || d.shared || d.items || []).length, floor: 0 },
  { dir: "history/states", what: "states",
    url: (m) => `/api/buildings/state-catalog?modPath=${encodeURIComponent(m)}`,
    count: (d) => (d.items || []).length, floor: 0 },
  // ⚠️ COUNT ONLY THE FOLDER BEING REPLACED. This row used to sum leader + unit and assert the total fell to
  // zero — which was this test CERTIFYING A BUG (#trait-roots-decided-for-the-wrong-folder). The traits
  // collector reads TWO folders, common/country_leader and common/unit_leader, and it resolved its root list
  // once, naming unit_leader, then used it for both. So replacing unit_leader really did take vanilla's
  // country-leader traits away as well, the sum really did fall to the floor, and this row passed.
  //
  // It should not have. Millennium Dawn declares replace_path for common/unit_leader and says nothing about
  // common/country_leader, so in game an MD add-on loads MD's unit traits and vanilla's 3,222 country-leader
  // blocks. `unchanged` below is the half that was missing: the other folder must not move at all.
  { dir: "common/unit_leader", what: "character traits",
    url: (m) => `/api/characters/traits?modPath=${encodeURIComponent(m)}`,
    count: (d) => (d.unit || []).length, floor: 0,
    unchanged: { what: "country_leader traits", of: (d) => (d.leader || []).length } },
];

(async () => {
  let api = null;
  try {
    api = await serve(createApp());

    console.log("\n[the control] an endpoint that ALREADY honoured replace_path, proving the probe can see it");
    {
      const plain = mkMod(null), tc = mkMod("common/technologies");
      const a = ((await api.get(`/api/technologies/catalog?modPath=${encodeURIComponent(plain)}`)).b.technologies || []).length;
      const b = ((await api.get(`/api/technologies/catalog?modPath=${encodeURIComponent(tc)}`)).b.technologies || []).length;
      rec("without replace_path the base technologies are offered", a > 100, a);
      rec("…and with it, none are", b === 0, b);
      console.log(`  --   technologies ${a} -> ${b}`);
    }

    console.log("\n[the family] each directory must stop offering what the game will not load");
    for (const c of CASES) {
      const plain = mkMod(null), tc = mkMod(c.dir);
      const before = c.count((await api.get(c.url(plain))).b);
      const after = c.count((await api.get(c.url(tc))).b);
      rec(`${c.dir}: the base ${c.what} are offered when nothing is replaced`, before > c.floor, before);
      rec(`…and are NOT offered once the directory is replaced`, after <= c.floor && after < before, { before, after, floor: c.floor });
      console.log(`  --   ${c.dir}: ${before} -> ${after}`);
      // …and a replace_path names ONE directory. Anything the reader also scans out of a DIFFERENT folder
      // must be untouched, or the endpoint is dropping content the game still loads.
      if (c.unchanged) {
        const uBefore = c.unchanged.of((await api.get(c.url(plain))).b);
        const uAfter = c.unchanged.of((await api.get(c.url(tc))).b);
        rec(`…while the ${c.unchanged.what} it also reads are untouched`, uBefore > 0 && uAfter === uBefore, { uBefore, uAfter });
        console.log(`  --   (${c.unchanged.what}: ${uBefore} -> ${uAfter})`);
      }
    }

    console.log("\n[a mod that replaces the directory AND ships its own] sees exactly its own");
    {
      const own = mkMod("common/ideologies", (dir) => {
        fs.mkdirSync(path.join(dir, "common", "ideologies"), { recursive: true });
        fs.writeFileSync(path.join(dir, "common", "ideologies", "00_ideologies.txt"), [
          "ideologies = {", "\tnua_order = {", "\t\ttypes = {", "\t\t\tnua_technocracy = { }", "\t\t}", "\t}", "}", "",
        ].join("\n"), "utf8");
      });
      const items = (await api.get(`/api/game/leader-ideologies?modPath=${encodeURIComponent(own)}`)).b;
      const types = (Array.isArray(items) ? items : []).map((x) => x && x.type);
      rec("its own ideology is offered", types.includes("nua_technocracy"), types.slice(0, 10));
      rec("…and vanilla's are not", !types.includes("despotism"), types.slice(0, 10));

      // The guard behind the character save reads the same scan, so it now validates against the mod's own.
      const bad = await api.post("/api/characters/save", {
        modPath: own, file: "nua_c.txt", token: "NUA_leader", name: "Leader",
        roleLeader: true, leaderIdeology: "despotism",
      });
      rec("saving a leader with a vanilla ideology is refused",
        bad.b && (bad.b.error || "").includes("despotism"), bad.b);
      const good = await api.post("/api/characters/save", {
        modPath: own, file: "nua_c.txt", token: "NUA_leader", name: "Leader",
        roleLeader: true, leaderIdeology: "nua_technocracy",
      });
      rec("…while the mod's own ideology is accepted", good.b && good.b.ok === true, good.b);
    }

    console.log("\n[and a mod that replaces it and ships NOTHING] is not blocked from saving");
    {
      // Deliberate: a mod with no ideologies at all has nothing to validate against, so the guard stands
      // down rather than refusing every leader. The comment at the guard says exactly this.
      const empty = mkMod("common/ideologies");
      const r = await api.post("/api/characters/save", {
        modPath: empty, file: "nua_c.txt", token: "NUA_leader2", name: "Leader",
        roleLeader: true, leaderIdeology: "anything_at_all",
      });
      rec("the save is allowed through", r.b && r.b.ok === true, r.b);
    }
    api.stop(); api = null;

    console.log("\n[the source] every one of these calls names its directory");
    {
      const SRV = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
      for (const dir of ["common/ideologies", "common/national_focus", "history/states"]) {
        rec(`getActiveRoots is called with "${dir}"`,
          SRV.includes(`getActiveRoots(root, "${dir}")`) || SRV.includes(`getActiveRoots(modRoot, "${dir}")`)
          || SRV.includes(`getActiveRoots(activeRoot, "${dir}")`), "no named call");
      }
      // common/unit_leader is no longer a literal at its call site and must not be asserted as one. The
      // traits collector reads two folders and now resolves a root list PER FOLDER
      // (#trait-roots-decided-for-the-wrong-folder), so it names the directory by computing it. Pinning the
      // old literal would push it back to one shared decision — the bug. The behaviour is covered above and
      // in test-trait-roots-per-folder.js; what belongs here is that the folder is still named at all.
      rec("the traits collector still names the directory it is reading",
        /getActiveRoots\(activeRoot, "common\/" \+ subdir\)/.test(SRV), "the folder is no longer named");
      // The hand-built lists must keep their fallback, or a resolver failure empties a picker silently.
      rec("the hand-built root lists survive as a fallback",
        (SRV.match(/if \(!roots\.length\) \{/g) || []).length + (SRV.match(/if \(!rs\.length\) \{/g) || []).length >= 2,
        "fallback missing");
    }

    console.log(`\n=== replace_path remaining endpoints: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (api) api.stop(); } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
