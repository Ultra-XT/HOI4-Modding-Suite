// #mio-blank-trait-silently-dropped — a named company trait was discarded by Save, which still said "✓ Saved".
//
// The trait editor has two boxes, Token (ID) and Name, both carrying a static example placeholder. A trait tree
// is authored by name, and the live in-game preview accepts either — syncPreview filters on `t.token || t.name`
// — so typing only a Name immediately produced "Company trait: <name>" in the preview and the trait looked real.
// save() then built the POST body with `.filter(function (tr) { return tr.token; })`, dropping every trait whose
// Token box was empty, and the pre-flight duplicate check skipped blank tokens (`if (!tk) continue;`) so nothing
// warned. The status line reported an unqualified success and the sidebar showed the company, but the trait node
// — and every equipment/production bonus row the user filled in on it — never reached the file.
//
// Fix: derive the token from the Name the way every other maker derives an id, re-render so the box shows what
// was chosen, and refuse the save outright if a tokenless trait still carries the user's work. An untouched
// "＋ blank trait" carries nothing and is still dropped silently — that is what dropping it is for.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-miotrait-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

// LF whatever the checkout: the two patterns that pull the helper out end on a line end (#a-lift-reads-lf)
const src = fs.readFileSync(path.join(__dirname, "public", "mio-editor.js"), "utf8").replace(/\r\n/g, "\n");

// ── the derivation helper, pulled out of the real source and run ──────────────────────────────────
const isTokSrc = src.match(/var isTok = function[\s\S]*?;\n/);
const tfnSrc = src.match(/var tokenFromName = function[\s\S]*?\n  \};\n/);
ok("mio-editor still defines tokenFromName", !!tfnSrc, "helper missing");
ok("…and it explains why", /mio-blank-trait-silently-dropped/.test(src), "no marker comment");

const tokenFromName = tfnSrc && isTokSrc
  ? new Function(isTokSrc[0] + tfnSrc[0] + "return tokenFromName;")()
  : () => "";

ok("a plain name becomes a token", tokenFromName("Reliable Tracks", "co") === "reliable_tracks", tokenFromName("Reliable Tracks", "co"));
ok("punctuation and runs collapse", tokenFromName("Wide-Track  Suspension!", "co") === "wide_track_suspension", tokenFromName("Wide-Track  Suspension!", "co"));
ok("leading/trailing separators are trimmed", tokenFromName("  --Heavy Armour--  ", "co") === "heavy_armour", tokenFromName("  --Heavy Armour--  ", "co"));
// A HOI4 token may not start with a digit; the server tries the same `<id>_<tok>` fallback.
ok("a digit-leading name is prefixed with the company id", tokenFromName("3rd Gen Optics", "krupp") === "krupp_3rd_gen_optics", tokenFromName("3rd Gen Optics", "krupp"));
ok("…and the result is a legal token", /^[A-Za-z_][A-Za-z0-9_]*$/.test(tokenFromName("3rd Gen Optics", "krupp")));
ok("a name with nothing usable derives nothing", tokenFromName("!!! ???", "co") === "", tokenFromName("!!! ???", "co"));
ok("an empty name derives nothing", tokenFromName("", "co") === "", tokenFromName("", "co"));
ok("a long name is capped", tokenFromName("x".repeat(200), "co").length <= 60, tokenFromName("x".repeat(200), "co").length);

// ── save() must derive BEFORE the duplicate check, and re-acquire the nodes render() replaced ─────
const saveSrc = src.slice(src.indexOf("    function save() {"), src.indexOf("    // ── sidebar list"));
ok("save() derives a token for a named trait", /tokenFromName\(tr\.name, d\.id\)/.test(saveSrc), saveSrc.slice(0, 400));
ok("…before the duplicate-token check, so derived tokens are deduped too",
  saveSrc.indexOf("tokenFromName(tr.name") < saveSrc.indexOf("is used twice"), "derivation runs after the dup check");
ok("…and re-renders so the box shows the token that was saved", /if \(derived\) \{ render\(\); /.test(saveSrc), saveSrc);
ok("…re-acquiring the status node render() just replaced", /if \(derived\) \{ render\(\); st = el\("mioStatus"\); btn = el\("mioSaveBtn"\); \}/.test(saveSrc), "stale st/btn after render");
ok("render() really is declared in this file (not a phantom call)", /^    function render\(\)/m.test(src), "render is not declared");
ok("a tokenless trait carrying work stops the save", /needs a Token \(ID\)/.test(saveSrc), saveSrc);
ok("…and that guard runs before the body is built", saveSrc.indexOf("needs a Token (ID)") < saveSrc.indexOf("var body = {"), "guard runs too late");
ok("the drop-empty filter is still there for genuinely untouched traits", /\.filter\(function \(tr\) \{ return tr\.token; \}\)/.test(saveSrc), "filter removed");

// ── the model transform, exactly as save() does it, then the real endpoint ────────────────────────
const MOD = path.join(ROOT, "probe");
fs.mkdirSync(MOD, { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="MIO"\nsupported_version="1.18.*"\n');

const traits = [
  { token: "", name: "Reliable Tracks", eq: [{ k: "reliability_mult", v: "0.05" }], prod: [] }, // named only — was dropped
  { token: "", name: "", eq: [{ k: "", v: "" }], prod: [] },                                    // untouched "＋ blank trait"
];
traits.forEach((tr) => { if (!(tr.token || "").trim() && (tr.name || "").trim()) tr.token = tokenFromName(tr.name, "probe_works"); });
ok("the named trait picked up a token", traits[0].token === "reliable_tracks", traits[0].token);
ok("…and the untouched one did not", traits[1].token === "", traits[1].token);

const rowsToObj = (arr) => { const o = {}; (arr || []).forEach((r) => { const k = (r.k || "").trim(); if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) && r.v !== "" && !isNaN(Number(r.v))) o[k] = Number(r.v); }); return o; };
const posted = traits.map((tr) => ({
  token: (tr.token || "").trim(), name: (tr.name || "").trim(), x: 0, y: 0, relativeTo: "", icon: "", parents: [],
  equipmentBonus: rowsToObj(tr.eq), productionBonus: rowsToObj(tr.prod),
})).filter((tr) => tr.token);
ok("so exactly one trait is posted", posted.length === 1, posted);

const PORT = 39971, app = createApp();
const server = app.listen(PORT, async () => {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/mio`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        modPath: MOD, id: "probe_works", name: "Probe Works", desc: "", allowedTag: "", icon: "",
        fileName: "nova_mio.txt", equipmentType: ["medium_tank_chassis"], researchCategories: [], include: [],
        initial: { equipmentBonus: {}, productionBonus: {} }, traits: posted, companyType: "tank",
      }),
    }).then((x) => x.json());
    ok("the save succeeds", r && r.ok, r);

    const f = path.join(MOD, "common", "military_industrial_organization", "organizations", r && r.file ? r.file : "nova_mio.txt");
    ok("…and wrote the file it named", fs.existsSync(f), f);
    const txt = fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "";
    ok("the named trait is now IN the file", /\btoken\s*=\s*reliable_tracks\b/.test(txt), txt.slice(0, 400));
    ok("…and so is the bonus row the user filled in on it", /reliability_mult\s*=\s*0\.05/.test(txt), txt.slice(0, 600));
    ok("the untouched blank trait did not become a node", !/token\s*=\s*(""|\s*\n)/.test(txt), txt.slice(0, 300));
    let depth = 0; for (const c of txt) { if (c === "{") depth++; else if (c === "}") depth--; }
    ok("…and the file is brace-balanced", depth === 0, depth);

    console.log("\ntest-mio-blank-trait: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 24 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
