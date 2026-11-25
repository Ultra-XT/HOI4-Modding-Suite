// The server's own state readers pick the state HOI4 keeps when two history/states files declare one id, as the Map editor does
// since #the-state-the-game-keeps: the lookup behind Country Setup's capital field and the Army page's deploy box, the state
// catalogue behind the Browse pickers, the previous owner a capital warning names, and the state file Create country writes the
// new country's capital into.
//
// THE DEFECT. A mod ships 2-Z.txt declaring state 2 (ZZZ's, province 5) over a game whose 2-B.txt declares it (AAA's capital,
// provinces 2 and 5). HOI4 keeps the game's block; the Map editor shows and edits it since 915459f. The server's readers did not:
//   * GET /api/state-province (server.js, a file-name prefix searched mod first) answered { owner: "ZZZ", province: 5,
//     provinceCount: 1 }, so Country Setup's capital field said the state was ZZZ's and the Army page deployed on ZZZ's land;
//   * GET /api/buildings/state-catalog (collectStateCatalogByRoots, merged by id with the last root winning) listed state 2 as ZZZ's;
//   * POST /api/map/set-owner answered with no capitalWarning: capitalTransferWarning read ZZZ, who has no capital, off findStateFile's
//     pick, not AAA, whose capital it is;
//   * POST /api/countries/create wrote the new country's owner line into 2-Z.txt, the block the game destroys, left the state HOI4
//     keeps AAA's, and said nothing about AAA's capital.
// MEASURED on 67954cf (the commit before this one): 8 of these 17 checks fail, and the controls — a mod whose 2-A.txt sorts first,
// so its own block is the one kept — pass.
//
// Each through the page's own request over testlib-two-layer-map.js, checked against an independent reading of the files in the
// engine's order (hoi4.exe 1.19.2: one byte-sorted list of every layer's state files, a higher layer's file replacing a lower one of
// the same name, the first block per id kept — see test-the-map-shows-and-edits-the-state-hoi4-keeps-when-two-files-declare-its-id.js).
"use strict";

const fs = require("fs");
const path = require("path");
const lib = require("./testlib-two-layer-map.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) fails.push(label);
};

const W = lib.makeWorld("b11-server-readers");
// The game's state 2 (2-B.txt, provinces 2 and 5) is AAA's, and AAA's capital. AAA also owns states 1 and 3, so taking state 2
// leaves it land: the capital warning is the "refuses a capital it does not own" one.
lib.write(W.GAME, { "history/countries/AAA - Aland.txt": "capital = 2\n" });
const ownedBy = (tag, id, provs) => lib.st(id, provs).replace("owner = AAA", `owner = ${tag}`);
const { createApp } = require("./server.js");
const md = require("./map-data.js");

/** The states HOI4 keeps, read independently: roots low -> high, one list of names (a higher root replaces the same name, compared
 *  without case as Nova's file layers do), sorted by UTF-8 bytes, the first block per id kept. */
function engineStates(roots) {
  const byName = new Map();
  for (const r of roots) {
    let names = [];
    try { names = fs.readdirSync(path.join(r, "history", "states")).filter((f) => /\.txt$/i.test(f)); } catch (_) { names = []; }
    for (const f of names) byName.set(f.toLowerCase(), { root: r, file: f });
  }
  const list = [...byName.values()].sort((a, b) => Buffer.compare(Buffer.from(a.file, "utf8"), Buffer.from(b.file, "utf8")));
  const out = new Map();
  for (const e of list) {
    for (const s of md.parseStatesText(fs.readFileSync(path.join(e.root, "history", "states", e.file), "utf8"))) {
      if (!out.has(s.id)) out.set(s.id, Object.assign({}, s, { file: e.file, root: e.root }));
    }
  }
  return out;
}
const readMod = (mod, rel) => fs.readFileSync(path.join(mod, ...rel.split("/")), "utf8");

