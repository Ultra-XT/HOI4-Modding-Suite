// #vertical-tab-written-horizontal — A TAB CREATED AS "VERTICAL" WAS WRITTEN TO THE MOD AS HORIZONTAL.
//
// The Create Tab modal offers "Horizontal" and "Vertical (HOI4 Up style)". Picking Vertical made the editor
// draw the tab vertically — and the mod on disk got `format = "LEFT"` with the era running left-to-right and
// the year stamps along the top, i.e. a horizontal tab. The editor and the game disagreed about the same
// file.
//
// HOI4 reads a folder's orientation from its gridbox `format`: "LEFT" is horizontal (time runs left→right,
// like vanilla's infantry folder) and "UP" is vertical (time runs top→down, like the doctrine folders).
//
// CAUSE: syncCustomFolderGridboxes already honoured opts.orientation — its comment says "trust an explicit
// choice from the editor; otherwise LEARN it from the folder's existing gridboxes" — but the caller that
// runs after every save, syncAllCustomFolderGridboxes, passed no opts at all. So every folder fell through
// to detectFolderOrientation, which on a freshly created folder has no gridbox to learn from and returns
// null, and the builder emitted its horizontal default. `grep -c '\.layout\b' server.js` returned ZERO:
// nothing on the server read the field the client had been sending all along.
//
// The choice lives in editor_custom_tabs.json, and it is the same field the editor renders from —
// research.js's getActiveLayout() returns `custom.layout` for a custom tab and sends exactly that to
// /api/research/fix-tree-layout. Reading it in the sync is what makes disk agree with screen.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-vtab-"));
process.env.HOI4_MODS_ROOT = ROOT;
process.env.APPDATA = path.join(ROOT, "appdata");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500));
  }
}

const toPosix = (p) => p.split(path.sep).join("/");
let seq = 0;
function mkMod() {
  const dir = path.join(ROOT, "m" + ++seq);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), 'name="V' + seq + '"\nsupported_version="1.19.*"\n');
  fs.writeFileSync(path.join(ROOT, "m" + seq + ".mod"),
    'name="V' + seq + '"\npath="' + toPosix(dir) + '"\nsupported_version="1.19.*"\n');
  return dir;
}
const guiOf = (mod) => {
  try { return fs.readFileSync(path.join(mod, "interface", "countrytechtreeview.gui"), "utf8"); }
  catch (_) { return ""; }
};
// The gridboxes Nova emits for a folder, and the format each declares.
// ⚠️ BALANCED BRACES, not [^}]*. A gridboxtype body contains nested blocks — `position = { … }` and
// `slotsize = { … }` — so a lazy scan stops at the first inner `}` and never reaches `format`, which comes
// last. My first version did exactly that and reported every format as "" on code that was already correct.
const formatsFor = (gui) => {
  const out = [];
  const re = /gridboxtype\s*=\s*\{/gi;
  let m;
  while ((m = re.exec(gui)) !== null) {
    const open = gui.indexOf("{", m.index);
    let d = 0, close = -1;
    for (let i = open; i < gui.length; i++) {
      if (gui[i] === "{") d++;
      else if (gui[i] === "}") { d--; if (!d) { close = i; break; } }
    }
    if (close === -1) break;
    re.lastIndex = close;
    const body = gui.slice(open + 1, close);
    const nm = /name\s*=\s*"([^"]+)"/.exec(body);
    const fmt = /format\s*=\s*"([^"]+)"/.exec(body);
    if (nm) out.push({ name: nm[1], format: fmt ? fmt[1] : "" });
  }
  return out;
};

let PORT = 50940;
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

// The body public/research.js:6408 actually posts for a save-batch, trimmed to what this exercises.
const saveBatch = (mod, folderKey, layout, techIds) => ({
  modPath: mod,
  countryTag: "VTA",
  countryTechIds: null,
  deletions: [],
  equipments: {},
  newTechIds: techIds,
  customTabs: [{ name: "Vert Tab", key: "kv", folder: folderKey, layout, ledger: "army" }],
  technologies: techIds.map((id, i) => ({
    id, folder: folderKey, x: 1, y: i * 2, startYear: 1936 + i * 2,
    researchCost: 1.5, forceSmallLayout: true, isMod: true,
    fileName: "custom_technologies.txt", prerequisites: [], dependencies: [],
    enableEquipments: [], modifiers: "", extraScript: "",
    name: "Tech " + id, description: "d", iconKey: "GFX_infantry_weapons_medium",
  })),
});

