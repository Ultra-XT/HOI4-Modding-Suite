// A strait's "through" province must be somewhere near the two it connects, or the crossing HOI4 loads is tied to a
// sea province nowhere near it. #a-strait-must-reach-its-through
//
// FOUND IN THE OWNER'S LOG, every launch since the adjacency tool was used:
//
//   map.cpp:1208  Error in map/adjacencies.csv: Adj between 14 and 21 is not adjacent with THROUGH = 4
//
// ⚠️ CORRECTED #a-strait-row-is-still-loaded: this said "HOI4 then DISCARDS the row, so the strait the modder drew does
// not exist in the game", and the rule's message said the same. hoi4.exe 1.20.0.0's adjacencies.csv loader (map.cpp in
// 1.19.3, whose source paths 1.19.4 no longer carries; 0x140AB53B0 — traced on 1.19.2, re-derived byte for byte on 1.19.3
// on 2026-09-30 and on 1.19.4.1, Operation Postern v1.19.4.1.99a5, on 2026-10-30: every byte the last section pins sits
// at the offset it had in 1.19.3, and the two neighbour-list helpers it calls moved together, +0x9BF00; and on 1.20.0.0,
// Operation Postern v1.20.0.0.8873, on 2026-11-20: every one of those bytes at its 1.19.4.1 offset, the helpers +0x3710)
// logs that line only when both ends are LAND and neither is adjacent to THROUGH, then falls straight
// through into the code that stores the row — the last section below re-reads those bytes. The crossing exists; its
// through province is the wrong one. Nothing crashes and nothing else says a word. Nova's tool checks that `through`
// exists, is water, and is not one of the pair — it never checks where it IS, so the panel accepts a sea province on
// the other side of the world.
//
// ⚠️ "EVERY LAUNCH" WAS EVERY -debug LAUNCH. That line carries the log flag word 0x10004 (0x140AB576D, pinned in the last
// section), and a normal launch has no file for that word
// (test-a-unit-that-starts-where-the-map-took-its-sea-or-land-away-is-reported.js pins the chain, read on 2026-10-30). The
// owner's launches of that week ran `--debug` (their crash folders' meta.yml said so). So a log WITHOUT this line says
// something only of a -debug launch, and nobody recorded whether MD's below was one; "the game is silent" and "ZERO map.cpp
// lines" may therefore say nothing about the row. The threshold does not stand on them. It stands on the corpus, and the
// loader's own fall-through says that a row is stored either way.
//
// ⚠️⚠️ THE THRESHOLD TOOK THREE WRONG ANSWERS, each refuted by the corpus. Worth keeping, because each was
// the obvious reading:
//   1. "through must border both endpoints" — VANILLA ITSELF ships 5 rows that do not (Amlia-Unalaska,
//      Grenada-St Vincent, Northern Quebec, Anguilla-Virgin Islands, Tanahbala) and the game is silent.
//   2. "at most 2 hops" — fires on 4 Millennium Dawn rows and 1 Old World Blues row which MD's own
//      error.log proves are accepted: it contains ZERO map.cpp lines in 1,849 lines of its own noise.
//   3. "rows with an adjacency RULE name are exempt, the rest must border" — closer, but unruled
//      non-bordering rows ship too, 4-7% of them.
//
// What holds, measured below over every installed map:
//     UNRULED rows reach at most THREE hops — once, in 1,329 rows across six maps.
//     RULED rows (Suez, Kiel, Panama, Caspian_Sea_Trade_Route, US_SUPPLY_LINE_TO_AFGHANISTAN) reach
//     7, 10, 11 and 12 hops, and are exempt by design.
// The owner's mod carries the only unruled row beyond 3 hops anywhere in the corpus, at 10.
//
// ⭐ THE METHOD MATTERS AS MUCH AS THE RULE. HOI4's own wiki does not document this constraint at all. The
// answer came from widening the search — the sibling Clausewitz wikis and the error text pointed at the
// adjacency-rule column, and the corpus settled the number. The owner's standing instruction.
//
// A WARNING, not an error: the game loads past it.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");
const { mapRuleLabel, isFatalRule } = require("./public/map-rule-labels.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 350) : "")); }
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
const tmps = [];

// ── ⚠️ ANTI-CRY-WOLF: every shipping map must come back clean ───────────────────────────────────────
console.log("\n=== ⚠️ the rule is silent on every map that ships ===");
{
  if (!fs.existsSync(path.join(GAME, "map", "adjacencies.csv"))) console.log("  ..   (the base game is not installed)");
  else {
    const roots = [["vanilla", GAME]];
    if (fs.existsSync(WS)) for (const id of fs.readdirSync(WS)) {
      const p = path.join(WS, id);
      if (fs.existsSync(path.join(p, "map", "adjacencies.csv")) && fs.existsSync(path.join(p, "map", "provinces.bmp"))) roots.push(["ws-" + id, p]);
    }
    let checked = 0, seaRows = 0;
    for (const [label, root] of roots) {
      const probs = md.validateMapBitmap({ modRoot: root, gameRoot: GAME, dependencyRoots: [] })
        .filter((p) => p.rule === "adjacency_through_too_far");
      checked++;
      let ap = path.join(root, "map", "adjacencies.csv");
      if (!fs.existsSync(ap)) ap = path.join(GAME, "map", "adjacencies.csv");
      for (const ln of fs.readFileSync(ap, "utf8").split(/\r?\n/)) {
        const c = ln.trim().split(";");
        if (c.length >= 4 && (c[2] || "").trim().toLowerCase() === "sea") seaRows++;
      }
      ok(probs.length === 0, `⭐⭐ ${label}: no strait reported`,
        probs.map((p) => String(p.message).slice(0, 130)));
    }
    ok(checked >= 2 && seaRows > 800,
      `${checked} shipping map(s), ${seaRows} sea adjacency rows examined — not a vacuous pass`, { checked, seaRows });
  }
}

// ── the fixture ─────────────────────────────────────────────────────────────────────────────────────
// Eleven provinces in a row: 1 | 2 | 3(sea) | 4 | 5 | 6(sea) | 7 | 8 | 9 | 10 | 11.
// 3 sits between 2 and 4; 6 is five provinces away from 1.
//
// ⚠️ ELEVEN, NOT SEVEN. THE MAP IS A CYLINDER — x wraps, as it does in the real game, and the rule's own
// neighbour walk wraps with it. A seven-province strip therefore has a maximum separation of three hops
// going the other way round, so the "far" province was never far and nothing fired. The first cut of this
// fixture failed for exactly that reason, and the rule was innocent.
function makeMod(rows) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-strait-")); tmps.push(d);
  fs.mkdirSync(path.join(d, "map"), { recursive: true });
  fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="ST"\nreplace_path="map"\n');
  const W = 44, H = 4;
  const COL = {};
  for (let i = 1; i <= 11; i++) COL[i] = [i * 10, i * 10, i * 10];
  const provAtX = (x) => Math.min(11, Math.floor(x / 4) + 1);
  const rowSize = (W * 3 + 3) & ~3, imageSize = rowSize * H;
  const bmp = Buffer.alloc(54 + imageSize);
  bmp.write("BM", 0, "ascii");
  bmp.writeUInt32LE(54 + imageSize, 2); bmp.writeUInt32LE(54, 10); bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(W, 18); bmp.writeInt32LE(H, 22); bmp.writeUInt16LE(1, 26);
  bmp.writeUInt16LE(24, 28); bmp.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < H; y++) { let o = 54 + (H - 1 - y) * rowSize; for (let x = 0; x < W; x++) { const c = COL[provAtX(x)]; bmp[o++] = c[2]; bmp[o++] = c[1]; bmp[o++] = c[0]; } }
  fs.writeFileSync(path.join(d, "map", "provinces.bmp"), bmp);
  fs.writeFileSync(path.join(d, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0",
    "1;10;10;10;land;true;plains;1",
    "2;20;20;20;land;true;plains;1",
    "3;30;30;30;sea;false;ocean;0",
    "4;40;40;40;land;true;plains;1",
    "5;50;50;50;land;true;plains;1",
    "6;60;60;60;sea;false;ocean;0",
    "7;70;70;70;land;true;plains;1",
    "8;80;80;80;land;true;plains;1",
    "9;90;90;90;land;true;plains;1",
    "10;100;100;100;land;true;plains;1",
    "11;110;110;110;land;true;plains;1",
  ].join("\n") + "\n");
  fs.writeFileSync(path.join(d, "map", "adjacencies.csv"),
    "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n" + rows.join("\n") + "\n");
  return d;
}
const NOGAME = path.join(os.tmpdir(), "__no_game_strait__");
const flagged = (d) => md.validateMapBitmap({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [] })
  .filter((p) => p.rule === "adjacency_through_too_far");

