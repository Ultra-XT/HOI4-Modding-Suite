// ⛔ #delete-inherited-state, ASKED BEFORE THE STATE DISAPPEARS FROM THE MAP.
//
// deleteState refuses to delete a state that comes from the base game or a dependency, when the mod does not
// replace history/states: removing the mod's copy just brings the original back, with its own provinces and
// buildings. The reasoning and the message are good. The timing was not.
//
// Driving the editor on a fresh vanilla-based mod, Delete on state 372 (Arkansas, USA):
//
//     "State 372 marked for deletion (unsaved — click 💾 Save)."
//
// and the handler had already pulled the state out of the local model, so the map showed its fourteen
// provinces as stateless land belonging to nobody. Save then answered "Save stopped at step 1: State 372
// comes from the base game or a dependency…", the staged delete stayed queued, and the view stayed wrong
// until a reload. The confirm even recited the rule in parentheses — "(Only states your mod defines can be
// deleted.)" — without ever checking it.
//
// ⭐ AND rootPath CANNOT CHECK IT. editStateBlock materialises a base state into the mod under the BASE
// FILE'S OWN NAME, because HOI4 overrides history/states by relative filename. So after any edit at all —
// move a province, change manpower — the id reads as the mod's while the original is still underneath, and
// deleting it hands the original back. That is the case this test exists for.
//
// buildMapModel now answers the real question as `inBaseLayer`, computed over effectiveLayers, which has
// already applied replace_path — so a mod that declares replace_path="history/states" sees no base layers,
// every id comes out false, and deleting is allowed, which is exactly deleteState's own gate.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 320) : "")); }
};
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const tmps = [];
const state = (id, provs, owner) =>
  `state = {\n\tid = ${id}\n\tname = "S${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs.join(" ")} }\n\thistory = { owner = ${owner} }\n}\n`;

function makeGame() {
  const g = fs.mkdtempSync(path.join(os.tmpdir(), "nova-delgame-")); tmps.push(g);
  mk(path.join(g, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0", "1;200;0;0;land;false;plains;1", "2;0;200;0;land;false;plains;1", "3;10;10;10;land;false;plains;1",
  ].join("\r\n") + "\r\n");
  mk(path.join(g, "history", "states", "10-Base.txt"), state(10, [1], "AAA"));
  mk(path.join(g, "history", "states", "20-Base.txt"), state(20, [2], "BBB"));
  return g;
}
function makeMod(tag, files, descriptorExtra) {
  const m = fs.mkdtempSync(path.join(os.tmpdir(), "nova-delmod-" + tag + "-")); tmps.push(m);
  mk(path.join(m, "descriptor.mod"), `name="${tag}"\nsupported_version="1.19.*"\n${descriptorExtra || ""}`);
  for (const [rel, body] of Object.entries(files || {})) mk(path.join(m, ...rel.split("/")), body);
  return m;
}
const flagOf = (modRoot, gameRoot, id) => {
  const model = md.buildMapModel({ modRoot, gameRoot, dependencyRoots: [] });
  const s = (model.states || []).find((x) => x.id === id);
  return s ? { inBaseLayer: s.inBaseLayer, rootPath: s.rootPath } : null;
};

(() => {
  const game = makeGame();

  console.log("\n=== a state that only the base game defines ===");
  {
    const mod = makeMod("plain", { "common/characters/c.txt": "characters = {\n}\n" });
    const f = flagOf(mod, game, 10);
    ok(f && f.inBaseLayer === true, "is marked as coming from a base layer", f);
    const r = md.deleteState({ modRoot: mod, gameRoot: game, dependencyRoots: [], stateId: 10 });
    ok(!!(r && r.error), "…and the server refuses to delete it, as it always did", r);
  }

  console.log("\n=== a state only the MOD defines ===");
  {
    const mod = makeMod("own", { "history/states/900-Mine.txt": state(900, [3], "CCC") });
    const f = flagOf(mod, game, 900);
    ok(f && f.inBaseLayer === false, "is not marked, so the button lets it through", f);
    const r = md.deleteState({ modRoot: mod, gameRoot: game, dependencyRoots: [], stateId: 900 });
    ok(!!(r && r.changed), "…and the server really does delete it", r);
  }

  console.log("\n=== ⭐ a base state MATERIALISED into the mod — where rootPath is the trap ===");
  {
    // What any edit produces: the base file copied into the mod under its own name. rootPath now says the
    // mod, and deleting would hand the original straight back.
    const mod = makeMod("materialised", { "history/states/10-Base.txt": state(10, [1], "AAA") });
    const f = flagOf(mod, game, 10);
    ok(/nova-delmod-materialised/.test(String(f && f.rootPath)),
      "rootPath says the state is the MOD's — which is why it cannot be the test", f && f.rootPath);
    ok(f && f.inBaseLayer === true, "⭐ …but inBaseLayer still says the original is underneath", f);
    const r = md.deleteState({ modRoot: mod, gameRoot: game, dependencyRoots: [], stateId: 10 });
    ok(!!(r && r.error), "…and the server refuses, so the two agree", r && r.error);
  }

  console.log("\n=== a mod that REPLACES history/states may delete anything ===");
  {
    // effectiveLayers cuts the base layers away, so nothing is inBaseLayer and deleteState's own gate opens.
    const mod = makeMod("replacer", { "history/states/10-Base.txt": state(10, [1], "AAA") },
      'replace_path="history/states"\n');
    const f = flagOf(mod, game, 10);
    ok(f && f.inBaseLayer === false, "the inherited id is no longer marked", f);
    const r = md.deleteState({ modRoot: mod, gameRoot: game, dependencyRoots: [], stateId: 10 });
    ok(!!(r && r.changed), "…and the server allows the delete", r);
  }

  console.log("\n=== the flag and the server never disagree ===");
  {
    // The point of the whole change: whatever the button decides, the save must decide the same. Check every
    // state in every shape above rather than trusting the four cases.
    const shapes = [
      ["plain", makeMod("agree1", { "common/characters/c.txt": "characters = {\n}\n" }), ""],
      ["own", makeMod("agree2", { "history/states/900-Mine.txt": state(900, [3], "CCC") }), ""],
      ["materialised", makeMod("agree3", { "history/states/10-Base.txt": state(10, [1], "AAA") }), ""],
    ];
    let checked = 0, disagreed = [];
    for (const [label, mod] of shapes) {
      const model = md.buildMapModel({ modRoot: mod, gameRoot: game, dependencyRoots: [] });
      for (const s of model.states) {
        const r = md.deleteState({ modRoot: mod, gameRoot: game, dependencyRoots: [], stateId: s.id });
        const serverRefused = !!(r && r.error);
        checked++;
        if (serverRefused !== !!s.inBaseLayer) disagreed.push({ label, id: s.id, inBaseLayer: s.inBaseLayer, serverRefused, err: r && r.error });
        // put it back so the next id in this mod is judged against the same tree
        if (r && r.changed) mk(path.join(mod, "history", "states", `${s.id}-restore.txt`), state(s.id, s.provinces || [1], s.owner || "AAA"));
      }
    }
    ok(checked > 0, `${checked} states judged by both sides`, checked);
    ok(disagreed.length === 0, "the click's answer matches the save's, for every one", disagreed.slice(0, 4));
  }

  tmps.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
  console.log(`\n=== deleting an inherited state is refused at the click: ${pass} checks, ${fails.length} failed ===`);
  fails.forEach((f) => console.log("   FAILED: " + f));
  process.exit(fails.length ? 1 : 0);
})();
