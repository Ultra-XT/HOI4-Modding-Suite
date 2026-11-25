// #focus-tree-id-leading-digit — A TREE NAMED "1936" HAD EVERY ONE OF ITS FOCUSES THROWN AWAY BY THE GAME.
//
// /api/mod/add-focus-tree writes `id = <fileName>`, and the tree's id also prefixes the ids of the focuses
// inside it. Its sanitiser allowed a leading digit and a leading '-' — the exact two things Clausewitz
// refuses:
//
//   Creation of dynamic token "1936_vrf38ctl_SWE_defense_act" failed,
//   keywords may not start with a digit or '-'.
//
// A user's error.log carried 168 of those, from trees named `1936` and `1936_vrf38` — created by this
// endpoint, whose output shape (`id = <name>` plus `country = { factor = 0 }`) those files match exactly.
// Nova had reported success while the game dropped the contents.
//
// Measured over every id the two corpora declare — 10,340 vanilla and 21,503 Millennium Dawn — NONE starts
// with a digit and none with an underscore, but 45 contain an INTERIOR hyphen. So hyphens are legal and only
// the first character is the problem, which is exactly what the lexer says.
//
// create-custom-folder has enforced this rule all along. This is the sibling that never adopted it.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-ftid-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const VNF = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/common/national_focus";
const MDNF = "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649/common/national_focus";

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
  const p = path.join(__dirname, `.ctl-ftid-${process.pid}-${label}.js`);
  fs.writeFileSync(p, wasCrlf ? out.replace(/\n/g, "\r\n") : out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

// every focus_tree / focus id a directory declares
function idsIn(dir) {
  const out = new Set();
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /\.txt$/i.test(f)); } catch (_) { return null; }
  for (const f of files) {
    let t = "";
    try { t = fs.readFileSync(path.join(dir, f), "utf8").replace(/#[^\n]*/g, ""); } catch (_) { continue; }
    for (const m of t.matchAll(/focus_tree\s*=\s*\{[\s\S]{0,400}?\bid\s*=\s*([A-Za-z0-9_-]+)/g)) out.add(m[1]);
    for (const m of t.matchAll(/(^|\n)\s*focus\s*=\s*\{[\s\S]{0,300}?\bid\s*=\s*([A-Za-z0-9_-]+)/g)) out.add(m[2]);
  }
  return out;
}

function mkMod(name) {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(path.join(dir, "common", "national_focus"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), `name="${name}"\nsupported_version="1.19.*"\n`, "utf8");
  return dir;
}
const treeFile = (mod, name) => path.join(mod, "common", "national_focus", `${name}.txt`);

// A tree to copy FROM. It has to be multi-line: renameFocusTreeIdentity anchors its id match to the start
// of a line, so a one-line `focus = { id = x … }` is renamed by nothing and every assertion below passes
// for the wrong reason. This is the shape both corpora actually ship.
function writeGeneric(mod) {
  fs.writeFileSync(treeFile(mod, "generic"), [
    "focus_tree = {",
    "\tid = generic",
    "\tdefault = yes",
    "\tfocus = {",
    "\t\tid = generic_alpha",
    "\t\tx = 0", "\t\ty = 0", "\t\tcost = 10",
    "\t}",
    "\tfocus = {",
    "\t\tid = generic_beta",
    "\t\tx = 2", "\t\ty = 0", "\t\tcost = 10",
    "\t\tprerequisite = { focus = generic_alpha }",
    "\t}",
    "}", ""].join("\n"), "utf8");
}

let PORT = 44560;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      post: (u, b) => fetch(`http://127.0.0.1:${PORT}${u}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) })
        .then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}
const add = (api, mod, fileName) => api.post("/api/mod/add-focus-tree", { modPath: mod, fileName });

(async () => {
  let api = null;
  try {
    console.log("\n[ground truth] no shipping id starts with a digit, but interior hyphens are fine");
    const v = idsIn(VNF), md = idsIn(MDNF);
    if (!v) console.log("  (skipped — vanilla not installed)");
    else {
      rec("vanilla declares thousands of ids", v.size > 5000, v.size);
      rec("…none starting with a digit", [...v].every((x) => !/^[0-9]/.test(x)),
        [...v].filter((x) => /^[0-9]/.test(x)).slice(0, 5));
      rec("…none starting with a dash or underscore",
        [...v].every((x) => !/^[-_]/.test(x)), [...v].filter((x) => /^[-_]/.test(x)).slice(0, 5));
      rec("…but interior hyphens do occur, so hyphens are not the problem",
        [...v].some((x) => x.includes("-")), "no hyphenated id found");
    }
    if (md) rec("Millennium Dawn agrees — none start with a digit",
      [...md].every((x) => !/^[0-9]/.test(x)), [...md].filter((x) => /^[0-9]/.test(x)).slice(0, 5));

    api = await serve(createApp());

    console.log("\n[the bug] a name the game's lexer would refuse is refused here first");
    const mod = mkMod("m");
    for (const bad of ["1936", "1936_vrf38", "2nd_tree", "-dash_start"]) {
      const r = await add(api, mod, bad);
      const cleaned = bad.replace(/[^a-zA-Z0-9_-]/g, "");
      rec(`"${bad}" is refused`, r.s === 400 && /starts with a number or a dash/i.test(String(r.b.error)), r.b);
      rec(`…and nothing was written for it`, !fs.existsSync(treeFile(mod, cleaned)), "a file was created");
    }

    console.log("\n[no over-reach] legal names still work");
    for (const good of ["focus_1936", "my_tree", "_leading_underscore", "tree-with-hyphen", "SOV_focus2"]) {
      const r = await add(api, mod, good);
      rec(`"${good}" is created`, r.s === 200 && r.b.ok, r.b);
      const t = fs.existsSync(treeFile(mod, good)) ? fs.readFileSync(treeFile(mod, good), "utf8") : "";
      rec(`…with id = ${good}`, new RegExp(`\\bid\\s*=\\s*${good.replace(/[-]/g, "\\-")}\\b`).test(t), t.slice(0, 120));
    }

    console.log("\n[the reachable one] '+ New Tree' posts to copy-generic-focus-tree, not add-focus-tree");
    {
      // Anchored to the declaration and to the whole file, not to a byte window around it — a window just
      // measures how long the comments above the fetch happen to be.
      const APP = fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8");
      const flowStart = APP.indexOf("async function startNewFocusTreeFlow(");
      const flowEnd = APP.indexOf("\n}", flowStart);
      const flow = flowStart === -1 ? "" : APP.slice(flowStart, flowEnd + 2);
      rec("the '+ New Tree' flow exists", !!flow, "startNewFocusTreeFlow not found");
      rec("…and it posts to copy-generic-focus-tree, not add-focus-tree",
        flow.includes("/api/mod/copy-generic-focus-tree"), flow.slice(0, 200));
      rec("…and the button is bound to it",
        /newFocusTreeBtn[\s\S]{0,200}?startNewFocusTreeFlow\(\)/.test(APP), "button not wired");
      rec("…and it surfaces the id note the server returns",
        /if \(data\.idNote\)/.test(flow), "idNote never read by the client");

      const g = mkMod("gen");
      writeGeneric(g);

      const r = await api.post("/api/mod/copy-generic-focus-tree", { modPath: g, fileName: "1936" });
      rec("a tree named 1936 is still created", r.s === 200 && r.b.ok, r.b);
      const txt = fs.existsSync(treeFile(g, "1936")) ? fs.readFileSync(treeFile(g, "1936"), "utf8") : "";
      rec("…the file keeps the name the user chose", !!txt, "no file written");

      // The thing the game actually rejects: ANY id token whose first char is a digit or a dash.
      const ids = [...txt.replace(/#[^\n]*/g, "").matchAll(/\bid\s*=\s*([^\s{}]+)/g)].map((m) => m[1]);
      rec("…several ids were written", ids.length >= 3, ids);
      rec("…and NOT ONE of them starts with a digit or a dash",
        ids.every((x) => /^[A-Za-z_]/.test(x)), ids.filter((x) => !/^[A-Za-z_]/.test(x)));
      rec("…the tree id itself was legalised", /\bid\s*=\s*focus_1936\b/.test(txt), ids[0]);
      rec("…prerequisites still point at ids that exist",
        [...txt.matchAll(/prerequisite\s*=\s*\{\s*focus\s*=\s*([^\s}]+)/g)].every((m) => ids.includes(m[1])),
        txt.slice(0, 400));
      rec("…and the response says so instead of repairing silently",
        typeof r.b.idNote === "string" && /number or a dash/i.test(r.b.idNote), r.b.idNote);

      // Loc keys ARE focus ids, so a dropped focus id also orphans its name.
      const locDir = path.join(g, "localisation", "english");
      const locs = fs.existsSync(locDir) ? fs.readdirSync(locDir) : [];
      const locTxt = locs.map((f) => fs.readFileSync(path.join(locDir, f), "utf8")).join("\n");
      rec("…localisation keys follow the legalised ids",
        !/(^|\n)\s*1936_/.test(locTxt), locTxt.slice(0, 300));

      console.log("\n[no over-reach] an ordinary name is untouched by any of this");
      const r2 = await api.post("/api/mod/copy-generic-focus-tree", { modPath: g, fileName: "nikos_focus" });
      const t2 = fs.existsSync(treeFile(g, "nikos_focus")) ? fs.readFileSync(treeFile(g, "nikos_focus"), "utf8") : "";
      rec("a letter-leading name is created", r2.s === 200 && r2.b.ok, r2.b);
      rec("…with no `focus_` bolted onto it", /\bid\s*=\s*nikos\b/.test(t2) || /\bid\s*=\s*nikos_focus\b/.test(t2),
        t2.slice(0, 200));
      rec("…and no note, because nothing was repaired", !r2.b.idNote, r2.b.idNote);
      rec("…and its focus ids are distinct from the first tree's",
        ![...t2.matchAll(/\bid\s*=\s*([^\s{}]+)/g)].map((m) => m[1]).some((x) => ids.includes(x)), "id collision");
    }

    console.log("\n[unchanged] the duplicate-id guard still fires");
    const dup = await add(api, mod, "my_tree");
    rec("a second tree under a taken id is still refused",
      dup.s === 400 && /already exists/i.test(String(dup.b.error)), dup.b);
    api.stop(); api = null;

    console.log("\n[back-out 1] let add-focus-tree accept a digit-leading name again");
    {
      const built = controlApp("nodigitcheck", [[
        "      if (!/^[A-Za-z_]/.test(fileName)) {",
        "      if (false) {"]]);
      if (built.error) rec("the control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        const cmod = mkMod("ctl");
        try {
          const c = await add(capi, cmod, "1936");
          const t = fs.existsSync(treeFile(cmod, "1936")) ? fs.readFileSync(treeFile(cmod, "1936"), "utf8") : "";
          rec("…and a tree the game will reject is written, reported as success",
            c.s === 200 && c.b.ok && /\bid\s*=\s*1936\b/.test(t), { resp: c.b, text: t.slice(0, 120) });
        } finally { capi.stop(); }
      }
    }

    console.log("\n[back-out 2] derive the focus-id prefix from the raw name again");
    {
      // The tree id was ALREADY legalised before this fix — only the prefix given to the focuses inside was
      // not. So the control must undo exactly that half, and the tree id staying legal is the proof that
      // reverting it reproduces the real bug rather than a bigger invented one.
      const built = controlApp("rawprefix", [
        ["      ].map(legalId))];", "      ])];"],
        ["      let prefix = legalId(strippedPrefix);", "      let prefix = strippedPrefix;"],
      ]);
      if (built.error) rec("the control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        const cmod = mkMod("ctl2");
        writeGeneric(cmod);
        try {
          const c = await capi.post("/api/mod/copy-generic-focus-tree", { modPath: cmod, fileName: "1936" });
          const t = fs.existsSync(treeFile(cmod, "1936")) ? fs.readFileSync(treeFile(cmod, "1936"), "utf8") : "";
          const cids = [...t.replace(/#[^\n]*/g, "").matchAll(/\bid\s*=\s*([^\s{}]+)/g)].map((m) => m[1]);
          rec("…the tree still loads (its id was already legal)",
            c.s === 200 && cids.some((x) => x === "focus_1936"), cids);
          rec("…but the focuses inside get ids the game throws away",
            cids.some((x) => /^[0-9]/.test(x)), cids);
        } finally { capi.stop(); }
      }
    }

    console.log(`\n=== focus tree id leading digit: ${checks} checks, ${fails.length} failed ===`);
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
