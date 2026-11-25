// A railway must not jump across the map. #a-railway-cannot-jump-across-the-map
//
// railways.txt is "<level> <count> <province> <province> …" — a PATH, each province bordering the next. The
// map editor says so in words ("click a chain of adjacent provinces"), and nothing checked it: the write guard
// asks only whether each province exists, is not sea and has a state, and the validator asks the same. Click
// Lisbon, then Vladivostok, and Nova wrote `1 2 <a> <b>` and reported success. The wiki lists "a very
// disjointed railway definition" among the invalid definitions that crash single-player load.
//
// ⚠️ "EVERY PAIR MUST BORDER" WOULD CRY WOLF. Measured 2026-09-10 with Nova's own neighbour walk — the
// 4-neighbour, x-wrapping graph adjacency_through_too_far builds from provinces.bmp — plus each map's
// adjacencies.csv, over every consecutive pair of every railway on every shipping map:
//
//     34,079 pairs · 33,704 border on the bitmap · 218 more are linked by an adjacencies.csv row (sea/blank)
//     157 do not: Old World Blues 132, Novum Vexillum 15, Road to 56 10 — vanilla, Millennium Dawn and
//     Rise of Nations none. Hops for those 157: 2 ×153, 3 ×2, 4 ×1, 8 ×1 (Road to 56, 6874 → 3917).
//     (Adding diagonal pixel contact changes nothing: 0 extra pairs on any map.)
//
// Every one of those maps launches, so the line is the corpus's own: a link more than 8 provinces apart is
// reported, and nothing a shipping map carries is. A WARNING — the game's own threshold for "disjointed" is
// unknown, and the shipping maps prove short gaps load.
//
// ⏱ It shares the neighbour graph validateMapFiles already builds for straits; provinces.bmp is not read again.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 260)));
  if (!ok) fails.push(label);
};

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-rail-home-"));
process.env.NOVA_HOME_DIR = HOME;
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");
const tmps = [HOME];
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const NOGAME = path.join(os.tmpdir(), "__nova_rail_no_game__");
const RULE = "railway_jump_too_far";

// 32 provinces as vertical stripes, 4 px each, on a 128-px-wide map. ⚠️ THE MAP IS A CYLINDER — x wraps, as in
// the game and in the rule's own walk — so province 1 borders 32, and no two provinces are more than 16 apart.
const N = 32, SW = 4, W = N * SW, H = 4;
function stripesBmp() {
  const rowSize = (W * 3 + 3) & ~3, img = rowSize * H, b = Buffer.alloc(54 + img);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + img, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(img, 34);
  for (let y = 0; y < H; y++) {
    let o = 54 + (H - 1 - y) * rowSize;
    for (let x = 0; x < W; x++) { const id = Math.floor(x / SW) + 1; b[o++] = 0; b[o++] = 0; b[o++] = id * 7; }
  }
  return b;
}
const DEF = ["0;0;0;0;land;false;unknown;0"].concat(Array.from({ length: N }, (_, i) => `${i + 1};${(i + 1) * 7};0;0;land;false;plains;1`)).join("\n") + "\n";
const ADJ_HEADER = "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment";
const railsText = (rails) => rails.map((p) => `1 ${p.length} ${p.join(" ")} `).join("\n") + "\n";
function writeMap(root, { rails = null, adj = [], bitmap = true } = {}) {
  if (bitmap) {
    mk(path.join(root, "map", "provinces.bmp"), stripesBmp());
    mk(path.join(root, "map", "definition.csv"), DEF);
  }
  if (adj != null) mk(path.join(root, "map", "adjacencies.csv"), [ADJ_HEADER].concat(adj).join("\n") + "\n");
  if (rails != null) mk(path.join(root, "map", "railways.txt"), railsText(rails));
}
function ownMod(tag, opts) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-rail-" + tag + "-")); tmps.push(d);
  mk(path.join(d, "descriptor.mod"), 'name="Rail"\nreplace_path="map"\n');
  writeMap(d, opts);
  return d;
}
const jumps = (mod, game) => md.validateMapFiles({ modRoot: mod, gameRoot: game || NOGAME, dependencyRoots: [] }).filter((p) => p.rule === RULE);
const pairsIn = (p) => (p.items || []).map((i) => `${i.from}>${i.to}`);

