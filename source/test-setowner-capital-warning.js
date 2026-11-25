// #capital-taken-from-owner — reassigning a state's owner on the map said nothing when it stripped a
// country of its capital.
//
// A country whose `capital = N` points at a state it no longer owns crashes HOI4 the moment that country is
// selected. Creating a country on somebody's capital state has warned about this for a while. Changing a
// state's OWNER on the map does exactly the same thing and returned nothing at all — the modder found out
// only if they happened to run Mod Health later.
//
// That is not hypothetical: the demo mod this campaign has been building acquired precisely this crash, and
// it took a Mod Health run several passes afterwards to notice. The validator does catch it, which is how it
// was eventually found — but a warning you only see if you go looking is not the same as being told.
//
// Not a refusal. Carving territory out of a major is an ordinary thing to want; doing it by accident is not.
// Both paths now share one helper, so they cannot drift apart again.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-setowner-capital-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "setowner_probe");
["history/states", "history/countries", "common/country_tags", "map"].forEach((d) =>
  fs.mkdirSync(path.join(MOD, d), { recursive: true }));
fs.writeFileSync(path.join(MOD, "descriptor.mod"),
  'name="SetOwnerProbe"\nsupported_version="1.19.*"\nreplace_path="history/states"\nreplace_path="map"\n');

const st = (id, prov, owner) =>
  `state = {\n\tid = ${id}\n\tname = "S${id}"\n\tmanpower = 100000\n\tprovinces = { ${prov} }\n\thistory = { owner = ${owner} }\n}\n`;
// AAA's capital is state 1. State 3 is ordinary AAA land. BBB has its own capital, state 2.
fs.writeFileSync(path.join(MOD, "history", "states", "1.txt"), st(1, 1, "AAA"));
fs.writeFileSync(path.join(MOD, "history", "states", "2.txt"), st(2, 2, "BBB"));
fs.writeFileSync(path.join(MOD, "history", "states", "3.txt"), st(3, 3, "AAA"));
// State 4 keeps AAA on the map after both transfers below — the capital rule only looks at countries that
// still OWN LAND, so a country stripped to nothing is deliberately not flagged (it is not selectable either).
fs.writeFileSync(path.join(MOD, "history", "states", "4.txt"), st(4, 4, "AAA"));
fs.writeFileSync(path.join(MOD, "history", "countries", "AAA - Alpha.txt"), 'capital = 1\noob = "AAA"\n');
fs.writeFileSync(path.join(MOD, "history", "countries", "BBB - Beta.txt"), 'capital = 2\noob = "BBB"\n');
fs.writeFileSync(path.join(MOD, "common", "country_tags", "custom.txt"),
  'AAA = "countries/Alpha.txt"\nBBB = "countries/Beta.txt"\n');
fs.writeFileSync(path.join(MOD, "map", "definition.csv"), [
  "0;0;0;0;land;false;unknown;0", "1;200;0;0;land;false;plains;1",
  "2;0;200;0;land;false;plains;1", "3;0;0;200;land;false;plains;1", "4;200;200;0;land;false;plains;1",
].join("\r\n") + "\r\n");

const ownerOf = (id) => { try { return (/owner\s*=\s*(\w+)/.exec(fs.readFileSync(path.join(MOD, "history", "states", id + ".txt"), "utf8")) || [])[1] || ""; } catch (_) { return ""; } };