let S = null;
(async () => {
  try {
    S = await lib.startServer(createApp);
    const get = (url) => fetch(S.base + url).then((r) => r.json());
    const later = (name) => W.mod(name, { "history/states/2-Z.txt": ownedBy("ZZZ", 2, "5") });
    const earlier = (name) => W.mod(name, { "history/states/2-A.txt": ownedBy("ZZZ", 2, "5") });

    console.log("\n=== 0. THE ENGINE: the fixture as HOI4 reads it ===");
    {
      const mod = later("Readers engine");
      const e = engineStates([W.GAME, mod]).get(2);
      rec("a mod's 2-Z.txt sorts after the game's 2-B.txt, so HOI4 keeps the game's state 2: AAA's, provinces 2 and 5",
        !!e && e.file === "2-B.txt" && e.owner === "AAA" && (e.provinces || []).slice().sort().join() === "2,5", e && { file: e.file, owner: e.owner, provinces: e.provinces });
      const c = engineStates([W.GAME, earlier("Readers engine earlier")]).get(2);
      rec("THE CONTROL: a mod's 2-A.txt sorts first, so HOI4 keeps the mod's state 2: ZZZ's, province 5", !!c && c.file === "2-A.txt" && c.owner === "ZZZ", c && { file: c.file, owner: c.owner });
    }

    console.log("\n=== 1. the state box's lookup (Country Setup's capital field, the Army page's deploy) ===");
    {
      const q = (mod) => get(`/api/state-province?modPath=${encodeURIComponent(mod)}&state=2`);
      const d = await q(later("Readers lookup"));
      rec("the lookup answered ok", !!d && d.ok === true, d);
      rec("⭐⭐⭐ …with the owner of the state HOI4 keeps: AAA, not the discarded block's ZZZ", !!d && d.owner === "AAA", d);
      rec("⭐⭐ …and that state's two provinces", !!d && d.provinceCount === 2 && [2, 5].includes(d.province), d);
      const c = await q(earlier("Readers lookup earlier"));
      rec("THE CONTROL: where the mod's 2-A.txt is the block kept, the lookup answers ZZZ and its one province", !!c && c.ok === true && c.owner === "ZZZ" && c.provinceCount === 1, c);
    }

    console.log("\n=== 2. the state catalogue (the Army page's and the focus panel's Browse pickers) ===");
    {
      const q = async (mod) => ((await get(`/api/buildings/state-catalog?${new URLSearchParams({ modPath: mod })}`)).items || []).filter((s) => String(s.stateId) === "2");
      const two = await q(later("Readers catalogue"));
      rec("the catalogue lists state 2 once", two.length === 1, two);
      rec("⭐⭐⭐ …owned by AAA, as the state HOI4 keeps is", two.length === 1 && two[0].ownerTag === "AAA", two);
      const c = await q(earlier("Readers catalogue earlier"));
      rec("THE CONTROL: where the mod's 2-A.txt is the block kept, the catalogue lists state 2 as ZZZ's", c.length === 1 && c[0].ownerTag === "ZZZ", c);
    }

    console.log("\n=== 3. handing the state to another country names the capital HOI4 has on it (the map's owner paint, flushed on Save) ===");
    {
      const mod = later("Readers set-owner");
      const r = await S.post("/api/map/set-owner", { stateId: 2, owner: "NEW" }, mod);
      rec("the edit answered ok", r.status === 200 && r.body.ok === true, r.body);
      rec("⭐⭐⭐ …and says state 2 was AAA's capital", /AAA's CAPITAL/.test(String(r.body.capitalWarning || "")), r.body.capitalWarning);
      const e = engineStates([W.GAME, mod]).get(2);
      rec("THE CONTROL: the state HOI4 keeps is NEW's now (the writer edits the kept block since #the-state-the-game-keeps)", !!e && e.owner === "NEW", e && { file: e.file, owner: e.owner });
    }

    console.log("\n=== 4. Country Setup's Create country writes its capital into the state HOI4 keeps ===");
    {
      const mod = later("Readers create");
      const zBefore = readMod(mod, "history/states/2-Z.txt");
      const r = await S.post("/api/countries/create", { tag: "NEW", name: "Newland", color: "120 40 60", graphicalCulture: "western_european_gfx", capitalStateId: 2 }, mod);
      rec("the create answered without an error", r.status === 200 && !r.body.error, r.body);
      const e = engineStates([W.GAME, mod]).get(2);
      rec("⭐⭐⭐ the state 2 HOI4 keeps belongs to the new country", !!e && e.owner === "NEW", e && { file: e.file, root: e.root, owner: e.owner });
      rec("⭐⭐ …in the mod's copy of 2-B.txt, which replaces the game's", !!e && e.file === "2-B.txt" && path.resolve(e.root) === path.resolve(mod), e && { file: e.file, root: e.root });
      rec("⭐⭐ …and the block the game discards, in 2-Z.txt, is left exactly as it was", readMod(mod, "history/states/2-Z.txt") === zBefore);
      rec("⭐⭐ …and the answer says state 2 was AAA's capital", /AAA's CAPITAL/.test(String(r.body.capitalWarning || "")), r.body.capitalWarning);
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
    fails.push("harness error");
  } finally {
    if (S) S.close();
    W.cleanup();
  }
  console.log(`\n=== the server's state readers pick the state HOI4 keeps when two files declare its id: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
