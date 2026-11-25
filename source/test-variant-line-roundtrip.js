// #variant-line-indent + #variant-line-comment — /api/equipment/variant/update's obsolete and icon branches
// hardcoded "\t\t\t" for the line they added and "\n\t\t" for the block's tail, and removed with a regex
// anchored by (?=\n).
//
// Two consequences, both silent:
//
//  * Ticking Obsolete and then unticking it never restored the original bytes, because the hardcoded indent
//    re-indented the closing brace of any block not shaped that way. Measured across both corpora, that is
//    MOST blocks: the hardcode matches 243 of vanilla's 1,343 variant blocks (18%) and 1,170 of Millennium
//    Dawn's 1,774 (66%) — and MD ships 216 blocks with a MIXED tab/space indent no hardcode could match.
//  * A value line carrying a trailing `# comment` could not be matched by the (?=\n)-anchored remover, so
//    unchecking the box did nothing at all while the endpoint still answered ok. Vanilla ships 6 such
//    `obsolete` lines and 6 such `icon` lines.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-varline-"));
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

const MOD = path.join(ROOT, "varmod");
fs.mkdirSync(path.join(MOD, "history", "countries"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="VarMod"\nsupported_version="1.18.*"\n', "utf8");

const FILE = "NVA - Novaland.txt";
const ABS = path.join(MOD, "history", "countries", FILE);

// One fixture per indent shape that real content actually uses, plus the commented-line shape.
const seedFor = (indent, extraLine) => [
  "capital = 1",
  "",
  "create_equipment_variant = {",
  `${indent}name = "Nova Design"`,
  `${indent}type = infantry_equipment_1`,
  ...(extraLine ? [`${indent}${extraLine}`] : []),
  "}",
  "",
].join("\n");

const PORT = 42451;
const app = createApp();
const server = app.listen(PORT, async () => {
  const update = async (set) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/equipment/variant/update`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ modPath: MOD, file: FILE, blockIdx: 0, set }),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const read = () => fs.readFileSync(ABS, "utf8");

  try {
    // The indent shapes measured in vanilla + MD, including MD's mixed tab/space form.
    for (const [label, indent] of [["1 tab", "\t"], ["2 tabs (vanilla's most common)", "\t\t"],
                                   ["3 tabs (MD's most common)", "\t\t\t"], ["mixed tab+space (MD ships 216)", "\t\t \t"]]) {
      console.log(`\n[${label}] set-then-clear must be byte-identical`);
      fs.writeFileSync(ABS, seedFor(indent), "utf8");
      const before = read();

      let r = await update({ obsolete: true });
      rec(`${label}: setting obsolete succeeded`, r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
      rec(`${label}: it actually wrote obsolete`, /obsolete\s*=\s*yes/.test(read()), read());
      rec(`${label}: …using the block's OWN indent`,
        new RegExp(`\\n${indent.replace(/\t/g, "\\t")}obsolete = yes`).test(read()), JSON.stringify(read()));

      r = await update({ obsolete: false });
      rec(`${label}: clearing obsolete succeeded`, r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
      rec(`${label}: the file is BYTE-IDENTICAL to before`, read() === before,
        { before: JSON.stringify(before), after: JSON.stringify(read()) });
    }

    console.log("\n[icon] set-then-clear must round-trip too");
    fs.writeFileSync(ABS, seedFor("\t\t"), "utf8");
    {
      const before = read();
      await update({ icon: "GFX_nova_icon" });
      rec("the icon was written", /icon\s*=\s*"GFX_nova_icon"/.test(read()), read());
      await update({ icon: "" });
      rec("clearing the icon restores the original bytes", read() === before,
        { before: JSON.stringify(before), after: JSON.stringify(read()) });
    }

    console.log("\n[trailing comment] unchecking must work on a commented line, not silently no-op");
    fs.writeFileSync(ABS, seedFor("\t\t", "obsolete = yes #used for oob only"), "utf8");
    {
      const r = await update({ obsolete: false });
      rec("the request succeeded", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
      rec("the obsolete line is GONE", !/obsolete\s*=\s*yes/.test(read()), read());
      rec("…and the rest of the block survived",
        /name = "Nova Design"/.test(read()) && /type = infantry_equipment_1/.test(read()), read());
    }

    console.log("\n[trailing comment] the same for a commented icon line");
    fs.writeFileSync(ABS, seedFor("\t\t", 'icon = "GFX_old" #legacy'), "utf8");
    {
      const r = await update({ icon: "" });
      rec("the request succeeded", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
      rec("the icon line is GONE", !/icon\s*=/.test(read()), read());
    }

    console.log("\n[control] an unrelated edit still leaves obsolete alone");
    // Guards against a fix that strips lines it was not asked about.
    fs.writeFileSync(ABS, seedFor("\t\t", "obsolete = yes"), "utf8");
    {
      const r = await update({ name: "Renamed Design" });
      rec("the rename succeeded", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
      rec("the name changed", /name\s*=\s*"Renamed Design"/.test(read()), read());
      rec("obsolete was NOT removed", /obsolete\s*=\s*yes/.test(read()), read());
    }

    console.log(`\n=== variant line round-trip: ${checks} checks, ${fails.length} failed ===`);
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
