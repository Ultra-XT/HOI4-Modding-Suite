// #mio-loc-codes-stripped-on-load — opening a company and pressing Save with NO edits permanently deleted
// every §colour code and every [scope] token from its name, its description and every trait name.
//
// /api/mio/detail is the MIO editor's LOAD endpoint. It ran every localised string through a display
// sanitiser — `.replace(/§[A-Za-z0-9!]/g,"").replace(/\[[^\]]*\]/g,"").replace(/£\S+/g,"").trim()` — and
// returned the stripped text as `name`, `desc` and each `traits[].name`. mio-editor.js:355 puts those values
// straight into the editor state and posts them back verbatim on the next save, where upsertMioLoc rewrites
// the .yml line. So a company called "§YGolden§! Works" whose description read "Owned by [ROOT.GetLeader]"
// came back as "Golden Works" / "Owned by", and the next Save wrote that over the author's real text. There
// was nothing to undo to, nothing warned, and the save reported ok.
//
// An edit surface must hand back exactly what is in the file. The stripping moved to the in-game PREVIEW in
// mio-editor.js (syncPreview), which is the same split decisions and events already use. The two sibling
// copies of the helper elsewhere in server.js are display-only and are intentionally left alone.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-mioloc-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "probe");
fs.mkdirSync(MOD, { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="M"\nsupported_version="1.18.*"\n');

const NAME = "§YGolden§! Works";
const DESC = "Owned by [ROOT.GetLeader] §Rred§! and £PP costly";
const TNAME = "§GFast§! tracks";

const PORT = 39981, app = createApp();
const server = app.listen(PORT, async () => {
  const post = (b) => fetch(`http://127.0.0.1:${PORT}/api/mio`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json());
  const detail = () => fetch(`http://127.0.0.1:${PORT}/api/mio/detail?modPath=${encodeURIComponent(MOD)}&id=mio_probe`).then((r) => r.json());
  try {
    const base = {
      modPath: MOD, id: "mio_probe", name: NAME, desc: DESC, allowedTag: "GER", icon: "",
      fileName: "nova_mio.txt", equipmentType: ["medium_tank_chassis"], researchCategories: [], include: [],
      initial: { equipmentBonus: {}, productionBonus: {} }, companyType: "tank",
      traits: [{ token: "t1", name: TNAME, x: 0, y: 0, relativeTo: "", icon: "", parents: [], equipmentBonus: { reliability_mult: 0.05 }, productionBonus: {} }],
    };
    const created = await post(base);
    ok("the company saves", created && created.ok, created);

    const YML = path.join(MOD, "localisation", "english", "nova_mio_l_english.yml");
    ok("…and wrote a localisation file", fs.existsSync(YML), YML);
    const yml1 = fs.readFileSync(YML, "utf8");
    ok("the file holds the author's exact name", yml1.includes(NAME), yml1.slice(0, 300));
    ok("…and the exact description", yml1.includes(DESC), yml1.slice(0, 300));

    // ── the LOAD endpoint must not sanitise ──────────────────────────────────────────────────────
    const det = await detail();
    ok("detail loads", det && det.ok, det);
    ok("the name round-trips byte-for-byte", det.name === NAME, { got: det.name, want: NAME });
    ok("the description round-trips, scope token and all", det.desc === DESC, { got: det.desc, want: DESC });
    ok("the trait name round-trips", ((det.traits || [])[0] || {}).name === TNAME, (det.traits || [])[0]);

    // ── open + save with no edits must be byte-identical ────────────────────────────────────────
    const resave = Object.assign({}, base, {
      name: det.name, desc: det.desc,
      traits: [Object.assign({}, base.traits[0], { name: ((det.traits || [])[0] || {}).name })],
    });
    const r2 = await post(resave);
    ok("the no-edit save succeeds", r2 && r2.ok, r2);
    const yml2 = fs.readFileSync(YML, "utf8");
    ok("OPEN + SAVE WITH NO EDITS IS BYTE-IDENTICAL", yml1 === yml2, { before: yml1.slice(0, 240), after: yml2.slice(0, 240) });
    ok("…the colour codes are still there", yml2.includes("§Y") && yml2.includes("§G"), yml2.slice(0, 300));
    ok("…the scope token is still there", yml2.includes("[ROOT.GetLeader]"), yml2.slice(0, 300));
    ok("…and the £ icon token survived too", yml2.includes("£PP"), yml2.slice(0, 300));

    // A second cycle must also be stable (the original loss was one-shot and then "stable" at the damage).
    const det2 = await detail();
    await post(Object.assign({}, base, { name: det2.name, desc: det2.desc, traits: [Object.assign({}, base.traits[0], { name: ((det2.traits || [])[0] || {}).name })] }));
    ok("a second open+save cycle is still byte-identical", fs.readFileSync(YML, "utf8") === yml1, fs.readFileSync(YML, "utf8").slice(0, 240));

    // ── plain text must be unaffected ────────────────────────────────────────────────────────────
    const plain = Object.assign({}, base, { id: "mio_plain", name: "Plain Works", desc: "No codes here.", traits: [Object.assign({}, base.traits[0], { token: "t2", name: "Plain trait" })] });
    await post(plain);
    const pd = await fetch(`http://127.0.0.1:${PORT}/api/mio/detail?modPath=${encodeURIComponent(MOD)}&id=mio_plain`).then((r) => r.json());
    ok("a company with no codes is unchanged by the fix", pd.ok && pd.name === "Plain Works" && pd.desc === "No codes here.", { n: pd.name, d: pd.desc });

    // ── the source split: server keeps bytes, the preview sanitises ─────────────────────────────
    const srv = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
    const handler = srv.slice(srv.indexOf('app.get("/api/mio/detail"'), srv.indexOf('app.get("/api/mio/categories"'));
    ok("the detail handler no longer strips on load", !/cleanLoc/.test(handler), "cleanLoc still in the load path");
    ok("…and explains why", /#mio-loc-codes-stripped-on-load/.test(handler), "no marker comment");
    const cli = fs.readFileSync(path.join(__dirname, "public", "mio-editor.js"), "utf8");
    ok("the preview does the stripping now", /var disp = function \(v\)/.test(cli), "no disp helper");
    ok("…and applies it to the name", /set\("previewIdeaName", nm\)/.test(cli) && /var nm = disp\(d\.name\)/.test(cli), "name not sanitised for preview");
    ok("…the description", /set\("tooltipIdeaDesc", disp\(d\.desc\)/.test(cli), "desc not sanitised for preview");
    ok("…and each trait name", /line\("Company trait", disp\(t\.name\)/.test(cli), "trait not sanitised for preview");
    ok("the form itself still posts the raw value", /name: d\.name\.trim\(\)/.test(cli), "save path changed");
    const html = fs.readFileSync(path.join(__dirname, "public", "ideas.html"), "utf8");
    // At least, not exactly — an exact pin turns every future bump of this file into a false failure.
    ok("the client cache version was bumped",
      (() => { const m = /mio-editor\.js\?v=(\d+)/.exec(html); return !!m && Number(m[1]) >= 8; })(), "stale cache version");

    console.log("\ntest-mio-loc-codes-preserved: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 21 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
