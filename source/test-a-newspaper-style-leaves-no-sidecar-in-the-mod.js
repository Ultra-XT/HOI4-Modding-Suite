// Applying a newspaper style leaves no Nova sidecar inside the mod — and the one a legacy Nova left is still read.
// #a-newspaper-style-leaves-no-sidecar-in-the-mod
//
// interface/eventwindow.gui + NOVA_EVENTGUI_ORIG_SUFFIX (".nova-orig") is the last Nova-written sidecar shaped
// like the 26 in-mod `.bak` copies batch 12 removed — a file that would ship to the Workshop with the mod. It is
// NOT one of them, and this test pins the measurement that says so (2026-09-16):
//
//   * NOTHING WRITES IT ANY MORE. The writer — `if (ownExists && !ownIsNova) fs.copyFileSync(own, origBak)` —
//     went in commit b713d3f ("newspaper feature no longer rewrites the mod's own eventwindow.gui"), which made
//     the feature non-destructive: the stripped window goes into a separate Nova-owned zz_nova_eventwindow.gui
//     and the mod's own file is never touched, so there is nothing left to back up. Every one of the six
//     remaining references in server.js reads it, copies FROM it, or unlinks it.
//   * NONE EXISTS. Zero `*.nova-orig` files across the owner's whole mod folder and all 15 installed workshop
//     mods.
//   * IT IS STILL READ, by four paths: buildStrippedEventGui and restoreEventGui restore the mod's real file
//     from it, dependencyEventGuiPath and resolveEffectiveEventGuiPath read it as a base mod's true layout.
//
// So it is not a stray copy to be moved out to Nova's own folder like the .bak backups were: for a mod damaged
// by a pre-July Nova it is THE ONLY COPY of the modder's own event window, and it sits beside the file it
// restores. A reader pointed at AppData would find nothing, and buildStrippedEventGui would then take its other
// branch and DELETE the mod's Nova-marked gui outright — losing the layout for good. Hence: left where it is,
// and guarded here instead, so that "Nova writes no sidecar into a mod" cannot quietly stop being true.
//
// Requests are the page's (public/events.js): POST /api/events/apply-newspaper-style { modPath, source }.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-npsidecar-"));
process.env.HOI4_MODS_ROOT = ROOT;
process.env.APPDATA = path.join(ROOT, "appdata");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
const { createApp } = require("./server.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail === undefined ? "" : "   -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500)));
  if (!ok) fails.push(label);
};

// DERIVED FROM SOURCE, not typed: the marker an old Nova stamped on its copy, and the sidecar's suffix.
const SRC = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
const MARKER = (/const NOVA_EVENTGUI_MARKER = "([^"]+)"/.exec(SRC) || [])[1];
const SUFFIX = (/const NOVA_EVENTGUI_ORIG_SUFFIX = "([^"]+)"/.exec(SRC) || [])[1];

/** Every file under `dir` whose name ends with the sidecar suffix. */
const sidecarsUnder = (dir, suffix) => {
  const out = [];
  const walk = (d) => {
    let e = [];
    try { e = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const x of e) {
      const p = path.join(d, x.name);
      if (x.isDirectory()) walk(p);
      else if (suffix && x.name.toLowerCase().endsWith(suffix.toLowerCase())) out.push(path.relative(dir, p).split(path.sep).join("/"));
    }
  };
  walk(dir);
  return out;
};
const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null);
const mkMod = (name, files) => {
  const dir = path.join(ROOT, name);
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(dir, ...rel.split("/"));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  }
  fs.writeFileSync(path.join(dir, "descriptor.mod"), `name="${name}"\nsupported_version="1.19.*"\n`);
  return dir;
};

const OWN_LAYOUT = '# MOD-OWN-LAYOUT\nguiTypes = {\n\tcontainerWindowType = {\n\t\tname = "EventWindow"\n\t\tsize = { width = 581 height = 427 }\n\t\tbuttonType = { name = "btn_minimize" spriteType = "GFX_event_button_minimize" position = { x = 10 y = 45 } }\n\t}\n}\n';

