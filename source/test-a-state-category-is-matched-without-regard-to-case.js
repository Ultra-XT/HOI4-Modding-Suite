// A state_category is found whatever its capital letters, the way HOI4 finds it, and a category the game cannot find is
// said to be logged — not to crash or fail the load. #a-state-category-is-matched-without-regard-to-case
//
// THE DEFECT, measured on 65978a2 / d868d07. Old World Blues ships history/states/1182-State.txt with `state_category=ENCLAVE`
// and defines its category as `enclave = {` (common/state_category/enclave.txt). Nova compared names exactly, so:
//   * unknown_state_category (an error) fired on Old World Blues itself — the only one on all six shipping maps (census-C:
//     vanilla 0, MD 0, R56 0, OWB 1 = "1182:ENCLAVE", NV 0, RoN 0; no other map spells a category in another case);
//   * state_buildings_exceed_slots could not size state 1182 at all (model.categorySlots["ENCLAVE"] is undefined);
//   * the building-slot catalogue (GET /api/buildings/state-catalog — the focus building panel and the Army air-base picker)
//     gave such a state 0 base slots.
// And the two category messages claimed more than the game does: a missing category "crashes with 'state does not have a
// category defined'", an unknown one "may fail to load".
//
// WHAT HOI4 DOES (hoi4.exe 1.19.4.1, Operation Postern v1.19.4.1.99a5, 56,530,040 bytes, capstone, read-only; section 1
// re-reads the bytes when that build is installed — re-derived on 1.19.3 2026-09-30, on 1.19.4.0 2026-10-30 and on the
// 1.19.4.1 hotfix the same day by walking out from the LEA of " does not have a category defined."):
//   * The state template reader looks the category up (0x140B10EE3 -> 0x14145F9E0) and stores the answer at [template+168h]
//     (0x140B10EE8). 0x14145F9E0 builds its key with 0x140C1F010 — FNV-1a over the name's bytes with A-Z folded to a-z
//     (lea ecx,[r9+20h] / lea r8d,[r9-41h] / cmp r8b,19h / cmova, then imul 1000193h) — and finds it with 0x14145EAD0, which
//     compares the hash and confirms with 0x1425D0448. That is the CRT's _stricmp (errno EINVAL 16h, _NLSCMPERROR 7FFFFFFFh,
//     then __ascii_stricmp 0x1425D040C folding A-Z). A miss returns the database's placeholder, Array[0].
//   * The template check 0x140B0F820 tests the category's defined byte (0x140B0F9D9) and, when it is clear, logs "State #N
//     does not have a category defined." (0x140B0FA29) and goes on to the next check (0x140B0FA56). It never calls the
//     failed-load path 0x140201F90.
//   From 1.19.2 each function moved as one block — statetemplate.cpp +0xF0C0, the lookup and its finder +0x15060, the key
//   builder +0xF520, the CRT's _stricmp +0x14FD0 — and every byte the 1.19.2 version asserted is unchanged. From 1.19.3 to
//   1.19.4.0 the same again: the template check +0x51FC0, the reader's lookup call +0x51FDB, the lookup and its finder
//   +0x9AB00, the key builder +0x55940, the CRT's _stricmp +0x7D730, each asserted instruction at the same offset inside its
//   function and every byte the 1.19.3 version asserted unchanged. From 1.19.4.0 to the 1.19.4.1 hotfix the template check, the
//   reader and the key builder did not move, the lookup and its finder moved +0x3C0 and the CRT's _stricmp and __ascii_stricmp
//   +0x350, each asserted instruction at the same offset and every byte the 1.19.4.0 version asserted unchanged. 1.19.4
//   carries no source-file names (no literal in the image ends in .cpp), so statetemplate.cpp is the name the earlier builds
//   gave this code; the reader was found again as the function that stores the lookup's answer where the template check reads
//   it ([+168h]), and the lookup is the one set_state_category's effect and has_state_category's trigger call too.
//   1.20.0.0 (56,556,664 bytes), re-derived 2026-11-20: check, reader, key builder +0x1DC0, lookup and finder +0x3710, _stricmp +0x3910.
// Outside sources are silent: the wiki's State modding page shows lowercase categories and says nothing about case;
// CWTools' states.cwt types the field as <state_category> with no case note.
//
// THE FIX. One helper, stateCategoryKeyIn (map-data.js), resolves a name the engine's way; the rule, the slot rule and its
// ownership gate, the missing-category fixer's choice of "rural", and the server's state catalogue use it. The public/map.js
// state panel only shows and writes the text and never looks a category up, so it needed nothing.
"use strict";