(async () => {
  let api = null;
  try {
    api = await serve(createApp());

    console.log("\n[a tab created as VERTICAL] the mod must say so too");
    {
      const mod = mkMod();
      const fk = "vert_folder";
      const c = await api.post("/api/research/create-custom-folder",
        { modPath: mod, folderKey: fk, ledger: "army", tabDdsPath: "", name: "Vert Tab" });
      rec("the folder is created", c.ok === true || c.success === true, c.error || c);
      const r = await api.post("/api/technologies/save-batch", saveBatch(mod, fk, "vertical", ["v_a", "v_b", "v_c"]));
      rec("the save succeeds", r.ok === true || r.savedTechCount > 0, r.error || r);

      const gui = guiOf(mod);
      const boxes = formatsFor(gui).filter((b) => /^v_[abc]_tree$/.test(b.name));
      console.log("     gridboxes: " + JSON.stringify(boxes));
      rec("a gridbox was written per tech", boxes.length === 3, boxes);
      // "UP" is vertical. This is the whole finding: it used to be "LEFT".
      rec("…every one declares format UP, the vertical orientation",
        boxes.length === 3 && boxes.every((b) => b.format === "UP"), boxes);
      rec("…and none of them says LEFT", !boxes.some((b) => b.format === "LEFT"), boxes);

      // The editor's own record must agree with what was written, or the two disagree again next save.
      const rec2 = JSON.parse(fs.readFileSync(path.join(mod, "editor_custom_tabs.json"), "utf8"));
      rec("…and the tab record still says vertical", rec2[0] && rec2[0].layout === "vertical", rec2);
    }

    console.log("\n[CONTROL — a tab created as HORIZONTAL] must stay horizontal");
    {
      // Without this, a fix that simply forced UP everywhere would pass every check above.
      const mod = mkMod();
      const fk = "horz_folder";
      await api.post("/api/research/create-custom-folder",
        { modPath: mod, folderKey: fk, ledger: "army", tabDdsPath: "", name: "Horz Tab" });
      const r = await api.post("/api/technologies/save-batch", saveBatch(mod, fk, "horizontal", ["h_a", "h_b"]));
      rec("the save succeeds", r.ok === true || r.savedTechCount > 0, r.error || r);
      const boxes = formatsFor(guiOf(mod)).filter((b) => /^h_[ab]_tree$/.test(b.name));
      console.log("     gridboxes: " + JSON.stringify(boxes));
      rec("every gridbox declares format LEFT", boxes.length === 2 && boxes.every((b) => b.format === "LEFT"), boxes);
    }

    console.log("\n[CONTROL — no layout recorded at all] falls back to detection, not to a guess");
    {
      // A tab list that carries no usable layout must leave the existing behaviour alone: the sync learns
      // the orientation from the folder's own gridboxes, and a fresh folder gets the horizontal default.
      const mod = mkMod();
      const fk = "none_folder";
      await api.post("/api/research/create-custom-folder",
        { modPath: mod, folderKey: fk, ledger: "army", tabDdsPath: "", name: "None Tab" });
      const body = saveBatch(mod, fk, "horizontal", ["n_a"]);
      delete body.customTabs[0].layout; // nothing recorded
      const r = await api.post("/api/technologies/save-batch", body);
      rec("the save succeeds", r.ok === true || r.savedTechCount > 0, r.error || r);
      const boxes = formatsFor(guiOf(mod)).filter((b) => /^n_a_tree$/.test(b.name));
      rec("…and it still writes a gridbox", boxes.length === 1, boxes);
      rec("…with the horizontal default rather than nothing", boxes[0] && boxes[0].format === "LEFT", boxes);
    }

    console.log("\n[⚠️ CONTROL — a junk layout value] must not override the orientation already on disk");
    {
      // Asserting "the gridbox still carries a real HOI4 format" does NOT discriminate: the builder treats
      // anything that is not "vertical" as horizontal, so a junk value emits LEFT either way and the check
      // passes with the filter removed. What the filter actually prevents is junk BEATING a correctly
      // detected orientation — so establish a vertical folder first, then save again with a junk layout.
      const mod = mkMod();
      const fk = "junk_folder";
      await api.post("/api/research/create-custom-folder",
        { modPath: mod, folderKey: fk, ledger: "army", tabDdsPath: "", name: "Junk Tab" });
      // 1) a real vertical save — the folder now has UP gridboxes for detection to learn from
      await api.post("/api/technologies/save-batch", saveBatch(mod, fk, "vertical", ["j_a", "j_b"]));
      const before = formatsFor(guiOf(mod)).filter((b) => /^j_[ab]_tree$/.test(b.name));
      rec("the folder starts out vertical", before.length === 2 && before.every((b) => b.format === "UP"), before);

      // 2) …and now a save whose recorded layout is nonsense
      const r = await api.post("/api/technologies/save-batch", saveBatch(mod, fk, "sideways", ["j_a", "j_b"]));
      rec("the save succeeds", r.ok === true || r.savedTechCount > 0, r.error || r);
      const after = formatsFor(guiOf(mod)).filter((b) => /^j_[ab]_tree$/.test(b.name));
      console.log("     gridboxes after the junk save: " + JSON.stringify(after));
      rec("…and the folder is STILL vertical — junk did not silently flip it",
        after.length === 2 && after.every((b) => b.format === "UP"), after);
    }

    console.log("\n[the wiring] the server actually reads the field the client sends");
    {
      const src = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
      rec("something on the server reads a tab's layout", /t\.layout === "vertical"/.test(src),
        "no server code reads customTabs[].layout");
      rec("…and forwards it as the sync's orientation",
        /syncCustomFolderGridboxes\(modRoot, fk, orientation \? \{ orientation \} : undefined\)/.test(src),
        "the layout is read but never passed on");
    }

    api.stop(); api = null;
    console.log(`\n=== custom tab vertical layout: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (api) api.stop(); } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
