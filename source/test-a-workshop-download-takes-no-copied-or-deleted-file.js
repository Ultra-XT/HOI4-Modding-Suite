// A Steam Workshop download takes no file from a route that writes without safeModWrite either: the mod-root gate refuses it too.
// ⛔ #nova-wrote-into-a-workshop-download (B2-20, B0-4) — review of group s's 8f4500a3
//
// THE GAP. 8f4500a3 put the Workshop refusal into assertModWritablePath, the gate safeModWrite asks before every write. But the
// comment at checkActiveRootNotGameRoot says ~100 write routes also write WITHOUT safeModWrite ("a .dds copied in, an asset upload"),
// which that gate never sees — and B0-4's own evidence is one of them: Rise of Nations' Workshop item held three nova_event_*.dds
// files that 🗞 Apply newspaper style copied in with fs.copyFileSync (2026-09-23), weeks before its .gfx and .gui landed. Measured at
// the branch tip ff6c5a99 with a decoy Workshop item: POST /api/events/apply-newspaper-style { modPath, source: "vanilla" } (the body
// public/events.js applyNewspaperStyle sends) answered 400 with the Workshop sentence — and the item held three new .dds files; and
// { source: "remove" } deleted the files an earlier visit had left in it. So the mod-root gate refuses a Workshop download as well,
// before "Allow editing vanilla game files" is asked (that setting is about the game's folder, not an author's mod), as
// #two-documents-folders put its copy check into both gates. The world run keeps its own refusal code and words.
//
// …AND THE FLAG IMPORT, WHICH ASKS NEITHER GATE. POST /api/flags/import-custom-image writes its .tga files with fs.promises.writeFile,
// asks only assertPathNotInGameRoot, and resolveAllowedModDirectory lets a Workshop folder in (for reading): aimed at a Workshop item
// it wrote fifteen .tga files into it (three sizes of five names) and deleted the author's same-stem .png flag. It refuses a Workshop download too now.
//
// …AND THE EVENTS PAGE'S OWN GET. GET /api/events/newspaper-styles?modPath= "heals" an event window an older Nova left (buildStrippedEventGui):
// it copies the .nova-orig back over the mod's eventwindow.gui and deletes the .nova-orig with raw fs calls, before safeModWrite is asked
// for the override. On a Workshop download that restored and deleted the author's files just by opening the page. It heals nothing there now.
"use strict";

const fs = require("fs");
const path = require("path");
const lib = require("./testlib-two-layer-map.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900)));
  if (!ok) fails.push(label);
};

// The world and the decoy Workshop exist BEFORE server.js is required: it decides its roots while it loads.
const world = lib.makeWorld("ws-copied-in");
const WS = path.join(world.ROOT, "steam", "steamapps", "workshop", "content", "394360");
fs.mkdirSync(WS, { recursive: true });
process.env.HOI4_WORKSHOP_ROOT = WS;
const DDS = (tag) => Buffer.concat([Buffer.from("DDS "), Buffer.alloc(124, 0), Buffer.from(tag)]);
// the base game's newspaper, which source "vanilla" copies from
for (const n of ["event_news_bg.dds", "event_option_entry.dds", "event_button_minimize.dds"]) {
  const f = path.join(world.GAME, "gfx", "interface", n);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, DDS("vanilla " + n));
}
// a Workshop item an earlier visit already left Nova's newspaper files in (Rise of Nations' shape), beside the author's own art
const ITEM = path.join(WS, "2624254320");
lib.write(ITEM, {
  "descriptor.mod": 'name="A Workshop Mod"\nsupported_version="1.*"\n',
  "history/states/1-A.txt": lib.st(1, "4"),
  "interface/nova_newspaper.gfx": "spriteTypes = {\n}\n",
});
for (const [n, tag] of [["event_news_bg.dds", "the author's own art"], ["nova_event_news_bg.dds", "an earlier visit"]]) {
  const f = path.join(ITEM, "gfx", "interface", n);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, DDS(tag));
}
const OWN = world.mod("My Own Mod", { "history/states/1-A.txt": lib.st(1, "4") });
// …and the author's own flag beside it: the flag import takes out a same-stem .png when it writes its .tga files
fs.mkdirSync(path.join(ITEM, "gfx", "flags"), { recursive: true });
fs.writeFileSync(path.join(ITEM, "gfx", "flags", "TST.png"), Buffer.from("\x89PNG the author's own flag"));
// a 4x2 uncompressed true-colour TGA (type 2, 24 bpp, top-left origin): what the flag import accepts as its source
const TGA = path.join(world.ROOT, "source-flag.tga");
{
  const w = 4, h = 2, head = Buffer.alloc(18, 0);
  head[2] = 2; head.writeUInt16LE(w, 12); head.writeUInt16LE(h, 14); head[16] = 24; head[17] = 0x20;
  const px = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) { px[i * 3] = 40; px[i * 3 + 1] = 120; px[i * 3 + 2] = 200; }
  fs.writeFileSync(TGA, Buffer.concat([head, px]));
}

