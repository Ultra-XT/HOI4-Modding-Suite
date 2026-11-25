// #focus-icon-does-not-resolve — A FOCUS ICON NAMING A SPRITE NOTHING DECLARES DRAWS NOTHING IN GAME.
//
// From the user's own mod: three focuses named GFX_focus_generic_construction / _army_tanks /
// _navy_battleship. HOI4's generic focus art is GFX_goal_generic_*; those names exist nowhere, so the
// focuses drew blank. Nothing told anyone, because the editor CANNOT tell: /api/icon-image serves a
// placeholder on a miss, so the node looks correct in Nova and is empty in HOI4.
//
// Nova already refused to invent one of these in /api/focus/restore-base-icons, which returns them in a
// `skipped` list — the guard existed in one endpoint and nowhere else.
//
// ⚠️ THE MEASUREMENT THAT MADE THIS SAFE TO SHIP, and the three things it caught:
//
//   1. A SPRITE NAME NEED NOT START WITH GFX_ — this is the one that mattered. Vanilla declares 2,564 that
//      do not, and Millennium Dawn references its own art by BARE TOKEN on 22,029 of its 22,072 focus icons
//      (`icon = money`, declared as `name = "money"`). Keeping only GFX_-prefixed names flags over 15,000 of
//      MD's working icons. I first blamed the overlay for that number; the test says otherwise, because MD
//      declares its own art, so scanning MD alone still leaves only 31. Assert the measurement, not the story.
//   2. A mod is still an overlay — the inventory is mod ∪ game — it just is not what dominated here.
//   3. .gfx files live outside interface/ — vanilla keeps 3,846 declarations under dlc/ and 1,884 under
//      integrated_dlc/.
//
// With all three corrected the rule flags 0.00% of vanilla's 11,016 focus icons and 0.14% of MD's 22,072,
// and MD's residue is genuine typos (`gfx`, `Naval_Upgrade`). Idea pictures and decision icons still sit at
// 1.6% and 5.6% under the same treatment, which is too loose to warn on — so this is scoped to FOCUSES.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-focusicon-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const V = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const MD = "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649";

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
  const p = path.join(__dirname, `.ctl-focusicon-${process.pid}-${label}.js`);
  fs.writeFileSync(p, wasCrlf ? out.replace(/\n/g, "\r\n") : out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

function walk(dir, re, depth = 0) {
  let out = [];
  if (depth > 8) return out;
  let es = [];
  try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return out; }
  for (const e of es) out = out.concat(e.isDirectory() ? walk(path.join(dir, e.name), re, depth + 1) : (re.test(e.name) ? [path.join(dir, e.name)] : []));
  return out;
}
function spritesOf(roots) {
  const out = new Set();
  for (const r of roots) {
    for (const p of walk(r, /\.gfx$/i)) {
      let t = "";
      try { t = fs.readFileSync(p, "utf8").replace(/#[^\n]*/g, ""); } catch (_) { continue; }
      for (const m of t.matchAll(/\bname\s*=\s*"([^"]+)"/g)) out.add(m[1]);
      for (const m of t.matchAll(/\bname\s*=\s*([A-Za-z0-9_.-]+)/g)) out.add(m[1]);
    }
  }
  return out;
}
function focusIconRefs(root) {
  const out = [];
  for (const p of walk(path.join(root, "common", "national_focus"), /\.txt$/i)) {
    let t = "";
    try { t = fs.readFileSync(p, "utf8").replace(/#[^\n]*/g, ""); } catch (_) { continue; }
    for (const m of t.matchAll(/(^|\n)\s*icon\s*=\s*"?([A-Za-z0-9_.-]+)"?/g)) out.push(m[2]);
  }
  return out;
}
const resolves = (raw, sprites) =>
  [raw, `GFX_${raw}`, `GFX_focus_${raw}`, `GFX_goal_${raw}`].some((c) => sprites.has(c));

let seq = 0;
function mkMod(focusText) {
  const dir = path.join(ROOT, "m" + (++seq));
  fs.mkdirSync(path.join(dir, "common", "national_focus"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), `name="m${seq}"\nsupported_version="1.19.*"\n`, "utf8");
  const p = path.join(dir, "common", "national_focus", "tree.txt");
  fs.writeFileSync(p, focusText, "utf8");
  return { dir, file: p };
}
let PORT = 45700;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      // /api/save rate-limits to one write per FILE_IO_MIN_INTERVAL_MS (120ms) per client, so a test that
      // fires several saves in a row gets a 429 on the second and measures the rate limiter, not the icons.
      save: async (file, content) => {
        await new Promise((r) => setTimeout(r, 150));
        const r = await fetch(`http://127.0.0.1:${PORT}/api/save`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ path: file, content, createBackup: false }),
        });
        return { s: r.status, b: await r.json().catch(() => ({})) };
      },
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}
const tree = (icons) => [
  "focus_tree = {", "\tid = nua_icon_probe", "\tcountry = { factor = 0 }",
  ...icons.flatMap((ic, i) => ["\tfocus = {", `\t\tid = nua_probe_${i}`, `\t\ticon = ${ic}`,
    "\t\tx = 0", `\t\ty = ${i}`, "\t\tcost = 10", "\t}"]),
  "}", ""].join("\n");

