// #country-file-match, the OTHER half — A BLIND READER MADE THE WRITER WIPE THE BASE MOD'S WORK.
//
// Found by a hunt on writes against layered content, then reproduced by hand before it was believed.
//
// The note above `countryHistoryFileMatches` records this exact bug happening once already: the reader and
// the writer disagreed about which file is a country's, "so a save read [] and then rebuilt the region from
// just the new entry — silently wiping every prior variant/stockpile". That was fixed for the FILENAME
// predicate and never for the ROOT. `findModCountryFile` still read only the active mod, while the writer
// (`ensureCountryHistoryFileInMod` → `findCountryHistoryFile`) resolves active → dependencies → vanilla.
//
// So for an add-on whose BASE mod owns the country file, every reader built on that one function answered
// empty, and the next save rebuilt its managed region from just the new entry. Measured against a base mod
// owning ZZA:
//
//                          active mod owns it     across a dependency
//   stockpile entries               2                     0
//   naval/air OOB refs        {naval, air}                {}
//
// Three separate kinds of content funnel through this one reader — equipment variants, starting stockpile,
// and naval/air OOB references — which is why a single blind reader cost all three. The GET answering
// `{ok:true, entries:[]}` is what makes it dangerous: it is an honest-looking success, so the client's own
// anti-wipe guard (which only fires on `{ok:false}` or a throw) cannot see anything wrong, the page says
// "No starting stockpile yet", and the author adds one entry on top of nothing.
//
// The fix resolves the reader the way the writer already does. The writer still copies into the ACTIVE mod,
// so an edit continues to land in the author's own mod — it just no longer starts from an empty base. That
// second half is asserted below, because "read the base" must not become "write the base".
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-layrd-"));
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
  const p = path.join(__dirname, `.ctl-layrd-${process.pid}-${label}.js`);
  fs.writeFileSync(p, wasCrlf ? out.replace(/\n/g, "\r\n") : out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

const toPosix = (p) => p.split(path.sep).join("/");
const HIST = [
  "capital = 5",
  "set_research_slots = 3",
  "",
  "# >>> NOVA starting stockpile (managed by Nova — do not edit inside) >>>",
  '# NOVA-STOCKPILE {"type":"infantry_equipment_1","amount":5000}',
  "add_equipment_to_stockpile = {",
  "\ttype = infantry_equipment_1",
  "\tamount = 5000",
  "}",
  '# NOVA-STOCKPILE {"type":"artillery_equipment_1","amount":300}',
  "add_equipment_to_stockpile = {",
  "\ttype = artillery_equipment_1",
  "\tamount = 300",
  "}",
  "# <<< NOVA starting stockpile <<<",
  "",
  "# >>> NOVA naval/air OOB >>>",
  '# NOVA-OOBREF {"naval":"ZZA_nova_navy","air":"ZZA_nova_air"}',
  'set_naval_oob = "ZZA_nova_navy"',
  'set_air_oob = "ZZA_nova_air"',
  "# <<< NOVA naval/air OOB <<<",
  "",
].join("\n");
const HIST_FILE = "ZZA - Baseland.txt";

let seq = 0;
function mkMod(name, opts) {
  const dir = path.join(ROOT, name + (++seq));
  fs.mkdirSync(path.join(dir, "history", "countries"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"),
    'name="' + opts.modName + '"\nsupported_version="1.19.*"\n'
    + (opts.dependsOn ? 'dependencies={ "' + opts.dependsOn + '" }\n' : ""), "utf8");
  fs.writeFileSync(path.join(ROOT, name + seq + ".mod"),
    'name="' + opts.modName + '"\npath="' + toPosix(dir) + '"\nsupported_version="1.19.*"\n', "utf8");
  if (opts.hist) fs.writeFileSync(path.join(dir, "history", "countries", HIST_FILE), HIST, "utf8");
  return dir;
}
const histOf = (dir) => {
  const f = path.join(dir, "history", "countries", HIST_FILE);
  return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "";
};

let PORT = 49000;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      get: (u) => fetch("http://127.0.0.1:" + PORT + u).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      post: (u, body) => fetch("http://127.0.0.1:" + PORT + u, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}
async function readBoth(api, dir) {
  const sp = await api.get("/api/army/stockpile?modPath=" + encodeURIComponent(dir) + "&tag=ZZA");
  const na = await api.get("/api/army/naval-air?modPath=" + encodeURIComponent(dir) + "&tag=ZZA");
  return { entries: (sp.b.entries || []).length, refs: na.b.refs || {} };
}

(async () => {
  let api = null;
  try {
    api = await serve(createApp());

    console.log("\n[the control] the same bytes, owned by the active mod");
    const own = mkMod("own", { modName: "Own", hist: true });
    const ctl = await readBoth(api, own);
    rec("the stockpile is read", ctl.entries === 2, ctl);
    rec("…and the OOB references are too", ctl.refs.naval === "ZZA_nova_navy" && ctl.refs.air === "ZZA_nova_air", ctl.refs);

    console.log("\n[across a dependency] the very same bytes must read the same");
    const base = mkMod("baseZ", { modName: "BaseZ", hist: true });
    const addon = mkMod("addonZ", { modName: "AddOnZ", dependsOn: "BaseZ", hist: false });
    const lay = await readBoth(api, addon);
    rec("the base mod's stockpile is read", lay.entries === ctl.entries, { layered: lay.entries, control: ctl.entries });
    rec("…and its OOB references are read", lay.refs.naval === ctl.refs.naval && lay.refs.air === ctl.refs.air, lay.refs);

    console.log("\n[and the write still belongs to the ACTIVE mod] reading the base must not become writing it");
    const baseBefore = histOf(base);
    const w = await api.post("/api/army/stockpile", {
      modPath: addon, tag: "ZZA",
      entries: [
        { type: "infantry_equipment_1", amount: 5000 },
        { type: "artillery_equipment_1", amount: 300 },
        { type: "convoy_1", amount: 50 },
      ],
    });
    rec("the save succeeds", w.b && w.b.ok === true, w.b);
    rec("…the BASE mod's file is byte-identical afterwards", histOf(base) === baseBefore, "the base mod was modified");
    const addonText = histOf(addon);
    rec("…the add-on now owns a copy", addonText.length > 0, "no file written into the add-on");
    rec("…carrying the inherited entries, not just the new one",
      addonText.includes("infantry_equipment_1") && addonText.includes("artillery_equipment_1"), addonText.slice(0, 400));
    rec("…and the new entry", addonText.includes("convoy_1"), addonText.slice(0, 400));
    rec("…with the base's other content carried across too",
      /capital = 5/.test(addonText) && /set_air_oob/.test(addonText), addonText.slice(0, 300));
    api.stop(); api = null;

    console.log("\n[back-out] read only the active mod again");
    {
      const built = controlApp("blindreader", [[
        "    try {\n      const found = findCountryHistoryFile(modRoot, tag);\n      if (found && found.path) return found.path;\n    } catch (_) { /* fall through to the active-mod-only scan below */ }",
        "    // (resolver removed)"]]);
      if (built.error) rec("the control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        try {
          mkMod("cbase", { modName: "CBase", hist: true });
          const caddon = mkMod("caddon", { modName: "CAddOn", dependsOn: "CBase", hist: false });
          const c = await readBoth(capi, caddon);
          rec("…the inherited stockpile reads as EMPTY", c.entries === 0, c);
          rec("…and the OOB references vanish", !c.refs.naval && !c.refs.air, c.refs);
          const cw = await capi.post("/api/army/stockpile", { modPath: caddon, tag: "ZZA", entries: [{ type: "convoy_1", amount: 50 }] });
          const ct = histOf(caddon);
          rec("…while the save still reports success", cw.b && cw.b.ok === true, cw.b);
          rec("…having written a copy that lost the inherited entries",
            ct.includes("convoy_1") && !ct.includes("infantry_equipment_1"), ct.slice(0, 300));
        } finally { capi.stop(); }
      }
    }

    console.log(`\n=== layered country readers: ${checks} checks, ${fails.length} failed ===`);
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
