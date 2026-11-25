// #newspaper-remove-always-claims-success — "Remove override" said it worked when it had removed nothing.
//
// Events > Newspaper Style writes a handful of files into the mod. Removing the override unlinked each of
// them inside an empty catch and then answered { ok: true, removed: true } unconditionally. If any unlink
// failed — a file held open by an image editor, an antivirus scanner, a permissions problem on the mod
// folder — Nova reported success, the picker redrew as "no override", and the player still saw the old
// newspaper in game. The one place the truth was available, Nova threw away.
//
// The fix measures the OUTCOME rather than the attempt: whatever is still on disk afterwards is exactly what
// the game will load, and asking that question is true whether or not the unlink threw.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-newsprm-"));
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

const toPosix = (p) => p.split(path.sep).join("/");
const MOD = path.join(ROOT, "newsmod");
fs.mkdirSync(path.join(MOD, "interface"), { recursive: true });
fs.mkdirSync(path.join(MOD, "gfx", "interface"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="NewsMod"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "newsmod.mod"), 'name="NewsMod"\npath="' + toPosix(MOD) + '"\nsupported_version="1.19.*"\n');

const BG = path.join(MOD, "gfx", "interface", "nova_event_news_bg.dds");
const GFX = path.join(MOD, "interface", "nova_newspaper.gfx");
const BG_REL = "gfx/interface/nova_event_news_bg.dds";

const PORT = 53241;
(async () => {
  let srv = null;
  try {
    const SV = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");

    console.log("\n[the rule, in source] the answer must come from disk, not from the attempt");
    {
      rec("the remove path collects what is still there afterwards",
        /leftovers\.push\(path\.relative\(modRoot, f\)/.test(SV), "nothing is measured after the unlink");
      rec("…and restoreEventGui reports what it could not undo",
        /return leftovers;/.test(SV) && /function restoreEventGui\(modRoot, p\) \{[\s\S]{0,2600}?return leftovers;/.test(SV),
        "restoreEventGui still returns nothing");
      rec("…and success is no longer unconditional",
        !/restoreEventGui\(modRoot, p\);\s*\n\s*dropModSpriteCache\(modRoot\);\s*\n\s*return res\.json\(\{ ok: true, removed: true \}\);/.test(SV),
        "the old unconditional return is still there");
    }

    srv = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
    const post = (u, b) => fetch(`http://127.0.0.1:${PORT}${u}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })).catch((e) => ({ status: 0, body: { error: String(e) } }));

    const apply = (source) => post("/api/events/apply-newspaper-style", { modPath: MOD, source });

    console.log("\n[fixture] apply a style so there is something to remove");
    {
      const r = await apply("vanilla");
      console.log(`     apply -> ${r.status} ${r.body && r.body.error ? r.body.error : "ok"}`);
      // ⚠️ If the apply does not land, the remove has nothing to fail at and both cases below pass emptily.
      rec("the style applied", r.status < 400 && r.body && !r.body.error, r.body);
      rec("…and wrote the newspaper background into the mod", fs.existsSync(BG), BG);
      rec("…and its sprite declaration", fs.existsSync(GFX), GFX);
    }

    console.log("\n[CONTROL] an ordinary removal must still report success — and be true");
    {
      const r = await apply("remove");
      console.log(`     remove -> ${r.status} ok=${r.body && r.body.ok} removed=${r.body && r.body.removed}`);
      rec("a clean removal reports success", r.body && r.body.ok === true && r.body.removed === true, r.body);
      // ⭐ The claim has to be checked against disk, or the test only re-asserts the bug in reverse.
      rec("…and the files really are gone", !fs.existsSync(BG) && !fs.existsSync(GFX),
        { bg: fs.existsSync(BG), gfx: fs.existsSync(GFX) });
    }

    console.log("\n[THE BUG] a removal that cannot remove must not claim it did");
    {
      const r0 = await apply("vanilla");
      rec("the style applied again", r0.status < 400 && fs.existsSync(BG), r0.body);

      // Put something at that path that unlink cannot take away. On Windows fs.unlinkSync opens with
      // FILE_SHARE_DELETE, so neither the read-only attribute nor an open handle stops it — a directory
      // does, with EPERM, which is the same shape as the permission failures this is really about.
      fs.unlinkSync(BG);
      fs.mkdirSync(BG);
      rec("the fixture blocks the unlink", fs.existsSync(BG) && (() => {
        try { fs.unlinkSync(BG); return false; } catch (_) { return true; }
      })(), "unlink was not blocked, so this case proves nothing");

      const r = await apply("remove");
      console.log(`     remove -> ok=${r.body && r.body.ok} removed=${r.body && r.body.removed}`);
      console.log(`     leftovers: ${JSON.stringify((r.body && r.body.leftovers) || [])}`);
      console.log(`     error: ${JSON.stringify(String((r.body && r.body.error) || "").slice(0, 140))}`);
      // Before the fix: ok:true, removed:true, no leftovers — while the file sat there untouched.
      rec("it does not claim to have removed the override", !(r.body && r.body.removed === true), r.body);
      rec("…it reports failure the client already surfaces (d.error)", !!(r.body && r.body.error), r.body);
      // Derived: the name it reports must be the file that is actually still on disk.
      rec("…and names the file that is still there",
        Array.isArray(r.body && r.body.leftovers) && r.body.leftovers.includes(BG_REL),
        (r.body && r.body.leftovers) || null);
      rec("…and the blocked file is indeed still on disk", fs.existsSync(BG), "gone after all");

      try { fs.rmdirSync(BG); } catch (_) {}
    }

    console.log("\n[after the obstruction clears] a retry must succeed");
    {
      const r = await apply("remove");
      console.log(`     remove -> ok=${r.body && r.body.ok} removed=${r.body && r.body.removed}`);
      rec("the retry reports success", r.body && r.body.removed === true, r.body);
      rec("…and nothing is left", !fs.existsSync(BG) && !fs.existsSync(GFX),
        { bg: fs.existsSync(BG), gfx: fs.existsSync(GFX) });
    }

    srv.closeAllConnections(); srv.close(); srv = null;
    console.log(`\n=== newspaper remove reports truthfully: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
