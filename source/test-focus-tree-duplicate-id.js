// #new-focus-tree-can-duplicate-an-id — "NEW FOCUS TREE" COULD CREATE A SECOND TREE UNDER AN ID ALREADY TAKEN.
//
// /api/mod/add-focus-tree writes `id = <fileName>` and refused only when a FILE of that name already existed.
// A focus tree's id must be unique across everything the game loads — HOI4 keeps one of two trees sharing an
// id and drops the other — and in real content the id is essentially never the filename:
//
//   vanilla: 81 files, 68 focus trees, ZERO with id === filename, ZERO duplicate ids
//   Millennium Dawn: 103 files, 93 trees, 2 with id === filename, 91 without
//
// ⚠️ RE-DERIVED 2026-11-20, after HOI4 1.20 added common/national_focus/romania_ttbe.txt (82 files). The counts are no longer typed:
// the file's own reader is checked against a brace-depth count of the top-level `focus_tree = {` blocks on the install. That count
// also found the reader counting Poland's `load_focus_tree = {` effect (poland.txt, changed 2026-10-27) as a tree, because its
// pattern had no word boundary; it has one now.
//
// So the filename check protected nothing against the collision that matters. A modder whose mine.txt declares
// `id = my_own_tree` — the shape the owner dialog and hand-editing both produce — could create my_own_tree.txt
// and get a second tree under that id, in the same mod, with an ok:true. Half their work would silently not
// load, and nothing in Nova would say so.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-ftdup-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const VFOCUS = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/common/national_focus";
const MDFOCUS = "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649/common/national_focus";
const HAVE_VANILLA = fs.existsSync(VFOCUS);

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