(async () => {
  let api = null;
  try {
    console.log("\n[ground truth] how the corpora actually name and declare focus art");
    const haveGame = fs.existsSync(path.join(V, "common", "national_focus"));
    if (!haveGame) console.log("  (skipped — vanilla not installed)");
    let vSprites = new Set();
    if (haveGame) {
      vSprites = spritesOf([V]);
      rec("vanilla declares tens of thousands of sprite names", vSprites.size > 20000, vSprites.size);
      const bare = [...vSprites].filter((s) => !s.startsWith("GFX_"));
      rec("…and a sprite name need NOT start with GFX_", bare.length > 1000, bare.length);
      const vRefs = focusIconRefs(V);
      rec("vanilla writes its focus icons as full GFX_ names",
        vRefs.length > 10000 && vRefs.every((r) => r.startsWith("GFX_")),
        { refs: vRefs.length, bare: vRefs.filter((r) => !r.startsWith("GFX_")).length });
      const unresolved = vRefs.filter((r) => !resolves(r, vSprites));
      rec("EVERY vanilla focus icon resolves — the rule flags none of them",
        unresolved.length === 0, unresolved.slice(0, 5));
    }
    if (fs.existsSync(path.join(MD, "common", "national_focus"))) {
      // A mod is an OVERLAY: its inventory is mod ∪ game. Scanning MD alone produced 7,023 phantom failures.
      const mdSprites = spritesOf([MD, V]);
      const mdRefs = focusIconRefs(MD);
      const bareRefs = mdRefs.filter((r) => !r.startsWith("GFX_")).length;
      rec("Millennium Dawn names its focus icons by BARE token", bareRefs > 20000, { refs: mdRefs.length, bare: bareRefs });
      const un = mdRefs.filter((r) => !resolves(r, mdSprites));
      const pct = (un.length / mdRefs.length) * 100;
      rec("…and under the overlay inventory almost all of them resolve", pct < 0.5,
        { unresolved: un.length, of: mdRefs.length, pct: pct.toFixed(2) });
      // The control for the BARE-NAME half, which is what actually mattered here: an inventory that keeps
      // only GFX_-prefixed names. Measured, that is what turned 93% of MD's focus art into phantom failures.
      // (The overlay correction matters for correctness but barely moves MD's number — it declares its own
      // art — so asserting otherwise would be asserting a story rather than the measurement.)
      const gfxOnly = new Set([...mdSprites].filter((x) => x.startsWith("GFX_")));
      const unGfxOnly = mdRefs.filter((r) => !resolves(r, gfxOnly));
      rec("…while keeping only GFX_-prefixed names would flag most of them",
        unGfxOnly.length > 15000, { wouldFlag: unGfxOnly.length, of: mdRefs.length });
    }

    api = await serve(createApp());

    console.log("\n[the bug] the three names from the user's mod");
    {
      const { file } = mkMod(tree(["GFX_goal_generic_construction"]));
      const bad = tree(["GFX_focus_generic_construction", "GFX_focus_generic_army_tanks", "GFX_focus_generic_navy_battleship"]);
      const r = await api.save(file, bad);
      rec("the save succeeds — a warning is not a refusal", r.s === 200 && r.b.ok, r.b);
      rec("…and the file really was written", fs.readFileSync(file, "utf8").includes("GFX_focus_generic_army_tanks"), "not written");
      const w = String(r.b.iconWarning || "");
      rec("…and it warns", !!w, "(no warning)");
      rec("…naming all three", ["construction", "army_tanks", "navy_battleship"].every((n) => w.includes(n)), w);
      rec("…and explaining why the editor looked fine", /placeholder/i.test(w), w);
    }

    console.log("\n[no cry-wolf] the real names say nothing");
    {
      const { file } = mkMod(tree(["GFX_goal_generic_construction"]));
      const good = tree(["GFX_goal_generic_construction", "GFX_goal_generic_army_tanks", "GFX_goal_generic_navy_battleship"]);
      const r = await api.save(file, good);
      rec("a tree whose icons all exist is saved silently", r.s === 200 && r.b.ok && !r.b.iconWarning, r.b.iconWarning);
    }

    console.log("\n[bare tokens] a mod's own art, declared without the GFX_ prefix");
    {
      const { dir, file } = mkMod(tree(["GFX_goal_generic_construction"]));
      fs.mkdirSync(path.join(dir, "interface"), { recursive: true });
      fs.writeFileSync(path.join(dir, "interface", "nova_art.gfx"),
        'spriteTypes = {\n\tspriteType = {\n\t\tname = "nua_money"\n\t\ttexturefile = "gfx/x.dds"\n\t}\n}\n', "utf8");
      const r = await api.save(file, tree(["nua_money"]));
      rec("an icon naming the mod's own bare-token sprite is accepted",
        r.s === 200 && !r.b.iconWarning, r.b.iconWarning);
      const r2 = await api.save(file, tree(["nua_never_declared"]));
      rec("…while an undeclared bare token beside it is flagged",
        String(r2.b.iconWarning || "").includes("nua_never_declared"), r2.b.iconWarning);
    }

    console.log("\n[scope] only focus files are judged");
    {
      const { dir } = mkMod(tree(["GFX_goal_generic_construction"]));
      const other = path.join(dir, "common", "ideas");
      fs.mkdirSync(other, { recursive: true });
      const p = path.join(other, "x.txt");
      fs.writeFileSync(p, "ideas = {\n\tcountry = {\n\t\tnua_i = {\n\t\t\tpicture = totally_made_up\n\t\t}\n\t}\n}\n", "utf8");
      const r = await api.save(p, fs.readFileSync(p, "utf8"));
      rec("an ideas file is saved at all", r.s === 200, { status: r.s, body: r.b });
      rec("…without an icon verdict", !r.b.iconWarning, r.b.iconWarning);
    }
    api.stop(); api = null;

    console.log("\n[the client] the page must show it");
    {
      const A = fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8");
      const HTML = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");
      rec("app.js reads iconWarning", /payload\.iconWarning/.test(A), "never read");
      rec("…and surfaces it", /payload\.iconWarning[\s\S]{0,160}?nbAlert/.test(A), "read but not shown");
      rec("…via a helper this page really loads", /ai-field-assist\.js/.test(HTML), "nbAlert is not available here");
      rec("…and not on an autosave", /iconWarning && !fromAuto/.test(A), "would fire on every autosave");
    }

    console.log("\n[back-out] stop checking the icons");
    {
      const built = controlApp("nocheck", [[
        "          iconWarning = unresolvedFocusIconWarning(req.body.content, targetPath);",
        "          iconWarning = \"\";"]]);
      if (built.error) rec("the control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        const { file } = mkMod(tree(["GFX_goal_generic_construction"]));
        try {
          const c = await capi.save(file, tree(["GFX_focus_generic_army_tanks"]));
          rec("…and a focus that draws nothing is saved with nothing said",
            c.s === 200 && c.b.ok && !c.b.iconWarning, c.b);
        } finally { capi.stop(); }
      }
    }

    console.log(`\n=== focus icon resolves: ${checks} checks, ${fails.length} failed ===`);
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
