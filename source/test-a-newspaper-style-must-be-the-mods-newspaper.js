// The Newspaper Style picker offered any installed mod that had a gfx/interface/event_news_bg.dds on disk,
// then copied that file into the user's mod under the source mod's name. Existence of a file is not evidence
// that the mod uses it.
//
// Old World Blues is the counter-example, measured on this machine: it ships event_news_bg.dds and
// references GFX_event_news_bg NOWHERE in its interface/, because its news window builds the paper from
// three sliced sprites. So every Nova user was offered "Old World Blues", and applying it WROTE an image
// OWB never shows into their mod, labelled "Using: Old World Blues".
//
// ⚠️ THE OBVIOUS FIX IS WRONG, and this test exists partly to stop it coming back. "The mod must declare a
// spriteType" drops Novum Vexillum, which references GFX_event_news_bg only as a USE inside its own
// eventwindow.gui and declares nothing. It does not need to: HOI4 replaces a file wholesale at the same
// relative path, so shipping gfx/interface/event_news_bg.dds overrides the texture vanilla's own spriteType
// points at. That is the half of the replace_path rule readers here keep missing.
//
// The honest question is whether the mod's news window DRAWS that sprite.
"use strict";

const fs = require("fs");
const path = require("path");
const { stripJsComments } = require("./testlib-strip-comments.js");

const SERVER = stripJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};

function extractFunction(src, name) {
  const at = src.indexOf("function " + name + "(");
  if (at === -1) return null;
  const open = src.indexOf("{", at);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) return src.slice(at, i + 1); }
  }
  return null;
}

try {
  console.log("1. The rule exists and is applied at BOTH ends");
  const fn = extractFunction(SERVER, "usesNewspaperBackground");
  rec("usesNewspaperBackground exists", !!fn, fn ? fn.length + " chars" : "NOT FOUND");
  rec("the LIST endpoint filters with it", /if \(!fs\.existsSync\(bg\)\) return;[\s\S]{0,400}?usesNewspaperBackground\(dir\)/.test(SERVER));
  rec("…and the APPLY endpoint enforces it too", /usesNewspaperBackground\(modDir\)/.test(SERVER),
    "a stale client or a hand-built request could otherwise still apply a leftover");
  rec("…the old filename-only test is gone", !/declaresNewspaperSprite/.test(SERVER));
  if (!fn) throw new Error("cannot continue without the function");

  // Run the real rule against the real mods on disk.
  const usesNewspaperBackground = new Function("fs", "path", fn + "; return usesNewspaperBackground;")(fs, path);

  console.log("\n2. Measured against the mods actually installed here");
  const ws = "D:/SteamLibrary/steamapps/workshop/content/394360";
  const shipsBg = [];
  if (fs.existsSync(ws)) {
    for (const d of fs.readdirSync(ws)) {
      const dir = path.join(ws, d);
      if (fs.existsSync(path.join(dir, "gfx", "interface", "event_news_bg.dds"))) shipsBg.push(dir);
    }
  }
  rec("at least two installed mods ship the file", shipsBg.length >= 2, shipsBg.map((d) => path.basename(d)));

  const verdicts = shipsBg.map((dir) => {
    const iface = path.join(dir, "interface");
    let refs = false, ownWindow = false;
    try {
      for (const f of fs.readdirSync(iface)) {
        if (!/\.(gfx|gui)$/i.test(f)) continue;
        const t = fs.readFileSync(path.join(iface, f), "utf8");
        if (/EventWindow_News/.test(t)) ownWindow = true;
        if (/GFX_event_news_bg/.test(t)) refs = true;
      }
    } catch (_) {}
    return { mod: path.basename(dir), ownWindow, refs, offered: usesNewspaperBackground(dir) };
  });
  verdicts.forEach((v) => console.log(`     ${v.mod}: ownNewsWindow=${v.ownWindow} referencesSprite=${v.refs} -> offered=${v.offered}`));

  console.log("\n3. A mod that never draws the sprite is NOT offered");
  const leftovers = verdicts.filter((v) => v.ownWindow && !v.refs);
  rec("the corpus contains at least one such mod", leftovers.length >= 1,
    leftovers.length ? leftovers.map((v) => v.mod) : "nothing to test the exclusion against");
  leftovers.forEach((v) => rec(`${v.mod} is excluded (its own window never draws it)`, v.offered === false));

  console.log("\n4. …but a mod that DOES draw it still is");
  const genuine = verdicts.filter((v) => v.refs);
  rec("the corpus contains at least one such mod", genuine.length >= 1, genuine.map((v) => v.mod));
  genuine.forEach((v) => rec(`${v.mod} is still offered`, v.offered === true,
    "over-tightening this drops legitimate mods — it did once"));

  console.log("\n5. The three ways a mod can legitimately own the newspaper");
  // Composed, so each branch is exercised even if the installed corpus lacks one.
  const tmp = fs.mkdtempSync(path.join(require("os").tmpdir(), "nova-npstyle-"));
  const mk = (name, files) => {
    const d = path.join(tmp, name);
    fs.mkdirSync(path.join(d, "interface"), { recursive: true });
    for (const [f, body] of Object.entries(files)) fs.writeFileSync(path.join(d, "interface", f), body, "utf8");
    return d;
  };
  rec("no interface/ at all -> inherits vanilla's window, which draws it",
    usesNewspaperBackground(mk("bare", {})) === true);
  rec("own news window that references it -> offered (the Novum Vexillum shape)",
    usesNewspaperBackground(mk("uses", { "eventwindow.gui": 'EventWindow_News = { spriteType ="GFX_event_news_bg" }' })) === true);
  rec("declares the spriteType in a .gfx -> offered (the Millennium Dawn shape)",
    usesNewspaperBackground(mk("declares", {
      "eventwindow.gui": "EventWindow_News = { }",
      "x.gfx": 'spriteType = { name = "GFX_event_news_bg" texturefile = "gfx/interface/event_news_bg.dds" }',
    })) === true);
  rec("own news window that never references it -> NOT offered (the Old World Blues shape)",
    usesNewspaperBackground(mk("leftover", { "eventwindow.gui": 'EventWindow_News = { spriteType = "GFX_event_news_top_bg" }' })) === false);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}

  console.log("\n6. This would have rejected what shipped");
  const OLD = (dir) => fs.existsSync(path.join(dir, "gfx", "interface", "event_news_bg.dds"));
  const owb = shipsBg.find((d) => verdicts.find((v) => v.mod === path.basename(d) && v.ownWindow && !v.refs));
  if (owb) {
    rec("the old rule offered the leftover", OLD(owb) === true, path.basename(owb));
    rec("…where the new rule does not", usesNewspaperBackground(owb) === false);
  } else {
    rec("a leftover mod was available to test the old rule against", false, "corpus lacks one");
  }

  console.log(`\n=== a newspaper style must be the mod's newspaper: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
  process.exitCode = 1;
}
