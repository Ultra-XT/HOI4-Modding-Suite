// #country-tag-shape — NOVA DISAGREED WITH ITSELF ABOUT WHAT A COUNTRY TAG IS, IN BOTH DIRECTIONS.
//
// 🈯 GROUND TRUTH, measured across vanilla + every installed workshop mod (see the corpus check below):
//     1,186 distinct country tags. All exactly 3 characters. All uppercase.
//     79 of them CONTAIN a digit — vanilla's own dynamic countries D01…, C01… .
//     ZERO of them START with a digit, because a Paradox token may not begin with one.
//   So the shape is exactly  ^[A-Z][A-Z0-9]{2}$ .
//
// Nova used two different WRONG shapes, on opposite sides:
//
//   TOO LOOSE — [A-Z0-9]{3} on the three CREATE gates (New Mod wizard, Country Setup, the Map's ✨ New
//   country flow). They accepted "0AB". That writes `0AB = "countries/…"` into common/country_tags/<file>.txt,
//   a token starting with a digit, which does not tokenise — and it takes the REST OF THAT FILE with it, so
//   the damage is not limited to the country the author just made.
//
//   TOO TIGHT — [A-Z]{3} in a family of READERS. They are blind to all 79 digit-bearing tags, and to the tag
//   NOVA ITSELF SUGGESTS: /api/map/free-tag pre-fills the Map's New-country box with a letter+two-digit tag
//   (Z00, Z01, …) precisely so it cannot clash with a 3-letter one. So the DEFAULT tag on the recommended
//   beginner path was the one shape those readers refused to see:
//     · the MIO scanner could not tell the company was the country's, so "Designed by" fell back to generic;
//     · the events "what fires this?" panel mistook a `Z00 = { country_event = … }` COUNTRY SCOPE for the
//       name of the button firing the event, because it only skipped 3-LETTER scopes;
//     · Genesis rendered the same scope as an unknown block instead of "For Z00: …".
//
// The two halves have to be fixed together: widening the readers without tightening the writers would just
// teach Nova to read tags the game cannot load.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-tagshape-"));
process.env.HOI4_MODS_ROOT = ROOT;
process.env.APPDATA = path.join(ROOT, "appdata");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
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

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const WORKSHOP = "D:/SteamLibrary/steamapps/workshop/content/394360";
const toPosix = (p) => p.split(path.sep).join("/");
const TAG_RE = /^[A-Z][A-Z0-9]{2}$/;

// A mod carrying: a MIO owned by a digit-bearing tag, one owned by a plain 3-letter tag (the control), and a
// scripted GUI whose button fires an event from inside a digit-bearing country scope.
const MOD = path.join(ROOT, "tagmod");
const mk = (...p) => { fs.mkdirSync(path.join(MOD, ...p), { recursive: true }); return path.join(MOD, ...p); };
mk("common", "military_industrial_organization", "organizations");
mk("common", "scripted_guis");
mk("common", "decisions");
mk("common", "country_tags");
mk("common", "countries");
mk("history", "countries");
mk("events");
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="TagMod"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "tagmod.mod"), 'name="TagMod"\npath="' + toPosix(MOD) + '"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(MOD, "common", "country_tags", "zz_tag.txt"), 'Z00 = "countries/Zephyria.txt"\nGER = "countries/Germany.txt"\n');
fs.writeFileSync(path.join(MOD, "common", "countries", "Zephyria.txt"), "graphical_culture = western_european_gfx\n");

fs.writeFileSync(path.join(MOD, "common", "military_industrial_organization", "organizations", "zz_orgs.txt"), [
  "Z00_zephyr_motors = {",
  "\tname = Z00_zephyr_motors",
  "\tinclude = generic_tank_organization",
  "\tequipment_type = { medium_tank_chassis }",
  "}",
  "GER_krupp_stahl = {",
  "\tname = GER_krupp_stahl",
  "\tinclude = generic_tank_organization",
  "\tequipment_type = { medium_tank_chassis }",
  "}",
  "",
].join("\n"), "utf8");

// The event, and the scripted GUI button that fires it from inside a country scope. `Z00 = { … }` is a SCOPE,
// never the name of the firing button — exactly as `GER = { … }` already was.
fs.writeFileSync(path.join(MOD, "events", "zz_events.txt"),
  "add_namespace = zeph\n\ncountry_event = {\n\tid = zeph.1\n\ttitle = zeph.1.t\n\tdesc = zeph.1.d\n\toption = { name = zeph.1.a }\n}\n", "utf8");
