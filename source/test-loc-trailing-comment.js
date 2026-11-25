// #loc-line-trailing-comment — a localisation line may carry a comment after the closing quote:
//
//   infantry_weapons7: "Small Arms 2035" #Future Tactical Rifle
//
// Both of Nova's in-place loc matchers anchored `".*"(\s*)$`, so such a line could never match. The edit
// silently missed it and a SECOND definition of the same key was appended to another file — the duplicate-key
// state these functions exist to avoid. Whichever file loads last then wins, so the rename appears to do
// nothing, or to work and then revert.
//
// Real exposure, measured rather than assumed: 18,890 such lines across 371 vanilla .yml files, and 746
// across 28 Millennium Dawn files (including equipment_l_english.yml).
//
// There are exactly TWO copies of this matcher — setLocalizationKeyInPlace and the /api/research/set-label-text
// handler — and both are covered here, because fixing one and not the other is how this class survives.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-loctc-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const MOD = path.join(ROOT, "tcmod");
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="TcMod"\nsupported_version="1.18.*"\n', "utf8");

const OWNER = path.join(MOD, "localisation", "english", "aa_owner_l_english.yml");
const SEED = "﻿" + [
  "l_english:",
  ' tc_label:0 "Original Label" #a note the modder wrote',
  ' tc_plain:0 "Plain Value"',
  ' tc_quoted:0 "He said \\"no\\"" #comment after an escaped quote',
  ' tc_label_extra:0 "A different key that must not be touched"',
  "",
].join("\n");

const PORT = 42433;
const app = createApp();
const server = app.listen(PORT, async () => {
  const post = async (route, body) => {
    const r = await fetch(`http://127.0.0.1:${PORT}${route}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const owner = () => fs.readFileSync(OWNER, "utf8");
  const allFiles = () => fs.readdirSync(path.join(MOD, "localisation", "english"));
  const countKeyEverywhere = (key) => {
    let n = 0;
    for (const f of allFiles()) {
      const txt = fs.readFileSync(path.join(MOD, "localisation", "english", f), "utf8");
      n += (txt.match(new RegExp(`^[ \\t]*${key}:`, "gm")) || []).length;
    }
    return n;
  };
  const valueOf = (txt, key) => {
    const m = new RegExp(`^[ \\t]*${key}:\\d*[ \\t]*"((?:[^"\\\\]|\\\\.)*)"`, "m").exec(txt);
    return m ? m[1] : null;
  };

  try {
    console.log("\n[set-label-text] a key defined on a commented line must be edited IN PLACE");
    fs.writeFileSync(OWNER, SEED, "utf8");
    let r = await post("/api/research/set-label-text", { modPath: MOD, key: "tc_label", value: "Renamed Label" });
    rec("the label save succeeded", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    rec("the value was replaced in the owning file", valueOf(owner(), "tc_label") === "Renamed Label",
      valueOf(owner(), "tc_label"));
    rec("the modder's trailing comment SURVIVED", /tc_label:0\s*"Renamed Label"\s*#a note the modder wrote/.test(owner()),
      owner());
    rec("the key is defined exactly ONCE across the whole mod", countKeyEverywhere("tc_label") === 1,
      { count: countKeyEverywhere("tc_label"), files: allFiles() });
    rec("no duplicate file was created for it", allFiles().length === 1, allFiles());

    console.log("\n[similar key] a key that merely shares a prefix must not be touched");
    rec("tc_label_extra is unchanged",
      valueOf(owner(), "tc_label_extra") === "A different key that must not be touched",
      valueOf(owner(), "tc_label_extra"));

    console.log("\n[escaped quotes + comment] the hardest shape");
    r = await post("/api/research/set-label-text", { modPath: MOD, key: "tc_quoted", value: "Now Simple" });
    rec("it was edited in place", valueOf(owner(), "tc_quoted") === "Now Simple", valueOf(owner(), "tc_quoted"));
    rec("…exactly once", countKeyEverywhere("tc_quoted") === 1, countKeyEverywhere("tc_quoted"));
    rec("…and its comment survived too", /tc_quoted:0\s*"Now Simple"\s*#comment after an escaped quote/.test(owner()),
      owner());

    console.log("\n[control] a plain line still works exactly as before");
    // Without this the fix could be "only match commented lines", which would break the common case.
    r = await post("/api/research/set-label-text", { modPath: MOD, key: "tc_plain", value: "Plain Renamed" });
    rec("the plain key was edited in place", valueOf(owner(), "tc_plain") === "Plain Renamed", valueOf(owner(), "tc_plain"));
    rec("…exactly once", countKeyEverywhere("tc_plain") === 1, countKeyEverywhere("tc_plain"));
    rec("…and gained no spurious comment", !/tc_plain:0\s*"Plain Renamed"\s*#/.test(owner()), owner());

    console.log("\n[control] a key the mod does not define is still written to the override file");
    r = await post("/api/research/set-label-text", { modPath: MOD, key: "tc_brand_new", value: "Brand New" });
    rec("a brand-new key still lands somewhere", countKeyEverywhere("tc_brand_new") === 1,
      { count: countKeyEverywhere("tc_brand_new"), files: allFiles() });

    console.log("\n[the other copy] setLocalizationKeyInPlace, via /api/localization/upsert redirect");
    // upsert redirects to the owning file when the key lives elsewhere — that redirect goes through
    // setLocalizationKeyInPlace, the second copy of the matcher.
    const TARGET = path.join(MOD, "localisation", "english", "zz_target_l_english.yml");
    fs.writeFileSync(TARGET, "﻿l_english:\n", "utf8");
    fs.writeFileSync(OWNER, SEED, "utf8");
    r = await post("/api/localization/upsert", {
      modPath: MOD, path: "localisation/english/zz_target_l_english.yml",
      entries: { tc_label: { name: "Redirected Rename" } },
    });
    rec("the upsert succeeded", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    rec("it edited the OWNING file, not the target", valueOf(owner(), "tc_label") === "Redirected Rename",
      { owner: valueOf(owner(), "tc_label"), target: fs.readFileSync(TARGET, "utf8") });
    rec("the trailing comment survived the redirect too",
      /tc_label:0\s*"Redirected Rename"\s*#a note the modder wrote/.test(owner()), owner());
    rec("still exactly one definition mod-wide", countKeyEverywhere("tc_label") === 1,
      { count: countKeyEverywhere("tc_label"), owner: owner(), target: fs.readFileSync(TARGET, "utf8") });

    console.log(`\n=== loc trailing comment: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) {
      fails.forEach((f) => console.log("   FAILED: " + f));
      process.exitCode = 1;
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
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