(async () => {
  let server = null;
  try {
    rec("the marker and the sidecar suffix are readable out of server.js", !!MARKER && !!SUFFIX, { MARKER, SUFFIX });

    server = await new Promise((resolve, reject) => { const s = createApp().listen(0, () => resolve(s)); s.on("error", reject); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = (body) => fetch(base + "/api/events/apply-newspaper-style", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));

    // A source mod that ships the newspaper art and no event window of its own (so it inherits vanilla's, which
    // draws GFX_event_news_bg — the condition usesNewspaperBackground checks). Nothing here needs the game.
    const src = mkMod("sidecar-source", { "gfx/interface/event_news_bg.dds": Buffer.from("DDS fixture bytes") });

    console.log("1. ⭐⭐ Applying a style writes Nova's own override — and no sidecar into the mod");
    {
      const mod = mkMod("sidecar-target", { "interface/eventwindow.gui": OWN_LAYOUT });
      const own = path.join(mod, "interface", "eventwindow.gui");
      const nova = path.join(mod, "interface", "zz_nova_eventwindow.gui");
      const before = read(own);
      const r = await post({ modPath: mod, source: "mod:" + src });
      rec("apply succeeds", r.status === 200 && r.body.ok === true, r.body);
      rec("POSITIVE CONTROL: it really wrote Nova's separate window override", fs.existsSync(nova) && (read(nova) || "").startsWith(MARKER), fs.existsSync(nova));
      rec("⭐⭐ the mod's own eventwindow.gui is byte-identical", read(own) === before, { changed: read(own) !== before });
      rec("⭐⭐⭐ no sidecar file was written anywhere in the mod", sidecarsUnder(mod, SUFFIX).length === 0, sidecarsUnder(mod, SUFFIX));

      console.log("   …and removing the style takes only Nova's own files back out");
      const rm = await post({ modPath: mod, source: "remove" });
      rec("remove succeeds", rm.status === 200 && rm.body.removed === true, rm.body);
      rec("Nova's override is gone", !fs.existsSync(nova));
      rec("the mod's own eventwindow.gui is still byte-identical", read(own) === before);
      rec("still no sidecar in the mod", sidecarsUnder(mod, SUFFIX).length === 0, sidecarsUnder(mod, SUFFIX));
    }

    console.log("\n2. ⛔ A sidecar a PRE-b713d3f Nova left behind is still the modder's only copy — and is restored");
    {
      const mod = mkMod("sidecar-legacy", {
        // What an old Nova left: its own stripped copy in the mod's own file, the real layout beside it.
        "interface/eventwindow.gui": MARKER + " (legacy in-place copy)\n" + OWN_LAYOUT.replace(/\tbuttonType[^\n]*\n/, ""),
        ["interface/eventwindow.gui" + SUFFIX]: OWN_LAYOUT,
      });
      const own = path.join(mod, "interface", "eventwindow.gui");
      const bak = own + SUFFIX;
      rec("POSITIVE CONTROL: the fixture really is the legacy shape", (read(own) || "").startsWith(MARKER) && read(bak) === OWN_LAYOUT);
      const rm = await post({ modPath: mod, source: "remove" });
      rec("remove succeeds", rm.status === 200 && rm.body.removed === true, rm.body);
      rec("⛔ the modder's own layout is restored from the sidecar, byte for byte", read(own) === OWN_LAYOUT, (read(own) || "").slice(0, 80));
      rec("⛔ …and the sidecar is consumed, not left to ship with the mod", !fs.existsSync(bak));
      rec("nothing sidecar-shaped is left in the mod", sidecarsUnder(mod, SUFFIX).length === 0, sidecarsUnder(mod, SUFFIX));
    }

    console.log("\n3. CONTROL: the \"no sidecar\" scan can find one");
    {
      const planted = mkMod("sidecar-control", { ["interface/eventwindow.gui" + SUFFIX]: "planted" });
      rec("a planted sidecar is reported by the same scan", sidecarsUnder(planted, SUFFIX).length === 1, sidecarsUnder(planted, SUFFIX));
    }
  } catch (e) {
    rec("the run finished without throwing", false, String((e && e.stack) || e));
  } finally {
    if (server) { try { server.closeAllConnections(); } catch (_) {} await new Promise((r) => server.close(r)); }
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {} // only the mkdtemp fixture this file made
  }

  // process.exitCode, not process.exit: exiting while the closed server's handle is still settling trips a
  // libuv assertion ("!(handle->flags & UV_HANDLE_CLOSING)") and the run reports 127 instead of 1. Measured
  // on the failing back-out run of this very test. test-newspaper-style.js next door already does it this way.
  console.log(`\n${checks - fails.length}/${checks} checks passed`);
  if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exitCode = 1; }
})();
