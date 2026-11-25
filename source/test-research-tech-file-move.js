// A technology must exist in exactly ONE file of a mod (#one-file-per-tech).
//
// The research editor has a "File" field, so a tech can be moved from one .txt to another. The writer
// only ever knew about the DESTINATION: it wrote the tech to the new file and left the original block
// sitting in the old one, so the mod defined the same id twice. The HOI4 wiki is explicit that duplicate
// database ids resolve by load order and should be avoided — the game reads whichever file loads first,
// so the move silently did nothing and the tech appeared to snap back to its old position on reload.
//
// Pinned here: a move cleans the old file, leaves its OTHER techs alone, handles a simultaneous rename,
// never touches files that don't contain the tech, and refuses to write a cleanup that would unbalance
// braces.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-techmove-"));
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="TechMove"\nsupported_version="1.19.*"\n');
const tdir = path.join(mod, "common", "technologies");
fs.mkdirSync(tdir, { recursive: true });

const tech = (id, x) => [
  `\t${id} = {`,
  "\t\tresearch_cost = 1",
  "\t\tstart_year = 1936",
  `\t\tfolder = { name = infantry_folder position = { x = ${x} y = 0 } }`,
  "\t}",
].join("\n");

fs.writeFileSync(path.join(tdir, "alpha.txt"), `technologies = {\n${tech("mover", 0)}\n${tech("stayer", 2)}\n}\n`);
// a file that has nothing to do with the move — must never be rewritten
const UNRELATED = `technologies = {\n${tech("elsewhere", 4)}\n}\n`;
fs.writeFileSync(path.join(tdir, "gamma.txt"), UNRELATED);
// another file that ALSO defines the same id, the way The Road to 56 does
fs.writeFileSync(path.join(tdir, "zdup.txt"), `technologies = {
${tech("mover", 7)}
${tech("dup_neighbour", 9)}
}
`);
// a structurally broken file: the cleanup must not make it worse
const BROKEN = `technologies = {\n${tech("mover", 9)}\n`; // deliberately unterminated
fs.writeFileSync(path.join(tdir, "zbroken.txt"), BROKEN);

const rd = (f) => fs.readFileSync(path.join(tdir, f), "utf8");
const has = (f, id) => new RegExp(`^\\t${id}\\s*=\\s*\\{`, "m").test(rd(f));

const PORT = 39573, app = createApp();
const server = app.listen(PORT, async () => {
  const get = (ep) => fetch(`http://127.0.0.1:${PORT}${ep}`).then((r) => r.json());
  const post = (ep, o) => fetch(`http://127.0.0.1:${PORT}${ep}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o) }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const save = (t) => post("/api/technologies/save-batch", {
    technologies: [t], equipments: {}, customTabs: [], modPath: mod,
    countryTag: null, countryTechIds: null, deletions: [], newTechIds: [],
  });
  try {
    const cat = await get(`/api/technologies/catalog?modPath=${encodeURIComponent(mod)}`);
    const T = {};
    for (const t of cat.technologies || []) T[t.id] = t;
    ok("fixture techs are in the catalog", !!T.mover && !!T.stayer && !!T.elsewhere, Object.keys(T).filter((k) => ["mover", "stayer", "elsewhere"].includes(k)));

    // ── a save that declares NO move must not touch another file, even one holding the same id ────
    // The first version of this fix swept the whole technologies dir for the id on every save. That
    // gutted mods which genuinely ship one id in several files: on The Road to 56 it took
    // infantry_extra_tech.txt from 35 braces to 1 and r56_country_techs.txt from 213 to 61, deleting
    // eight techs apiece on a save the user never aimed at those files. #one-file-per-tech
    // The catalog resolves a duplicated id to ONE file, and writing there is correct — that is the
    // tech's file. What must never happen is the OTHER copy being deleted.
    const r0 = await save(T.mover);
    ok("plain save of a duplicated id → 200", r0.s === 200, r0.b);
    ok("BOTH copies of the duplicated id still exist", has("alpha.txt", "mover") && has("zdup.txt", "mover"),
      { alpha: has("alpha.txt", "mover"), zdup: has("zdup.txt", "mover") });
    ok("the duplicate file's OTHER tech is untouched", has("zdup.txt", "dup_neighbour"), rd("zdup.txt"));
    ok("the duplicate file did not lose any tech", (rd("zdup.txt").match(/^\t[A-Za-z_]\w*\s*=\s*\{/gm) || []).length === 2,
      (rd("zdup.txt").match(/^\t[A-Za-z_]\w*\s*=\s*\{/gm) || []));

    // ── move `mover` from alpha.txt to beta.txt ───────────────────────────────────────────────────
    // previousFileName is what the client sends when the user actually changes the File field.
    const r1 = await save(Object.assign({}, T.mover, { fileName: "beta.txt", previousFileName: "alpha.txt" }));
    ok("move → 200", r1.s === 200, r1.b);
    ok("the tech is in the destination file", has("beta.txt", "mover"));
    ok("the tech is GONE from the source file (the fix)", !has("alpha.txt", "mover"), rd("alpha.txt"));
    ok("the source file's OTHER tech survives", has("alpha.txt", "stayer"), rd("alpha.txt"));
    ok("the source file is still structurally valid", /technologies\s*=\s*\{[\s\S]*\}/.test(rd("alpha.txt")));
    ok("an unrelated file is untouched", rd("gamma.txt") === UNRELATED);
    ok("a structurally broken file is left exactly as it was", rd("zbroken.txt") === BROKEN, rd("zbroken.txt"));

    // ── a plain re-save (no move) must not disturb any other file ─────────────────────────────────
    const beforeAll = { alpha: rd("alpha.txt"), gamma: rd("gamma.txt") };
    const cat2 = await get(`/api/technologies/catalog?modPath=${encodeURIComponent(mod)}`);
    const stayer = (cat2.technologies || []).find((t) => t.id === "stayer");
    const r2 = await save(stayer);
    ok("plain re-save → 200", r2.s === 200, r2.b);
    ok("plain re-save leaves other files alone", rd("gamma.txt") === beforeAll.gamma);
    ok("plain re-save keeps the tech in its own file", has("alpha.txt", "stayer"));

    // ── rename AND move at once: neither id may be left behind ────────────────────────────────────
    const cat3 = await get(`/api/technologies/catalog?modPath=${encodeURIComponent(mod)}`);
    const mv = (cat3.technologies || []).find((t) => t.id === "mover");
    const r3 = await save(Object.assign({}, mv, { id: "mover_renamed", previousId: "mover", fileName: "delta.txt", previousFileName: "beta.txt" }));
    ok("rename+move → 200", r3.s === 200, r3.b);
    ok("the new id is in the new file", has("delta.txt", "mover_renamed"));
    ok("the OLD id is gone from the previous file", !has("beta.txt", "mover"), rd("beta.txt"));
    ok("the old id is gone from the original file too", !has("alpha.txt", "mover"));
    // The reference-renamer also renames the duplicate DEFINITION, which is right — it is the same
    // tech. What matters is that the file still holds both of its blocks; nothing was deleted.
    ok("the duplicate file STILL has both its techs",
      (rd("zdup.txt").match(/^\t[A-Za-z_]\w*\s*=\s*\{/gm) || []).length === 2, rd("zdup.txt"));

    console.log(`\ntest-research-tech-file-move: ${pass}/${total} checks passed`);
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 20 ? 0 : 1;
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