// focus_tree ids declared in a directory, and which file each came from.
function treeIdsIn(dir) {
  const out = new Map();
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /\.txt$/i.test(f)); } catch (_) { return out; }
  for (const f of files) {
    let t = "";
    try { t = fs.readFileSync(path.join(dir, f), "utf8").replace(/#[^\n]*/g, ""); } catch (_) { continue; }
    for (const m of t.matchAll(/(?<![A-Za-z0-9_])focus_tree\s*=\s*\{[\s\S]{0,400}?\bid\s*=\s*([A-Za-z0-9_]+)/g)) {
      if (!out.has(m[1])) out.set(m[1], []);
      out.get(m[1]).push(f);
    }
  }
  return out;
}

// The same directory counted a second, independent way: top-level `focus_tree = {` blocks, by brace depth (comments dropped).
function topLevelTreeCount(dir) {
  let n = 0;
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /\.txt$/i.test(f)); } catch (_) { return 0; }
  for (const f of files) {
    let t = "";
    try { t = fs.readFileSync(path.join(dir, f), "utf8").replace(/#[^\n]*/g, ""); } catch (_) { continue; }
    let depth = 0;
    for (const m of t.matchAll(/(?<![A-Za-z0-9_])focus_tree\s*=\s*\{|[{}]/g)) {
      if (m[0] === "{") depth++;
      else if (m[0] === "}") depth--;
      else { if (depth === 0) n++; depth++; }
    }
  }
  return n;
}

function mkMod(name) {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(path.join(dir, "common", "national_focus"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), `name="${name}"\nsupported_version="1.19.*"\n`, "utf8");
  // A tree whose FILE NAME and ID differ — the shape 68 of vanilla's 68 trees have.
  fs.writeFileSync(path.join(dir, "common", "national_focus", "mine.txt"),
    "focus_tree = {\n\tid = my_own_tree\n\tcountry = { factor = 0 }\n}\n", "utf8");
  return dir;
}

const ctlFiles = [];
function controlApp(label, pairs) {
  const src = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  let out = src;
  for (const [from, to] of pairs) {
    if (!out.includes(from)) return { error: "anchor missing: " + from.slice(0, 70) };
    if (out.split(from).length !== 2) return { error: "anchor not unique: " + from.slice(0, 70) };
    out = out.replace(from, to);
  }
  const p = path.join(__dirname, `.ctl-ftd-${process.pid}-${label}.js`);
  fs.writeFileSync(p, out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

let PORT = 43971;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      post: (u, b) => fetch(`http://127.0.0.1:${PORT}${u}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) })
        .then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

(async () => {
  const api = await serve(createApp());
  const add = (a, dir, fileName) => a.post("/api/mod/add-focus-tree", { modPath: dir, fileName });
  try {
    console.log("\n[ground truth] a focus tree's id is not its filename, and no two trees share one");
    if (!HAVE_VANILLA) console.log("  (skipped — vanilla not installed)");
    else {
      const v = treeIdsIn(VFOCUS);
      const files = fs.readdirSync(VFOCUS).filter((f) => /\.txt$/i.test(f)).length;
      let same = 0;
      for (const [id, fs2] of v) if (fs2.some((f) => f.replace(/\.txt$/i, "") === id)) same++;
      const counted = topLevelTreeCount(VFOCUS);
      console.log(`     vanilla: ${files} focus files, ${counted} top-level focus trees, ${v.size} ids read`);
      rec("vanilla's focus files declare trees, and every one is read once (counted two ways)", files > 0 && counted > 0 && v.size === counted, { files, counted, ids: v.size });
      rec("…NOT ONE of which names its file after its id", same === 0, same);
      rec("…and no id is declared twice", [...v.values()].every((a) => a.length === 1),
        [...v.entries()].filter(([, a]) => a.length > 1).slice(0, 3));
      if (fs.existsSync(MDFOCUS)) {
        const m = treeIdsIn(MDFOCUS);
        let mSame = 0;
        for (const [id, fs2] of m) if (fs2.some((f) => f.replace(/\.txt$/i, "") === id)) mSame++;
        const decls = [...m.values()].reduce((a, b) => a + b.length, 0);
        // ⚠️ MOVED 2026-09-11. The owner reinstalled Millennium Dawn, and the fresh copy neither ships the id
        // collision pinned here (93 trees under 92 ids) nor the 2 trees named after their file. Neither number is
        // what the guard below relies on: the point is that in a real mod a tree's id is essentially never its
        // filename, so a filename check cannot catch an id collision. That is asserted; the counts are printed.
        const shared = [...m.entries()].filter(([, a]) => a.length > 1).map(([id]) => id);
        console.log(`     Millennium Dawn: ${decls} trees under ${m.size} ids (${shared.length} shared${shared.length ? ": " + shared.slice(0, 3).join(", ") : ""}); ${mSame} named after their file`);
        rec("Millennium Dawn's focus trees were read", decls > 0, { decls, ids: m.size });
        rec("…and most of them are NOT named after their file", mSame * 2 < decls, { mSame, decls });
      }
    }

    console.log("\n[the bug] a new tree may not take an id another loaded tree already declares");
    const mod = mkMod("dupmod");
    let r = await add(api, mod, "my_own_tree");
    rec("the request is refused", r.s === 400 && !!r.b.error, r.b);
    rec("…naming the file that already has the id", /mine\.txt/.test(String(r.b.error)), r.b.error);
    rec("…and saying what HOI4 does with two trees under one id", /dropped/i.test(String(r.b.error)), r.b.error);
    rec("…and nothing was written", !fs.existsSync(path.join(mod, "common", "national_focus", "my_own_tree.txt")),
      fs.readdirSync(path.join(mod, "common", "national_focus")));
    if (HAVE_VANILLA) {
      const vId = [...treeIdsIn(VFOCUS).keys()][0];
      r = await add(api, mod, vId);
      rec(`…and an id VANILLA declares is refused too (${vId})`, r.s === 400 && !!r.b.error, r.b);
      rec("…without a file appearing", !fs.existsSync(path.join(mod, "common", "national_focus", vId + ".txt")), vId);
    }

    console.log("\n[control] a free name still creates a tree");
    // Without this the guard could be "refuse everything", which is not a fix.
    r = await add(api, mod, "nvx_brand_new_tree");
    rec("the tree is created", r.s === 200 && r.b.ok, r.b);
    const made = path.join(mod, "common", "national_focus", "nvx_brand_new_tree.txt");
    rec("…the file is on disk", fs.existsSync(made), fs.readdirSync(path.join(mod, "common", "national_focus")));
    const text = fs.existsSync(made) ? fs.readFileSync(made, "utf8") : "";
    rec("…with its id", /\bid\s*=\s*nvx_brand_new_tree\b/.test(text), text);
    rec("…unassigned, so it does not tie with a country's real tree", /factor\s*=\s*0/.test(text), text);
    rec("…and brace-balanced", (text.match(/\{/g) || []).length === (text.match(/\}/g) || []).length, text);
    rec("the mod now declares no id twice",
      [...treeIdsIn(path.join(mod, "common", "national_focus")).values()].every((a) => a.length === 1),
      [...treeIdsIn(path.join(mod, "common", "national_focus")).entries()]);

    console.log("\n[control] the existing filename check still works");
    r = await add(api, mod, "mine");
    rec("a duplicate FILE name is still refused", r.s === 400 && /already exists/.test(String(r.b.error)), r.b);
    api.stop();

    console.log("\n[back-out] stop checking the id");
    const built = controlApp("noidcheck", [[
      "      if (takenTreeIds.has(fileName)) {", "      if (false && takenTreeIds.has(fileName)) {"]]);
    if (built.error) rec("the control patched cleanly", false, built.error);
    else {
      const capi = await serve(built.createApp());
      const cmod = mkMod("ctlmod");
      try {
        const c = await add(capi, cmod, "my_own_tree");
        const dir = path.join(cmod, "common", "national_focus");
        rec("…and the colliding tree is created with ok:true", c.s === 200 && c.b.ok, c.b);
        rec("…leaving the mod with two trees under one id",
          (treeIdsIn(dir).get("my_own_tree") || []).length === 2, [...treeIdsIn(dir).entries()]);
      } finally { capi.stop(); }
    }

    console.log(`\n=== focus tree duplicate id: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { api.stop(); } catch (_) {}
    for (const p of ctlFiles) { try { fs.rmSync(p, { force: true }); } catch (_) {} }
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
