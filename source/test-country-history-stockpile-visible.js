// #stockpile-in-country-history-invisible — NOVA COULD NOT SEE THE STOCKPILE NOVA HAD JUST WRITTEN.
//
// `add_equipment_to_stockpile` is a COUNTRY-HISTORY command. Nova's own /api/army/stockpile writes it into
// history/countries/<TAG>*.txt deliberately — `instant_effect` is not a country-history command — and vanilla
// seeds one the same way for 8 countries across 17 blocks.
//
// /api/units only ever read history/units, and unit-data collects stockpiles solely from `instant_effect`
// blocks inside those files. So none of it was visible, and Country Setup's Starting-units card told the
// author their country "begins with no pre-placed divisions or stockpile" moments after Nova itself had
// seeded one on the Military page — a false statement about Nova's own write.
//
// 🈯 Measured on vanilla: CHI 2 blocks, CZE 2, DEN 1, FIN 2, HUN 1, ITA 5, RAJ 1, SWE 3 — 17 in total, 0 of
// them reported. Through the endpoint after the fix: ITA 5 entries, SWE 3, CHI 2, GER 0.
//
// The country history is resolved through findCountryHistoryFile, which honours replace_path and the whole
// root chain, so what is reported is the stockpile the GAME loads rather than only the mod's own copy.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-stk-"));
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
const toPosix = (p) => p.split(path.sep).join("/");

