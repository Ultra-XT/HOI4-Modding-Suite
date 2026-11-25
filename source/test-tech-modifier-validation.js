// #tech-modifier-not-a-modifier — NOVA WROTE MODIFIERS THE GAME HAS NEVER HEARD OF, AND SAID NOTHING.
//
// Reported from play: a signals technology never appeared in the research tree in game, with no clue why.
// The user's error.log had the answer:
//
//   Unknown modifier: communications_relay_bonus  in common/technologies/nuaC_signals.txt
//
// A technology may carry country modifiers directly in its block (`army_org_factor = 0.02`). The editor's
// Modifiers box is free text, so whatever is typed is written verbatim — and on an unknown name HOI4 does
// not skip the line, it DROPS THE WHOLE TECHNOLOGY.
//
// Nova already shipped the answer and only ever used it to prompt the AI: data/hoi4-spec.json carries 812
// country modifiers derived from the CWTools config. Country modifiers are engine-defined — a mod cannot add
// one — so a name absent from that list is always wrong.
//
// It WARNS rather than refuses: the spec is a derived list, and being wrong in the refusing direction would
// block real work over a gap in our own data, while being wrong in the warning direction costs a sentence.
//
// The other half was that research.js never read `refWarning` at all, so even the notes the server already
// produced — a rename whose references could not be rewritten, a redirected equipment file, an unknown
// country tag — were written and thrown away. The test asserts the client reads it.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-tmv-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700));
  }
}

