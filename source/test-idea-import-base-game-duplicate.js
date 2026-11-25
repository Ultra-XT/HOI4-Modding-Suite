// #import-duplicates-base-game — IMPORTING A SPIRIT THE GAME ALREADY HAS MADE A DUPLICATE OF IT.
//
// From a play-test error.log, 18 times:
//
//   Duplicate idea. ENG_george_vi is a duplicate.
//
// Every one of them came from a single file Nova writes, common/ideas/focus_editor_imported_ideas.txt. The
// focus editor's spirit picker carries an "Import national spirit into my mod" checkbox that is ticked BY
// DEFAULT, so picking a vanilla spirit for a focus copied its definition into the mod. common/ideas merges,
// so vanilla's copy still loads and now there are two.
//
// This is not a tidy-up problem. With two definitions the game keeps whichever it loads last, so a modder
// editing their copy can find it does nothing — the "my changes had no effect" report.
//
// The endpoint already skipped an idea the MOD defines elsewhere and said why. It simply never looked at the
// base game. getActiveRoots answers that exactly, INCLUDING the replace_path case: a mod that replaces
// common/ideas (Millennium Dawn does) gets the game root filtered out, and importing a vanilla idea there is
// correct — so that must keep working, and this test pins it.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-ideadup-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const V = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
// Two ids the play-test log named, both defined by vanilla in common/ideas.
const VANILLA_IDEA = "ENG_george_vi";
const VANILLA_SPIRIT = "static_warfare_spirit";

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
  const p = path.join(__dirname, `.ctl-ideadup-${process.pid}-${label}.js`);
  fs.writeFileSync(p, wasCrlf ? out.replace(/\n/g, "\r\n") : out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

function mkMod(name, extraDescriptor) {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(path.join(dir, "common", "ideas"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"),
    `name="${name}"\nsupported_version="1.19.*"\n${extraDescriptor || ""}`, "utf8");
  return dir;
}
const importedFile = (mod) => path.join(mod, "common", "ideas", "focus_editor_imported_ideas.txt");
const readImported = (mod) => { try { return fs.readFileSync(importedFile(mod), "utf8"); } catch (_) { return ""; } };
// A definition is a top-level `<id> = {` inside a category block — not merely the id appearing somewhere.
const defines = (txt, id) => new RegExp(`(^|\\n)\\s*${id}\\s*=\\s*\\{`).test(txt);

let PORT = 44880;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      post: (u, b) => fetch(`http://127.0.0.1:${PORT}${u}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) })
        .then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}
const doImport = (api, mod, ideaId, sourceModRoot) =>
  api.post("/api/ideas/import", { modPath: mod, ideaId, sourceModRoot: sourceModRoot || V, targetLocalizationPath: "" });

(async () => {
  let api = null;
  try {
    console.log("\n[ground truth] the game really does define these, in common/ideas");
    const haveGame = fs.existsSync(path.join(V, "common", "ideas"));
    if (!haveGame) console.log("  (skipped — vanilla not installed)");
    else {
      for (const id of [VANILLA_IDEA, VANILLA_SPIRIT]) {
        const files = fs.readdirSync(path.join(V, "common", "ideas")).filter((f) => f.endsWith(".txt"));
        const owner = files.find((f) => defines(fs.readFileSync(path.join(V, "common", "ideas", f), "utf8"), id));
        rec(`vanilla defines ${id}`, !!owner, "not found in any vanilla ideas file");
      }
    }

    api = await serve(createApp());

    if (haveGame) {
      console.log("\n[the bug] a spirit the game already has is not copied");
      {
        const mod = mkMod("m1");
        const r = await doImport(api, mod, VANILLA_IDEA);
        rec("the import succeeds", r.s === 200 && r.b.ok, r.b);
        rec("…and reports the definition as skipped",
          (r.b.imported || []).includes("definition-skipped"), r.b.imported);
        rec("…and NOT as written", !(r.b.imported || []).includes("definition"), r.b.imported);
        rec("…naming where it already loads from", !!r.b.alreadyLoadsFrom, r.b);
        rec("…and the mod file does NOT define it",
          !defines(readImported(mod), VANILLA_IDEA), readImported(mod).slice(0, 400));

        const note = String(r.b.importNote || "");
        rec("…the note explains it already loads", /already loads from/i.test(note), note || "(no note)");
        rec("…quotes what the game would say", /Duplicate idea/i.test(note), note);
        rec("…and says the focus can still use it", /can use it as it is/i.test(note), note);
      }

      console.log("\n[still useful] the localisation and icon steps still run");
      {
        const mod = mkMod("m2");
        const r = await doImport(api, mod, VANILLA_SPIRIT);
        rec("a skipped definition does not abort the rest",
          (r.b.imported || []).some((x) => /localization|localisation|icon/i.test(x)) || !!r.b.targetLocalizationPath,
          r.b.imported);
      }
    }

    console.log("\n[no over-reach] an idea the game does NOT have is copied as before");
    {
      const src = mkMod("srcmod");
      fs.writeFileSync(path.join(src, "common", "ideas", "src.txt"),
        ["ideas = {", "\tcountry = {", "\t\tnua_invented_spirit = {",
          "\t\t\tpicture = generic_morale_bonus",
          "\t\t\tmodifier = { war_support_factor = 0.05 }",
          "\t\t}", "\t}", "}", ""].join("\n"), "utf8");
      const mod = mkMod("m3");
      const r = await doImport(api, mod, "nua_invented_spirit", src);
      rec("the import succeeds", r.s === 200 && r.b.ok, r.b);
      rec("…the definition IS written", (r.b.imported || []).includes("definition"), r.b.imported);
      rec("…and really lands in the mod file",
        defines(readImported(mod), "nua_invented_spirit"), readImported(mod).slice(0, 400));
      rec("…with no note, because nothing was skipped", !r.b.importNote, r.b.importNote);
    }

    console.log("\n[replace_path] a mod that replaces common/ideas MUST still be able to import");
    if (haveGame) {
      // Millennium Dawn does exactly this. Vanilla's ideas then do not load at all, so copying one in is the
      // only way to have it — the opposite verdict from the same code path, decided by the descriptor.
      const mod = mkMod("m4", 'replace_path="common/ideas"\n');
      const r = await doImport(api, mod, VANILLA_IDEA);
      rec("the import succeeds", r.s === 200 && r.b.ok, r.b);
      rec("…the definition IS written, because vanilla's no longer loads",
        (r.b.imported || []).includes("definition"), r.b.imported);
      rec("…and really lands in the mod file",
        defines(readImported(mod), VANILLA_IDEA), readImported(mod).slice(0, 300));
      rec("…and it is not called a duplicate", !/Duplicate idea/i.test(String(r.b.importNote || "")), r.b.importNote);
    }

    console.log("\n[the copies already on disk] named, not deleted");
    if (haveGame) {
      const mod = mkMod("m5");
      // Exactly the shape the user's mod is in: base-game ids already sitting in the Nova-owned file.
      fs.writeFileSync(importedFile(mod),
        ["ideas = {", "\tcountry = {",
          `\t\t${VANILLA_IDEA} = {`, "\t\t\tmodifier = { war_support_factor = 0.05 }", "\t\t}",
          `\t\t${VANILLA_SPIRIT} = {`, "\t\t\tmodifier = { war_support_factor = 0.05 }", "\t\t}",
          "\t}", "}", ""].join("\n"), "utf8");
      const r = await doImport(api, mod, "nua_invented_spirit", path.join(ROOT, "srcmod"));
      rec("the import succeeds", r.s === 200 && r.b.ok, r.b);
      rec("…and both existing duplicates are reported",
        (r.b.duplicateOfBaseGame || []).includes(VANILLA_IDEA) &&
        (r.b.duplicateOfBaseGame || []).includes(VANILLA_SPIRIT), r.b.duplicateOfBaseGame);
      rec("…the note says the game reports them as duplicate",
        /duplicate/i.test(String(r.b.importNote || "")), r.b.importNote);
      // Deleting them is not ours to decide: one may carry edits, and which definition the game keeps is
      // load-order dependent, so a silent delete could throw away the only copy the user cares about.
      const after = readImported(mod);
      rec("…and NEITHER is deleted",
        defines(after, VANILLA_IDEA) && defines(after, VANILLA_SPIRIT), after.slice(0, 500));
    }
    api.stop(); api = null;

    console.log("\n[the client] the page must show the reason, not just 'definition-skipped'");
    {
      const A = fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8");
      const HTML = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");
      rec("app.js reads importNote", /payload\.importNote/.test(A), "never read");
      rec("…and surfaces it", /payload\.importNote[\s\S]{0,120}?nbAlert/.test(A), "read but not shown");
      // nbAlert is defined in ai-field-assist.js. On a page that does not load it the call would throw into
      // a catch and the message would be lost — which is what happened on the Military page.
      rec("…via a helper this page really loads", /ai-field-assist\.js/.test(HTML), "nbAlert is not available here");
      rec("the import toggle still defaults to on",
        /ideaPickerImportToggleEl\.checked = true/.test(A), "default changed — check this is intended");
    }

    console.log("\n[back-out] stop looking at the base game");
    if (haveGame) {
      const built = controlApp("nobase", [[
        "      if (!blockMap.has(ideaId) && !definedElsewhere && !alreadyLoadsFromBase) {",
        "      if (!blockMap.has(ideaId) && !definedElsewhere) {"]]);
      if (built.error) rec("the control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        const cmod = mkMod("ctl");
        try {
          const c = await doImport(capi, cmod, VANILLA_IDEA);
          rec("…and a second definition of a vanilla idea is written",
            c.s === 200 && c.b.ok && defines(readImported(cmod), VANILLA_IDEA), readImported(cmod).slice(0, 300));
        } finally { capi.stop(); }
      }
    }

    console.log(`\n=== idea import base-game duplicate: ${checks} checks, ${fails.length} failed ===`);
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
