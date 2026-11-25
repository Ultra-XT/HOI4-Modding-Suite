// #editor-active-root-frozen-at-page-init — THE CLIENT'S "ACTIVE MOD" STOPPED BEING TRUE AFTER ONE LOAD.
//
// public/app.js sets `editorActiveRootPath` in exactly one place: fetchRoot(), which runs exactly once, at
// page init. The SERVER meanwhile re-points its own active root on every POST /api/load (setActiveRoot from
// the loaded file's path). So from the first tree you open in a different mod, the two disagree — and the
// client holds the stale one.
//
// That is not cosmetic. About fourteen call sites read this variable and send it as `modPath`, and the
// server PREFERS an explicit modPath over its own root. A stale value is therefore worse than no value at
// all: it overrides the correct answer, and writes land in whichever mod happened to be active when the
// page opened.
//
// Measured in the running UI before the fix: after loading modA's tree the server reported modA while the
// client still held modB, and the client's value never changed across loads at all. After the fix it tracks
// every load and agrees with the server each time.
//
// Four call sites already defended themselves with `inferModRootFromFocusPath(loadedPath) ||
// editorActiveRootPath`. Refreshing the variable at the source fixes the other ten as well, and keeps client
// and server agreeing by construction rather than by each caller remembering to.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { stripJsComments } = require("./testlib-strip-comments.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300));
  }
}

const APP = fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8");
// ⭐ Strip comments first — the fix's own prose names every identifier asserted below.
const CODE = stripJsComments(APP);

console.log("\n[the premise] the server really does re-point its active root on load");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-rootdrift-"));
process.env.HOI4_MODS_ROOT = ROOT;
process.env.APPDATA = path.join(ROOT, "appdata");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
const { createApp } = require("./server.js");
const toPosix = (p) => p.split(path.sep).join("/");
const PORT = 53373;

function mkMod(name) {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(path.join(dir, "common", "national_focus"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), `name="${name}"\nsupported_version="1.19.*"\n`);
  fs.writeFileSync(path.join(ROOT, `${name}.mod`),
    `name="${name}"\npath="${toPosix(dir)}"\nsupported_version="1.19.*"\n`);
  fs.writeFileSync(path.join(dir, "common", "national_focus", "tree.txt"),
    `focus_tree = {\n\tid = ${name}_tree\n\tcountry = { factor = 1 }\n` +
    `\tfocus = {\n\t\tid = ${name}_focus\n\t\tx = 0\n\t\ty = 0\n\t\tcost = 1\n\t}\n}\n`);
  return dir;
}
const A = mkMod("modA");
const B = mkMod("modB");
const base = (p) => String(p || "").split(/[\\/]/).filter(Boolean).pop() || "(empty)";

(async () => {
  const srv = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
  try {
    const J = (u, o) => fetch(`http://127.0.0.1:${PORT}${u}`, o).then((r) => r.json()).catch((e) => ({ error: String(e) }));
    // ⚠️ /api/load throttles repeat calls from the same client ("Please wait a moment before loading
    // again"), and the key includes the User-Agent — so a second load with the default agent is REJECTED
    // and the root appears not to move. Vary it, or this test measures the rate limiter instead.
    let agent = 0;
    const loadTree = async (root) => {
      const r = await J("/api/load", {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": `nova-test-${agent++}` },
        body: JSON.stringify({ path: path.join(root, "common", "national_focus", "tree.txt") }),
      });
      if (r && r.error) throw new Error(`load refused: ${r.error}`);
      return r;
    };

    await loadTree(A);
    const afterA = base((await J("/api/root")).activeRoot);
    await loadTree(B);
    const afterB = base((await J("/api/root")).activeRoot);

    rec("loading modA's tree makes modA the server's active mod", afterA === "modA", afterA);
    rec("loading modB's tree moves it to modB", afterB === "modB", afterB);
    // If this ever stops being true the whole premise changes, and the client-side refresh below would be
    // fixing a problem that no longer exists.
    rec("…so a value captured once at page init cannot stay correct", afterA !== afterB, { afterA, afterB });
  } finally {
    srv.closeAllConnections();
    srv.close();
  }

  console.log("\n[the fix] the client refreshes its copy when a tree is loaded");
  {
    rec("fetchRoot is still the page-init source", /editorActiveRootPath = String\(payload\.activeRoot/.test(CODE), "gone");
    // THE FIX: loadFile adopts the loaded tree's mod, right where it already computes it for localStorage.
    rec("loadFile refreshes it from the loaded tree's mod",
      /if \(loadedModRoot\) editorActiveRootPath = loadedModRoot;/.test(CODE), "no refresh in loadFile");
    // Same block as the activeModPath write it sits beside — the two must not drift apart into different
    // code paths. Generous window: the explanation between them is deliberately long.
    rec("…in the same block as the activeModPath it already stored",
      /localStorage\.setItem\("activeModPath", loadedModRoot\);[\s\S]{0,400}?editorActiveRootPath = loadedModRoot;/.test(CODE),
      "the refresh is not next to the existing write");
    // A vanilla tree yields "" — the value must be LEFT ALONE, matching the server, which also keeps its
    // current root in that case (#vanilla-focus-load-clears-active-mod). The `if` is what guarantees it.
    rec("a vanilla tree (no mod root) leaves it untouched",
      !/editorActiveRootPath = loadedModRoot \|\|/.test(CODE) && /if \(loadedModRoot\) editorActiveRootPath/.test(CODE),
      "an empty mod root could overwrite it");
  }

  console.log("\n[CONTROL] the defensive call sites are still defensive");
  {
    // Four sites prefer the open tree's mod over this variable. The refresh does not make them redundant —
    // they are what keeps the picker and the icon upload right even before any refresh has happened.
    const guarded = (CODE.match(/inferModRootFromFocusPath\(loadedPath\) \|\| (String\()?editorActiveRootPath/g) || []).length;
    rec("the belt-and-braces call sites survive", guarded >= 3, guarded);
    // And nothing should be assigning this variable from anywhere else. Three sites total: the `let`
    // declaration, fetchRoot at page init, and the refresh in loadFile. A fourth means someone has started
    // setting it from a path that may not agree with the server, which is the whole bug.
    const writers = (CODE.match(/editorActiveRootPath = /g) || []).length;
    rec("it is written in exactly three places (declaration + page init + load)", writers === 3, writers);
  }

  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  console.log(`\n=== editor active root tracks load: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
