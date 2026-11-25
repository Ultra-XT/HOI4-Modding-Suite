// #windows-hostile-filename — names Windows treats specially must not produce a save that reports success and
// then leaves nothing on disk.
//
// Three of them, all reachable from a plain text box in the editor:
//
//  - a TRAILING DOT or SPACE: Windows drops it when creating the file, so "my_ideas.txt." becomes
//    "my_ideas.txt" on disk while Nova goes on believing the name it was handed. Every later read, rename and
//    delete then looks for a file that does not exist under that name.
//  - NO EXTENSION: HOI4 does not load it and Nova's own scanners filter on .txt, so the save succeeds and the
//    content disappears from the editor AND from the game.
//  - a RESERVED DEVICE NAME (CON, PRN, NUL, COM1…): opening one does not create a file at all, the handle goes
//    to the device, so the write goes nowhere.
//
// A colon is the fourth: on NTFS it opens an alternate data stream, so "names:english.yml" writes a hidden
// stream on a file called "names". The .yml extension check does not catch it, because extname() of that
// string is ".yml".
//
// Hermetic: fake mod under tmpdir.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-winname-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300));
  }
}

const MOD = path.join(ROOT, "winmod");
const CHAR_DIR = path.join(MOD, "common", "characters");
fs.mkdirSync(CHAR_DIR, { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="WinMod"\nsupported_version="1.18.*"\n', "utf8");

const PORT = 42167;
const app = createApp();
const server = app.listen(PORT, async () => {
  const saveChar = async (file, token) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/characters/save`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modPath: MOD, file, token, name: token, countryTag: "GER",
        roleLeader: true, leaderIdeology: "despotism",
      }),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  // Every .txt actually present in common/characters.
  const files = () => { try { return fs.readdirSync(CHAR_DIR); } catch (_) { return []; } };
  // Is this token readable back through the endpoint the editor loads with?
  const listed = async (token) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/characters/list?modPath=${encodeURIComponent(MOD)}`);
    const b = await r.json().catch(() => null);
    const all = [].concat(...(((b && b.files) || []).map((f) => f.characters || [])));
    return all.some((c) => c && c.token === token);
  };

  try {
    // ── CONTROL FIRST: an ordinary name must behave exactly as before ────────────────────────────
    console.log("\n[control] an ordinary file name");
    const okSave = await saveChar("my_people.txt", "NOVA_ok");
    rec("the save succeeded", okSave.status === 200 && okSave.body && okSave.body.ok !== false, okSave.body || okSave.status);
    rec("the file was created under that exact name", files().includes("my_people.txt"), files());
    rec("…and the character reads back", await listed("NOVA_ok"), files());

    // ── TRAILING DOT ─────────────────────────────────────────────────────────────────────────────
    console.log("\n[trailing dot] Windows drops it when creating the file");
    const dot = await saveChar("dotted.txt.", "NOVA_dot");
    rec("the save reported a result", dot.status === 200 || !!(dot.body && dot.body.error), dot.body || dot.status);
    rec("no file was left with a trailing dot in its name",
      !files().some((f) => /[ .]$/.test(f)), files());
    if (dot.body && dot.body.ok) {
      rec("…and whatever was saved reads back", await listed("NOVA_dot"), files());
    }

    // ── NO EXTENSION ─────────────────────────────────────────────────────────────────────────────
    console.log("\n[no extension] HOI4 will not load it and Nova's scanners skip it");
    const noExt = await saveChar("extensionless", "NOVA_noext");
    rec("the save reported a result", noExt.status === 200 || !!(noExt.body && noExt.body.error), noExt.body || noExt.status);
    rec("nothing was written without a .txt extension",
      !files().some((f) => !/\.txt$/i.test(f)), files());
    if (noExt.body && noExt.body.ok) {
      rec("…and the character reads back through the editor", await listed("NOVA_noext"), files());
    }

    // ── RESERVED DEVICE NAME ─────────────────────────────────────────────────────────────────────
    console.log("\n[reserved name] CON is a device, not a file");
    const con = await saveChar("CON.txt", "NOVA_con");
    rec("the save reported a result", con.status === 200 || !!(con.body && con.body.error), con.body || con.status);
    rec("no file named CON.txt was attempted",
      !files().some((f) => /^con\.txt$/i.test(f)), files());
    if (con.body && con.body.ok) {
      rec("…and the character reads back through the editor", await listed("NOVA_con"), files());
    }

    // ── COLON: an NTFS alternate data stream ─────────────────────────────────────────────────────
    console.log("\n[colon] a colon opens an alternate data stream on NTFS");
    const r = await fetch(`http://127.0.0.1:${PORT}/api/localization/create`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modPath: MOD, path: "localisation/english/names:english.yml", language: "english" }),
    });
    const body = await r.json().catch(() => null);
    rec("the colon path was refused", !(body && body.ok === true), body || r.status);
    const locFiles = fs.readdirSync(path.join(MOD, "localisation", "english"));
    rec("…and no stray stream host file was created",
      !locFiles.some((f) => f === "names" || f.includes(":")), locFiles);

    console.log(`\n=== windows-hostile filenames: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) {
      fails.forEach((f) => console.log("   FAILED: " + f));
      process.exitCode = 1;
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 6).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
server.on("error", (e) => {
  console.error("listen error:", e.message);
  process.exitCode = 1;
});
