// #wizard-focus-tree-id-leading-digit — THE FRONT DOOR WROTE A TREE THE GAME THROWS AWAY.
//
// 🈯 Clausewitz: "Creation of dynamic token '1936_vrf38ctl_SWE_defense_act' failed, keywords may not start
// with a digit or '-'." A focus tree whose `id` starts with a digit is refused, and every focus in it goes
// with it. A user's own play-test error.log carried 168 of these.
//
// Nova already enforces this in the two places a tree id is minted by hand — /api/mod/add-focus-tree and the
// tree-copy path both carry #focus-tree-id-leading-digit — and in create-custom-folder before them. The
// STORYLINE WIZARD, which is the very first thing a new user touches, did not: it derived the id from
// slugifyModName(modName), which lowercases and strips punctuation and is perfectly happy to return
// `1936_redux`. So "1936 Redux" produced
//     focus_tree = { id = 1936_redux_focus_tree … }
// and the whole tree was dropped by the game while Nova reported success and opened it in the editor.
//
// The mod FOLDER may still be named 1936_redux — a path is not a token. Only what becomes a bareword key
// has to change.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-wizid-"));
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
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
// The ids that become BAREWORD KEYS: the tree's own id and each focus's id.
//
// ⚠️ Scoped to those blocks on purpose. A flat scan for `id = X` also catches `country_event = { id = 3 }`,
// `random_list` weights and event ids — 453 of vanilla's 13,326 `id =` lines start with a digit for exactly
// that reason, and reading them as focus ids would say the corpus disagrees with HOI4's own lexer.
const idsIn = (text) => {
  const src = text.replace(/#[^\n]*/g, "");
  const out = [];
  const re = /(?:^|\n)\s*(focus_tree|shared_focus|focus)\s*=\s*\{/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const open = src.indexOf("{", m.index);
    let d = 0, close = -1;
    for (let i = open; i < src.length; i++) {
      if (src[i] === "{") d++;
      else if (src[i] === "}") { d--; if (!d) { close = i; break; } }
    }
    if (close === -1) break;
    // Only the block's OWN id — depth 1 — never one belonging to a nested effect.
    const body = src.slice(open + 1, close);
    let depth = 0, id = "";
    for (const line of body.split("\n")) {
      const before = depth;
      for (const ch of line) { if (ch === "{") depth++; else if (ch === "}") depth--; }
      if (before === 0) {
        const im = /^\s*id\s*=\s*([^\s{}#]+)/.exec(line);
        if (im) { id = im[1]; break; }
      }
    }
    if (id) out.push(id);
    re.lastIndex = m.index + m[0].length; // nested `focus = {` blocks are found on their own pass
  }
  return out;
};

let PORT = 51340;
(async () => {
  let srv = null;
  try {
    srv = await new Promise((r) => { const s = createApp().listen(++PORT, () => r(s)); });
    const post = (u, body) => fetch(`http://127.0.0.1:${PORT}${u}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })).catch((e) => ({ status: 0, body: { error: String(e) } }));

    console.log("\n[ground truth] no id in either shipped corpus starts with a digit");
    {
      const dir = path.join(GAME, "common", "national_focus");
      let files = []; try { files = fs.readdirSync(dir).filter((f) => f.endsWith(".txt")); } catch (_) { files = []; }
      if (!files.length) console.log("     (no HOI4 install — skipped)");
      else {
        let total = 0, bad = 0;
        for (const f of files) {
          let t = ""; try { t = fs.readFileSync(path.join(dir, f), "latin1"); } catch (_) { continue; }
          for (const id of idsIn(t)) { total++; if (/^[0-9-]/.test(id)) bad++; }
        }
        console.log(`     ${total} focus-tree / focus ids in vanilla · ${bad} start with a digit or dash`);
        rec("the corpus agrees the first character may not be a digit or dash", total > 1000 && bad === 0, { total, bad });
      }
    }

    console.log("\n[the wizard] a mod name that begins with a year");
    {
      const r = await post("/api/mod/create-template", {
        modName: "1936 Redux", countryName: "Redland", countryTag: "RDL",
        capitalStateId: 1, color: "#3388ff", dependencies: [],
      });
      rec("the mod was created", r.status < 400 && r.body && r.body.ok !== false, { status: r.status, body: r.body });
      const treePath = String((r.body || {}).focusTreePath || "");
      rec("…and it reported a focus tree file", !!treePath && fs.existsSync(treePath), treePath);
      const text = treePath && fs.existsSync(treePath) ? fs.readFileSync(treePath, "utf8") : "";
      const ids = idsIn(text);
      console.log(`     ids written: ${JSON.stringify(ids)}`);
      rec("there are ids to check at all", ids.length >= 2, ids);
      rec("NOT ONE of them starts with a digit or a dash", ids.every((i) => /^[A-Za-z_]/.test(i)), ids.filter((i) => !/^[A-Za-z_]/.test(i)));
      // The tree id specifically — the one derived from the mod name.
      const treeId = (/(?:^|\n)\s*focus_tree\s*=\s*\{[\s\S]*?\n\s*id\s*=\s*([^\s{}#]+)/.exec(text) || [])[1] || "";
      console.log(`     tree id: ${treeId}`);
      rec("the focus_tree id is a legal bareword", /^[A-Za-z_][A-Za-z0-9_]*$/.test(treeId), treeId);
      rec("…and it still recognisably comes from the mod name", /1936_redux/.test(treeId), treeId);
      // A path is not a token: the folder may keep the digit, and renaming it would be churn for nothing.
      rec("CONTROL: the mod FOLDER is left alone", /1936_redux/.test(String((r.body || {}).modRoot || "")), (r.body || {}).modRoot);
    }

    console.log("\n[the OTHER mod creator] /api/mod/create has the same rule");
    {
      // ⚠️ TWO FRONT DOORS WRITE A FOCUS TREE. /api/mod/create-template is the Storyline wizard; /api/mod/create
      // is the plainer "new mod" path, and it writes its own focus_tree with `id = <slug>_focus_tree` too.
      // The first fix reached only one of them, which is the same never-adopted-sibling shape this whole
      // session keeps turning up — so the test now drives both.
      const r = await post("/api/mod/create", { modName: "1942 Plain", displayName: "1942 Plain" });
      rec("the plain creator answers", r.status < 400 && r.body && r.body.ok !== false, { status: r.status, body: r.body });
      const root = String((r.body || {}).modRoot || "");
      const dir = path.join(root, "common", "national_focus");
      let files = []; try { files = fs.readdirSync(dir); } catch (_) { files = []; }
      rec("…and wrote a focus tree", files.length >= 1, { dir, files });
      const text = files.length ? fs.readFileSync(path.join(dir, files[0]), "utf8") : "";
      const ids = idsIn(text);
      console.log(`     /api/mod/create wrote ids: ${JSON.stringify(ids)}`);
      rec("…whose id is a legal bareword", ids.length > 0 && ids.every((i) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(i)), ids);
      rec("…still recognisably from the mod name", ids.some((i) => /1942_plain/.test(i)), ids);
      // The loc key has to move with the id, or the tree shows as its raw id in game.
      const locDir = path.join(root, "localisation", "english");
      let locFiles = []; try { locFiles = fs.readdirSync(locDir); } catch (_) { locFiles = []; }
      const loc = locFiles.length ? fs.readFileSync(path.join(locDir, locFiles[0]), "utf8") : "";
      const treeId = ids[0] || "";
      console.log(`     loc: ${JSON.stringify((loc.split("\n").find((l) => /focus_tree/.test(l)) || "").trim())}`);
      rec("…and its localisation key matches that id", !!treeId && loc.includes(treeId + ":"), { treeId, loc: loc.slice(0, 160) });
    }

    console.log("\n[CONTROL — an ordinary mod name] is not rewritten");
    {
      // Without this, prefixing unconditionally would look identical in the check above while renaming
      // every tree Nova has ever made.
      const r = await post("/api/mod/create-template", {
        modName: "Bright Dawn", countryName: "Brightland", countryTag: "BRT",
        capitalStateId: 1, color: "#3388ff", dependencies: [],
      });
      const treePath = String((r.body || {}).focusTreePath || "");
      const text = treePath && fs.existsSync(treePath) ? fs.readFileSync(treePath, "utf8") : "";
      const treeId = (/(?:^|\n)\s*focus_tree\s*=\s*\{[\s\S]*?\n\s*id\s*=\s*([^\s{}#]+)/.exec(text) || [])[1] || "";
      console.log(`     tree id: ${treeId}`);
      rec("a letter-first name yields exactly the id it always did", treeId === "bright_dawn_focus_tree", treeId);
    }

    console.log("\n[the tree Nova writes is one Nova can read back]");
    {
      // The id being legal is only half of it — the file still has to load in the maker, or the fix has
      // traded a silent in-game failure for a loud in-editor one.
      const r = await post("/api/mod/create-template", {
        modName: "2000 Modern", countryName: "Modland", countryTag: "MDL",
        capitalStateId: 1, color: "#3388ff", dependencies: [],
      });
      const treePath = String((r.body || {}).focusTreePath || "");
      const load = await fetch(`http://127.0.0.1:${PORT}/api/focus/all-ids?modPath=${encodeURIComponent(String((r.body || {}).modRoot || ""))}`)
        .then((x) => x.json()).catch((e) => ({ error: String(e) }));
      // `mine` is { focusId: file } for the mod's own focuses; `inherited` is everything below it.
      const mine = Object.keys((load && load.mine) || {}).filter((s) => /^mdl_/.test(s));
      console.log(`     ids Nova reads back: ${JSON.stringify(mine.slice(0, 4))}`);
      rec("Nova reads back the focuses it just wrote", mine.length >= 3, load && load.mine);
      rec("…and the file is where it said", !!treePath && fs.existsSync(treePath), treePath);
    }

    srv.closeAllConnections(); srv.close(); srv = null;
    console.log(`\n=== wizard focus tree id: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