// a second Workshop item an OLDER Nova left its legacy event window in: the override with the button deleted, and the item's own
// eventwindow.gui rewritten in place by Nova, the author's file kept beside it as .nova-orig. Opening the Events page asks GET
// /api/events/newspaper-styles?modPath=, which "heals" exactly this shape — with a raw copy over the item's file and a delete.
const MARK = "# Nova-managed event window";
const LEGACY = {
  "descriptor.mod": 'name="Another Workshop Mod"\nsupported_version="1.*"\n',
  "interface/zz_nova_eventwindow.gui": `${MARK}\nguiTypes = {\n\tcontainerWindowType = {\n\t\tname = "top_Window"\n\t}\n}\n`,
  "interface/eventwindow.gui": `${MARK}\nguiTypes = {\n\tcontainerWindowType = {\n\t\tname = "top_Window"\n\t}\n}\n`,
  "interface/eventwindow.gui.nova-orig": `guiTypes = {\n\tcontainerWindowType = {\n\t\tname = "top_Window"\n\t\t# the author's own event window\n\t\tbuttonType = { name = "btn_minimize" }\n\t}\n}\n`,
};
const ITEM2 = path.join(WS, "2000000002");
lib.write(ITEM2, LEGACY);
const OWN2 = world.mod("My Own Mod Two", LEGACY);

const { createApp } = require("./server.js");
const SERVER = maskJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));
const bodyOf = (src, sig) => {
  const at = src.indexOf(sig);
  if (at < 0) return "";
  let d = 0;
  for (let i = src.indexOf("{", at); i < src.length; i++) {
    if (src[i] === "{") d++;
    else if (src[i] === "}") { d--; if (d === 0) return src.slice(at, i + 1); }
  }
  return "";
};
const SENTENCE = /Steam Workshop download/;