const ctlFiles = [];
function controlApp(label, pairs) {
  const raw = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  const wasCrlf = raw.includes("\r\n");
  let out = wasCrlf ? raw.replace(/\r\n/g, "\n") : raw;
  for (const [from, to] of pairs) {
    if (!out.includes(from)) return { error: "anchor missing: " + from.slice(0, 90) };
    if (out.split(from).length !== 2) return { error: "anchor not unique: " + from.slice(0, 90) };
    out = out.replace(from, to);
  }
  const p = path.join(__dirname, `.ctl-tmv-${process.pid}-${label}.js`);
  fs.writeFileSync(p, wasCrlf ? out.replace(/\n/g, "\r\n") : out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

function mkMod(name) {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(path.join(dir, "common", "technologies"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), `name="${name}"\nsupported_version="1.19.*"\n`, "utf8");
  return dir;
}
const BASE = {
  folder: "infantry_folder", x: 1, y: 1, researchCost: 2, startYear: 1936,
  categories: ["infantry_tech"], enableEquipments: [], subTechnologies: [], mutuallyExclusive: [],
  prerequisites: [], dependencies: [], leadsTo: [], pathMeta: {}, aiWillDo: "", extraScript: "",
  authoredFields: { research_cost: true, start_year: true },
};
const techWritten = (mod, id) => {
  const d = path.join(mod, "common", "technologies");
  try {
    return fs.readdirSync(d).some((f) => fs.readFileSync(path.join(d, f), "utf8").includes(`${id} = {`));
  } catch (_) { return false; }
};

let PORT = 44520;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      get: (u) => fetch(`http://127.0.0.1:${PORT}${u}`).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      post: (u, b) => fetch(`http://127.0.0.1:${PORT}${u}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) })
        .then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}
async function save(api, mod, id, modifiers) {
  const cat = await api.get(`/api/technologies/catalog?modPath=${encodeURIComponent(mod)}`);
  return api.post("/api/technologies/save", {
    modPath: mod, tech: { ...BASE, id, modifiers }, allTechs: (cat.b && cat.b.technologies) || [],
  });
}

(async () => {
  let api = null;
  try {
    console.log("\n[ground truth] Nova ships the vocabulary this needs");
    const spec = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "hoi4-spec.json"), "utf8"));
    const list = spec.modifiers || [];
    const names = new Set((Array.isArray(list) ? list.map((m) => (m && (m.name || m.id)) || m) : Object.keys(list)));
    rec("data/hoi4-spec.json carries hundreds of country modifiers", names.size >= 500, names.size);
    rec("…including the real ones a tech would use",
      names.has("army_org_factor") && names.has("research_speed_factor"), "missing a known-good name");
    rec("…and NOT the one from the report", !names.has("communications_relay_bonus"), "spec knows it after all");

    api = await serve(createApp());
    const mod = mkMod("m");

    console.log("\n[the bug] an invented modifier is named, and the tech is still written");
    const a = await save(api, mod, "nuaC_signals_relay", "army_org_factor = 0.02\ncommunications_relay_bonus = 0.01");
    rec("the save succeeds", a.s === 200 && a.b.ok, a.b);
    rec("…and warns", !!a.b.refWarning, "no warning");
    rec("…naming the offender", /communications_relay_bonus/.test(String(a.b.refWarning)), a.b.refWarning);
    rec("…and not the valid one beside it", !/army_org_factor/.test(String(a.b.refWarning)), a.b.refWarning);
    rec("…explaining that the game drops the whole technology",
      /drops the whole technology/i.test(String(a.b.refWarning)), a.b.refWarning);
    rec("the tech is written anyway — a warning is not a refusal", techWritten(mod, "nuaC_signals_relay"), "not written");

    // These assert about the MODIFIER verdict, not about the response carrying no warning at all: the
    // refWarning channel is shared, and a fixture tech with no prerequisites legitimately also draws the
    // "no grid box" warning (#tech-without-gridbox). Asserting the whole field was empty made this test
    // fail the moment a second, correct check started using the same channel.
    const modWarn = (r) => { const w = String((r.b && r.b.refWarning) || ""); return /modifier/i.test(w) ? w : ""; };
    console.log("\n[no false alarms]");
    const b = await save(api, mod, "nuaC_clean", "army_org_factor = 0.02\nresearch_speed_factor = 0.05");
    rec("real modifiers stay silent", b.s === 200 && !modWarn(b), b.b.refWarning);
    const d = await save(api, mod, "nuaC_comment", "army_org_factor = 0.02\n# communications_relay_bonus = 0.01");
    rec("a commented-out line does not count", !modWarn(d), d.b.refWarning);
    const e = await save(api, mod, "nuaC_block", "targeted_modifier = {\n\ttag = SOV\n\tattack_bonus = 0.1\n}");
    rec("a nested block is a different vocabulary and is left alone", !modWarn(e), e.b.refWarning);
    const f = await save(api, mod, "nuaC_empty", "");
    rec("an empty modifier box says nothing", !modWarn(f), f.b.refWarning);

    console.log("\n[a modifier the mod DEFINES ITSELF is not invented]");
    // #modifier-vocab-misses-definitions — the vocabulary read common/modifiers (dynamic modifiers) but not
    // common/modifier_definitions, where a mod declares its own CUSTOM modifiers. Old World Blues declares
    // 91 of those, Millennium Dawn 123, Rise of Nations 4, vanilla 3.
    //
    // Measured across the shipping corpora, none of them is currently spent in a technology's top-level
    // reward modifier, so this fixed no live false alarm — a reward modifier on a tech is rare (0 in vanilla,
    // 7 in MD, 7 in Rise of Nations, 10 in Road to 56). That is exactly why it matters: almost every reward
    // modifier Nova helps write is a NEW one, and a modder working in a mod with 123 custom modifiers is the
    // likeliest author of the first. Telling them "HOI4 drops the whole technology" about a modifier their
    // own mod defines is the cry-wolf failure this validator exists to avoid.
    const defMod = mkMod("withdefs");
    fs.mkdirSync(path.join(defMod, "common", "modifier_definitions"), { recursive: true });
    fs.writeFileSync(path.join(defMod, "common", "modifier_definitions", "01_custom.txt"),
      "nova_custom_relay_bonus = {\n\tcolor_type = good\n\tvalue_type = number\n}\n", "utf8");
    const h = await save(api, defMod, "nuaC_custom", "army_org_factor = 0.02\nnova_custom_relay_bonus = 0.01");
    rec("a modifier declared in common/modifier_definitions is accepted",
      h.s === 200 && !/nova_custom_relay_bonus/.test(String(h.b.refWarning || "")), h.b.refWarning);
    // ⭐ CONTROL: the same mod must still catch a genuinely invented name, or this has simply muted the rule.
    const i2 = await save(api, defMod, "nuaC_custom_bad", "nova_custom_relay_bonus = 0.01\nnot_a_real_modifier = 0.5");
    rec("…while an undeclared name in the same mod is still caught",
      /not_a_real_modifier/.test(String(i2.b.refWarning || "")), i2.b.refWarning);
    rec("…and the declared one is not dragged in with it",
      !/nova_custom_relay_bonus/.test(String(i2.b.refWarning || "")), i2.b.refWarning);

    console.log("\n[several] every offender is listed, once");
    const g = await save(api, mod, "nuaC_many", "made_up_one = 1\narmy_org_factor = 0.02\nmade_up_two = 2\nmade_up_one = 3");
    rec("both invented names appear",
      /made_up_one/.test(String(g.b.refWarning)) && /made_up_two/.test(String(g.b.refWarning)), g.b.refWarning);
    rec("…and the repeat is not listed twice",
      (String(g.b.refWarning).match(/made_up_one/g) || []).length === 1, g.b.refWarning);

    console.log("\n[the client must show it]");
    const clientSrc = fs.readFileSync(path.join(__dirname, "public", "research.js"), "utf8");
    // The surface MOVED, and that is the point of #write-notes-reach-one-page: research.js was the only
    // client that ever read `refWarning`, so this same message was thrown away by events, decisions,
    // characters, army, MIO and Country Setup. It is now shown for every one of them by the write-note
    // surface in public/loading-overlay.js — the single script each maker page already loads.
    const overlaySrc = fs.readFileSync(path.join(__dirname, "public", "loading-overlay.js"), "utf8");
    rec("the shared write-note surface reads refWarning", /body\.refWarning/.test(overlaySrc), "never read");
    rec("…and puts it in front of the user", /window\.nbAlert \|\| window\.alert/.test(overlaySrc), "read but not shown");
    rec("…and the Research page actually loads that surface",
      /loading-overlay\.js/.test(fs.readFileSync(path.join(__dirname, "public", "research.html"), "utf8")),
      "research.html does not load loading-overlay.js, so nothing would show it here");
    rec("…while research.js no longer shows it too, which would dialog the user twice",
      !/nbAlert\(result\.refWarning\)/.test(clientSrc), "still shown locally as well");
    api.stop(); api = null;

    console.log("\n[back-out] stop checking the vocabulary");
    {
      const built = controlApp("nocheck", [[
        // The signature gained a modRoot when the vocabulary stopped being the static spec list alone
        // (#tech-modifier-crywolf); keep this anchor on the real call or the control silently patches nothing.
        "      const bad = unknownTechModifiers(tech.modifiers, activeRoot);",
        "      const bad = [];"]]);
      if (built.error) rec("the control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        const cmod = mkMod("ctl");
        try {
          const c = await save(capi, cmod, "nuaC_signals_relay", "army_org_factor = 0.02\ncommunications_relay_bonus = 0.01");
          rec("…and the tech is written with nothing said",
            c.s === 200 && c.b.ok && !modWarn(c) && techWritten(cmod, "nuaC_signals_relay"), c.b);
        } finally { capi.stop(); }
      }
    }

    console.log(`\n=== tech modifier validation: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (api) api.stop(); } catch (_) {}
    for (const p of ctlFiles) { try { fs.unlinkSync(p); } catch (_) {} }
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