const fs = require("fs");
const path = require("path");
const lib = require("./testlib-two-layer-map.js");

let checks = 0, skips = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!ok) fails.push(label);
};
const skip = (label) => { skips++; console.log("  SKIP " + label); };

const W = lib.makeWorld("catcase");
const { createApp } = require("./server.js");
const md = require("./map-data.js");
const EXE = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/hoi4.exe";
const VAN = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const OWB = "D:/SteamLibrary/steamapps/workshop/content/394360/2265420196";

const RULE = "unknown_state_category";
const NONE = "state_no_category";
const SLOTS = "state_buildings_exceed_slots";
const FACT3 = "\t\tbuildings = {\n\t\t\tindustrial_complex = 3\n\t\t}\n";   // 3 shared buildings; rural gives 2 slots
const OVERCLAIM = /crash|fail(s|ed)? to load|may fail|won't load|will not load/i;
const msgOf = (v, rule) => ((v.problems || []).find((p) => p.rule === rule) || {}).message || "";

(async () => {
  let S = null;
  try {
    console.log("\n=== 1. how hoi4.exe finds a state_category (1.20.0.0, read-only) ===");
    if (!fs.existsSync(EXE) || fs.statSync(EXE).size !== 56556664) {
      skip("hoi4.exe 1.20.0.0 (56,556,664 bytes) is not installed here — the engine facts did NOT run");
    } else {
      const fd = fs.openSync(EXE, "r");
      try {
        const head = Buffer.alloc(4096); fs.readSync(fd, head, 0, 4096, 0);
        const pe = head.readUInt32LE(0x3c), nSec = head.readUInt16LE(pe + 6), optSize = head.readUInt16LE(pe + 20), opt = pe + 24;
        const IB = Number(head.readBigUInt64LE(opt + 24));
        const secs = []; for (let i = 0; i < nSec; i++) { const s = opt + optSize + i * 40; secs.push({ va: head.readUInt32LE(s + 12), size: head.readUInt32LE(s + 16), raw: head.readUInt32LE(s + 20) }); }
        const bytes = (va, n) => { const rva = va - IB, s = secs.find((x) => rva >= x.va && rva < x.va + x.size), b = Buffer.alloc(n); fs.readSync(fd, b, 0, n, rva - s.va + s.raw); return b; };
        const hex = (va, n) => bytes(va, n).toString("hex");
        const jumpTo = (va) => { const b = bytes(va, 5); return b[0] === 0xe8 || b[0] === 0xe9 ? va + 5 + b.readInt32LE(1) : -1; };
        const leaText = (va) => { const b = bytes(va, 7); if ((b[0] & 0xfb) !== 0x48 || b[1] !== 0x8d) return null; return bytes(va + 7 + b.readInt32LE(3), 96).toString("latin1").split("\0")[0]; };
        const callsIn = (lo, hi, target) => { const b = bytes(lo, hi - lo), out = []; for (let i = 0; i + 5 <= b.length; i++) if (b[i] === 0xe8 && lo + i + 5 + b.readInt32LE(i + 1) === target) out.push(lo + i); return out; };
        const H16 = (n) => "0x" + n.toString(16).toUpperCase();

        rec("the state template reader looks the category up (0x140B12CA3 → 0x1414630F0) and keeps the answer at [template+168h] (0x140B12CA8)",
          jumpTo(0x140B12CA3) === 0x1414630F0 && hex(0x140B12CA8, 7) === "49898768010000", [H16(jumpTo(0x140B12CA3)), hex(0x140B12CA8, 7)]);
        rec("…whose key is built by 0x140C20DD0 (0x141463129) and found by 0x1414621E0 (0x14146313A)",
          jumpTo(0x141463129) === 0x140C20DD0 && jumpTo(0x14146313A) === 0x1414621E0, [H16(jumpTo(0x141463129)), H16(jumpTo(0x14146313A))]);
        rec("⭐⭐⭐ the key is FNV-1a over the name with A-Z folded to a-z: lea ecx,[r9+20h] · lea r8d,[r9-41h] · cmp r8b,19h · imul 1000193h",
          hex(0x140C20E28, 4) === "418d4920" && hex(0x140C20E2F, 8) === "458d41bf4180f819" && hex(0x140C20E41, 7) === "4469d193010001",
          [hex(0x140C20E28, 4), hex(0x140C20E2F, 8), hex(0x140C20E41, 7)]);
        rec("⭐⭐⭐ …and a hash match is confirmed by 0x1425D3D58 (0x141462295): the CRT's _stricmp — errno EINVAL, 7FFFFFFFh, then a compare folding A-Z",
          jumpTo(0x141462295) === 0x1425D3D58 && hex(0x1425D3D6F, 6) === "c70016000000" && hex(0x1425D3D7A, 5) === "b8ffffff7f"
          && jumpTo(0x1425D3D8D) === 0x1425D3D1C && hex(0x1425D3D2D, 7) === "418d40bf83f819",
          [H16(jumpTo(0x141462295)), hex(0x1425D3D6F, 6), hex(0x1425D3D7A, 5), H16(jumpTo(0x1425D3D8D)), hex(0x1425D3D2D, 7)]);
        rec("the template check logs \"… does not have a category defined.\" (0x140B117E9) when the category's defined byte is clear (0x140B11799) …",
          leaText(0x140B117E9) === " does not have a category defined." && hex(0x140B11799, 4) === "80781000", [leaText(0x140B117E9), hex(0x140B11799, 4)]);
        rec("…and goes on to its next check (0x140B1179D jne → 0x140B11816)", hex(0x140B1179D, 2) === "7577", hex(0x140B1179D, 2));
        const failLoad = callsIn(0x140B115E0, 0x140B119A1, 0x140202130);
        rec("⭐⭐ …and never calls the failed-load path 0x140202130", failLoad.length === 0, failLoad.map(H16));
        rec("THE SCANNER'S CONTROL: it finds the map check's call to that path (0x1401E4A42)", callsIn(0x1401E4A20, 0x1401E4A60, 0x140202130).includes(0x1401E4A42));
      } finally { fs.closeSync(fd); }
    }

    S = await lib.startServer(createApp);

    console.log("\n=== 2. THE CONTROLS ===");
    {
      const t = W.mod("Typo", { "history/states/3-C.txt": lib.st(3, "3", { category: "megalopoliss" }) });
      const v = await S.validate(t);
      rec("a category nothing defines in any case is still unknown_state_category", lib.idsOf(v, RULE).join() === "3", lib.idsOf(v, RULE));
      rec("⭐⭐ …saying what the game logs", /does not have a category defined/.test(msgOf(v, RULE)), msgOf(v, RULE));
      rec("⭐⭐ …and not that the state crashes or may fail to load", !OVERCLAIM.test(msgOf(v, RULE)), msgOf(v, RULE));
      const lo = await S.validate(W.mod("LowerOver", { "history/states/2-B.txt": lib.st(2, "2 5", { category: "rural", history: FACT3 }) }));
      rec("3 shared buildings on rural's 2 slots is state_buildings_exceed_slots", lib.idsOf(lo, SLOTS).join() === "2", lib.idsOf(lo, SLOTS));
    }

    console.log("\n=== 3. a category spelled in other capital letters is the category it names ===");
    {
      const a = W.mod("Upper", { "history/states/2-B.txt": lib.st(2, "2 5", { category: "RURAL" }), "history/states/3-C.txt": lib.st(3, "3", { category: "Town" }) });
      const v = await S.validate(a);
      rec("⭐⭐⭐ RURAL and Town are not unknown_state_category", lib.idsOf(v, RULE).length === 0, (v.problems || []).filter((p) => p.rule === RULE));
      const over = await S.validate(W.mod("UpperOver", { "history/states/2-B.txt": lib.st(2, "2 5", { category: "RURAL", history: FACT3 }) }));
      rec("⭐⭐⭐ 3 shared buildings on RURAL are counted against rural's 2 slots", lib.idsOf(over, SLOTS).join() === "2", lib.idsOf(over, SLOTS));
      const item = (((over.problems || []).find((p) => p.rule === SLOTS) || {}).items || [])[0] || {};
      rec("…with rural's slot count", item.slots === 2, item);
    }

    console.log("\n=== 4. a missing category is said to be logged, not to crash ===");
    {
      const v = await S.validate(W.mod("NoCat", { "history/states/3-C.txt": lib.st(3, "3", { category: "" }) }));
      rec("a state with no state_category is state_no_category", lib.idsOf(v, NONE).join() === "3", lib.idsOf(v, NONE));
      rec("⭐⭐ …saying the game logs \"does not have a category defined\"", /does not have a category defined/.test(msgOf(v, NONE)), msgOf(v, NONE));
      rec("⭐⭐⭐ …and not that it crashes", !OVERCLAIM.test(msgOf(v, NONE)), msgOf(v, NONE));
    }

    console.log("\n=== 5. the building-slot catalogue (GET /api/buildings/state-catalog, as army.js sends it) ===");
    {
      const cat = async (modPath) => (await fetch(`${S.base}/api/buildings/state-catalog?${new URLSearchParams({ modPath })}`).then((r) => r.json())).items || [];
      const lower = (await cat(W.mod("CatLower", { "history/states/2-B.txt": lib.st(2, "2 5", { category: "rural" }) }))).find((i) => +i.stateId === 2) || {};
      rec("THE CONTROL: a rural state has rural's 2 base slots", (lower.slots || {}).base === 2, lower);
      const upper = (await cat(W.mod("CatUpper", { "history/states/2-B.txt": lib.st(2, "2 5", { category: "RURAL" }) }))).find((i) => +i.stateId === 2) || {};
      rec("⭐⭐⭐ a RURAL state has them too", (upper.slots || {}).base === 2, upper);
    }

    console.log("\n=== 6. the missing-category fixer and the ownership gate go by the same match ===");
    {
      rec("stateCategoryKeyIn resolves a name the way the engine does", typeof md.stateCategoryKeyIn === "function"
        && md.stateCategoryKeyIn({ enclave: 1 }, "ENCLAVE") === "enclave" && md.stateCategoryKeyIn({ Rural: 2, rural: 3 }, "rural") === "rural"
        && md.stateCategoryKeyIn({ rural: 2 }, "rurall") === null && md.stateCategoryKeyIn({ rural: 2 }, "  ") === null);
    }

    console.log("\n=== 7. the real Old World Blues (read-only) ===");
    if (!fs.existsSync(path.join(OWB, "history", "states")) || !fs.existsSync(path.join(VAN, "history", "states"))) {
      skip("Old World Blues or the base game is not installed — the corpus half did NOT run");
    } else {
      const model = md.buildMapModel({ modRoot: OWB, gameRoot: VAN, dependencyRoots: [], cacheStableLayers: true });
      const known = model.categorySlots || {};
      const fold = (s) => String(s).trim().replace(/[A-Z]/g, (c) => c.toLowerCase());
      // Derived, not typed in: every state whose category is not a key as written but is one with A-Z folded.
      const caseOnly = (model.states || []).filter((s) => (s.provinces || []).length && s.category && !(String(s.category).trim() in known)
        && Object.keys(known).some((k) => fold(k) === fold(s.category))).map((s) => s.id);
      if (!caseOnly.length) skip("Old World Blues no longer spells a state_category in other capital letters — nothing to measure");
      else {
        const told = md.validateMapModel(model).filter((p) => p.rule === RULE).flatMap((p) => (p.items || []).map((i) => i.stateId));
        rec(`⭐⭐⭐ Old World Blues' state(s) ${caseOnly.join(", ")} on a category spelled in other capitals are not reported unknown`, caseOnly.every((id) => !told.includes(id)), told);
      }
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
    fails.push("harness error");
  } finally {
    if (S) S.close();
    W.cleanup();
  }
  console.log(`\n=== a state category is matched without regard to case: ${checks} checks, ${fails.length} failed${skips ? `, ${skips} SKIPPED (not counted as passes)` : ""} ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