(async () => {
  let srv = null;
  try {
    console.log("0. The mod-root gate, as the source has it");
    const gate = bodyOf(SERVER, "function checkActiveRootNotGameRoot(");
    const ask = gate.indexOf("assertNotAWorkshopDownload(activeRoot);"), allow = gate.indexOf("if (allowVanillaEdits) return;");
    rec("⭐⭐ checkActiveRootNotGameRoot asks assertNotAWorkshopDownload of the mod it is given", ask !== -1, gate.slice(0, 300));
    rec("⭐ …before \"Allow editing vanilla game files\" can return early", ask !== -1 && allow !== -1 && ask < allow, { ask, allow });

    srv = await lib.startServer(createApp);
    // events.js applyNewspaperStyle: JSON.stringify({ modPath: getModPath(), source })
    const apply = (modPath, source) => srv.post("/api/events/apply-newspaper-style", { source }, modPath);

    console.log("\n1. ⛔ 🗞 Apply newspaper style, aimed at the Workshop download");
    const before = lib.tree(ITEM);
    const a = await apply(ITEM, "vanilla");
    rec("⭐⭐⭐ it is refused, in the Workshop sentence", a.status === 400 && SENTENCE.test(String(a.body.error || "")), a);
    rec("⭐⭐⭐ …and no .dds was copied in, nor any other file written: the item is byte for byte as it was",
      lib.written(before, lib.tree(ITEM)).length === 0, lib.written(before, lib.tree(ITEM)));
    const r = await apply(ITEM, "remove");
    rec("⭐⭐⭐ its Remove is refused too", r.status === 400 && SENTENCE.test(String(r.body.error || "")) && r.body.removed !== true, r);
    rec("⭐⭐⭐ …and the files an earlier visit left there are still there: Nova deletes nothing in a Workshop download",
      lib.written(before, lib.tree(ITEM)).length === 0 && fs.existsSync(path.join(ITEM, "gfx", "interface", "nova_event_news_bg.dds")), lib.written(before, lib.tree(ITEM)));

    console.log("\n2. ⛔ \"Allow editing vanilla game files\" does not open a Workshop download");
    const on = await srv.post("/api/settings/allow-vanilla-edits", { allowed: true });
    rec("(the setting is on)", on.status === 200 && on.body.allowed === true, on);
    const a2 = await apply(ITEM, "vanilla");
    rec("⭐⭐ the apply is still refused", a2.status === 400 && SENTENCE.test(String(a2.body.error || "")), a2);
    rec("⭐⭐ …and still nothing was written", lib.written(before, lib.tree(ITEM)).length === 0, lib.written(before, lib.tree(ITEM)));
    const off = await srv.post("/api/settings/allow-vanilla-edits", { allowed: false });
    rec("(the setting is off again)", off.status === 200 && off.body.allowed === false, off);

    console.log("\n3. The world run keeps its own refusal");
    const w = await srv.post("/api/map/prepare-world", { dryRun: true }, ITEM);   // map.js: { modPath: modPath(), dryRun: true }
    rec("⭐ 🌍 Generate a world still answers refused \"workshop\", in its own words", w.status === 400 && w.body.refused === "workshop" && /This mod is a Steam Workshop download/.test(String(w.body.error || "")), w);
    const wOwn = await srv.post("/api/map/prepare-world", { dryRun: true }, OWN);
    rec("CONTROL: …and does not say so of the modder's own mod", wOwn.body.refused !== "workshop", wOwn);

    console.log("\n4. THE CONTROL: the modder's own mod");
    const c = await apply(OWN, "vanilla");
    const copied = path.join(OWN, "gfx", "interface", "nova_event_news_bg.dds");
    rec("⭐⭐⭐ the same apply on the modder's own mod goes through and copies the newspaper in",
      c.status === 200 && c.body.ok === true && fs.existsSync(copied) && fs.readFileSync(copied).equals(DDS("vanilla event_news_bg.dds")), c);
    const cr = await apply(OWN, "remove");
    rec("⭐ …and its Remove takes it out again", cr.status === 200 && cr.body.removed === true && !fs.existsSync(copied), cr);

    console.log("\n5. ⛔ The flag import, which asks neither gate (it writes with fs.promises.writeFile)");
    // public/app.js: JSON.stringify({ stem, sourcePath: importPath, modRoot: getActiveModPath() })
    const flag = (modRoot) => srv.post("/api/flags/import-custom-image", { stem: "TST", sourcePath: TGA, modRoot });
    const fb = lib.tree(ITEM);
    const f = await flag(ITEM);
    rec("⭐⭐⭐ a flag imported into the Workshop download is refused, in the Workshop sentence", f.status === 400 && SENTENCE.test(String(f.body.error || "")), f);
    rec("⭐⭐⭐ …no .tga was written into it, and the author's own TST.png is still there",
      lib.written(fb, lib.tree(ITEM)).length === 0 && fs.existsSync(path.join(ITEM, "gfx", "flags", "TST.png")), lib.written(fb, lib.tree(ITEM)));
    const fo = await flag(OWN);
    rec("THE CONTROL: the same import into the modder's own mod writes its flag", fo.status === 200 && fs.existsSync(path.join(OWN, "gfx", "flags", "TST.tga")), fo);

    console.log("\n6. ⛔ Opening the Events page on a Workshop download heals nothing in it (a GET, gated by no route check)");
    // events.js loadNewspaperStyleDisplay: fetch(`/api/events/newspaper-styles?modPath=${encodeURIComponent(getModPath())}`)
    const styles = (mod) => fetch(`${srv.base}/api/events/newspaper-styles?modPath=${encodeURIComponent(mod)}`).then(async (x) => ({ status: x.status, body: await x.json().catch(() => ({})) }));
    const hb = lib.tree(ITEM2);
    const g = await styles(ITEM2);
    rec("the page's request answers (the styles list)", g.status === 200 && Array.isArray(g.body.styles), g);
    rec("⭐⭐⭐ …and nothing in the Workshop download was restored, deleted or written: it is byte for byte as it was",
      lib.written(hb, lib.tree(ITEM2)).length === 0 && fs.existsSync(path.join(ITEM2, "interface", "eventwindow.gui.nova-orig")), lib.written(hb, lib.tree(ITEM2)));
    rec("⭐ …and it does not claim a heal", g.body.healedEventWindow !== true, g.body);
    const go = await styles(OWN2);
    rec("THE CONTROL: on the modder's own mod the same request heals the legacy window: the author's file is back, the override rewritten",
      go.status === 200 && go.body.healedEventWindow === true && /the author's own event window/.test(fs.readFileSync(path.join(OWN2, "interface", "eventwindow.gui"), "utf8"))
        && !fs.existsSync(path.join(OWN2, "interface", "eventwindow.gui.nova-orig")), go.body);
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 12).join("\n") : e);
    fails.push("harness error");
  } finally {
    if (srv) srv.close();
    world.cleanup();
  }
  console.log(`\n=== a Workshop download takes no copied or deleted file: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  else if (checks < 21) { console.log("   too few checks ran"); process.exitCode = 1; }
})();
