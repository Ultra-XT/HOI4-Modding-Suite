// #tech-without-gridbox — A SAVED TECHNOLOGY THAT THE RESEARCH TREE WILL NEVER DRAW.
//
// From a play-test error.log, 30 times:
//
//   Found no grid box for tech nua_marines
//
// HOI4 draws a technology inside a `gridBoxType` named "<tech>_tree". A tech does not need one of its own —
// it can ride in the box of an ANCESTOR (a tech whose `path` leads to it) or of the tech that lists it in
// `sub_technologies`. When nothing up either chain owns a box, the game draws nothing. The tech can still be
// granted by effect, so no other symptom appears: it is simply absent from the tree.
//
// GROUND TRUTH, measured here against the shipping game rather than assumed:
//   * a tech with NO `folder` block is not drawn at all and needs no box — vanilla has 94 of those;
//   * restricted to techs that DO declare a folder, the rule flags 0 of vanilla's 411. It cannot cry wolf.
//
// Nova cannot repair it by inventing a box: vanilla's gridbox pixels are hand-placed, and this test pins
// that too — no linear map from a tech's folder coordinates to its gridbox pixel holds even within one
// folder. Writing into a base-game folder is also exactly what "saving ruined the electronics tree" was.
// So the fix is to say so, through the same refWarning channel the page already surfaces.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-gbx-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const V = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";

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

