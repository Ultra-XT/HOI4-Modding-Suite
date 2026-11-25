// #vanilla-focus-load-clears-active-mod — STUDYING VANILLA'S TREE CHANGED WHICH MOD YOU WERE EDITING.
//
// /api/load takes any .txt on disk, so the Focus editor's Load button opens vanilla's trees as readily as
// the mod's — looking at how Paradox built a branch is one of the most ordinary things a modder does.
//
// The endpoint then calls setActiveRoot(detectModRootFromFocusPath(targetPath)). That detector deliberately
// returns null for a vanilla path — its own comment reads "Let it fall back to activeRoot or ROOT". But
// setActiveRoot(null) does not fall back to activeRoot. It resolves `rootPath || ROOT`, and ROOT is
// path.resolve(__dirname, "..", "..") — the directory two levels ABOVE Nova's own folder. On this machine
// that is the bare drive root.
//
// So the intent written in the code and the behaviour of the code disagreed, and every endpoint that falls
// back to the process-wide active mod — 228 getActiveRoot() call sites — began resolving against a
// directory that is not a mod, for the rest of the session.
//
// ⭐ THE ACTIVE ROOT IS OBSERVED BY ITS EFFECT. getActiveRoot() is not exported, and the endpoints that
// take a modPath fallback are mostly writers, which are not safe to poke for a reading. /api/events/list
// falls back to it and only reads, so a marker event that only the fixture mod owns answers the question.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-loadroot-"));
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
function makeMod(slug, marker) {
  const dir = path.join(ROOT, slug);
  fs.mkdirSync(path.join(dir, "common", "national_focus"), { recursive: true });
  fs.mkdirSync(path.join(dir, "events"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), `name="${slug}"\nsupported_version="1.19.*"\n`);
  fs.writeFileSync(path.join(ROOT, `${slug}.mod`), `name="${slug}"\npath="${toPosix(dir)}"\nsupported_version="1.19.*"\n`);
  const tree = path.join(dir, "common", "national_focus", `${slug}_tree.txt`);
  fs.writeFileSync(tree,
    `focus_tree = {\n\tid = ${slug}_tree\n\tcountry = { factor = 1 }\n\tfocus = {\n\t\tid = ${slug}_focus\n\t\tx = 0\n\t\ty = 0\n\t\tcost = 10\n\t}\n}\n`);
  fs.writeFileSync(path.join(dir, "events", "marker.txt"),
    `add_namespace = ${marker}\n\ncountry_event = {\n\tid = ${marker}.1\n\ttitle = ${marker}.1.t\n\tdesc = ${marker}.1.d\n\tis_triggered_only = yes\n\toption = { name = ${marker}.1.a }\n}\n`);
  return { dir, tree, marker };
}
const A = makeMod("modalpha", "nova_alpha_ns");
const B = makeMod("modbravo", "nova_bravo_ns");

const VANILLA_FOCUS = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/common/national_focus";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PORT = 53237;
(async () => {
  let srv = null;
  try {
    const SV = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");

    console.log("\n[the rule, in source] a detector that returns null must not be treated as a root");
    {
      rec("setActiveRoot refuses an empty root instead of resolving it to ROOT",
        /if \(!rootPath \|\| !String\(rootPath\)\.trim\(\)\) return false;/.test(SV),
        "setActiveRoot still resolves a falsy argument");
      rec("…and the focus load says why it may get nothing back",
        /returns null for a VANILLA tree/.test(SV), "the reason is not written down");
    }

    if (!fs.existsSync(VANILLA_FOCUS)) {
      console.log("\n[behaviour] SKIPPED — Hearts of Iron IV is not installed at the expected path");
      rec("the vanilla probe is skipped only because the game is absent", true, "skipped");
    } else {
      const vanillaTree = path.join(VANILLA_FOCUS, "argentina.txt");
      rec("a vanilla focus tree is present to browse", fs.existsSync(vanillaTree), vanillaTree);

      srv = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
      const post = (u, b) => fetch(`http://127.0.0.1:${PORT}${u}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b),
      }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })).catch((e) => ({ status: 0, body: { error: String(e) } }));
      const get = (u) => fetch(`http://127.0.0.1:${PORT}${u}`).then((r) => r.json()).catch((e) => ({ error: String(e) }));

      // ⚠️ /api/load rate-limits to one call per 120ms per client and answers 429 otherwise — a 429 would
      // make every "the root did not move" check pass without the endpoint ever running.
      const load = async (p) => {
        await sleep(200);
        const r = await post("/api/load", { path: p });
        return r;
      };
      const marks = async () => {
        const j = await get("/api/events/list");
        const txt = JSON.stringify(j || {});
        return { alpha: txt.includes(A.marker), bravo: txt.includes(B.marker) };
      };

      console.log("\n[CONTROL] opening the mod's own tree points the session at that mod");
      {
        const r = await load(A.tree);
        rec("the mod's own tree loads", r.status === 200, r.body);
        const m = await marks();
        console.log(`     events/list (no modPath): alpha=${m.alpha} bravo=${m.bravo}`);
        // ⚠️ Without this the whole test could pass against a session that never saw either mod.
        rec("the session sees the mod it just opened", m.alpha && !m.bravo, m);
      }

      console.log("\n[THE BUG] browsing one of vanilla's trees must not change which mod you are editing");
      {
        const r = await load(vanillaTree);
        rec("the vanilla tree loads", r.status === 200, r.body);
        const m = await marks();
        console.log(`     events/list (no modPath): alpha=${m.alpha} bravo=${m.bravo}`);
        // Before the fix: alpha=false — the active root had become the drive above Nova's own folder.
        rec("the mod is still the active one afterwards", m.alpha, m);
      }

      console.log("\n[CONTROL] …but opening ANOTHER MOD's tree still must repoint the session");
      {
        // ⭐ The fix must not work by disabling the mechanism. If this does not bite, the guard is turning
        // away roots it should accept, and the Load button has stopped following the user between mods.
        const r = await load(B.tree);
        rec("the other mod's tree loads", r.status === 200, r.body);
        const m = await marks();
        console.log(`     events/list (no modPath): alpha=${m.alpha} bravo=${m.bravo}`);
        rec("the session followed the user to the other mod", m.bravo && !m.alpha, m);
      }

      console.log("\n[and back again] returning to vanilla must leave the second mod in place");
      {
        await load(vanillaTree);
        const m = await marks();
        console.log(`     events/list (no modPath): alpha=${m.alpha} bravo=${m.bravo}`);
        rec("the second mod survives a vanilla browse too", m.bravo, m);
      }
    }

    if (srv) { srv.closeAllConnections(); srv.close(); srv = null; }
    console.log(`\n=== vanilla load keeps active mod: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
