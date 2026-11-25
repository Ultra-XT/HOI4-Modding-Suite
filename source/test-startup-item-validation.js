// #startup-item-unvalidated / #country-create-unvalidated — values that go straight into HOI4 script must be
// checked before they are written.
//
// Three write paths interpolated user input into script with no guard, while their siblings in the same
// handlers were validated carefully:
//
//   - set-startup with an itemType matching nothing fell through an if/else chain that had no else, so the
//     file was written back unchanged and the endpoint answered ok — but not before materialising a full
//     vanilla-copy history override for that country, which then silently overrides vanilla forever;
//   - set-startup / set-startup-all with an id containing a brace, space, quote or `#` produced unloadable
//     script, and the matching remove could no longer find its own line, so damage compounded on the next save;
//   - countries/create wrote `color` and `graphicalCulture` verbatim, so a brace produced a file with more
//     closes than opens while the country was still registered in country_tags and listed by the catalog.
//
// None are reachable from the UI. They are hardening — but a corrupted history file, or a country that exists
// in the tag list and cannot load, is not something a user can easily undo.
//
// Both directions: every refusal below must NOT fire for legitimate input, or the makers stop working.
//
// Hermetic: fake mod under tmpdir.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-startupval-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 260));
  }
}

const MOD = path.join(ROOT, "valmod");
["history/countries", "common/ideas", "common/country_tags", "common/countries"].forEach((d) =>
  fs.mkdirSync(path.join(MOD, ...d.split("/")), { recursive: true }));
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="ValMod"\nsupported_version="1.18.*"\n', "utf8");
fs.writeFileSync(path.join(MOD, "common", "ideas", "custom_ideas.txt"),
  "ideas = {\n\tcountry = {\n\t\tnua_val_spirit = { removal_cost = -1 }\n\t}\n}\n", "utf8");
fs.writeFileSync(path.join(MOD, "history", "countries", "NVL - Valland.txt"), "capital = 1\n", "utf8");

const PORT = 42181;
const app = createApp();
const server = app.listen(PORT, async () => {
  const post = async (route, body) => {
    const r = await fetch(`http://127.0.0.1:${PORT}${route}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const histFiles = () => { try { return fs.readdirSync(path.join(MOD, "history", "countries")); } catch (_) { return []; } };
  const balanced = (p) => {
    if (!fs.existsSync(p)) return true;
    const t = fs.readFileSync(p, "utf8").replace(/#[^\n]*/g, "");
    return (t.match(/\{/g) || []).length === (t.match(/\}/g) || []).length;
  };
  const HIST = path.join(MOD, "history", "countries", "NVL - Valland.txt");

  try {
    // ── CONTROL FIRST: legitimate input must still work ─────────────────────────────────────────
    console.log("\n[control] real ids and types still work");
    const good = await post("/api/history/set-startup", {
      modPath: MOD, tag: "NVL", itemId: "nua_val_spirit", itemType: "spirit", active: true,
    });
    rec("a valid spirit was wired", good.status === 200 && good.body && good.body.ok !== false, good.body || good.status);
    rec("…and the history file is valid script", balanced(HIST), fs.readFileSync(HIST, "utf8"));

    // ── UNKNOWN ITEM TYPE ───────────────────────────────────────────────────────────────────────
    console.log("\n[unknown itemType] must refuse, and must not materialise a vanilla override");
    const before = histFiles().length;
    const badType = await post("/api/history/set-startup", {
      modPath: MOD, tag: "SWI", itemId: "whatever", itemType: "not_a_real_type", active: true,
    });
    rec("it was refused", !(badType.body && badType.body.ok === true), badType.body || badType.status);
    rec("…and names the types it does accept", /spirit|technology|character|event|decision/.test(
      String((badType.body && badType.body.error) || "")), badType.body);
    rec("…and no country history file was created", histFiles().length === before, histFiles());

    // ── MALFORMED ITEM IDS ──────────────────────────────────────────────────────────────────────
    console.log("\n[malformed itemId] must refuse rather than write unloadable script");
    const BAD = [
      ["bad}brace", "spirit"],
      ["x = { evil", "decision"],
      ["a b", "spirit"],
      ["#comment", "spirit"],
      ["weird id.1", "event"],
    ];
    for (const [id, type] of BAD) {
      const r = await post("/api/history/set-startup", { modPath: MOD, tag: "NVL", itemId: id, itemType: type, active: true });
      rec(`refused ${type} id ${JSON.stringify(id)}`, !(r.body && r.body.ok === true), r.body || r.status);
    }
    rec("the history file is STILL valid script", balanced(HIST), fs.readFileSync(HIST, "utf8"));

    // set-startup-all writes the same script for every country at once.
    const allBad = await post("/api/history/set-startup-all", {
      modPath: MOD, itemId: "bad}brace", itemType: "spirit", active: true,
    });
    rec("set-startup-all refuses it too", !(allBad.body && allBad.body.ok === true), allBad.body || allBad.status);

    // A real event id must still be accepted — the event rule is the stricter one.
    const okEvent = await post("/api/history/set-startup", {
      modPath: MOD, tag: "NVL", itemId: "nua_val.3", itemType: "event", active: true,
    });
    rec("a real event id (namespace.number) is accepted",
      okEvent.status === 200 && okEvent.body && okEvent.body.ok !== false, okEvent.body || okEvent.status);

    // ── COUNTRY CREATE ──────────────────────────────────────────────────────────────────────────
    console.log("\n[countries/create] colour and graphical culture");
    const badColor = await post("/api/countries/create", {
      modPath: MOD, tag: "NVK", name: "Brace Colour", color: "}", graphicalCulture: "western_european_gfx",
      capitalStateId: 710,
    });
    rec("a brace as a colour is refused", !(badColor.body && badColor.body.ok === true), badColor.body || badColor.status);
    const badCulture = await post("/api/countries/create", {
      modPath: MOD, tag: "NVJ", name: "Brace Culture", color: "10 20 30", graphicalCulture: "x_gfx }",
      capitalStateId: 710,
    });
    rec("a brace in graphical culture is refused", !(badCulture.body && badCulture.body.ok === true),
      badCulture.body || badCulture.status);
    rec("…and neither country file was written",
      !fs.existsSync(path.join(MOD, "common", "countries", "Brace Colour.txt")) &&
      !fs.existsSync(path.join(MOD, "common", "countries", "Brace Culture.txt")),
      (() => { try { return fs.readdirSync(path.join(MOD, "common", "countries")); } catch (_) { return []; } })());

    const okCountry = await post("/api/countries/create", {
      modPath: MOD, tag: "NVG", name: "Good Country", color: "150 20 20",
      graphicalCulture: "western_european_gfx", capitalStateId: 710,
    });
    rec("a legitimate country is still created",
      okCountry.status === 200 && okCountry.body && okCountry.body.ok !== false, okCountry.body || okCountry.status);

    console.log(`\n=== startup item + country validation: ${checks} checks, ${fails.length} failed ===`);
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
