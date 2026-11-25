// A tech's `categories` block keeps the author's own text until the list actually changes
// (#keep-categories-raw).
//
// categories is a modelled field: the parser reads it into an array and the serializer rebuilt the
// block from that array on every save. That normalised the formatting and dropped the modder's
// annotations — 15 live category entries in vanilla and 48 in Millennium Dawn carry a trailing comment,
// e.g. `CAT_artillery #Generic for all artillery`. Same rule already used for tech positions and
// equipment stat variables: hand back the author's text while the value is unchanged, and rebuild only
// once they edit it.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-catraw-"));
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="CatRaw"\nsupported_version="1.19.*"\n');
const tdir = path.join(mod, "common", "technologies");
fs.mkdirSync(tdir, { recursive: true });

const FILE = path.join(tdir, "probe.txt");
const ORIGINAL = [
  "technologies = {",
  "\tprobe_tech = {",
  "\t\tresearch_cost = 1",
  "\t\tstart_year = 1936",
  "\t\tcategories = {",
  "\t\t\tCAT_artillery #Generic for all artillery",
  "\t\t\tmio_cat_artillery",
  "\t\t\t#CAT_disabled_for_now",
  "\t\t}",
  "\t\tfolder = { name = infantry_folder position = { x = 0 y = 0 } }",
  "\t}",
  "}",
  "",
].join("\n");
fs.writeFileSync(FILE, ORIGINAL, "utf8");

const rd = () => fs.readFileSync(FILE, "utf8");
const catBlock = () => (/categories\s*=\s*\{([\s\S]*?)\n\t\t\}/.exec(rd()) || [])[1] || "";

const PORT = 39580, app = createApp();
const server = app.listen(PORT, async () => {
  const get = (ep) => fetch(`http://127.0.0.1:${PORT}${ep}`).then((r) => r.json());
  const save = (t) => fetch(`http://127.0.0.1:${PORT}/api/technologies/save-batch`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ technologies: [t], equipments: {}, customTabs: [], modPath: mod, countryTag: null, countryTechIds: null, deletions: [], newTechIds: [] }),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const load = async () => (await get(`/api/technologies/catalog?modPath=${encodeURIComponent(mod)}`)).technologies.find((t) => t.id === "probe_tech");
  try {
    const t = await load();
    ok("the tech is in the catalog", !!t);
    ok("only the LIVE categories are parsed", JSON.stringify(t.categories) === JSON.stringify(["CAT_artillery", "mio_cat_artillery"]), t.categories);
    ok("a commented-out entry is NOT treated as a category", !t.categories.includes("CAT_disabled_for_now"), t.categories);
    ok("the raw block text is carried for the writer", typeof t.categoriesRaw === "string" && /#Generic for all artillery/.test(t.categoriesRaw), t.categoriesRaw);

    // ── unchanged save keeps the author's text ────────────────────────────────────────────────────
    const r1 = await save(t);
    ok("unchanged save → 200", r1.s === 200, r1.b);
    ok("the trailing annotation survives", /CAT_artillery #Generic for all artillery/.test(rd()), catBlock());
    ok("the commented-out entry survives", /#CAT_disabled_for_now/.test(rd()), catBlock());
    ok("no category was invented or lost", (catBlock().match(/^\s*[A-Za-z_]/gm) || []).length === 2, catBlock());
    ok("the whole file is unchanged apart from key order", rd().includes("CAT_artillery #Generic for all artillery"));

    // ── editing the list rebuilds it, dropping the stale raw text ─────────────────────────────────
    const t2 = await load();
    const r2 = await save(Object.assign({}, t2, { categories: ["CAT_artillery", "mio_cat_artillery", "CAT_added"] }));
    ok("edited save → 200", r2.s === 200, r2.b);
    ok("the new category is written", /\bCAT_added\b/.test(catBlock()), catBlock());
    ok("the original two are still there", /\bCAT_artillery\b/.test(catBlock()) && /\bmio_cat_artillery\b/.test(catBlock()));
    ok("the stale raw text is not re-emitted alongside", (catBlock().match(/CAT_artillery/g) || []).length === 1, catBlock());

    // ── removing a category also rebuilds ─────────────────────────────────────────────────────────
    const t3 = await load();
    const r3 = await save(Object.assign({}, t3, { categories: ["CAT_artillery"] }));
    ok("shrunk save → 200", r3.s === 200, r3.b);
    ok("the removed category is gone", !/\bmio_cat_artillery\b/.test(catBlock()), catBlock());
    ok("the kept one remains", /\bCAT_artillery\b/.test(catBlock()));

    console.log(`\ntest-research-categories-raw: ${pass}/${total} checks passed`);
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 15 ? 0 : 1;
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
