// ⛔ #stockpile-shows-only-the-part-nova-wrote — THE CARD SAID "EMPTY" FOR EQUIPMENT THE GAME HANDS OUT.
//
// The Army maker's starting-stockpile card reads a sentinel region Nova writes into the country history.
// That is right for the WRITER — the region is its single source of truth — and it was also the only thing
// the card ever showed. So a country whose starting equipment was written by hand read as
//     "No starting stockpile yet — add a type + amount above."
// while the game handed it 150 motorised, 150 armoured cars and three tank designs on day one.
//
// Counted across the installed corpus, Nova displayed 0 of 1,005 hand-written add_equipment_to_stockpile
// blocks: vanilla 17 (8 files) · Novum Vexillum 643 · Millennium Dawn 199 · Old World Blues 98 ·
// Road to 56 44 · Rise of Nations 4. The modder reads "empty", adds the entry again through Nova, and the
// country now gets both.
//
// The overlay question in its usual form: does this show what the GAME will show, or only what the mod's
// own tooling wrote? They are reported READ-ONLY beside the managed ones and never adopted — 878 of the
// 1,005 sit inside an `if` or a dated block, and lifting a modder's statement out of the condition it was
// written under would change what the game does.
"use strict";

// #a-bare-test-run-writes-into-the-real-app-data — FIRST: run bare, the server this starts inherits the sandbox.
require("./safe-write.js");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const PORT = Number(process.env.NOVA_TEST_PORT || 53697);
let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 320) : "")); }
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const COUNTRIES = path.join(GAME, "history", "countries");
if (!fs.existsSync(COUNTRIES)) {
  console.log("  ..   skipped: the base game is not installed at the expected path");
  console.log("\nPASSED 0/0 (skipped)");
  process.exitCode = 0;
} else {
  const roots = [];

  // The premise, DERIVED from the shipped files rather than typed in: which vanilla countries seed a
  // stockpile by hand, and how many entries each has. Comments are stripped first — vanilla's POL has
  // exactly one commented-out entry, which is why a raw grep reports nine files where there are eight.
  const stripComments = (t) => String(t).split("\n").map((l) => l.replace(/#.*$/, "")).join("\n");
  const handWritten = {};
  for (const f of fs.readdirSync(COUNTRIES)) {
    if (!f.toLowerCase().endsWith(".txt")) continue;
    let t = ""; try { t = fs.readFileSync(path.join(COUNTRIES, f), "utf8"); } catch (_) { continue; }
    const n = (stripComments(t).match(/add_equipment_to_stockpile/g) || []).length;
    if (n) handWritten[f.slice(0, 3).toUpperCase()] = n;
  }

  const appdata = fs.mkdtempSync(path.join(os.tmpdir(), "nova-sp-ad-")); roots.push(appdata);
  const mkMod = (name) => {
    const m = fs.mkdtempSync(path.join(os.tmpdir(), "nova-sp-")); roots.push(m);
    fs.writeFileSync(path.join(m, "descriptor.mod"), `version="1.0"\nname="${name}"\n`, "utf8");
    return m;
  };

  const srv = spawn(process.execPath, [path.join(__dirname, "server.js")], {
    env: Object.assign({}, process.env, {
      PORT: String(PORT), APPDATA: appdata, NOVA_APP_DATA_DIR: appdata, NOVA_HOME_DIR: appdata,
    }),
    stdio: ["ignore", "pipe", "pipe"],
  });
  srv.stdout.on("data", () => {}); srv.stderr.on("data", () => {});

  (async () => {
    try {
      let up = false;
      for (let i = 0; i < 160; i++) {
        try { await fetch(`http://127.0.0.1:${PORT}/`); up = true; break; } catch (_) { await new Promise((r) => setTimeout(r, 250)); }
      }
      if (!up) { ok(false, "server came up on " + PORT); return; }

      // Exactly what public/army.js sends.
      const get = async (root, tag) =>
        (await fetch(`http://127.0.0.1:${PORT}/api/army/stockpile?modPath=${encodeURIComponent(root)}&tag=${tag}`)).json();
      const post = async (root, tag, entries) =>
        (await fetch(`http://127.0.0.1:${PORT}/api/army/stockpile`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modPath: root, tag, entries }),
        })).json();

      console.log("\n-- ⭐ the premise: countries really do seed their stockpile by hand --");
      {
        const tags = Object.keys(handWritten);
        ok(tags.length >= 5, `${tags.length} vanilla countries write add_equipment_to_stockpile themselves`, tags);
        ok(handWritten.ITA > 0, "…Italy among them, which the default bookmark plays", handWritten.ITA);
        ok(handWritten.POL === undefined,
          "…and Poland's, which is COMMENTED OUT, is not one of them — masking is not optional here", handWritten.POL);
      }

      console.log("\n-- ⭐ a mod that has not overridden the file still sees what the country gets --");
      {
        // No country files of its own: the reader resolves active -> dependencies -> vanilla, so this is the
        // brand-new-mod case, where a modder is most likely to believe the country starts with nothing.
        const mod = mkMod("Fresh");
        for (const tag of Object.keys(handWritten)) {
          const d = await get(mod, tag);
          ok(d && d.ok && Array.isArray(d.existing) && d.existing.length === handWritten[tag],
            `${tag}: ${handWritten[tag]} hand-written ${handWritten[tag] === 1 ? "entry is" : "entries are"} reported`,
            { got: d && (d.existing || []).length, expected: handWritten[tag], error: d && d.error });
        }
      }

      console.log("\n-- the fields a modder needs to recognise the entry --");
      {
        const mod = mkMod("Fields");
        const d = await get(mod, "ITA");
        const ex = (d && d.existing) || [];
        const byType = (t) => ex.find((e) => e.type === t);
        ok(!!byType("motorized_equipment_1"), "the equipment type comes through", ex.map((e) => e.type));
        ok(byType("motorized_equipment_1") && byType("motorized_equipment_1").amount === 150, "…and the amount",
          byType("motorized_equipment_1"));
        const named = ex.find((e) => e.variant_name);
        ok(named && named.variant_name === "Fiat 3000",
          "…and a quoted variant name, which the comment mask blanks and so must be read from the original", named);
        const withProducer = ex.find((e) => e.producer);
        ok(withProducer && /^[A-Z]{3}$/.test(withProducer.producer), "…and the producer tag", withProducer);
        ok(ex.every((e) => Number(e.line) > 0), "…and the line to go and look at", ex.map((e) => e.line));
      }

      console.log("\n-- ⭐ it says which ones are conditional, because most of them are --");
      {
        const mod = mkMod("Where");
        const ita = await get(mod, "ITA");
        const ex = (ita && ita.existing) || [];
        const top = ex.filter((e) => !e.where);
        const cond = ex.filter((e) => e.where);
        ok(top.length > 0 && cond.length > 0,
          "Italy has both unconditional and conditional entries, so the distinction is not cosmetic",
          { top: top.length, cond: cond.length });
        ok(cond.every((e) => /conditionally/.test(e.where)), "…the conditional ones say so", cond.map((e) => e.where));
        // Vanilla's own ITA file writes `IF` in capitals — Clausewitz does not care and neither may this.
        const src = fs.readFileSync(path.join(COUNTRIES, "ITA - Italy.txt"), "utf8");
        ok(/\bIF\s*=\s*\{/.test(src),
          "…and vanilla really does write `IF` in capitals, which is why the match is case-insensitive");
      }

      console.log("\n-- a country with none reports none — a clean negative --");
      {
        const mod = mkMod("None");
        const none = Object.keys(handWritten);
        const d = await get(mod, "GER");
        ok(!none.includes("GER"), "Germany writes no stockpile of its own (derived, not assumed)");
        ok(d && d.ok && (d.existing || []).length === 0, "…and Nova reports zero for it, not a false positive", d && d.existing);
      }

      console.log("\n-- ⭐ Nova's OWN entries are not reported twice --");
      {
        // The managed region is made of add_equipment_to_stockpile blocks too. A scan that does not exclude
        // it by span shows every entry the user just added a second time.
        const mod = mkMod("Managed");
        const w = await post(mod, "SPA", [{ type: "infantry_equipment_1", amount: 500 }]);
        ok(w && w.ok === true, "an entry saves", w && w.error);
        const d = await get(mod, "SPA");
        ok((d.entries || []).length === 1, "…and reads back once as MANAGED", d.entries);
        ok((d.existing || []).length === 0, "…and NOT also as hand-written", d.existing);
      }

      console.log("\n-- ⭐ CONTROL: saving Nova's region leaves the hand-written entries alone --");
      {
        // The whole reason they are read-only. If a save moved or dropped one, showing them would be worse
        // than not showing them.
        const mod = mkMod("Untouched");
        fs.mkdirSync(path.join(mod, "history", "countries"), { recursive: true });
        const file = path.join(mod, "history", "countries", "ZZA - Zed.txt");
        const before = [
          "capital = 1",
          "add_equipment_to_stockpile = {",
          "\ttype = infantry_equipment_1",
          "\tamount = 111",
          "}",
          "1939.1.1 = {",
          "\tadd_equipment_to_stockpile = {",
          "\t\ttype = artillery_equipment_1",
          "\t\tamount = 222",
          "\t}",
          "}",
          "",
        ].join("\n");
        fs.writeFileSync(file, before, "utf8");

        const d0 = await get(mod, "ZZA");
        ok((d0.existing || []).length === 2, "both hand-written entries are seen, dated one included", d0.existing);
        ok((d0.existing || []).some((e) => e.where === "from 1939.1.1"),
          "…and the dated one is labelled with its date", (d0.existing || []).map((e) => e.where));

        const w = await post(mod, "ZZA", [{ type: "support_equipment_1", amount: 7 }]);
        ok(w && w.ok === true, "Nova adds one of its own", w && w.error);
        const after = fs.readFileSync(file, "utf8");
        ok(/amount = 111/.test(after) && /amount = 222/.test(after), "…and BOTH hand-written entries survive the write", after.slice(0, 200));
        ok(/1939\.1\.1 = \{/.test(after), "…with the dated block still intact");
        const d1 = await get(mod, "ZZA");
        ok((d1.existing || []).length === 2, "…still reported as hand-written, not absorbed", d1.existing);
        ok((d1.entries || []).length === 1, "…and Nova's own is the only managed one", d1.entries);

        // …and clearing Nova's region takes only Nova's.
        const c = await post(mod, "ZZA", []);
        ok(c && c.ok === true, "clearing Nova's entries succeeds", c && c.error);
        const cleared = fs.readFileSync(file, "utf8");
        ok(/amount = 111/.test(cleared) && /amount = 222/.test(cleared),
          "…and the hand-written ones are STILL there — 'remove every entry' was never true");
      }

      console.log("\n-- ⭐ CONTROL: a commented-out entry is not conjured into existence --");
      {
        const mod = mkMod("Commented");
        fs.mkdirSync(path.join(mod, "history", "countries"), { recursive: true });
        fs.writeFileSync(path.join(mod, "history", "countries", "ZZB - Zeb.txt"), [
          "capital = 1",
          "#add_equipment_to_stockpile = {",
          "#\ttype = infantry_equipment_1",
          "#\tamount = 999",
          "#}",
          "",
        ].join("\n"), "utf8");
        const d = await get(mod, "ZZB");
        ok((d.existing || []).length === 0, "a commented-out entry is not reported — this is vanilla's POL", d.existing);
      }

      console.log("\n-- the client shows them, and says they are not its own --");
      {
        const APP = fs.readFileSync(path.join(__dirname, "public", "army.js"), "utf8");
        ok(/S\.stockpileExisting = d\.existing \|\| \[\];/.test(APP), "army.js keeps what the endpoint returned");
        ok(/const existing = S\.stockpileExisting \|\| \[\];/.test(APP), "…and renders it in the stockpile list");
        ok(/Already in this country’s history file/.test(APP), "…labelled as the file's own, not Nova's");
        ok(!/stockpileExisting[\s\S]{0,400}?JSON\.stringify\(\{ modPath/.test(APP),
          "…and never sends it back, which would duplicate every entry");
        ok(/S\.stockpileExisting \|\| \[\]\)\.length/.test(APP),
          "…and the clear-confirm counts what it will really leave behind");
      }
    } catch (e) {
      ok(false, "threw: " + e.message + "\n" + e.stack);
    } finally {
      try { srv.kill(); } catch (_) {}
      setTimeout(() => { try { srv.kill("SIGKILL"); } catch (_) {} }, 800);
      for (const r of roots) { try { fs.rmSync(r, { recursive: true, force: true }); } catch (_) { /* scratch only */ } }
      console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
      process.exitCode = fail ? 1 : 0;
      setTimeout(() => process.exit(fail ? 1 : 0), 1200);
    }
  })();
}