const PORT = 39603, app = createApp();
const server = app.listen(PORT, async () => {
  const post = (ep, o) => fetch("http://127.0.0.1:" + PORT + ep, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const breathe = () => new Promise((r) => setTimeout(r, 170));
  const setOwner = (stateId, owner) => post("/api/map/set-owner", { modPath: MOD, stateId, owner });

  try {
    // ── taking an ORDINARY state: a territory change, nothing alarming ─────────────────────────────
    const plain = await setOwner(3, "BBB");
    await breathe();
    ok("taking an ordinary state → 200", plain.s === 200, plain.b);
    ok("…the owner really changed", ownerOf(3) === "BBB", ownerOf(3));
    ok("…and it is not reported as a capital loss",
      !/CAPITAL\./.test(String(plain.b && plain.b.capitalWarning || "")), plain.b && plain.b.capitalWarning);
    ok("…though it does say who lost the state", /was owned by AAA/.test(String(plain.b && plain.b.capitalWarning || "")),
      plain.b && plain.b.capitalWarning);

    // ── taking a country's CAPITAL state: the crash case ───────────────────────────────────────────
    await breathe();
    const cap = await setOwner(1, "BBB");
    await breathe();
    const warn = String((cap.b && cap.b.capitalWarning) || "");
    ok("taking a capital state → 200 (allowed, not refused)", cap.s === 200, cap.b);
    ok("…the owner really changed", ownerOf(1) === "BBB", ownerOf(1));
    ok("…and the response WARNS about it", !!warn, cap.b);
    ok("…naming the country that lost its capital", /\bAAA\b/.test(warn), warn);
    ok("…naming the state", /\b1\b/.test(warn), warn);
    // Moved with #a-map-message-matches-what-the-engine-checks: HOI4 REFUSES that capital and logs it — the owner's
    // own error.log carries "Attempting to set capital state #295 for Belgium, they dont own it!" and the game played
    // on for thirteen months after it — so the warning says that, not a crash.
    ok("…and saying what goes wrong in game", /refuses/i.test(warn) && /they dont own it/.test(warn) && !/crash/i.test(warn), warn);

    // ── the validator agrees, so the two halves tell the same story ────────────────────────────────
    await breathe();
    const vr = await fetch("http://127.0.0.1:" + PORT + "/api/map/validate?modPath=" + encodeURIComponent(MOD));
    const v = await vr.json().catch(() => ({}));
    ok("Mod Health independently flags the same problem",
      (v.problems || []).some((p) => p.rule === "capital_state_owned_by_other" && JSON.stringify(p.items || []).includes("AAA")),
      (v.problems || []).filter((p) => p.rule === "capital_state_owned_by_other"));

    // ── giving a state to the country that already owns it says nothing ────────────────────────────
    await breathe();
    const noop = await setOwner(1, "BBB");
    await breathe();
    ok("re-assigning a state to its current owner → 200", noop.s === 200, noop.b);
    ok("…and warns about nothing", !String((noop.b && noop.b.capitalWarning) || ""), noop.b && noop.b.capitalWarning);

    // ── moving a capital must not leave the OLD state's name on the line ──────────────────────────
    // Vanilla annotates it: `capital = 64 # Berlin/Brandeburg`. Replacing only the number left the comment
    // naming the state the capital used to be, so the file asserted something false — `capital = 5 #
    // Berlin/Brandeburg`. Found while relocating Germany's capital out of a state the demo mod had taken.
    await breathe();
    fs.writeFileSync(path.join(MOD, "history", "countries", "AAA - Alpha.txt"), 'capital = 1 # S1/Alphaville\noob = "AAA"\n');
    const moved = await post("/api/map/set-capital", { modPath: MOD, tag: "AAA", stateId: 4 });
    await breathe();
    const aaa = fs.readFileSync(path.join(MOD, "history", "countries", "AAA - Alpha.txt"), "utf8");
    ok("moving a capital → 200", moved.s === 200, moved.b);
    ok("…the new state id is written", /capital\s*=\s*4\b/.test(aaa), aaa.slice(0, 120));
    ok("…and the OLD state's comment is gone", !/Alphaville/.test(aaa), aaa.slice(0, 120));
    ok("…while the rest of the file survives", /oob\s*=\s*"AAA"/.test(aaa), aaa.slice(0, 120));

    // ── the client actually shows it ──────────────────────────────────────────────────────────────
    // The map page BUFFERS writes and flushes them on Save, so a warning returned per write is easy to drop
    // on the floor. This half lives in the client and is exactly what went wrong, so assert the source.
    {
      const src = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
      ok("the map page collects capitalWarning from each write", /res\.capitalWarning/.test(src));
      ok("…and folds it into the post-save warning line", /writeWarnings\.concat\(/.test(src));
      ok("…and shows that line even when nothing else warned", /paintWarnings\.length \|\| writeWarnings\.length/.test(src));
    }

    console.log("\ntest-setowner-capital-warning: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 14 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