try {
  console.log("1. A chain of neighbours is a railway, not a problem");
  {
    const mod = ownMod("chain", { rails: [[1, 2, 3, 4, 5], [32, 1]] });
    rec("neighbours — including across the wrap seam — are not reported", jumps(mod).length === 0, jumps(mod).map((p) => p.message));
  }

  console.log("\n2. ⛔ A railway that jumps across the map is reported");
  {
    const mod = ownMod("jump", { rails: [[1, 2], [2, 18]] });
    const rep = jumps(mod);
    rec("⭐⭐⭐ the jump 2 → 18 (16 provinces apart) is reported, once", rep.length === 1, rep.map((p) => p.message));
    const p = rep[0] || {};
    rec("…naming that link and only that link", JSON.stringify(pairsIn(p)) === JSON.stringify(["2>18"]), pairsIn(p));
    rec("⚠️ …as a WARNING — shipping maps carry short gaps and launch", p.severity === "warning", p.severity);
    rec("…NOT in the curated fatal set, so Save is not gated on it", labels.isFatalRule(RULE) === false);
    rec("…with a real label and a fix hint", !!labels.LABELS[RULE] && labels.mapRuleFixHint(RULE).length > 15,
      { label: labels.LABELS[RULE], hint: labels.mapRuleFixHint(RULE) });
    // What the page asks for: GET /api/map/validate composes validateMapBitmap, which is where this lives.
    const viaEndpoint = md.validateMapBitmap({ modRoot: mod, gameRoot: NOGAME, dependencyRoots: [] }).filter((x) => x.rule === RULE);
    rec("⭐ …and it reaches the validate endpoint's own composition", viaEndpoint.length === 1, viaEndpoint.length);
  }

  console.log("\n3. ⭐⭐ The line is the corpus's: 8 apart ships (Road to 56), 9 apart is reported");
  {
    const eight = ownMod("eight", { rails: [[1, 9]] });
    rec("⭐⭐ a link 8 provinces apart — the furthest any shipping map carries — is not reported", jumps(eight).length === 0, jumps(eight).map(pairsIn));
    const nine = ownMod("nine", { rails: [[1, 10]] });
    rec("⭐⭐ a link 9 provinces apart is", jumps(nine).length === 1, jumps(nine).map(pairsIn));
  }

  console.log("\n4. ⭐⭐ A link declared in adjacencies.csv joins two provinces, as it does in the game");
  {
    const linked = ownMod("linked", { rails: [[2, 18]], adj: ["2;18;;-1;-1;-1;-1;-1;;railway ferry"] });
    rec("⭐⭐ a railway along a declared crossing is not reported", jumps(linked).length === 0, jumps(linked).map(pairsIn));
    const blocked = ownMod("blocked", { rails: [[2, 18]], adj: ["2;18;impassable;-1;-1;-1;-1;-1;;"] });
    rec("…but an IMPASSABLE row is not a link", jumps(blocked).length === 1, jumps(blocked).map(pairsIn));
    const control = ownMod("control", { rails: [[2, 18]] });
    rec("⚠️ CONTROL: the same railway with no row at all is reported", jumps(control).length === 1, jumps(control).length);
  }

  console.log("\n5. ⛔ Whose file: an add-on is not told off for the railways it inherits");
  {
    const GAME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-rail-game-")); tmps.push(GAME);
    writeMap(GAME, { rails: [[2, 18]] });
    rec("⚠️ CONTROL: validated as itself, the base's jump IS reported", jumps(GAME, GAME).length === 1, jumps(GAME, GAME).length);
    const addon = fs.mkdtempSync(path.join(os.tmpdir(), "nova-rail-addon-")); tmps.push(addon);
    mk(path.join(addon, "descriptor.mod"), 'name="Addon"\n');
    rec("⭐⭐⭐ an add-on shipping none of the map is not blamed for it", jumps(addon, GAME).length === 0, jumps(addon, GAME).map(pairsIn));
    const ownsRails = fs.mkdtempSync(path.join(os.tmpdir(), "nova-rail-own-")); tmps.push(ownsRails);
    mk(path.join(ownsRails, "descriptor.mod"), 'name="OwnRails"\n');
    // ⛔ #a-railway-gap-below-is-not-the-add-ons (B4-3) — a jump the base ships stays the base's even in the mod's own file; the mod's own is said
    writeMap(ownsRails, { rails: [[1, 2], [2, 18], [3, 19]], adj: null, bitmap: false });
    rec("⭐⭐ …while a mod that ships its own railways.txt over that bitmap is told of its own jump 3 → 19, and not the base's 2 → 18", jumps(ownsRails, GAME).length === 1 && JSON.stringify(pairsIn(jumps(ownsRails, GAME)[0] || {})) === JSON.stringify(["3>19"]), jumps(ownsRails, GAME).map(pairsIn));
  }

  console.log("\n6. ⏱ provinces.bmp is not read again for railways");
  {
    const strait = "1;3;sea;2;-1;-1;-1;-1;;a strait the strait rule walks";
    const straitOnly = ownMod("s", { adj: [strait] });
    const straitAndRails = ownMod("sr", { adj: [strait], rails: [[1, 2, 3], [2, 18]] });
    const railsOnly = ownMod("r", { rails: [[1, 2, 3], [2, 18]] });
    const realRead = fs.readFileSync;
    const readsOf = (mod) => {
      let n = 0;
      fs.readFileSync = function (p, ...rest) { if (typeof p === "string" && /provinces\.bmp$/i.test(p)) n++; return realRead.call(fs, p, ...rest); };
      try { md.validateMapFiles({ modRoot: mod, gameRoot: NOGAME, dependencyRoots: [] }); } finally { fs.readFileSync = realRead; }
      return n;
    };
    const a = readsOf(straitOnly), b = readsOf(straitAndRails), c = readsOf(railsOnly);
    rec("the strait-only map reads the bitmap at least once (the probe is live)", a >= 1, a);
    rec("⭐⭐ adding railways to it adds no read of provinces.bmp", b === a, { straitOnly: a, straitAndRails: b });
    rec("⭐ …and railways alone read it no more often than straits alone", c <= a, { straitOnly: a, railsOnly: c });
  }

  console.log("\n7. ⚠️ The rule does not cry wolf on a map that ships");
  {
    const VAN = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
    const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
    if (!fs.existsSync(path.join(VAN, "map", "railways.txt"))) console.log("  ..   (the base game is not installed)");
    else {
      const roots = [["vanilla", VAN]];
      if (fs.existsSync(WS)) for (const id of fs.readdirSync(WS)) {
        const p = path.join(WS, id);
        if (fs.existsSync(path.join(p, "map", "railways.txt")) && fs.existsSync(path.join(p, "map", "provinces.bmp"))) roots.push(["ws-" + id, p]);
      }
      // ⛔ THIS ASSERTED "NOT ONE MAP REPORTS ANYTHING", and that was only ever a claim about the maps that
      // happened to be installed. Hearts of Minecraft arrived and its map/railways.txt row 122 — `1 3 4256
      // 5407 2724` — joins two provinces measured at THIRTY-EIGHT hops apart over the province graph plus
      // adjacencies.csv. The rule is right; a shipping map simply carries a broken railway, which is normal
      // (Millennium Dawn ships twenty map problems and launches fine).
      //
      // So the property worth pinning is not "no shipping map has a defect" — it is that the rule never fires
      // on something LEGITIMATE. Each reported pair is re-measured here, independently of map-data.js, and
      // must be genuinely far; anything close is cry-wolf and fails. That is stronger than a zero, and it does
      // not go stale the next time the owner subscribes to a mod.
      const linkGraph = (root) => {
        const model = md.buildMapModel({ modRoot: root, gameRoot: VAN, dependencyRoots: [], cacheStableLayers: true });
        const nbr = md.provinceNeighbourGraph({ modRoot: root, gameRoot: VAN, dependencyRoots: [], model });
        const extra = new Map();
        const add = (a, b) => { if (!extra.has(a)) extra.set(a, new Set()); extra.get(a).add(b); };
        const af = fs.existsSync(path.join(root, "map", "adjacencies.csv"))
          ? path.join(root, "map", "adjacencies.csv") : path.join(VAN, "map", "adjacencies.csv");
        for (const l of fs.readFileSync(af, "latin1").split(/\r?\n/)) {
          const c = l.split(";");
          if (!(c.length >= 4 && /^\d+$/.test((c[0] || "").trim()))) continue;
          if (String(c[2] || "").trim().toLowerCase() === "impassable") continue;   // not a crossing
          const a = +c[0], b = +c[1];
          if (a > 0 && b > 0) { add(a, b); add(b, a); }
        }
        return { model, nbr, extra };
      };
      const hops = (g, a, b, cap) => {
        if (a === b) return 0;
        const seen = new Set([a]);
        let front = [a];
        for (let d = 1; d <= cap; d++) {
          const next = [];
          for (const q of front) for (const set of [g.nbr.get(q), g.extra.get(q)]) {
            if (!set) continue;
            for (const n of set) { if (n === b) return d; if (seen.has(n)) continue; seen.add(n); next.push(n); }
          }
          if (!next.length) return Infinity;
          front = next;
        }
        return cap + 1;
      };
      const THRESHOLD = 8;                       // the rule's own MAX_HOPS, quoted in its message
      let pairs = 0, reported = 0;
      for (const [label, root] of roots) {
        const g = linkGraph(root);
        for (const r of g.model.railways) pairs += Math.max(0, r.provinces.length - 1);
        const rep = jumps(root, VAN);
        reported += rep.length;
        if (!rep.length) { rec(`⭐⭐ ${label}: nothing reported`, true); continue; }
        const close = [];
        for (const item of rep) {
          for (const it of (item.items || [item])) {
            if (!(it && it.from > 0 && it.to > 0)) continue;
            const d = hops(g, it.from, it.to, 200);
            if (d <= THRESHOLD) close.push({ from: it.from, to: it.to, hops: d });
          }
        }
        rec(`⭐⭐⭐ ${label}: every reported link really is more than ${THRESHOLD} provinces apart`,
          close.length === 0, { reported: rep.map(pairsIn), tooClose: close });
      }
      rec(`${roots.length} shipping map(s), ${pairs} railway links examined — not a vacuous pass`, roots.length >= 2 && pairs > 30000, { maps: roots.length, pairs });
      rec("⭐⭐ …and the rule stays rare on shipping data, not a flood", reported <= Math.ceil(pairs / 1000), { reported, pairs });
    }
  }

  console.log(`\n=== a railway cannot jump across the map: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
