// Erasing a province must take its building block with it, even when that block has a sub-block inside.
// #a-nested-building-block-survives-the-erase
//
// removeProvinceBuildingBlock matched `<pid> = { [^{}]* }`, and `[^{}]*` stops at the first inner brace.
// Vanilla's own DLC-gated shape has one — 126-Greater London Area.txt, province 11374:
//
//     11374 = {
//         naval_base = 10
//         naval_headquarters = { level = 1 allowed = { has_dlc = "No Compromise" } }
//     }
//
// so the match failed and the block stayed in the file. Erasing that province to sea pulled it out of the
// provinces list and left its naval base and headquarters keyed to open water — the "land data on a water
// province" class. Nothing claimed otherwise (the backlog sweep honestly reports 0) and nothing removed it;
// the only signal was a naval_base_non_coastal warning, which reads as being about something else and has
// no fixer behind it.
//
// ⚠️ NOT AN EXOTIC SHAPE. Counted below from every installed root: 159 of 3,807 province building blocks
// nest, 30 of them in VANILLA — Big Ben, the Great Wall, Nanjing's presidential palace, several naval
// headquarters — and 89 in Millennium Dawn. It is simply how a landmark is written.
//
// The replacement walks BALANCED BRACES at the buildings block's top level, on comment-masked text. That
// keeps the two properties the old regex was carrying: a commented-out block is never touched
// (#building-remover-ate-a-commented-out-block, which once unbalanced a Road to 56 state file), and
// removing province 121 cannot slice into 1121 — the key is now read back as a whole token rather than
// matched as a substring.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 400) : "")); }
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
const tmps = [];

const B = (id, body) => `\t\t\t${id} = {\n${body}\n\t\t\t}`;
const stateWith = (buildings) => `state = {
\tid = 1
\tname = "STATE_1"
\tmanpower = 1000
\tstate_category = rural
\tprovinces = { 1 2 121 1121 }
\thistory = {
\t\towner = AAA
\t\tbuildings = {
${buildings}
\t\t}
\t}
}
`;
const braces = (s) => [(s.match(/\{/g) || []).length, (s.match(/\}/g) || []).length];
const hasBlock = (txt, pid) => {
  const i = txt.indexOf("buildings");
  return i < 0 ? false : new RegExp(`(^|[^0-9])${pid}\\s*=\\s*\\{`).test(txt.slice(i));
};

// ── ⛔ the finding ───────────────────────────────────────────────────────────────────────────────────
console.log("\n=== ⛔ a block with a sub-block inside it ===");
{
  const src = stateWith([
    B(1, "\t\t\t\tnaval_base = 10\n\t\t\t\tnaval_headquarters = { level = 1 allowed = { has_dlc = \"No Compromise\" } }"),
    B(2, "\t\t\t\tnaval_base = 4"),
  ].join("\n"));

  const gone = md.removeProvinceBuildingBlock(src, 1);
  ok(!hasBlock(gone, 1), "⭐⭐⭐ the nested block is removed", gone.slice(gone.indexOf("buildings"), gone.indexOf("buildings") + 220));
  ok(hasBlock(gone, 2), "⚠️ …and its flat neighbour is untouched", true);
  const [o, c] = braces(gone);
  ok(o === c, "⭐⭐ …leaving the file balanced", { open: o, close: c });
  ok(!/naval_headquarters/.test(gone), "…the sub-block went with it, not just the first line", true);

  // the control the old code DID pass, so the rewrite cannot have lost it
  const flat = md.removeProvinceBuildingBlock(src, 2);
  ok(!hasBlock(flat, 2) && hasBlock(flat, 1), "✅ a flat block is still removed, and only it", true);
}

