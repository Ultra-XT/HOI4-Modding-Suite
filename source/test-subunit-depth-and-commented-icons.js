// Two "matched at the wrong nesting level" defects.
//
//  #28 /api/subunits/edit — a battalion is a DEPTH-0 child of `sub_units = { }`, but the locator found it with
//      a plain regex that matched at ANY depth. A key naming a NESTED block — battalion_mult, need,
//      categories, or a terrain block like `forest = { }` — was accepted as a battalion and the stat write
//      landed inside that unrelated block. Brace-balanced, committed, and listed in `applied`, so nothing
//      said the stats had gone somewhere else. setSubUnitScalar, thirty lines below, was already migrated to
//      splitTopLevelPdxStatements for exactly this reason; the locator never adopted it.
//
//  #37 /api/focus/restore-base-icons — icon references on COMMENTED-OUT lines were scanned as live, so dead
//      lines bloated the generated .gfx and put phantom names in the user-facing `skipped` warning list.
//      Vanilla carries 161 such commented icon references, so anyone copying a vanilla focus file inherits
//      them. Every other focus parser in server.js blanks comments first; this scanner was the exception.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-sudepth-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp, buildRestoredFocusIconsGfx } = require("./server.js");

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

const MOD = path.join(ROOT, "sumod");
fs.mkdirSync(path.join(MOD, "common", "units"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="SuMod"\nsupported_version="1.18.*"\n', "utf8");

const SUFILE = path.join(MOD, "common", "units", "nova_subunits.txt");
// Shaped like Millennium Dawn's recon battalions: a nested battalion_mult block carrying the SAME stat name
// that also exists at top level, plus a nested terrain block.
const SEED = [
  "sub_units = {",
  "\tnova_recon = {",
  "\t\tsprite = recon",
  "\t\tbattalion_mult = {",
  "\t\t\tsoft_attack = 0.05",
  "\t\t\tdefense = 0.01",
  "\t\t}",
  "\t\tforest = {",
  "\t\t\tattack = 0.10",
  "\t\t}",
  "\t\tsoft_attack = -0.66",
  "\t\tdefense = 2.0",
  "\t\tneed = {",
  "\t\t\tinfantry_equipment = 10",
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n");

const PORT = 42441;
const app = createApp();
const server = app.listen(PORT, async () => {
  const edit = async (key, stats) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/subunits/edit`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ modPath: MOD, fileName: "nova_subunits.txt", key, stats }),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const read = () => fs.readFileSync(SUFILE, "utf8");
  const blockOf = (name) => {
    const m = new RegExp(`${name}\\s*=\\s*\\{`).exec(read());
    if (!m) return "";
    const txt = read();
    let i = txt.indexOf("{", m.index), d = 0, end = -1;
    for (; i < txt.length; i++) {
      if (txt[i] === "{") d++;
      else if (txt[i] === "}") { d--; if (d === 0) { end = i; break; } }
    }
    return end === -1 ? "" : txt.slice(m.index, end + 1);
  };

  try {
    console.log("\n[#28 control] editing the REAL battalion still works");
    // First, so the fix cannot be "refuse everything".
    fs.writeFileSync(SUFILE, SEED, "utf8");
    let r = await edit("nova_recon", { soft_attack: 1.5 });
    rec("the real battalion edit succeeded", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    rec("…and applied the stat", !!(r.body && Array.isArray(r.body.applied) && r.body.applied.includes("soft_attack")), r.body);
    rec("the TOP-LEVEL soft_attack changed", /\n\t\tsoft_attack\s*=\s*1\.5/.test(read()), read());
    rec("the nested battalion_mult soft_attack did NOT change",
      /battalion_mult\s*=\s*\{[\s\S]*?soft_attack\s*=\s*0\.05/.test(read()), blockOf("battalion_mult"));

    console.log("\n[#28] a NESTED block name must not be accepted as a battalion");
    fs.writeFileSync(SUFILE, SEED, "utf8");
    const beforeNested = read();
    r = await edit("battalion_mult", { soft_attack: 9.9 });
    rec("the request was refused", r.body && r.body.ok === false, r.body);
    rec("…with a 'couldn't locate' message", !!(r.body && /Couldn't locate/i.test(String(r.body.error || ""))), r.body && r.body.error);
    rec("the file is unchanged", read() === beforeNested, read());
    rec("9.9 was not written anywhere", !/9\.9/.test(read()), read());

    console.log("\n[#28] a terrain block is not a battalion either");
    r = await edit("forest", { soft_attack: 7.7 });
    rec("the terrain-block request was refused", r.body && r.body.ok === false, r.body);
    rec("nothing was written", !/7\.7/.test(read()), read());

    console.log("\n[#28] and `need` is not a battalion");
    r = await edit("need", { soft_attack: 5.5 });
    rec("the `need` request was refused", r.body && r.body.ok === false, r.body);
    rec("nothing was written", !/5\.5/.test(read()), read());

    console.log("\n[#37] commented-out icon references must not be treated as live");
    const gfx = 'spriteTypes = {\n\tspriteType = { name = "GFX_goal_live_icon" textureFile = "gfx/live.dds" }\n' +
      '\tspriteType = { name = "GFX_goal_dead_icon" textureFile = "gfx/dead.dds" }\n}\n';
    const focusText = [
      "focus_tree = {",
      "\tid = t",
      "\tfocus = {",
      "\t\tid = f1",
      "\t\ticon = GFX_goal_live_icon",
      "\t}",
      "\tfocus = {",
      "\t\tid = f2",
      "\t\t# icon = GFX_goal_dead_icon",
      "\t}",
      "}",
      "",
    ].join("\n");
    const built = buildRestoredFocusIconsGfx([focusText], gfx);
    const asText = JSON.stringify(built);
    rec("the LIVE icon was registered", /GFX_goal_live_icon/.test(asText), asText.slice(0, 300));
    rec("the COMMENTED icon was NOT registered", !/GFX_goal_dead_icon/.test(asText), asText.slice(0, 400));

    console.log("\n[#37 control] uncommenting the same line brings it back");
    // Without this, "register nothing" would pass the check above.
    const uncommented = focusText.replace("# icon = GFX_goal_dead_icon", "icon = GFX_goal_dead_icon");
    const built2 = JSON.stringify(buildRestoredFocusIconsGfx([uncommented], gfx));
    rec("the same icon IS registered when live", /GFX_goal_dead_icon/.test(built2), built2.slice(0, 400));

    console.log("\n[#37 endpoint] the endpoint has its OWN scan — cover that path too");
    // buildRestoredFocusIconsGfx is the exported pure surface, but /api/focus/restore-base-icons does not
    // call it: it scans focusTexts itself. Testing only the builder left the live path uncovered, which the
    // control caught by NOT going red when the endpoint's strip was removed.
    fs.mkdirSync(path.join(MOD, "common", "national_focus"), { recursive: true });
    fs.writeFileSync(path.join(MOD, "common", "national_focus", "nova_tree.txt"), [
      "focus_tree = {",
      "\tid = nova_tree",
      "\tfocus = {",
      "\t\tid = nova_f1",
      "\t\ticon = GFX_goal_nova_live",
      "\t}",
      "\tfocus = {",
      "\t\tid = nova_f2",
      "\t\t# icon = GFX_goal_nova_phantom",
      "\t}",
      "}",
      "",
    ].join("\n"), "utf8");

    const rr = await fetch(`http://127.0.0.1:${PORT}/api/focus/restore-base-icons`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ modPath: MOD }),
    });
    const rb = await rr.json().catch(() => null);
    rec("the endpoint answered", rr.status === 200 && rb && rb.ok !== false, rb || rr.status);
    const skippedList = JSON.stringify((rb && rb.skipped) || []);
    rec("the LIVE icon reached the scan", /GFX_goal_nova_live/.test(skippedList), skippedList);
    rec("the COMMENTED icon did NOT pollute the skipped list",
      !/GFX_goal_nova_phantom/.test(skippedList), skippedList);

    console.log(`\n=== subunit depth + commented icons: ${checks} checks, ${fails.length} failed ===`);
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
