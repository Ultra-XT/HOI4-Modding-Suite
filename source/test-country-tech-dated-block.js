// #remove-tech-removes-nothing — "✕ Remove technology" in Country Setup removed nothing, and each click
// bloated the country's history file with a duplicate copy of every other tech.
//
// The Starting Technologies list is filled by a reader that scans EVERY set_technology block in the history
// file. The writer behind ✕ deliberately rewrites ONLY the region before the first dated block, because
// set_technology inside a date block or an `if = { has_dlc … }` is hand-authored logic and rewriting it would
// delete the modder's work. That scoping is right; the problem was that the reader did not agree with it.
//
// So the writer was handed the full list — including techs that live in the dated block — and wrote them all
// into a NEW top-level block. Net effect per click: the tech the user removed was still granted by the
// untouched dated block, every other tech was now granted TWICE from two competing blocks, and the file grew
// by about 1.5 KB. The endpoint answered {"ok":true} and the list redrew unchanged, so the button looked
// simply inert.
//
// Millennium Dawn puts set_technology inside its 2000.1.1 block for 344 of the 345 countries that have one,
// so on MD this was very nearly every country. Measured on a copy of MD's "ABK - Abkhazia.txt": 69 techs
// listed, remove one, list still 69, set_technology blocks 3 -> 4, file +1465 bytes.
//
// Now: techs granted by a dated block are never re-declared at top level, and the response names the ones it
// could not change so the UI can say so instead of silently redrawing the row.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-ctech-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "probe");
fs.mkdirSync(path.join(MOD, "history", "countries"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="CT"\nsupported_version="1.18.*"\n');

// Millennium Dawn's shape: the real techs live inside a dated block, with a small top-level one as well.
const FILE = path.join(MOD, "history", "countries", "ZZZ - Probeland.txt");
const ORIGINAL = `capital = 706

set_technology = {
	early_fighter = 1
}

2000.1.1 = {
	set_technology = {
		infantry_weapons = 1
		APC_1 = 1
		Anti_Air_0 = 1
	}
	set_politics = {
		ruling_party = neutrality
	}
}
`;
fs.writeFileSync(FILE, ORIGINAL, "utf8");

const read = () => fs.readFileSync(FILE, "utf8");
const blocks = () => (read().match(/set_technology\s*=\s*\{/g) || []).length;
const grants = (id) => (read().match(new RegExp(`\\b${id}\\s*=\\s*1`, "g")) || []).length;

const PORT = 39965, app = createApp();
const server = app.listen(PORT, async () => {
  const list = () => fetch(`http://127.0.0.1:${PORT}/api/technologies/country-techs?modPath=${encodeURIComponent(MOD)}&tag=ZZZ`)
    .then((r) => r.json());
  const save = (techIds) => fetch(`http://127.0.0.1:${PORT}/api/technologies/save-country-techs`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ modPath: MOD, tag: "ZZZ", techIds }),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

  try {
    const before = read();
    const l = await list();
    const shown = l.techs || l.modTechs || l.all || [];
    ok("the list shows techs from both regions", shown.length >= 4, shown);
    ok("precondition: one top-level block plus one dated block", blocks() === 2, blocks());

    // The user clicks ✕ on a tech that lives in the DATED block. The client resends everything else.
    const keep = shown.filter((t) => String(t) !== "infantry_weapons");
    const r = await save(keep);
    ok("the save succeeds", r.s === 200 && r.b && r.b.ok, r.b);

    // The real damage was here: every other dated tech re-declared at top level.
    ok("no extra set_technology block was created", blocks() === 2, { blocks: blocks(), file: read() });
    ok("APC_1 is still granted exactly once, not twice", grants("APC_1") === 1, { count: grants("APC_1"), file: read() });
    ok("…and Anti_Air_0 too", grants("Anti_Air_0") === 1, { count: grants("Anti_Air_0"), file: read() });
    ok("the file did not grow", read().length <= before.length + 20, { before: before.length, after: read().length });
    ok("the dated block is intact", /2000\.1\.1 = \{[\s\S]*?infantry_weapons = 1/.test(read()), read());
    ok("…and its set_politics is untouched", /ruling_party = neutrality/.test(read()), read());

    // And the honest part: it must SAY it could not remove that one.
    ok("the response names what it could not change", Array.isArray(r.b.unmanagedTechs) && r.b.unmanagedTechs.includes("infantry_weapons"), r.b);
    ok("…with a note the UI can show", typeof r.b.note === "string" && /dated or DLC-gated/.test(r.b.note), r.b.note);
    ok("…that names the tech", /infantry_weapons/.test(String(r.b.note || "")), r.b.note);

    // ── a tech in the MANAGED region must still be removable ───────────────────────────────────────
    const l2 = await list();
    const shown2 = l2.techs || l2.modTechs || l2.all || [];
    ok("early_fighter is still listed", shown2.includes("early_fighter"), shown2);
    const r2 = await save(shown2.filter((t) => t !== "early_fighter"));
    ok("removing a top-level tech succeeds", r2.s === 200 && r2.b && r2.b.ok, r2.b);
    ok("…and it is really gone", grants("early_fighter") === 0, read());
    ok("…while the dated block still has its techs", grants("APC_1") === 1 && /infantry_weapons = 1/.test(read()), read());

    // ── adding a tech still works ─────────────────────────────────────────────────────────────────
    const r3 = await save(["fighter2"]);
    ok("adding a tech succeeds", r3.s === 200 && r3.b && r3.b.ok, r3.b);
    ok("…and it lands in the managed region", /fighter2 = 1/.test(read()), read());
    ok("…without duplicating the dated techs", grants("APC_1") === 1, read());

    console.log("\ntest-country-tech-dated-block: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 18 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