// ── ⛔ the finding ───────────────────────────────────────────────────────────────────────────────────
console.log("\n=== ⛔ a strait whose through province is far away ===");
{
  // 2 <-> 4 through 3: correct, 3 borders both.
  const good = makeMod(["2;4;sea;3;-1;-1;-1;-1;;Correct strait"]);
  ok(flagged(good).length === 0, "a strait through the water between its two ends is fine", flagged(good).map((p) => p.message.slice(0, 90)));

  // 1 <-> 2 through 6: five provinces away, the long way round the cylinder too.
  const bad = makeMod(["1;2;sea;6;-1;-1;-1;-1;;Nonsense strait"]);
  const f = flagged(bad);
  ok(f.length === 1, "⭐⭐⭐ a strait whose through province is nowhere near it IS reported", f.length);
  ok(f.length === 1 && f[0].severity === "warning",
    "⚠️ …as a WARNING — HOI4 logs it and loads the row anyway, it does not crash", f[0] && f[0].severity);
  ok(isFatalRule("adjacency_through_too_far") === false,
    "…and it is NOT in the curated fatal set, so Save is not gated on it", true);
  ok(mapRuleLabel("adjacency_through_too_far") !== "Adjacency through too far",
    "…and it has a human label", mapRuleLabel("adjacency_through_too_far"));
  // ⚠️ MOVED WITH #a-strait-row-is-still-loaded. This pinned /discards/ — "the strait is not in the game". hoi4.exe keeps
  // the row (the last section re-reads the loader), so a message saying it is thrown away sends the modder hunting for a
  // crossing that is there.
  ok(f.length === 1 && !/discard/i.test(String(f[0].message)),
    "⭐⭐ …and the message no longer says HOI4 throws the row away", f[0] && f[0].message.slice(0, 260));
  ok(f.length === 1 && /still loads/i.test(String(f[0].message)),
    "⭐⭐ …it says the crossing is still loaded, with the wrong through province", f[0] && f[0].message.slice(0, 260));
}