fs.writeFileSync(path.join(MOD, "common", "scripted_guis", "zz_gui.txt"), [
  "scripted_gui = {",
  "\tzephyr_council_button = {",
  "\t\tcontext_type = player_context",
  "\t\teffect = {",
  "\t\t\tZ00 = {",
  "\t\t\t\tcountry_event = { id = zeph.1 }",
  "\t\t\t}",
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n"), "utf8");
// CONTROL: the same shape with a plain 3-letter tag, which already worked.
fs.writeFileSync(path.join(MOD, "events", "zz_events2.txt"),
  "add_namespace = zephb\n\ncountry_event = {\n\tid = zephb.1\n\ttitle = zephb.1.t\n\tdesc = zephb.1.d\n\toption = { name = zephb.1.a }\n}\n", "utf8");
fs.writeFileSync(path.join(MOD, "common", "scripted_guis", "zz_gui2.txt"), [
  "scripted_gui = {",
  "\tkrupp_council_button = {",
  "\t\tcontext_type = player_context",
  "\t\teffect = {",
  "\t\t\tGER = {",
  "\t\t\t\tcountry_event = { id = zephb.1 }",
  "\t\t\t}",
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n"), "utf8");

let PORT = 51120;
(async () => {
  let srv = null;
  try {
    srv = await new Promise((r) => { const s = createApp().listen(++PORT, () => r(s)); });
    const B = `http://127.0.0.1:${PORT}`;
    const get = (u) => fetch(B + u).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })).catch((e) => ({ status: 0, body: { error: String(e) } }));
    const post = (u, body) => fetch(B + u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })).catch((e) => ({ status: 0, body: { error: String(e) } }));

    console.log("\n[ground truth] every country tag the installed corpus declares");
    {
      const tags = new Set();
      const scan = (rootDir) => {
        const d = path.join(rootDir, "common", "country_tags");
        let files = []; try { files = fs.readdirSync(d).filter((f) => f.toLowerCase().endsWith(".txt")); } catch (_) { return; }
        for (const f of files) {
          let t = ""; try { t = fs.readFileSync(path.join(d, f), "latin1"); } catch (_) { continue; }
          for (const m of t.replace(/#.*$/gm, "").matchAll(/(?:^|\n)[ \t]*([A-Za-z0-9_]{1,8})[ \t]*=[ \t]*"/g)) tags.add(m[1]);
        }
      };
      scan(GAME);
      try { for (const d of fs.readdirSync(WORKSHOP)) scan(path.join(WORKSHOP, d)); } catch (_) {}
      if (tags.size < 100) console.log("     (no HOI4 corpus installed — skipped)");
      else {
        const all = [...tags];
        const withDigit = all.filter((t) => /[0-9]/.test(t));
        const digitFirst = all.filter((t) => /^[0-9]/.test(t));
        const wrongLen = all.filter((t) => t.length !== 3);
        console.log(`     ${all.length} distinct tags · ${withDigit.length} contain a digit · ${digitFirst.length} start with one · ${wrongLen.length} are not 3 chars`);
        rec("real tags DO contain digits, so a letters-only reader is blind to them", withDigit.length >= 20, withDigit.length);
        rec("…and NONE of them starts with a digit, so a create gate that allows one invents a shape", digitFirst.length === 0, digitFirst.slice(0, 5));
        rec("…every one of them matches the canonical shape", all.every((t) => TAG_RE.test(t)), all.filter((t) => !TAG_RE.test(t)).slice(0, 5));
      }
    }

    console.log("\n[the create gates] refuse a tag HOI4 cannot tokenise");
    {
      const r1 = await post("/api/map/create-country", { modPath: MOD, tag: "0AB", name: "Zeroland", stateIds: [1], capitalStateId: 1 });
      rec("Map ✨ New country refuses a digit-first tag", r1.body && r1.body.ok === false && /letter/i.test(String(r1.body.error || "")), r1.body);
      const r2 = await post("/api/countries/create", { modPath: MOD, tag: "9XY", name: "Nineland", color: "150 20 20", graphicalCulture: "western_european_gfx", capitalStateId: 1 });
      rec("Country Setup refuses a digit-first tag", r2.body && (r2.body.ok === false || r2.status >= 400) && /letter/i.test(String((r2.body || {}).error || "")), r2.body);
      const r3 = await post("/api/mod/create-template", { modName: "ZeroMod", countryName: "Zeroland", countryTag: "7QQ", capitalStateId: 1, color: "#ff0000", dependencies: [] });
      rec("the New Mod wizard refuses a digit-first tag", (r3.body && r3.body.error && /letter/i.test(String(r3.body.error))) || r3.status >= 400, { status: r3.status, body: r3.body });
      rec("…and refusing happened BEFORE anything was written", !fs.existsSync(path.join(ROOT, "ZeroMod")), "a mod directory was created anyway");
    }

    console.log("\n[CONTROL] the same gates still accept the digit-BEARING tag Nova itself suggests");
    {
      // Without this the fix is indistinguishable from "reject more things". Z00 is exactly what
      // /api/map/free-tag pre-fills, so refusing it would break the recommended beginner path outright.
      const mkc = (tag, name) => post("/api/countries/create",
        { modPath: MOD, tag, name, color: "51 136 255", graphicalCulture: "western_european_gfx", capitalStateId: 1 });
      const r = await mkc("Z01", "Zephyria Two");
      rec("Country Setup accepts Z01", r.status < 400 && r.body && !r.body.error, { status: r.status, body: r.body });
      const r2 = await mkc("ZZZ", "Zed");
      rec("…and a plain 3-letter tag still works", r2.status < 400 && r2.body && !r2.body.error, { status: r2.status, body: r2.body });
    }

    console.log("\n[the seam] the tag Nova SUGGESTS must be a tag Nova ACCEPTS");
    {
      const r = await get(`/api/map/free-tag?modPath=${encodeURIComponent(MOD)}`);
      const t = String((r.body || {}).tag || "");
      console.log(`     suggested: ${t || "(none)"}`);
      rec("the Map's suggestion matches the canonical shape", TAG_RE.test(t), r.body);
      rec("…and it is not already taken in this mod", t !== "Z00", r.body);
    }

    console.log("\n[the MIO reader] a digit-bearing tag owns its company");
    {
      const r = await get(`/api/mio/for-equipment?modPath=${encodeURIComponent(MOD)}&archetype=medium_tank_chassis&tag=Z00`);
      const cos = ((r.body || {}).companies) || [];
      const zeph = cos.find((c) => c.id === "Z00_zephyr_motors");
      const krupp = cos.find((c) => c.id === "GER_krupp_stahl");
      console.log("     " + cos.map((c) => `${c.id}[tag=${c.tag || "-"}]`).join("  "));
      rec("the Z00 company is found at all", !!zeph, cos.map((c) => c.id));
      rec("…and Nova knows Z00 owns it", zeph && zeph.tag === "Z00", zeph);
      // ⚠️ This one does NOT discriminate on its own — untagged sorts to the GENERIC tier, which already
      // ranked ahead of another country's company. It is here as an invariant that must survive the widening,
      // not as evidence of it; `zeph.tag === "Z00"` above is the discriminating check.
      rec("…so it ranks ABOVE the other country's company for Z00", zeph && krupp && cos.indexOf(zeph) < cos.indexOf(krupp), cos.map((c) => c.id));
      // CONTROL: the letters-only path it already handled must keep working.
      const r2 = await get(`/api/mio/for-equipment?modPath=${encodeURIComponent(MOD)}&archetype=medium_tank_chassis&tag=GER`);
      const cos2 = ((r2.body || {}).companies) || [];
      const k2 = cos2.find((c) => c.id === "GER_krupp_stahl");
      rec("CONTROL: a 3-LETTER tag still owns its company", k2 && k2.tag === "GER", cos2);
      rec("CONTROL: …and ranks first for that country", k2 && cos2.indexOf(k2) === 0, cos2.map((c) => c.id));
    }

    console.log("\n[the 'what fires this?' panel] a country scope is a scope, not a button name");
    {
      const r = await get(`/api/events/triggers?modPath=${encodeURIComponent(MOD)}&id=zeph.1`);
      const guis = ((r.body || {}).scriptedGuis) || [];
      const names = guis.map((g) => g.gui || g.name || JSON.stringify(g));
      console.log("     reported: " + (names.join(", ") || "(none)"));
      rec("the button is named", names.some((n) => String(n).includes("zephyr_council_button")), names);
      rec("…and the Z00 SCOPE is not mistaken for the button", !names.some((n) => String(n) === "Z00"), names);
      // CONTROL: GER was already skipped — the widening must not stop skipping it.
      const r2 = await get(`/api/events/triggers?modPath=${encodeURIComponent(MOD)}&id=zephb.1`);
      const names2 = (((r2.body || {}).scriptedGuis) || []).map((g) => g.gui || g.name || JSON.stringify(g));
      rec("CONTROL: a 3-letter scope is still skipped", names2.some((n) => String(n).includes("krupp_council_button")) && !names2.some((n) => String(n) === "GER"), names2);
    }

    console.log("\n[the pages] every client-side gate agrees with the canonical shape");
    {
      const src = (f) => { try { return fs.readFileSync(path.join(__dirname, "public", f), "utf8"); } catch (_) { return ""; } };
      // A gate that accepts a digit-first tag on the page is a gate the user meets FIRST — the server refusal
      // is the backstop, not the message they should be reading.
      for (const f of ["map.js", "app.js", "country-setup.js", "army.js"]) {
        const s = src(f);
        rec(`${f} has no digit-first country-tag gate left`, !/\^\[A-Z0-9\]\{3\}\$/.test(s),
          (s.match(/.{0,70}\^\[A-Z0-9\]\{3\}\$.{0,40}/) || [])[0] || "");
      }
      // Genesis turns script into plain English; a country scope it does not recognise renders as an
      // unknown block rather than "For Z00: …".
      const g = src("genesis-engine.js");
      rec("Genesis recognises a digit-bearing tag as a country scope", /\[A-Z\]\[A-Z0-9\]\{2\}/.test(g), "still letters-only");
    }

    srv.closeAllConnections(); srv.close(); srv = null;
    console.log(`\n=== country tag shape: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
