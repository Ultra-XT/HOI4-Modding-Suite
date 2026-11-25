// Regression: setting a country's starting technologies (the country-setup "Starting Technologies"
// UI → /api/technologies/save-country-techs → writeCountryTechnologies) must manage ONLY the
// top-level unconditional set_technology block and NEVER destroy a DLC-conditional set_technology
// block inside the date block (a Millennium Dawn add-on like GRE relies on those). Previously the
// writer stripped ALL set_technology blocks, silently deleting the modder's conditional tech setup.
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");
const PORT = 3593;

function req(method, p, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({ host: "127.0.0.1", port: PORT, path: p, method, headers: data ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {} }, (res) => {
      let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => { try { resolve(JSON.parse(b)); } catch (_) { resolve({ raw: b.slice(0, 160) }); } });
    });
    r.on("error", reject); if (data) r.write(data); r.end();
  });
}

(async () => {
  const s = createApp().listen(PORT, "127.0.0.1");
  await new Promise((r) => s.on("listening", r));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "novamod-ctechs-"));
  let pass = 0, fail = 0;
  const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };
  const balanced = (t) => { let d = 0; for (const c of String(t).replace(/#.*$/gm, "")) { if (c === "{") d++; else if (c === "}") { d--; if (d < 0) return false; } } return d === 0; };
  const countTop = (t) => (t.match(/(?:^|\n)set_technology\s*=\s*\{/g) || []).length;
  try {
    fs.writeFileSync(path.join(tmp, "descriptor.mod"), 'name="CTech Test"\n', "utf8");
    const hc = path.join(tmp, "history", "countries");
    fs.mkdirSync(hc, { recursive: true });
    const file = path.join(hc, "GRE - Greece.txt");
    // GRE-style: a DLC-conditional set_technology INSIDE the date block that must survive.
    fs.writeFileSync(file,
      "capital = 141\n\n2000.1.1 = {\n\tif = { limit = { has_dlc = \"No Step Back\" }\n\t\tset_technology = { mbt_tech = 1 nsb_artillery_0 = 1 }\n\t}\n}\n", "utf8");

    // 1. Set starting techs (real vanilla techs so any validation passes).
    // A REAL vanilla tech id: #unknown-tech-written-silently refuses ids that exist nowhere, and "radar"
    // is not one (vanilla has centimetric_radar / monopulse_radar). This test is about the write path.
    let res = await req("POST", "/api/technologies/save-country-techs", { tag: "GRE", modPath: tmp, techIds: ["infantry_weapons", "centimetric_radar"] });
    check("save-country-techs ok", res && (res.ok === true || res.techs), JSON.stringify(res).slice(0, 140));

    let out = fs.readFileSync(file, "utf8");
    check("DLC-conditional set_technology INSIDE the date block is preserved", /mbt_tech = 1/.test(out) && /has_dlc/.test(out), out.slice(0, 200));
    check("chosen starting techs written", /infantry_weapons = 1/.test(out) && /centimetric_radar = 1/.test(out), "");
    const topIdx = out.search(/(?:^|\n)set_technology\s*=\s*\{/);
    const dateIdx = out.search(/\d{4}\.\d{1,2}\.\d{1,2}\s*=\s*\{/);
    check("the managed block is top-level, before the date block", topIdx !== -1 && dateIdx !== -1 && topIdx < dateIdx, `top@${topIdx} date@${dateIdx}`);
    check("file stays brace-balanced", balanced(out), "");

    // 2. Change the techs — must replace the top-level block in place, still preserving conditional.
    await req("POST", "/api/technologies/save-country-techs", { tag: "GRE", modPath: tmp, techIds: ["infantry_weapons"] });
    out = fs.readFileSync(file, "utf8");
    check("exactly one top-level set_technology block (no duplication)", countTop(out) === 1, "count=" + countTop(out));
    check("removed tech gone, kept tech remains", /infantry_weapons = 1/.test(out) && !/(?:^|\n)set_technology[^}]*centimetric_radar = 1/.test(out.replace(/\n/g, "\n")), "");
    check("conditional block STILL preserved after re-save", /mbt_tech = 1/.test(out) && balanced(out), "");

    // 3. Clear — removes the top-level managed block but keeps the conditional one.
    await req("POST", "/api/technologies/save-country-techs", { tag: "GRE", modPath: tmp, techIds: [] });
    out = fs.readFileSync(file, "utf8");
    check("clearing removes the top-level block", !/(?:^|\n)set_technology\s*=\s*\{[^}]*infantry_weapons/.test(out), "");
    check("conditional block survives a full clear", /mbt_tech = 1/.test(out) && /has_dlc/.test(out) && balanced(out), "");
  } catch (e) {
    fail++; console.log("  FAIL harness →", e.message);
  } finally {
    s.close();
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nCOUNTRY-TECHS TEST: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