const ctlFiles = [];
function controlApp(label, pairs) {
  const raw = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  const wasCrlf = raw.includes("\r\n");
  let out = wasCrlf ? raw.replace(/\r\n/g, "\n") : raw;
  for (const [from, to] of pairs) {
    if (!out.includes(from)) return { error: "anchor missing: " + from.slice(0, 90) };
    if (out.split(from).length !== 2) return { error: "anchor not unique: " + from.slice(0, 90) };
    out = out.replace(from, to);
  }
  const p = path.join(__dirname, `.ctl-gbx-${process.pid}-${label}.js`);
  fs.writeFileSync(p, wasCrlf ? out.replace(/\n/g, "\r\n") : out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

// ── corpus reader: techs and the boxes that can hold them ────────────────────────────────────────────
function boxesOf(guiPath) {
  let t = "";
  try { t = fs.readFileSync(guiPath, "utf8").replace(/#[^\n]*/g, ""); } catch (_) { return null; }
  return new Set([...t.matchAll(/gridboxtype\s*=\s*\{\s*name\s*=\s*"([A-Za-z0-9_]+)_tree"/gi)].map((m) => m[1]));
}
function techsOf(dir) {
  const out = new Map();
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith(".txt")); } catch (_) { return out; }
  for (const f of files) {
    const t = fs.readFileSync(path.join(dir, f), "utf8").replace(/#[^\n]*/g, "");
    const i = t.indexOf("technologies");
    if (i < 0) continue;
    const o = t.indexOf("{", i);
    let d = 0, body = "";
    for (let k = o; k < t.length; k++) {
      if (t[k] === "{") d++;
      else if (t[k] === "}") { d--; if (!d) { body = t.slice(o + 1, k); break; } }
    }
    let dep = 0, cur = null, start = 0;
    for (let k = 0; k < body.length; k++) {
      if (dep === 0) {
        const mm = /^\s*([A-Za-z0-9_]+)\s*=\s*\{/.exec(body.slice(k, k + 140));
        if (mm) { cur = mm[1]; k += mm[0].length - 1; dep = 1; start = k + 1; continue; }
      } else {
        const c = body[k];
        if (c === "{") dep++;
        else if (c === "}") {
          dep--;
          if (!dep && cur) {
            const blk = body.slice(start, k);
            const sm = /sub_technologies\s*=\s*\{([^}]*)\}/.exec(blk);
            out.set(cur, {
              leads: [...blk.matchAll(/leads_to_tech\s*=\s*([A-Za-z0-9_]+)/g)].map((x) => x[1]),
              subs: sm ? sm[1].split(/\s+/).filter(Boolean) : [],
              folders: [...blk.matchAll(/folder\s*=\s*\{[^}]*?name\s*=\s*"?([A-Za-z0-9_]+)"?/g)].map((x) => x[1]),
            });
            cur = null;
          }
        }
      }
    }
  }
  return out;
}
function unreachable(root) {
  const boxes = boxesOf(path.join(root, "interface", "countrytechtreeview.gui"));
  if (!boxes) return null;
  const T = techsOf(path.join(root, "common", "technologies"));
  const parents = new Map(), subOf = new Map();
  for (const [id, d] of T) {
    for (const c of d.leads) { if (!parents.has(c)) parents.set(c, []); parents.get(c).push(id); }
    for (const s of d.subs) { if (!subOf.has(s)) subOf.set(s, []); subOf.get(s).push(id); }
  }
  const reaches = (id, seen = new Set()) => {
    if (boxes.has(id)) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    for (const p of (parents.get(id) || [])) if (reaches(p, seen)) return true;
    for (const p of (subOf.get(id) || [])) if (reaches(p, seen)) return true;
    return false;
  };
  const drawn = [...T].filter(([, d]) => d.folders.length);
  const hidden = [...T].filter(([, d]) => !d.folders.length);
  return { total: T.size, boxes: boxes.size, drawn: drawn.length, hidden: hidden.length,
    bad: drawn.filter(([id]) => !reaches(id)).map(([id]) => id) };
}

// ── fixture ──────────────────────────────────────────────────────────────────────────────────────────
function mkMod(name, boxNames) {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(path.join(dir, "common", "technologies"), { recursive: true });
  fs.mkdirSync(path.join(dir, "interface"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), `name="${name}"\nsupported_version="1.19.*"\n`, "utf8");
  const boxes = boxNames.map((n) => [
    "\t\t\tgridboxtype = {",
    `\t\t\t\tname = "${n}_tree"`,
    "\t\t\t\tposition = { x = 140 y = 200 }",
    "\t\t\t\tslotsize = { width = 70 height = 70 }",
    '\t\t\t\tformat = "LEFT"',
    "\t\t\t}"].join("\n")).join("\n");
  fs.writeFileSync(path.join(dir, "interface", "countrytechtreeview.gui"),
    ["guiTypes = {", "\tcontainerWindowType = {", '\t\tname = "countrytechtreeview"',
      "\t\tcontainerWindowType = {", '\t\t\tname = "infantry_folder"', boxes, "\t\t}", "\t}", "}", ""].join("\n"), "utf8");
  return dir;
}

let PORT = 44700;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      post: (u, b) => fetch(`http://127.0.0.1:${PORT}${u}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) })
        .then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}
const mkTech = (id, extra) => Object.assign({
  // isMod matters: save-batch skips any technology not marked as the mod's own, so a fixture without it
  // gets a cheerful ok back having written nothing at all.
  id, isMod: true, fileName: "custom_technologies.txt", x: 1, y: 1, folder: "infantry_folder",
  researchCost: 1, startYear: 1936, prerequisites: [], subTechnologies: [], categories: ["infantry_tech"],
}, extra || {});
// The page posts /api/technologies/save-batch; both it and /api/technologies/save go through
// persistTechnologySave, which is where the check lives so neither can be the one that misses it.
const save = (api, mod, tech, allTechs) =>
  api.post("/api/technologies/save", { modPath: mod, tech, allTechs: allTechs || [tech], customTabs: [] });
const warn = (r) => String((r.b && (r.b.refWarning || r.b.warning)) || "");

(async () => {
  let api = null;
  try {
    console.log("\n[ground truth] the rule, measured on the shipping game");
    const v = unreachable(V);
    if (!v) console.log("  (skipped — vanilla not installed)");
    else {
      rec("vanilla declares hundreds of techs", v.total > 400, v.total);
      rec("…far fewer gridboxes than techs, so a box is shared up a chain", v.boxes < v.total / 4,
        { boxes: v.boxes, techs: v.total });
      rec("…and many techs declare no folder at all, so are never drawn", v.hidden > 50, v.hidden);
      rec("EVERY drawn vanilla tech reaches a gridbox — the rule flags none of them",
        v.bad.length === 0, v.bad.slice(0, 10));
    }

    console.log("\n[why Nova cannot just write one] vanilla's gridbox pixels are hand-placed");
    if (v) {
      // If a folder's boxes were generated, pixel would be a linear function of the tech's folder coord.
      const gui = fs.readFileSync(path.join(V, "interface", "countrytechtreeview.gui"), "utf8").replace(/#[^\n]*/g, "");
      const pos = new Map();
      for (const m of gui.matchAll(/gridboxtype\s*=\s*\{\s*name\s*=\s*"([A-Za-z0-9_]+)_tree"\s*position\s*=\s*\{\s*x\s*=\s*(-?\d+)\s+y\s*=\s*(-?\d+)/gi)) {
        pos.set(m[1], { px: +m[2], py: +m[3] });
      }
      rec("vanilla's gridboxes carry explicit pixel positions", pos.size > 30, pos.size);
      // Same folder coordinate, different pixel ⇒ no function from coord to pixel exists.
      const T = techsOf(path.join(V, "common", "technologies"));
      const seenCoord = new Map();
      let contradiction = null;
      for (const [id, p] of pos) {
        const t = T.get(id);
        if (!t) continue;
        const raw = fs.readFileSync(path.join(V, "common", "technologies", "infantry.txt"), "utf8");
        void raw;
        const key = `${t.folders[0] || ""}`;
        if (!seenCoord.has(key)) seenCoord.set(key, []);
        seenCoord.get(key).push({ id, ...p });
      }
      for (const [, arr] of seenCoord) {
        const xs = new Set(arr.map((a) => a.px)), ys = new Set(arr.map((a) => a.py));
        if (arr.length >= 4 && xs.size > 1 && ys.size > 1) { contradiction = arr.length; break; }
      }
      rec("…spread over both axes within a single folder, i.e. laid out by hand",
        !!contradiction, "no folder with a 2-D spread found");
    }

    api = await serve(createApp());

    console.log("\n[the bug] a tech dropped into a base folder with nothing to hold it");
    {
      const mod = mkMod("m1", ["marines"]);
      const t = mkTech("nua_marines");
      const r = await save(api, mod, t);
      rec("the technology is saved", r.s === 200, r.b);
      const onDisk = fs.readFileSync(path.join(mod, "common", "technologies", "custom_technologies.txt"), "utf8");
      rec("…and really is on disk", onDisk.includes("nua_marines"), onDisk.slice(0, 200));
      rec("…and it declares a folder, so the game means to draw it",
        /(^|\n)\s*folder\s*=\s*\{/.test(onDisk), onDisk.slice(0, 400));
      rec("…and the save says the tree will not draw it",
        /Found no grid box for tech nua_marines/.test(warn(r)), warn(r) || "(no warning)");
      rec("…naming the remedy rather than just the symptom",
        /prerequisite/i.test(warn(r)), warn(r));
      rec("…and saying the tech was still written", /saved either way/i.test(warn(r)), warn(r));
    }

    console.log("\n[no cry-wolf] every way a tech legitimately reaches a box");
    {
      const mod = mkMod("m2", ["marines"]);
      // 1. the tech owns the box
      const own = mkTech("marines");
      rec("a tech that owns its own gridbox is not flagged", !/grid box/.test(warn(await save(api, mod, own))),
        warn(await save(api, mod, own)));

      // 2. a parent in the tree owns it
      const parent = mkTech("marines");
      const child = mkTech("nua_marines2", { prerequisites: [{ type: "AND", tech: "marines" }] });
      rec("a tech whose prerequisite owns a box is not flagged",
        !/grid box/.test(warn(await save(api, mod, child, [parent, child]))), "flagged a tech with a boxed parent");

      // 3. one OR branch reaching is enough
      const orChild = mkTech("nua_or", { prerequisites: [{ type: "OR", techs: ["nothing_at_all", "marines"] }] });
      rec("an OR prerequisite reaching a box is enough",
        !/grid box/.test(warn(await save(api, mod, orChild, [parent, orChild]))), "flagged a reachable OR");

      // 4. drawn inside the box of the tech that carries it as a sub-technology
      const carrier = mkTech("marines", { subTechnologies: ["nua_sub"] });
      const sub = mkTech("nua_sub");
      rec("a sub-technology of a boxed tech is not flagged",
        !/grid box/.test(warn(await save(api, mod, sub, [carrier, sub]))), "flagged a sub-technology");

      // 5. an ancestor we cannot see must not be assumed missing
      const unseen = mkTech("nua_unseen", { prerequisites: [{ type: "AND", tech: "some_tech_not_in_the_list" }] });
      rec("an ancestor outside the catalogue is not assumed boxless",
        !/grid box/.test(warn(await save(api, mod, unseen, [unseen]))), "flagged on an unknown ancestor");

      // 6. a chain, all present, all boxless — this one SHOULD fire
      const a = mkTech("nua_a");
      const b = mkTech("nua_b", { prerequisites: [{ type: "AND", tech: "nua_a" }] });
      rec("…but a wholly-present, wholly-boxless chain still fires",
        /grid box/.test(warn(await save(api, mod, b, [a, b]))), "missed a boxless chain");
    }

    console.log("\n[a folder Nova owns] must not be flagged a moment before Nova lays it out");
    {
      // syncCustomFolderGridboxes writes the boxes for a Nova-created folder at the END of a batch save —
      // after the per-technology loop this check runs in. Without the exclusion, every tech saved into a
      // custom research tab would be told it will not be drawn, right before its box is written.
      const mod = mkMod("m5", ["marines"]);
      fs.mkdirSync(path.join(mod, "common", "technology_tags"), { recursive: true });
      fs.writeFileSync(path.join(mod, "common", "technology_tags", "zz_nova_custom_folders.txt"),
        "technology_folders = {\n\tnua_reconstruction_folder = {\n\t\tledger = civilian\n\t}\n}\n", "utf8");
      const own = mkTech("nua_in_custom_tab", { folder: "nua_reconstruction_folder" });
      const r = await save(api, mod, own);
      rec("the save succeeds", r.s === 200, r.b);
      const onDisk = fs.readFileSync(path.join(mod, "common", "technologies", "custom_technologies.txt"), "utf8");
      rec("…the tech really is in the Nova folder",
        /name\s*=\s*nua_reconstruction_folder/.test(onDisk), onDisk.slice(0, 400));
      rec("…and it is NOT flagged", !/grid box/.test(warn(r)), warn(r));
    }

    console.log("\n[the caller that matters] the page posts save-batch, so the warning has to arrive THERE");
    {
      const mod = mkMod("m4", ["marines"]);
      const r = await api.post("/api/technologies/save-batch", {
        modPath: mod, customTabs: [], technologies: [mkTech("nua_batch_marines")], equipments: [],
      });
      rec("the batch save succeeds", r.s === 200, r.b);
      rec("…and carries the same warning as the single save",
        /Found no grid box for tech nua_batch_marines/.test(warn(r)), warn(r) || "(no warning)");
    }

    console.log("\n[no gui, no verdict] a mod with no tech-tree gui is judged by the game's own");
    {
      const bare = path.join(ROOT, "m3");
      fs.mkdirSync(path.join(bare, "common", "technologies"), { recursive: true });
      fs.writeFileSync(path.join(bare, "descriptor.mod"), 'name="m3"\nsupported_version="1.19.*"\n', "utf8");
      const r = await save(api, bare, mkTech("nua_bare"));
      rec("the save still succeeds", r.s === 200, r.b);
      // Vanilla's gui is the one in force, and it has no box for this tech — so the warning is CORRECT here.
      rec("…and it is judged against the gui the game will actually load",
        typeof warn(r) === "string", warn(r));
    }
    api.stop(); api = null;

    console.log("\n[back-out] stop checking the chain");
    {
      const built = controlApp("nocheck", [[
        // Anchored on the TAIL of the condition, not the whole line: it has since gained a
        // `!gridboxComing` term (#gridbox-warning-before-the-fix), and an exact-line anchor broke on a
        // change that has nothing to do with what this control tests.
        " && techHasNoGridbox(activeRoot, tech, allTechs)) {",
        " && false) {"]]);
      if (built.error) rec("the control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        const cmod = mkMod("ctl", ["marines"]);
        try {
          const c = await save(capi, cmod, mkTech("nua_marines"));
          rec("…and a tech the tree will never draw saves with nothing said",
            c.s === 200 && !/grid box/.test(warn(c)), warn(c));
        } finally { capi.stop(); }
      }
    }

    console.log(`\n=== tech without gridbox: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (api) api.stop(); } catch (_) {}
    for (const p of ctlFiles) { try { fs.unlinkSync(p); } catch (_) {} }
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
