// #custom-folder-tech-drag-discarded — DO NOT OFFER A DRAG THAT WILL BE THROWN AWAY.
//
// Left as an open lead by the maker hunt's completeness pass, which could not settle it without a browser:
// "a technology in a Nova-created research folder is written with position = { x = 0 y = 0 } no matter what
// coordinates are sent … If the editor lets you drag a tech in a custom tab, it snaps back silently."
//
// It does. `setupDrag` was attached to every `tech.isMod` node with no test of which folder the tech is in,
// while the server's `relayoutCustomFolderTechFiles` owns the coordinates of every folder Nova created and
// rewrites them on each save. Measured end to end:
//
//   base folder (infantry_folder)   send x=4 y=7    ->  written x=4 y=7
//   Nova-created folder             send x=4 y=7    ->  written x=0 y=0
//                                   re-send x=9 y=3 ->  still   x=0 y=0
//
// The node moved under the cursor, the save answered ok, and the tech was back where it started on the next
// load with nothing said about it.
//
// The relayout is not the bug — Nova laying out the tabs it created is deliberate, and it is what makes a
// custom tab render at all (vanilla's gridbox pixels are hand-placed; Nova's are computed). Positioning a
// tech by hand in a Nova-owned tab is a feature Nova does not have. Pretending to have it is the defect, so
// the fix is to stop offering the drag and say why — the endpoint now reports which folders Nova owns, and
// the page uses that rather than guessing.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-cfdrag-"));
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

const CLIENT = fs.readFileSync(path.join(__dirname, "public", "research.js"), "utf8");
const HTML = fs.readFileSync(path.join(__dirname, "public", "research.html"), "utf8");

let seq = 0;
function mkMod() {
  const dir = path.join(ROOT, "m" + (++seq));
  fs.mkdirSync(path.join(dir, "common", "technologies"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), 'name="m"\nsupported_version="1.19.*"\n', "utf8");
  return dir;
}
// Where did a tech's folder position actually land on disk?
function positionOf(dir, id) {
  const tdir = path.join(dir, "common", "technologies");
  let files = [];
  try { files = fs.readdirSync(tdir); } catch (_) { return null; }
  for (const f of files) {
    const t = fs.readFileSync(path.join(tdir, f), "utf8");
    const i = t.indexOf("\n\t" + id + " = {");
    if (i === -1) continue;
    let d = 0, seg = "";
    for (let k = t.indexOf("{", i); k < t.length; k++) {
      if (t[k] === "{") d++;
      else if (t[k] === "}") { d--; if (!d) { seg = t.slice(i, k + 1); break; } }
    }
    const m = /position\s*=\s*\{\s*x\s*=\s*(-?\w+)\s+y\s*=\s*(-?\w+)/.exec(seg);
    return m ? { file: f, x: m[1], y: m[2] } : { file: f, raw: seg.slice(0, 200) };
  }
  return null;
}

let PORT = 47700;
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

(async () => {
  let api = null;
  try {
    api = await serve(createApp());
    const dir = mkMod();
    const mk = await api.post("/api/research/create-custom-folder",
      { modPath: dir, folderKey: "nua_folder", name: "Nova Tab", ledger: "army" });
    rec("a Nova tab can be created", mk.b.ok === true, mk.b);

    // NB: the serializer reads tech.x / tech.y — NOT tech.folderPosition. An earlier version of this probe
    // sent folderPosition and got 0,0 for BOTH folders, which looked exactly like the bug and was my own
    // fixture. Check the field the writer actually reads before believing a measurement.
    const saveTech = (folder, id, x, y) => api.post("/api/technologies/save-batch", {
      modPath: dir, newTechIds: [id],
      technologies: [{
        id, isMod: true, folder, x, y, research_cost: 1, start_year: 1936,
        enableEquipments: [], categories: ["infantry_tech"], path: [],
      }],
    });

    console.log("\n[the measurement] a base tab honours the coordinates; a Nova tab lays them out itself");
    await saveTech("infantry_folder", "nua_base_tech", 4, 7);
    const base = positionOf(dir, "nua_base_tech");
    rec("a tech in a BASE folder keeps what was sent", base && base.x === "4" && base.y === "7", base);
    await saveTech("nua_folder", "nua_custom_tech", 4, 7);
    const custom = positionOf(dir, "nua_custom_tech");
    rec("…while a tech in a NOVA-created folder is positioned by the server instead",
      custom && custom.x === "0" && custom.y === "0", custom);
    await saveTech("nua_folder", "nua_custom_tech", 9, 3);
    const custom2 = positionOf(dir, "nua_custom_tech");
    rec("…and re-sending different coordinates changes nothing",
      custom2 && custom2.x === "0" && custom2.y === "0", custom2);

    console.log("\n[the page is told which tabs those are] rather than left to guess");
    const gl = await api.get(`/api/research/gui-layout?modPath=${encodeURIComponent(dir)}`);
    rec("gui-layout answers", gl.s === 200 && gl.b.ok === true, gl.b.error || Object.keys(gl.b || {}));
    rec("…reporting the Nova-created folder", (gl.b.novaOwnedFolders || []).includes("nua_folder"), gl.b.novaOwnedFolders);
    rec("…and NOT claiming a base-game folder",
      !(gl.b.novaOwnedFolders || []).includes("infantry_folder"), gl.b.novaOwnedFolders);
    rec("…while still listing the base folders as usual",
      (gl.b.allFolders || []).includes("infantry_folder"), (gl.b.allFolders || []).slice(0, 6));
    const fresh = mkMod();
    const gl2 = await api.get(`/api/research/gui-layout?modPath=${encodeURIComponent(fresh)}`);
    rec("a mod with no Nova tabs reports none", (gl2.b.novaOwnedFolders || []).length === 0, gl2.b.novaOwnedFolders);
    api.stop(); api = null;

    console.log("\n[the drag] is offered only where it will be honoured");
    rec("the page reads the list", /novaOwnedFolders = new Set\(gl\.novaOwnedFolders \|\| \[\]\)/.test(CLIENT), "not read");
    rec("…and clears it between mods", /novaOwnedFolders = new Set\(\);/.test(CLIENT), "not reset");
    rec("dragging is gated on the tech's folder",
      /if \(tech\.folder && novaOwnedFolders\.has\(tech\.folder\)\) \{/.test(CLIENT), "not gated");
    rec("…so setupDrag runs only in the else branch",
      /\} else \{[\s\S]{0,40}setupDrag\(node, tech\);/.test(CLIENT), "setupDrag still unconditional");
    rec("…and the node says why it cannot be moved",
      /Nova arranges this tab/.test(CLIENT), "no explanation");
    rec("…pointing at what the author CAN do instead",
      /prerequisites to move it in the chain/.test(CLIENT), "no remedy offered");
    rec("…without the move cursor promising otherwise",
      /\.tech-node--managed-layout \{[\s\S]{0,80}cursor: default;/.test(HTML), "no cursor rule");
    rec("a vanilla tech is still not draggable at all, as before",
      /if \(tech\.isMod\) \{/.test(CLIENT), "the isMod gate is gone");

    console.log("\n[still valid]");
    rec("research.js parses", (() => { try { new Function(CLIENT); return true; } catch (e) { return String(e.message); } })() === true,
      (() => { try { new Function(CLIENT); return "ok"; } catch (e) { return String(e.message); } })());
    rec("…and is versioned so the change ships", /research\.js\?v=[\w]+/.test(HTML), "no version");

    console.log(`\n=== custom folder tech drag: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (api) api.stop(); } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