// ── ⭐⭐⭐ a NAMED adjacency rule is exempt — this is what Suez, Kiel and Panama are ─────────────────
console.log("\n=== ⭐⭐⭐ a named route is exempt, however far it reaches ===");
{
  const ruled = makeMod(["1;2;sea;6;-1;-1;-1;-1;MY_TRADE_ROUTE;A declared route"]);
  ok(flagged(ruled).length === 0,
    "⭐⭐⭐ the same far-away through, with an adjacency rule name, is left alone", flagged(ruled).map((p) => p.message.slice(0, 90)));

  // …and the control: strip the name back off and it fires again, so the exemption is doing the work.
  const unruled = makeMod(["1;2;sea;6;-1;-1;-1;-1;;Same row, no rule"]);
  ok(flagged(unruled).length === 1,
    "⚠️ THE CONTROL: the identical row without the name is reported", flagged(unruled).length);
}

// ── 🈯 the measurement the threshold rests on ────────────────────────────────────────────────────────
console.log("\n=== 🈯 how far do shipping straits actually reach? ===");
{
  if (!fs.existsSync(path.join(GAME, "map", "adjacencies.csv"))) console.log("  ..   (the base game is not installed)");
  else {
    // Re-derive the max unruled hop distance from the corpus, so the number in the rule cannot rot.
    const roots = [["vanilla", GAME]];
    if (fs.existsSync(WS)) for (const id of fs.readdirSync(WS)) {
      const p = path.join(WS, id);
      if (fs.existsSync(path.join(p, "map", "adjacencies.csv")) && fs.existsSync(path.join(p, "map", "provinces.bmp"))) roots.push(["ws-" + id, p]);
    }
    let worstUnruled = 0, unruledRows = 0, ruledBeyond3 = 0;
    for (const [, root] of roots) {
      const m = md.buildMapModel({ modRoot: root, gameRoot: GAME, dependencyRoots: [] });
      const c2i = new Map();
      for (const p of m.provinces || []) c2i.set(((p.r << 16) | (p.g << 8) | p.b) >>> 0, p.id);
      let bp = path.join(root, "map", "provinces.bmp");
      if (!fs.existsSync(bp)) bp = path.join(GAME, "map", "provinces.bmp");
      const b = fs.readFileSync(bp);
      const o0 = b.readUInt32LE(10), W = b.readInt32LE(18), H = b.readInt32LE(22), rs = Math.floor((24 * W + 31) / 32) * 4;
      const idAt = (x, y) => { const o = o0 + (H - 1 - y) * rs + x * 3; const id = c2i.get(((b[o + 2] << 16) | (b[o + 1] << 8) | b[o]) >>> 0); return id === undefined ? 0 : id; };
      const nbr = new Map();
      const add = (p1, p2) => { if (p1 <= 0 || p2 <= 0 || p1 === p2) return; if (!nbr.has(p1)) nbr.set(p1, new Set()); nbr.get(p1).add(p2); };
      let prev = new Int32Array(W); for (let x = 0; x < W; x++) prev[x] = idAt(x, 0);
      const cur = new Int32Array(W);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) cur[x] = (y === 0) ? prev[x] : idAt(x, y);
        for (let x = 0; x < W; x++) {
          const a = cur[x], l = cur[(x - 1 + W) % W];
          if (a !== l) { add(a, l); add(l, a); }
          if (y > 0) { const u = prev[x]; if (a !== u) { add(a, u); add(u, a); } }
        }
        prev.set(cur);
      }
      const hop = (a, z, cap) => {
        if (a === z) return 0;
        const seen = new Set([a]); let front = [a];
        for (let d = 1; d <= cap; d++) {
          const nxt = [];
          for (const q of front) for (const n of (nbr.get(q) || [])) { if (n === z) return d; if (seen.has(n)) continue; seen.add(n); nxt.push(n); }
          if (!nxt.length) break; front = nxt;
        }
        return Infinity;
      };
      let ap = path.join(root, "map", "adjacencies.csv");
      if (!fs.existsSync(ap)) ap = path.join(GAME, "map", "adjacencies.csv");
      for (const ln of fs.readFileSync(ap, "utf8").split(/\r?\n/)) {
        const t = ln.trim(); if (!t || t.startsWith("#")) continue;
        const c = t.split(";"); if (c.length < 4) continue;
        if ((c[2] || "").trim().toLowerCase() !== "sea") continue;
        const from = parseInt(c[0], 10), to = parseInt(c[1], 10), thr = parseInt(c[3], 10);
        if (![from, to, thr].every((v) => Number.isFinite(v) && v > 0)) continue;
        const rule = (c[8] || "").trim();
        const d = Math.max(hop(thr, from, 13), hop(thr, to, 13));
        if (rule && rule !== "-1") { if (d > 3) ruledBeyond3++; continue; }
        unruledRows++;
        if (d !== Infinity && d > worstUnruled) worstUnruled = d;
      }
    }
    console.log(`     ${unruledRows} unruled sea rows; the furthest reaches ${worstUnruled} hop(s). Ruled rows beyond 3 hops: ${ruledBeyond3}.`);
    ok(unruledRows > 800, "the corpus is big enough to calibrate on", unruledRows);
    ok(worstUnruled <= 3,
      `⭐⭐⭐ no unruled strait in any shipping map reaches more than 3 — the threshold is theirs, not mine`, worstUnruled);
    ok(ruledBeyond3 > 0,
      "⭐⭐ …while NAMED routes do reach further, which is exactly why they are exempt", ruledBeyond3);
  }
}

