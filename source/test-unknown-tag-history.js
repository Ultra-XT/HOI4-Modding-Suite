// #unknown-tag-history — NOVA MINTED COUNTRY HISTORY FILES FOR TAGS NOTHING DECLARES.
//
// HOI4 answered the user's mod with 14 "<TAG> is not in the tag list" lines, and those matched the 14
// "<TAG> - Custom.txt" files Nova had created — an exact 1:1. The file is inert: the game reads the tag
// list, does not find the tag, and ignores everything in it. Whatever the author put there does nothing.
//
// NOT auto-registered, and that was measured rather than assumed. Writing the 14 tags into
// common/country_tags would have traded 14 error lines for roughly 84, because 23 of the mod's 24
// already-registered tags have no flag .tga and each of those costs 6 more lines — and it would have Nova
// invent a colour and a graphical_culture from what was only a spirit-toggle click. Two of the 14 files had
// no content at all.
//
// So it warns, at the ONE choke point all 12 callers funnel through. The guard already existed — at exactly
// 1 of those 12 call sites. That is this codebase's dominant bug shape: a guard adopted by one caller and
// not its siblings. Recording the note at the choke point was only half of it: /api/history/set-startup
// returned a bare { ok: true } and drained nothing, so the note had nowhere to appear. A guard whose caller
// never surfaces it is a dead guard.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-unktag-"));
process.env.HOI4_MODS_ROOT = ROOT;
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

const MOD = path.join(ROOT, "unktagmod");
fs.mkdirSync(path.join(MOD, "history", "countries"), { recursive: true });
fs.mkdirSync(path.join(MOD, "common", "ideas"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="UnkTagMod"\nsupported_version="1.19.*"\n', "utf8");
fs.writeFileSync(path.join(MOD, "common", "ideas", "nova_probe_ideas.txt"),
  "ideas = {\n\tcountry = {\n\t\tunk_probe_spirit = {\n\t\t\tmodifier = { political_power_factor = 0.1 }\n\t\t}\n\t}\n}\n", "utf8");

const histDir = path.join(MOD, "history", "countries");
const histFiles = () => { try { return fs.readdirSync(histDir); } catch (_) { return []; } };

const PORT = 42497;
const app = createApp();
const server = app.listen(PORT, async () => {
  const post = (ep, body) => fetch(`http://127.0.0.1:${PORT}${ep}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const warn = (r) => String((r.b && (r.b.refWarning || r.b.warning)) || "");

  // Toggling a national spirit onto a country is one of the paths that mints a history file without ever
  // asking whether the country exists — the shape that produced the user's 14 dead files.
  const grantSpirit = (tag) => post("/api/history/set-startup", {
    modPath: MOD, tag, itemId: "unk_probe_spirit", itemType: "spirit", active: true,
  });

  try {
    console.log("\n[control] a REAL country must not be warned about");
    // FIRST. GER is in the base game, so this is the case that must stay silent — a warning here would fire
    // on nearly every legitimate edit and the check would be worthless.
    let r = await grantSpirit("GER");
    rec("granting a spirit to GER succeeds", r.s === 200 && r.b && r.b.ok !== false, r.b || r.s);
    rec("…with no unknown-tag warning", !/not in the tag list|not a country/i.test(warn(r)), warn(r));
    rec("…and the history file exists", histFiles().some((f) => /^GER/.test(f)), histFiles());

    console.log("\n[the bug] a tag nothing declares");
    r = await grantSpirit("ZQX");
    rec("the save still SUCCEEDS (warn, never block)", r.s === 200 && r.b && r.b.ok !== false, r.b || r.s);
    rec("…and Nova warns the file is inert", /ZQX/.test(warn(r)), warn(r));
    rec("…quoting what the game itself reports", /tag list/i.test(warn(r)), warn(r));
    rec("…and naming what to do about it", /Country Setup/i.test(warn(r)), warn(r));
    // The file is still written: the author asked for it, and "declare the tag afterwards" is a real order
    // of work — the maker fuzz fixture does exactly that a hundred times over.
    rec("…while still writing the file the user asked for", histFiles().some((f) => /^ZQX/.test(f)), histFiles());

    console.log("\n[once the tag is declared, the warning stops]");
    // The control proving the check reads the CATALOGUE rather than pattern-matching the tag's shape.
    fs.mkdirSync(path.join(MOD, "common", "country_tags"), { recursive: true });
    fs.writeFileSync(path.join(MOD, "common", "country_tags", "nova_probe_tags.txt"),
      'ZQY = "countries/ZQY.txt"\n', "utf8");
    fs.mkdirSync(path.join(MOD, "common", "countries"), { recursive: true });
    fs.writeFileSync(path.join(MOD, "common", "countries", "ZQY.txt"),
      "graphical_culture = western_european_gfx\n", "utf8");
    r = await grantSpirit("ZQY");
    rec("granting a spirit to a declared tag succeeds", r.s === 200 && r.b && r.b.ok !== false, r.b || r.s);
    rec("…with NO unknown-tag warning, because it is declared now", !/ZQY/.test(warn(r)), warn(r));

    console.log("\n[the note is not repeated per write]");
    r = await grantSpirit("ZQZ");
    const hits = (warn(r).match(/is not a country in this mod/g) || []).length;
    rec("one note per tag, not one per file touched", hits <= 1, { hits, warn: warn(r) });

    console.log(`\n=== unknown tag history: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });
