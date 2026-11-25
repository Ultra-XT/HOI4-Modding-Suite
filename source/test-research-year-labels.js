// "Apply year design to game" — server contract. Writes designed year markers into a folder as
// instantTextBoxType elements inside a # >>> NOVA_YEARS sentinel block. Proves: create, idempotency
// (re-apply replaces, never accumulates), reversibility (empty markers strip Nova's block + leave the mod's own
// year label untouched), duplicate-year markers (distinct names), font/size mapping, and brace-balance +
// backup throughout. Run: node test-research-year-labels.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path"), http = require("http");
const { createApp } = require("./server.js");
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, x != null ? "→ " + x : ""); } };
const balanced = (s) => { let d = 0; for (const c of s.replace(/#[^\n]*/g, "")) { if (c === "{") d++; else if (c === "}") { d--; if (d < 0) return false; } } return d === 0; };
const count = (s, re) => (s.match(re) || []).length;

const GUI = `guiTypes = {
	containerWindowType = {
		name = "countrytechtreeview"
		containerWindowType = {
			name = "infantry_folder"
			position = { x = 0 y = 47 }
			size = { width = 100%% height = 100%% }
			containerWindowType = {
				name = "techtree_stripes"
				size = { width = 1400 height = 1275 }
				instantTextBoxType = {
					name = "infantry_year2"
					position = { x = 130 y = 50 }
					font = "hoi_36header"
					text = "1936"
				}
			}
		}
	}
}
`;

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-yrlbl-"));
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="YrLbl"\n');
fs.mkdirSync(path.join(mod, "interface"), { recursive: true });
const guiPath = path.join(mod, "interface", "countrytechtreeview.gui");
fs.writeFileSync(guiPath, GUI);
const PRISTINE = fs.readFileSync(guiPath, "utf8"); // for the byte-identical reversibility check

const server = http.createServer(createApp());
const post = (p, body) => new Promise((res, rej) => {
  const data = Buffer.from(JSON.stringify(body));
  const r = http.request({ host: "127.0.0.1", port: server.address().port, path: p, method: "POST", headers: { "Content-Type": "application/json", "Content-Length": data.length } },
    (rs) => { let o = ""; rs.on("data", c => o += c); rs.on("end", () => res({ status: rs.statusCode, body: o })); });
  r.on("error", rej); r.write(data); r.end();
});
const getJson = (p) => new Promise((res, rej) => {
  const r = http.request({ host: "127.0.0.1", port: server.address().port, path: p, method: "GET" }, (rs) => { let o = ""; rs.on("data", c => o += c); rs.on("end", () => res(JSON.parse(o))); }); r.on("error", rej); r.end();
});

server.listen(0, "127.0.0.1", async () => {
  try {
    const M = (p) => `${p}?modPath=${encodeURIComponent(mod)}&folder=infantry_folder`;
    // ── 1. Apply two markers (incl. a big-font one). ──
    const r1 = await post("/api/research/folder-year-labels", { modPath: mod, folder: "infantry_folder", markers: [
      { id: "yr_1", year: 1918, x: 20, y: 50, fontSize: 40, w: 100, h: 40 },
      { id: "yr_2", year: 1936, x: 270, y: 50, fontSize: 60 },
    ] });
    ok("apply 200", r1.status === 200, r1.body);
    let gui = fs.readFileSync(guiPath, "utf8");
    ok("brace-balanced after apply", balanced(gui), gui);
    ok("NOVA_YEARS sentinel present", /# >>> NOVA_YEARS[\s\S]*# <<< NOVA_YEARS/.test(gui));
    ok("2 nova_year_ blocks", count(gui, /name = "nova_year_/g) === 2, count(gui, /name = "nova_year_/g));
    ok("year 1918 at x=20", /nova_year_yr_1"\s*position = \{ x = 20 y = 50 \}[\s\S]*?text = "1918"/.test(gui), gui.match(/nova_year_yr_1[\s\S]{0,120}/));
    // This used to expect `hoi_48header`, which pinned a bug rather than a requirement: that font exists in
    // NEITHER vanilla nor Millennium Dawn, so a big year label named a font the game cannot resolve.
    // Vanilla's largest header font is hoi_36header. See #year-label-font-not-a-font and
    // test-year-label-font-real.js, which pins the invariant (every size the UI allows names a font the game
    // declares) instead of a specific row of the table.
    ok("fontSize 60 → hoi_36header, the largest header font that exists",
      /nova_year_yr_2"[\s\S]*?font = "hoi_36header"/.test(gui), gui.match(/nova_year_yr_2[\s\S]{0,160}/));
    ok("box w=100 → maxWidth 80 (100/1.25)", /nova_year_yr_1"[\s\S]*?maxWidth = 80/.test(gui), gui.match(/nova_year_yr_1[\s\S]{0,180}/));
    ok("mod's OWN infantry_year2 untouched", /name = "infantry_year2"/.test(gui) && /text = "1936"[\s\S]*?\}/.test(gui));

    // ── 2. Idempotency: re-apply different set → still no accumulation. ──
    const r2 = await post("/api/research/folder-year-labels", { modPath: mod, folder: "infantry_folder", markers: [
      { id: "yr_1", year: 1920, x: 30, y: 50, fontSize: 20 },
    ] });
    ok("re-apply 200", r2.status === 200, r2.body);
    gui = fs.readFileSync(guiPath, "utf8");
    ok("brace-balanced after re-apply", balanced(gui));
    ok("exactly 1 nova_year_ now (no accumulation)", count(gui, /name = "nova_year_/g) === 1, count(gui, /name = "nova_year_/g));
    ok("only one NOVA_YEARS sentinel pair", count(gui, /# >>> NOVA_YEARS/g) === 1 && count(gui, /# <<< NOVA_YEARS/g) === 1);
    ok("infantry_year2 STILL present after re-apply", /name = "infantry_year2"/.test(gui));

    // ── 3. Duplicate-year markers (same year, distinct ids). ──
    const r3 = await post("/api/research/folder-year-labels", { modPath: mod, folder: "infantry_folder", markers: [
      { id: "yr_a", year: 1936, x: 100, y: 50, fontSize: 30 },
      { id: "yr_b", year: 1936, x: 300, y: 50, fontSize: 30 },
    ] });
    ok("dup-year apply 200", r3.status === 200, r3.body);
    gui = fs.readFileSync(guiPath, "utf8");
    ok("two distinct nova_year names for same year", /nova_year_yr_a/.test(gui) && /nova_year_yr_b/.test(gui));
    ok("both read back via GET", (await getJson(M("/api/research/folder-year-labels"))).years.length === 2);

    // ── 4. Reversibility: empty markers → strip Nova's block, restore pristine. ──
    const r4 = await post("/api/research/folder-year-labels", { modPath: mod, folder: "infantry_folder", markers: [] });
    ok("remove 200", r4.status === 200, r4.body);
    gui = fs.readFileSync(guiPath, "utf8");
    ok("NOVA_YEARS block gone", !/NOVA_YEARS/.test(gui));
    ok("no nova_year_ left", count(gui, /nova_year_/g) === 0);
    ok("mod's infantry_year2 survived the whole cycle", /name = "infantry_year2"/.test(gui));
    ok("brace-balanced after remove", balanced(gui));
    ok("GET returns empty after remove", (await getJson(M("/api/research/folder-year-labels"))).years.length === 0);
    ok("remove restores the gui BYTE-IDENTICAL to pristine (clean reversibility)", gui === PRISTINE, "len " + gui.length + " vs " + PRISTINE.length);

    // ── 5. Sanitisation: junk markers dropped, valid kept. ──
    const r5 = await post("/api/research/folder-year-labels", { modPath: mod, folder: "infantry_folder", markers: [
      { id: "bad id!", year: 1940, x: 0, y: 0 },   // id sanitises to "badid"
      { id: "", year: 1940 },                        // empty id → dropped
      { id: "ok", year: 99999 },                     // year out of range → dropped
      { id: "good", year: 1950, x: 10, y: 50, fontSize: 16 },
    ] });
    gui = fs.readFileSync(guiPath, "utf8");
    ok("junk dropped, valid kept (2 written)", count(gui, /name = "nova_year_/g) === 2, count(gui, /name = "nova_year_/g));
    ok("brace-balanced after sanitise", balanced(gui));
  } catch (e) { fail++; console.log("  FAIL harness threw →", e && e.stack || e); }
  finally {
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    console.log(`\nRESEARCH-YEAR-LABELS: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
});