// A mod with a country whose ONLY starting equipment is in its country history — no history/units at all.
// That is exactly the shape a brand-new Nova country has after the Military page seeds a stockpile.
const MOD = path.join(ROOT, "stkmod");
fs.mkdirSync(path.join(MOD, "history", "countries"), { recursive: true });
fs.mkdirSync(path.join(MOD, "common", "country_tags"), { recursive: true });
fs.mkdirSync(path.join(MOD, "common", "countries"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="StkMod"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "stkmod.mod"),
  'name="StkMod"\npath="' + toPosix(MOD) + '"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(MOD, "common", "country_tags", "zz.txt"), 'STK = "countries/Stockland.txt"\n');
fs.writeFileSync(path.join(MOD, "common", "countries", "Stockland.txt"), "graphical_culture = western_european_gfx\n");
fs.writeFileSync(path.join(MOD, "history", "countries", "STK - Stockland.txt"), [
  "capital = 1",
  "add_equipment_to_stockpile = {",
  "\ttype = infantry_equipment_1",
  "\tamount = 1200",
  "\tproducer = STK",
  "}",
  "add_equipment_to_stockpile = {",
  "\ttype = support_equipment_1",
  "\tamount = 300",
  "\tproducer = STK",
  "}",
  "",
].join("\n"), "utf8");

let PORT = 51010;
(async () => {
  let srv = null;
  try {
    srv = await new Promise((r) => { const s = createApp().listen(++PORT, () => r(s)); });
    const units = (tag, mod) => fetch(`http://127.0.0.1:${PORT}/api/units?country=${tag}&modPath=${encodeURIComponent(mod)}`)
      .then((r) => r.json()).catch((e) => ({ error: String(e) }));

    console.log("\n[ground truth] vanilla seeds stockpiles in country histories, not only in OOB files");
    {
      const dir = path.join(GAME, "history", "countries");
      if (!fs.existsSync(dir)) console.log("     (no HOI4 install — skipped)");
      else {
        let files = 0, blocks = 0;
        for (const f of fs.readdirSync(dir)) {
          if (!f.endsWith(".txt")) continue;
          const n = (fs.readFileSync(path.join(dir, f), "latin1").replace(/#.*$/gm, "").match(/add_equipment_to_stockpile/g) || []).length;
          if (n) { files++; blocks += n; }
        }
        console.log(`     ${files} country histories seed a stockpile, ${blocks} blocks in total`);
        rec("vanilla really does put stockpiles in country histories", files >= 5 && blocks >= 10, { files, blocks });
      }
    }

    console.log("\n[a country whose only equipment is in its history] must not be reported as empty");
    {
      const d = await units("STK", MOD);
      rec("the endpoint answers", d.ok === true, d);
      rec("…there is genuinely no order-of-battle file", d.count === 0, d.count);
      const chs = d.countryHistoryStockpile || {};
      rec("…but the country-history stockpile is reported", (chs.entries || []).length === 2, chs);
      rec("…naming the file it came from", /STK/.test(String(chs.file || "")), chs);
      const agg = (d.aggregate && d.aggregate.stockpile) || [];
      rec("…and it is folded into the aggregate the card reads", agg.length === 2, agg);
      const inf = agg.find((s) => s.type === "infantry_equipment_1");
      rec("…with the right amounts", inf && inf.amount === 1200, agg);
      // The card's empty branch fires only when the aggregate is empty on all three counts, so a country
      // with a history stockpile can no longer be told it "begins with no pre-placed divisions or stockpile".
      rec("…so the card's empty-state branch is not reachable for it",
        !!(agg.length || (d.aggregate.templates || []).length || (d.aggregate.divisions || []).length), d.aggregate);
    }

    console.log("\n[CONTROL — a country with nothing at all] still reports empty");
    {
      // Without this, folding anything into the aggregate would look like a fix while making the empty state
      // unreachable for everyone.
      fs.writeFileSync(path.join(MOD, "common", "country_tags", "zz2.txt"), 'STN = "countries/Nothingland.txt"\n');
      fs.writeFileSync(path.join(MOD, "common", "countries", "Nothingland.txt"), "graphical_culture = western_european_gfx\n");
      fs.writeFileSync(path.join(MOD, "history", "countries", "STN - Nothingland.txt"), "capital = 1\n", "utf8");
      const d = await units("STN", MOD);
      rec("the endpoint answers", d.ok === true, d);
      rec("…no country-history stockpile is invented", ((d.countryHistoryStockpile || {}).entries || []).length === 0, d.countryHistoryStockpile);
      rec("…and the aggregate really is empty", ((d.aggregate || {}).stockpile || []).length === 0, d.aggregate);
    }

    console.log("\n[the real corpus] the counts match what the files say");
    if (fs.existsSync(path.join(GAME, "history", "countries"))) {
      // CHI is the case-sensitivity case: both its blocks are wrapped in `IF = {` in CAPITALS, eight levels
      // deep, and a case-sensitive wrapper check reported China as starting with no equipment at all.
      // FIN is the date-block case: it declares TWO blocks but only ONE is day-one — the other sits inside a
      // `1939.1.1 = { … }` section, which the walker deliberately does not enter, because that is equipment
      // for a 1939 start and not what this country begins with. Counting raw `add_equipment_to_stockpile`
      // occurrences would call that a miss; it is the correct answer.
      for (const [tag, want] of [["ITA", 5], ["SWE", 3], ["CHI", 2], ["FIN", 1], ["GER", 0]]) {
        const d = await units(tag, GAME);
        const n = ((d.countryHistoryStockpile || {}).entries || []).length;
        console.log(`     ${tag}: ${n} country-history stockpile entries (expected ${want})`);
        rec(`${tag} reports ${want}`, n === want, { got: n, want });
      }
    } else console.log("     (no HOI4 install — skipped)");

    console.log("\n[the card] says where the stockpile came from rather than counting files");
    {
      const cs = fs.readFileSync(path.join(__dirname, "public", "country-setup.js"), "utf8");
      rec("it reads the new field", /countryHistoryStockpile/.test(cs), "never read");
      rec("…and does not print '0 files' when the stockpile came from the history",
        /no order-of-battle file yet/.test(cs), "still counts files only");
    }

    srv.closeAllConnections(); srv.close(); srv = null;
    console.log(`\n=== country history stockpile: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