// ── ⚠️ the two properties the old regex was carrying ─────────────────────────────────────────────────
console.log("\n=== ⚠️ what the regex was protecting is still protected ===");
{
  // 1. a substring id must not match: removing 121 must not touch 1121
  const src = stateWith([B(121, "\t\t\t\tnaval_base = 1"), B(1121, "\t\t\t\tnaval_base = 2")].join("\n"));
  const r = md.removeProvinceBuildingBlock(src, 121);
  ok(!hasBlock(r, 121), "province 121's block is removed", true);
  ok(/1121\s*=\s*\{/.test(r), "⭐⭐ …and province 1121's block survives it intact", r.slice(r.indexOf("buildings"), r.indexOf("buildings") + 200));

  // 2. a COMMENTED-OUT block is not content — touching it once unbalanced a real mod's state file
  const commented = stateWith("\t\t\t#11945 = {\n\t\t\t#\tnaval_base = 3\n\t\t\t#}\n" + B(2, "\t\t\t\tnaval_base = 4"));
  const [o0, c0] = braces(commented);
  const r2 = md.removeProvinceBuildingBlock(commented, 11945);
  const [o1, c1] = braces(r2);
  ok(r2 === commented, "⭐⭐⭐ a commented-out block is left exactly as the modder wrote it", r2 === commented);
  ok(o1 === c1 && o0 === o1, "…and the file's braces are untouched", { before: [o0, c0], after: [o1, c1] });

  // 3. a province with no block at all is a no-op
  const none = stateWith(B(2, "\t\t\t\tnaval_base = 4"));
  ok(md.removeProvinceBuildingBlock(none, 9999) === none, "a province with no block changes nothing", true);
}

// ── 🈯 HOW COMMON IS IT? counted from the installed corpus ───────────────────────────────────────────
console.log("\n=== 🈯 nested blocks in shipping content ===");
{
  const roots = [];
  if (fs.existsSync(path.join(GAME, "history", "states"))) roots.push(["vanilla", GAME]);
  if (fs.existsSync(WS)) for (const id of fs.readdirSync(WS)) {
    if (fs.existsSync(path.join(WS, id, "history", "states"))) roots.push(["ws-" + id, path.join(WS, id)]);
  }
  if (!roots.length) console.log("  ..   (no installed roots)");
  else {
    let blocks = 0, nested = 0, vanillaNested = 0;
    for (const [label, root] of roots) {
      const dir = path.join(root, "history", "states");
      for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".txt"))) {
        let t = ""; try { t = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
        const clean = t.replace(/#[^\n\r]*/g, "");
        const re = /(^|[^A-Za-z0-9_])buildings\s*=\s*\{/g;
        let m;
        while ((m = re.exec(clean))) {
          let d = 1, i = re.lastIndex;
          while (i < clean.length && d > 0) { const ch = clean[i]; if (ch === "{") d++; else if (ch === "}") d--; i++; }
          const body = clean.slice(re.lastIndex, i - 1);
          const pr = /(^|[^A-Za-z0-9_])(\d+)\s*=\s*\{/g;
          let pm;
          while ((pm = pr.exec(body))) {
            let dd = 1, j = pr.lastIndex, sub = false;
            while (j < body.length && dd > 0) { const ch = body[j]; if (ch === "{") { dd++; sub = true; } else if (ch === "}") dd--; j++; }
            blocks++;
            if (sub) { nested++; if (label === "vanilla") vanillaNested++; }
          }
        }
      }
    }
    console.log(`     ${blocks} province building blocks across ${roots.length} root(s); ${nested} nest, ${vanillaNested} of them in vanilla`);
    ok(vanillaNested > 0, "⭐⭐ the base game itself ships nested province building blocks", vanillaNested);
    ok(nested > 50, "⚠️ …and so does the wider corpus, in numbers — this is a normal shape", nested);
  }
}

// ── ⭐⭐⭐ THE ROUND TRIP: remove every block from every shipping state file ──────────────────────────
console.log("\n=== ⭐⭐⭐ removing a block never breaks a shipping file ===");
{
  const dir = path.join(GAME, "history", "states");
  if (!fs.existsSync(dir)) console.log("  ..   (the base game is not installed)");
  else {
    let files = 0, removals = 0, unbalanced = 0, grew = 0;
    const bad = [];
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".txt"))) {
      let t = ""; try { t = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
      files++;
      const ids = [...new Set([...t.replace(/#[^\n\r]*/g, "").matchAll(/(^|[^A-Za-z0-9_])(\d+)\s*=\s*\{/g)].map((m) => m[2]))];
      for (const id of ids) {
        const out = md.removeProvinceBuildingBlock(t, id);
        if (out === t) continue;
        removals++;
        const [o, c] = braces(out);
        const [o0, c0] = braces(t);
        if (o !== c) { unbalanced++; if (bad.length < 5) bad.push(`${f}: province ${id} left ${o} open / ${c} close`); }
        if (out.length > t.length) { grew++; if (bad.length < 5) bad.push(`${f}: province ${id} GREW`); }
        // …and it must never take a neighbour with it
        if (o0 - c0 !== 0) continue;
      }
    }
    console.log(`     ${files} vanilla state files, ${removals} block removals performed`);
    ok(removals > 100, "the round trip actually did work — it is not vacuous", removals);
    ok(unbalanced === 0, "⭐⭐⭐ not one removal left a file with unmatched braces", bad);
    ok(grew === 0, "…and none of them made a file longer", bad);
  }
}

tmps.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
console.log(`\n=== a nested building block survives nothing: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