// ── the evidence: HOI4 logs a far THROUGH and keeps the row (hoi4.exe 1.20.0.0, when installed) ───────
console.log("\n=== ⚠️ the loader logs a far THROUGH and still stores the row — re-read from hoi4.exe ===");
{
  const EXE = path.join(GAME, "hoi4.exe");
  if (!fs.existsSync(EXE) || fs.statSync(EXE).size !== 56556664) console.log("  ..   (hoi4.exe 1.20.0.0, 56,556,664 bytes, is not installed — the addresses belong to that build)");
  else {
    const fd = fs.openSync(EXE, "r");
    try {
      const head = Buffer.alloc(4096); fs.readSync(fd, head, 0, 4096, 0);
      const pe = head.readUInt32LE(0x3c), nSec = head.readUInt16LE(pe + 6), optSize = head.readUInt16LE(pe + 20), opt = pe + 24;
      const IB = Number(head.readBigUInt64LE(opt + 24));
      const secs = []; for (let i = 0; i < nSec; i++) { const s = opt + optSize + i * 40; secs.push({ va: head.readUInt32LE(s + 12), size: head.readUInt32LE(s + 16), raw: head.readUInt32LE(s + 20) }); }
      const bytes = (va, n) => { const rva = va - IB, s = secs.find((x) => rva >= x.va && rva < x.va + x.size), b = Buffer.alloc(n); fs.readSync(fd, b, 0, n, rva - s.va + s.raw); return b; };
      const callTo = (va) => { const b = bytes(va, 5); return b[0] === 0xe8 ? va + 5 + b.readInt32LE(1) : -1; };
      const leaText = (va) => { const b = bytes(va, 7); if ((b[0] & 0xfb) !== 0x48 || b[1] !== 0x8d) return null; return bytes(va + 7 + b.readInt32LE(3), 64).toString("latin1").split("\0")[0]; };
      const hex = (va, n) => bytes(va, n).toString("hex");
      ok(hex(0x140AB56D7, 7) === "f680d200000001" && hex(0x140AB56F8, 7) === "f680d200000001",
        "map.cpp 0x140AB53B0 checks THROUGH only when both ends are LAND (test byte [prov+0D2h],1 at 0x140AB56D7 and 0x140AB56F8)", [hex(0x140AB56D7, 7), hex(0x140AB56F8, 7)]);
      ok(callTo(0x140AB5719) === 0x1414A9970 && callTo(0x140AB575B) === 0x1414A9970,
        "…and logs only when NEITHER end is adjacent to it (adjacency tests at 0x140AB5719 and 0x140AB575B)");
      ok(leaText(0x140AB57ED) === " is not adjacent with THROUGH = ", "the logged text is the owner's error.log line (0x140AB57ED)", leaText(0x140AB57ED));
      ok(hex(0x140AB576D, 8) === "c744242004000100" && callTo(0x140AB578C) === 0x14254FD50,
        "⚠️ …on the log flag word 0x10004 (0x140AB576D, the fifth argument of the log entry 0x14254FD50 at 0x140AB578C): a word a normal launch has no file for, so only a -debug launch writes this line", hex(0x140AB576D, 8));
      ok(bytes(0x140AB582B, 1)[0] === 0xe8 && bytes(0x140AB5830, 1)[0] === 0x90 && hex(0x140AB5831, 6) === "8b8d58030000",
        "⭐⭐⭐ after logging it falls straight through, with no jump, into the code that stores the row (0x140AB5831)", hex(0x140AB5831, 6));
      ok(callTo(0x140AB5C44) === 0x1414A7CB0 && callTo(0x140AB5C92) === 0x1414A7CB0,
        "⭐⭐ …which appends the crossing to BOTH provinces' neighbour lists (0x140AB5C44, 0x140AB5C92)");
    } finally { fs.closeSync(fd); }
  }
}

tmps.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
console.log(`\n=== a strait must reach its through: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
