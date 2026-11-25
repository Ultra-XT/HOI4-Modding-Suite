// #half-applied-write — when a file an operation MUST rewrite cannot be written, the operation must refuse
// rather than half-apply and report success.
//
// Renaming or moving a character rewrites two files: the destination gains the character, the source loses it.
// The source write was wrapped in a catch that swallowed any failure, on the reasoning that cleanup should
// never undo a successful save. The result was worse than the thing being avoided: the character defined in
// BOTH files at once, one id claimed twice, which one the game keeps decided by load order — and the save
// reported success, so nothing said so. Moving a technology had the identical shape.
//
// On Windows this is an ordinary failure, not an exotic one: the file is read-only, the game has it open, or
// a cloud-sync client holds it.
//
// Both directions matter. Refusing too eagerly would block ordinary saves, so the control asserts that a
// perfectly writable move still works.
//
// Hermetic: fake mod under tmpdir. Permissions are restored in a finally block so nothing is left locked.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-halfwrite-"));
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

const MOD = path.join(ROOT, "halfmod");
const CHAR_DIR = path.join(MOD, "common", "characters");
const TECH_DIR = path.join(MOD, "common", "technologies");
fs.mkdirSync(CHAR_DIR, { recursive: true });
fs.mkdirSync(TECH_DIR, { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="HalfMod"\nsupported_version="1.18.*"\n', "utf8");

const SRC_CHARS = path.join(CHAR_DIR, "src_chars.txt");
const SRC_TECH = path.join(TECH_DIR, "src_tech.txt");
const locked = [];

function lock(p) { fs.chmodSync(p, 0o444); locked.push(p); }
function unlockAll() {
  for (const p of locked) { try { fs.chmodSync(p, 0o666); } catch (_) {} }
  locked.length = 0;
}

// Count how many times an id is DEFINED across a directory — the whole point is that it must never be two.
function definitionCount(dir, id) {
  let n = 0;
  for (const f of fs.readdirSync(dir).filter((x) => /\.txt$/i.test(x))) {
    const t = fs.readFileSync(path.join(dir, f), "utf8");
    const re = new RegExp(`(?:^|\\n)\\s*${id}\\s*=\\s*\\{`, "g");
    n += (t.match(re) || []).length;
  }
  return n;
}

const PORT = 42155;
const app = createApp();
const server = app.listen(PORT, async () => {
  const post = async (route, body) => {
    const r = await fetch(`http://127.0.0.1:${PORT}${route}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };

  try {
    // ── CONTROL FIRST: an ordinary move must work, or the refusal test proves nothing ────────────
    console.log("\n[control] a move with everything writable still works");
    fs.writeFileSync(SRC_CHARS,
      "characters = {\n\tNOVA_mover = {\n\t\tname = NOVA_mover\n\t\tcountry_leader = { ideology = despotism }\n\t}\n}\n", "utf8");
    const okMove = await post("/api/characters/save", {
      modPath: MOD, file: "dest_chars.txt", previousFile: "src_chars.txt",
      token: "NOVA_mover", name: "Nova Mover", countryTag: "GER",
      roleLeader: true, leaderIdeology: "despotism",
    });
    rec("the move succeeded", okMove.status === 200 && okMove.body && okMove.body.success !== false,
      okMove.body || okMove.status);
    rec("the character is defined exactly once afterwards", definitionCount(CHAR_DIR, "NOVA_mover") === 1,
      definitionCount(CHAR_DIR, "NOVA_mover"));

    // ── CHARACTER: source file locked ────────────────────────────────────────────────────────────
    console.log("\n[character] the source file cannot be written");
    fs.writeFileSync(SRC_CHARS,
      "characters = {\n\tNOVA_stuck = {\n\t\tname = NOVA_stuck\n\t\tcountry_leader = { ideology = despotism }\n\t}\n}\n", "utf8");
    lock(SRC_CHARS);
    const blocked = await post("/api/characters/save", {
      modPath: MOD, file: "dest2_chars.txt", previousFile: "src_chars.txt",
      token: "NOVA_stuck", name: "Nova Stuck", countryTag: "GER",
      roleLeader: true, leaderIdeology: "despotism",
    });
    rec("the save did NOT report success", !(blocked.body && blocked.body.success === true),
      blocked.body || blocked.status);
    rec("…and the error names the unwritable file",
      /src_chars\.txt/.test(String((blocked.body && blocked.body.error) || "")),
      blocked.body);
    rec("the character is NOT defined twice", definitionCount(CHAR_DIR, "NOVA_stuck") === 1,
      definitionCount(CHAR_DIR, "NOVA_stuck"));
    rec("…and it is still in its original file",
      fs.readFileSync(SRC_CHARS, "utf8").includes("NOVA_stuck"), "lost from the source file");
    unlockAll();

    // ── TECHNOLOGY: source file locked ───────────────────────────────────────────────────────────
    console.log("\n[technology] the source file cannot be written");
    fs.writeFileSync(SRC_TECH,
      "technologies = {\n\tnova_stuck_tech = {\n\t\tresearch_cost = 1\n\t\tstart_year = 1936\n\t}\n}\n", "utf8");
    const cat = await fetch(`http://127.0.0.1:${PORT}/api/technologies/catalog?includeVanilla=0&includeActiveMod=1&sourcePath=${encodeURIComponent(MOD)}&modPath=${encodeURIComponent(MOD)}`)
      .then((r) => r.json()).catch(() => null);
    const mine = ((cat && cat.technologies) || []).find((t) => t.id === "nova_stuck_tech");
    rec("the catalog returned the tech", !!mine, ((cat && cat.technologies) || []).map((t) => t.id).slice(0, 6));
    if (mine) {
      lock(SRC_TECH);
      const moved = Object.assign({}, mine, { fileName: "dest_tech.txt", previousFileName: "src_tech.txt" });
      const tr = await post("/api/technologies/save-batch", { modPath: MOD, technologies: [moved] });
      rec("the tech is NOT defined twice", definitionCount(TECH_DIR, "nova_stuck_tech") === 1,
        definitionCount(TECH_DIR, "nova_stuck_tech"));
      rec("…and it is still in its original file",
        fs.readFileSync(SRC_TECH, "utf8").includes("nova_stuck_tech"), "lost from the source file");
      void tr;
      unlockAll();
    }

    console.log(`\n=== half-applied write: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) {
      fails.forEach((f) => console.log("   FAILED: " + f));
      process.exitCode = 1;
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 6).join("\n") : e);
    process.exitCode = 1;
  } finally {
    unlockAll(); // never leave a locked file behind, even on an exception
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
server.on("error", (e) => {
  console.error("listen error:", e.message);
  process.exitCode = 1;
});
