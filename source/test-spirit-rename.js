// #spirit-rename — editing a national spirit's id used to CLONE it instead of renaming.
//
// The editor decides "edit vs create" by looking the id up in the catalog, so a NEW id is never "existing"
// and the save ran as a create: the mod ended up with the spirit defined under both ids, two localisation
// keys, and a stale copy that no later edit ever reaches.
//
// That is worse than the untidy-file version of this bug on other pages, because a spirit is handed out BY
// ID. Every `add_ideas = { <old id> }` already in a country's history keeps granting the abandoned spirit, so
// the country carries the version you thought you renamed away.
//
// Which is also why the fix cannot stop at the definition: deleting the old block while the grants still
// point at it would leave `add_ideas` referencing an idea that does not exist — worse than the duplicate.
// The grants are re-pointed, so whoever had the spirit still has it under its new id.
//
// Also asserted here: the page's own ⧉ Duplicate and + Create New buttons forget the loaded id, so a copy
// cannot read as a rename and delete the spirit it was copying. That is not hypothetical — this campaign
// shipped exactly that regression on characters.
//
// NOTE: nothing in this file repeat-saves one spirit. Two older spirit tests do, and that shape tripped the
// user's antivirus badly enough to freeze the machine; see run-tests.js AV_RISKY.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-spirit-rename-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "spirit_rename_probe");
fs.mkdirSync(path.join(MOD, "common", "ideas"), { recursive: true });
fs.mkdirSync(path.join(MOD, "history", "countries"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="SpiritRenameProbe"\nsupported_version="1.19.*"\n');

const REL = "common/ideas/zz_rename_spirits.txt";
const abs = path.join(MOD, "common", "ideas", "zz_rename_spirits.txt");
const read = () => { try { return fs.readFileSync(abs, "utf8"); } catch (_) { return ""; } };
const idsIn = (t) => [...t.matchAll(/\n\t\t([a-z_][\w]*)\s*=\s*\{/g)].map((m) => m[1]);
const balanced = (t) => { let d = 0; for (const ch of t.replace(/#.*$/gm, "")) { if (ch === "{") d++; else if (ch === "}") d--; if (d < 0) return false; } return d === 0; };
const locAll = () => { try { return fs.readdirSync(path.join(MOD, "localisation", "english"))
  .map((f) => fs.readFileSync(path.join(MOD, "localisation", "english", f), "utf8")).join("\n"); } catch (_) { return ""; } };
const HIST = path.join(MOD, "history", "countries", "GER - Germany.txt");
const histText = () => { try { return fs.readFileSync(HIST, "utf8"); } catch (_) { return ""; } };

const PORT = 39561, app = createApp();
const server = app.listen(PORT, async () => {
  const post = (ep, o) => fetch("http://127.0.0.1:" + PORT + ep, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const breathe = () => new Promise((r) => setTimeout(r, 170));
  const spirit = (ideaId, name, extra) => post("/api/ideas/upsert-definition", Object.assign({
    modPath: MOD, ideaId, targetRelativeFile: REL,
    targetLocalizationPath: "localisation/english/custom_ideas_l_english.yml",
    name, desc: "A probe spirit.", picture: "GFX_idea_generic_army_bonus",
    selectedEffects: ["political_power_gain = 0.10"],
    // The editor sends "create" for any id it cannot find in the catalog — which a RENAMED id never is.
    // That is precisely why the rename duplicated instead of failing loudly.
    mode: "create", category: "country", traits: [], cost: "", removalCost: "", ledger: "",
  }, extra || {}));

  try {
    for (const [id, nm] of [["zz_alpha", "Alpha Doctrine"], ["zz_beta", "Beta Doctrine"], ["zz_gamma", "Gamma Doctrine"]]) {
      await spirit(id, nm);
      await breathe();
    }
    ok("three spirits were created", idsIn(read()).length === 3, idsIn(read()));

    // grant the middle one to Germany at game start, the way the owner chips do
    const grant = await post("/api/history/set-startup", { tag: "GER", itemId: "zz_beta", itemType: "spirit", active: true, modPath: MOD });
    await breathe();
    ok("the spirit was granted to a country", grant.s === 200 && /zz_beta/.test(histText()), histText().slice(0, 300));

    // ── rename the MIDDLE one ─────────────────────────────────────────────────────────────────────
    await breathe();
    const r = await spirit("zz_beta_renamed", "Beta Doctrine", { previousIdeaId: "zz_beta" });
    await breathe();
    ok("renaming → 200", r.s === 200, r.b);
    const after = read();
    const ids = idsIn(after);
    ok("…there are still exactly THREE spirits", ids.length === 3, ids);
    ok("…the old id is gone", !ids.includes("zz_beta"), ids);
    ok("…the new id is there", ids.includes("zz_beta_renamed"), ids);
    ok("…both neighbours survived", ids.includes("zz_alpha") && ids.includes("zz_gamma"), ids);
    ok("…the file is still valid", balanced(after), after.slice(0, 200));

    const loc = locAll();
    ok("the old localisation key is gone", !/(^|\n)\s*zz_beta:/.test(loc), loc.slice(0, 400));
    ok("…and its description key too", !/(^|\n)\s*zz_beta_desc:/.test(loc), loc.slice(0, 400));
    ok("…the new key names the spirit", /zz_beta_renamed:\d*\s*"Beta Doctrine"/.test(loc), loc.slice(0, 400));
    ok("…and the neighbours' keys are untouched", /zz_alpha:/.test(loc) && /zz_gamma:/.test(loc), loc.slice(0, 400));

    // ── the GRANT has to come with it ─────────────────────────────────────────────────────────────
    // Removing the definition while `add_ideas` still names the old id would hand the country an idea that
    // does not exist — a worse mod than the duplicate this fix removes.
    const h = histText();
    ok("the country no longer receives the old id", !/\bzz_beta\b(?!_renamed)/.test(h.replace(/#.*$/gm, "")), h.slice(0, 400));
    ok("…it receives the new one instead", /\bzz_beta_renamed\b/.test(h), h.slice(0, 400));
    ok("…and its history file is still valid", balanced(h), h.slice(0, 300));

    // ── an ordinary re-save must NOT remove anything ──────────────────────────────────────────────
    await breathe();
    const same = await spirit("zz_beta_renamed", "Beta Doctrine", { previousIdeaId: "zz_beta_renamed" });
    await breathe();
    ok("re-saving under the same id → 200", same.s === 200, same.b);
    ok("…still three spirits", idsIn(read()).length === 3, idsIn(read()));
    ok("…the spirit still exists", idsIn(read()).includes("zz_beta_renamed"), idsIn(read()));
    ok("…and kept its localisation", /zz_beta_renamed:/.test(locAll()), locAll().slice(0, 300));

    // ── a previousIdeaId that is not on disk must not disturb anything ────────────────────────────
    await breathe();
    const ghost = await spirit("zz_beta_renamed", "Beta Doctrine", { previousIdeaId: "zz_never_existed" });
    await breathe();
    ok("a previousIdeaId that never existed → 200", ghost.s === 200, ghost.b);
    ok("…and changed nothing", idsIn(read()).length === 3 && balanced(read()), idsIn(read()));

    // ── ⧉ DUPLICATE must COPY, never move ─────────────────────────────────────────────────────────
    await breathe();
    const dup = await spirit("zz_beta_renamed_copy", "Beta Doctrine (copy)");   // note: no previousIdeaId
    await breathe();
    const dupIds = idsIn(read());
    ok("saving a duplicate → 200", dup.s === 200, dup.b);
    ok("…the ORIGINAL is still there", dupIds.includes("zz_beta_renamed"), dupIds);
    ok("…and the copy exists beside it", dupIds.includes("zz_beta_renamed_copy"), dupIds);
    ok("…so there are now four spirits", dupIds.length === 4, dupIds);
    {
      const src = fs.readFileSync(path.join(__dirname, "public", "ideas.js"), "utf8");
      const cut = (marker) => { const i = src.indexOf(marker); return i === -1 ? "" : src.slice(i, i + 1800); };
      const dupBody = cut('duplicateIdeaBtn.addEventListener("click"');
      ok("the Duplicate handler forgets the loaded id", /loadedIdeaId\s*=\s*null/.test(dupBody),
        dupBody ? dupBody.slice(0, 160) : "duplicate handler not found");
      const newBody = cut('newIdeaBtn.addEventListener("click"');
      ok("…and so does Create New Spirit", /loadedIdeaId\s*=\s*null/.test(newBody),
        newBody ? newBody.slice(0, 160) : "new handler not found");
      ok("…while selecting a spirit remembers it", /loadedIdeaId = item\.ideaId/.test(src));
      ok("…and the save only sends it when the id changed",
        /previousIdeaId: loadedIdeaId/.test(src) && /loadedIdeaId && loadedIdeaId !== ideaId/.test(src));
    }

    console.log("\ntest-spirit-rename: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 22 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
