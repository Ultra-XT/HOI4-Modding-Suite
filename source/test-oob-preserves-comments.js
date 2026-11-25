// #oob-save-eats-location-comments — saving an order of battle stripped the modder's annotations.
//
// Millennium Dawn labels every division's province with the place name (`location = 12862\t\t#As Shajarah`)
// across all 924 of its OOB files, and groups them with headers like `#Popular Defence Forces`. genDivision
// re-emits location from the parsed number, so a save deleted all of it: on one 325-line Sudanese OOB, 17
// place names and 2 headers, silently, with the save reporting success.
//
// The comment cannot travel through the client. /api/army returns a PROJECTION of each division — location,
// name, template and the few modelled fields — so the browser never sees a comment and cannot send one back.
// It is recovered server-side inside mergeOob from the original file, the same shape as the equipment stat
// variables and the MIO allowed block. A value the client cannot carry has to be rebuilt where the file is.
//
// A MOVED division must NOT keep its old label — a comment naming the wrong province is worse than none — so
// the comment is re-emitted only when the location is unchanged. That direction is tested too.
//
// Hermetic: fake mod under tmpdir.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-oobcmt-"));
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

const MOD = path.join(ROOT, "oobmod");
fs.mkdirSync(path.join(MOD, "history", "units"), { recursive: true });
fs.mkdirSync(path.join(MOD, "history", "countries"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="OobMod"\nsupported_version="1.18.*"\n', "utf8");

const FILE = "NUA_1936.txt";
const ABS = path.join(MOD, "history", "units", FILE);
const SEED = [
  "units = {",
  "\t#First Army Group",
  "\tdivision = {",
  '\t\tname = "1st Infantry Division"',
  "\t\tlocation = 12862\t\t#As Shajarah",
  '\t\tdivision_template = "Infantry Division"',
  "\t\tstart_experience_factor = 0.1",
  "\t}",
  "\tdivision = {",
  '\t\tname = "2nd Infantry Division"',
  "\t\tlocation = 4133\t\t#El-Obeid",
  '\t\tdivision_template = "Infantry Division"',
  "\t\tstart_experience_factor = 0.2",
  "\t}",
  "\t#Reserve Forces",
  "\tdivision = {",
  '\t\tname = "3rd Reserve Division"',
  "\t\tlocation = 2088\t\t#Khasm El Girba",
  '\t\tdivision_template = "Infantry Division"',
  "\t\tstart_experience_factor = 0.0",
  "\t}",
  "}",
  "",
].join("\n");

const PORT = 42313;
const app = createApp();
const server = app.listen(PORT, async () => {
  const get = async (u) => (await fetch(`http://127.0.0.1:${PORT}${u}`)).json();
  const save = async (body) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/army/save`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.assign({ modPath: MOD, tag: "NUA", file: FILE }, body)),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const read = () => fs.readFileSync(ABS, "utf8");

  try {
    console.log("\n[dirty save] annotations survive a full regenerate");
    fs.writeFileSync(ABS, SEED, "utf8");
    let a = await get(`/api/army?modPath=${encodeURIComponent(MOD)}&tag=NUA`);
    rec("the OOB was read", (a.divisions || []).length === 3, a.divisions && a.divisions.length);

    // The client cannot carry a comment — assert that, so the test documents WHY the fix is server-side.
    rec("the API projection carries no comment (so it must be recovered server-side)",
      a.divisions.every((d) => d.locationComment === undefined), Object.keys(a.divisions[0] || {}));

    let r = await save({
      templates: a.templates || [],
      divisions: (a.divisions || []).map((d) => Object.assign({}, d, { _dirty: true })),
    });
    rec("the save succeeded", r.status === 200 && r.body && r.body.ok === true, r.body || r.status);

    let txt = read();
    rec("every place name survived",
      /#As Shajarah/.test(txt) && /#El-Obeid/.test(txt) && /#Khasm El Girba/.test(txt), txt);
    rec("…still attached to their own location lines",
      /location = 12862[ \t]*#As Shajarah/.test(txt) && /location = 4133[ \t]*#El-Obeid/.test(txt), txt);
    rec("the section headers survived", /#First Army Group/.test(txt) && /#Reserve Forces/.test(txt), txt);
    rec("…above the division they introduce",
      /#Reserve Forces\s*\n\s*division = \{[\s\S]*?3rd Reserve Division/.test(txt), txt);
    rec("all three divisions are still there", (txt.match(/division = \{/g) || []).length === 3,
      (txt.match(/division = \{/g) || []).length);
    rec("the file is brace-balanced",
      (txt.replace(/#[^\n]*/g, "").match(/\{/g) || []).length === (txt.replace(/#[^\n]*/g, "").match(/\}/g) || []).length, txt);

    console.log("\n[repeat] comments must not multiply");
    a = await get(`/api/army?modPath=${encodeURIComponent(MOD)}&tag=NUA`);
    await save({ templates: a.templates || [], divisions: (a.divisions || []).map((d) => Object.assign({}, d, { _dirty: true })) });
    txt = read();
    rec("each place name appears once", (txt.match(/#As Shajarah/g) || []).length === 1,
      (txt.match(/#As Shajarah/g) || []).length);
    rec("each header appears once", (txt.match(/#Reserve Forces/g) || []).length === 1,
      (txt.match(/#Reserve Forces/g) || []).length);

    console.log("\n[moved division] a stale label must NOT follow it");
    fs.writeFileSync(ABS, SEED, "utf8");
    a = await get(`/api/army?modPath=${encodeURIComponent(MOD)}&tag=NUA`);
    const moved = (a.divisions || []).map((d) =>
      Object.assign({}, d, { _dirty: true }, d.location === 12862 ? { location: 9999 } : {}));
    r = await save({ templates: a.templates || [], divisions: moved });
    rec("the save succeeded", r.status === 200 && r.body && r.body.ok === true, r.body || r.status);
    txt = read();
    rec("the division really moved", /location = 9999/.test(txt), txt);
    rec("…and did NOT keep the label naming where it used to be", !/9999[ \t]*#As Shajarah/.test(txt), txt);
    rec("…and the label is gone entirely, not left floating", !/#As Shajarah/.test(txt), txt);
    rec("the divisions that did not move kept theirs",
      /location = 4133[ \t]*#El-Obeid/.test(txt) && /location = 2088[ \t]*#Khasm El Girba/.test(txt), txt);

    console.log("\n[division templates] annotations inside a regenerated template survive");
    {
      // #oob-save-eats-template-comments — same by-key shape as the divisions. Two placements matter: a
      // comment above a field Nova REBUILDS (regiments) and one above a field it merely preserves (role).
      // Only the second would come along if comments rode on preserved statements alone.
      // Its OWN mod directory. /api/army resolves the OOB by TAG (country history, else any units file whose
      // name matches), and takes no `file` parameter — with two NUA_* files in one mod the read picked the
      // other one, returned no templates, and saving that empty list wiped this file. The real client has no
      // such ambiguity: it sends back the `file` the read resolved.
      const MOD_T = path.join(ROOT, "tplmod");
      fs.mkdirSync(path.join(MOD_T, "history", "units"), { recursive: true });
      fs.mkdirSync(path.join(MOD_T, "history", "countries"), { recursive: true });
      fs.writeFileSync(path.join(MOD_T, "descriptor.mod"), 'name="TplMod"\nsupported_version="1.18.*"\n', "utf8");
      const TPL = path.join(MOD_T, "history", "units", "NUA_tpl.txt");
      fs.writeFileSync(TPL, [
        "division_template = {",
        '\tname = "Nova Infantry"',
        "\t#Motorized Brigade (trucks?)",
        "\tregiments = {",
        "\t\tinfantry = { x = 0 y = 0 }",
        "\t}",
        "\t#a note above an un-modelled field",
        "\trole = 1",
        "\tpriority = 0",
        "}",
        "units = {",
        "\tdivision = {",
        '\t\tname = "1st"',
        "\t\tlocation = 1",
        '\t\tdivision_template = "Nova Infantry"',
        "\t}",
        "}",
        "",
      ].join("\n"), "utf8");

      const at = await get(`/api/army?modPath=${encodeURIComponent(MOD_T)}&tag=NUA`);
      const tpls = (at.templates || []).map((t) => Object.assign({}, t, { _dirty: true }));
      const rt = await save({ modPath: MOD_T, file: "NUA_tpl.txt", templates: tpls, divisions: at.divisions || [] });
      rec("the template save succeeded", rt.status === 200 && rt.body && rt.body.ok === true, rt.body || rt.status);

      const t = fs.readFileSync(TPL, "utf8");
      rec("a comment above a REBUILT field survived", /#Motorized Brigade \(trucks\?\)/.test(t), t);
      rec("…directly above the regiments block it annotates",
        /#Motorized Brigade \(trucks\?\)\s*\n\s*regiments = \{/.test(t), t);
      rec("a comment above a PRESERVED field survived", /#a note above an un-modelled field/.test(t), t);
      rec("…and that un-modelled field is still there", /\brole = 1\b/.test(t), t);
      rec("the template is still brace-balanced",
        (t.replace(/#[^\n]*/g, "").match(/\{/g) || []).length === (t.replace(/#[^\n]*/g, "").match(/\}/g) || []).length, t);
      rec("each template comment appears once", (t.match(/#Motorized Brigade/g) || []).length === 1,
        (t.match(/#Motorized Brigade/g) || []).length);
    }

    console.log(`\n=== OOB comment preservation: ${checks} checks, ${fails.length} failed ===`);
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
