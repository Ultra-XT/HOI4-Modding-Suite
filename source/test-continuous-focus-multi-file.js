// #cf-list-shows-one-file / #cf-two-default-palettes
//
// GET /api/continuous-focus/list picked exactly ONE file out of common/continuous_focus and returned only its
// palettes. A mod with a second palette file therefore had that palette — and every focus in it — unreachable
// through the read endpoint the panel loads with: created successfully, saved successfully, then invisible
// after a reload with no way back to it.
//
// The create path also hardcoded `default = yes`, so making a second palette file left the mod declaring two
// default continuous-focus palettes. HOI4 takes one, the same "one total" rule Nova already enforces for
// focus trees.
//
// Both directions: every palette must be listed, and the single-file case (which is what vanilla and
// Millennium Dawn both ship) must behave exactly as before.
//
// Hermetic: fake mod under tmpdir.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-cf-"));
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

const MOD = path.join(ROOT, "cfmod");
const CF_DIR = path.join(MOD, "common", "continuous_focus");
fs.mkdirSync(CF_DIR, { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="CfMod"\nsupported_version="1.18.*"\n', "utf8");

// The mod's existing, default palette — the shape vanilla and MD both ship.
fs.writeFileSync(path.join(CF_DIR, "generic.txt"), [
  "continuous_focus_palette = {",
  "\tid = generic_focus",
  "\tcountry = { factor = 1 }",
  "\tdefault = yes",
  "\treset_on_civilwar = no",
  "\tposition = { x = 50 y = 1000 }",
  "\tcontinuous_focus = {",
  "\t\tid = nua_existing_focus",
  "\t\ticon = GFX_focus_generic_industry_1",
  "\t\tx = 0",
  "\t\ty = 0",
  "\t}",
  "}",
  "",
].join("\n"), "utf8");

const PORT = 42205;
const app = createApp();
const server = app.listen(PORT, async () => {
  const post = async (body) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/continuous-focus/save`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modPath: MOD, ...body }),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const list = async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/continuous-focus/list?modPath=${encodeURIComponent(MOD)}`);
    return await r.json().catch(() => null);
  };
  const defaultCount = () => {
    let n = 0;
    for (const f of fs.readdirSync(CF_DIR).filter((x) => x.endsWith(".txt"))) {
      const t = fs.readFileSync(path.join(CF_DIR, f), "utf8").replace(/#[^\n]*/g, "");
      n += (t.match(/^\s*default\s*=\s*yes/gm) || []).length;
    }
    return n;
  };

  try {
    console.log("\n[single file] the common case must be unchanged");
    const one = await list();
    rec("the list loads", !!one && one.ok !== false, one);
    rec("it reports the mod's file", one && one.file === "generic.txt", one && one.file);
    rec("…and its palette", (one && one.palettes || []).some((p) => p.id === "generic_focus"),
      (one && one.palettes || []).map((p) => p.id));
    rec("the mod declares exactly one default", defaultCount() === 1, defaultCount());

    console.log("\n[second file] its palette must be reachable through the list");
    const made = await post({ file: "nova_second.txt", paletteId: "nova_second_palette", op: "create-file", position: { x: 60, y: 900 } });
    rec("the second palette file was created", made.status === 200 && made.body && made.body.ok !== false,
      made.body || made.status);
    rec("…and exists on disk", fs.existsSync(path.join(CF_DIR, "nova_second.txt")), fs.readdirSync(CF_DIR));

    const added = await post({
      file: "nova_second.txt", paletteId: "nova_second_palette", op: "upsert-focus",
      focusId: "nua_second_focus", fields: { icon: "GFX_focus_generic_industry_1", x: 0, y: 0 },
    });
    rec("a focus was added to it", added.status === 200 && added.body && added.body.ok !== false,
      added.body || added.status);

    const two = await list();
    const ids = (two && two.palettes || []).map((p) => p.id);
    rec("the ORIGINAL palette is still listed", ids.includes("generic_focus"), ids);
    rec("the SECOND palette is listed too", ids.includes("nova_second_palette"), ids);
    const second = (two && two.palettes || []).find((p) => p.id === "nova_second_palette");
    rec("…and carries the file it lives in", second && second.file === "nova_second.txt", second && second.file);
    rec("…and its focus is reachable",
      second && JSON.stringify(second).includes("nua_second_focus"), second);

    console.log("\n[one default] a second palette file must not claim the default too");
    rec("the mod still declares exactly one default palette", defaultCount() === 1,
      { count: defaultCount(), files: fs.readdirSync(CF_DIR) });

    console.log(`\n=== continuous focus multi-file: ${checks} checks, ${fails.length} failed ===`);
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
