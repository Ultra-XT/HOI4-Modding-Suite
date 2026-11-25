// #x2-brigade-cards — PLACED DIVISIONS WERE GROUPED INTO ONE CARD MARKED ×N.
//
// Reported from play: "x2 brigade cards need separating".
//
// renderDivisionList grouped placed divisions by template@province into a single tile showing ×N. The
// grouping hid more than it tidied:
//   · the × deleted EVERY division matching (province, template), never just the one you clicked
//   · clicking edited the whole stack
//   · the tile showed "N commanders" as a COUNT, and took equipment/experience from whichever division
//     happened to carry a value — so an uneven stack displayed one division's numbers for all of them
//
// Uneven stacks are not a corner case. This test measures vanilla's own order of battle for them rather
// than repeating the claim: several groups share a template and province while carrying DIFFERENT
// commanders. Vanilla's ETH_1936_bba.txt puts two named commanders at province 7944 with 45%/5% and
// 100%/25% — one ×2 card, neither name visible.
//
// Now: one tile per division, keyed by object IDENTITY (the array is filtered on delete, so a stored index
// would point at a different division), with per-division delete and per-division edit.
"use strict";
const fs = require("fs");
const path = require("path");

const V = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700));
  }
}
const ARMY = fs.readFileSync(path.join(__dirname, "public", "army.js"), "utf8");
const HTML = fs.readFileSync(path.join(__dirname, "public", "army.html"), "utf8");

// The body of one named function, brace-matched — never a fixed window, which just measures how long the
// comments above the code happen to be.
function fnBody(src, name) {
  const i = src.indexOf(`function ${name}(`);
  if (i === -1) return "";
  let d = 0, end = -1;
  for (let k = src.indexOf("{", i); k < src.length; k++) {
    if (src[k] === "{") d++;
    else if (src[k] === "}") { d--; if (!d) { end = k + 1; break; } }
  }
  return src.slice(i, end);
}

(async () => {
  try {
    console.log("\n[ground truth] vanilla really does stack DIFFERENT divisions on one template + province");
    const oob = path.join(V, "history", "units");
    if (!fs.existsSync(oob)) console.log("  (skipped — vanilla not installed)");
    else {
      // division = { name=… location=N division_template="…" … }
      let uneven = 0, filesWith = new Set(), example = null;
      for (const f of fs.readdirSync(oob).filter((x) => x.endsWith(".txt"))) {
        let t = "";
        try { t = fs.readFileSync(path.join(oob, f), "utf8").replace(/#[^\n]*/g, ""); } catch (_) { continue; }
        const groups = new Map();
        const re = /division\s*=\s*\{/g;
        let m;
        while ((m = re.exec(t))) {
          const o = t.indexOf("{", m.index);
          let d = 0, c = -1;
          for (let k = o; k < t.length; k++) { if (t[k] === "{") d++; else if (t[k] === "}") { d--; if (!d) { c = k; break; } } }
          if (c === -1) break;
          const b = t.slice(o + 1, c);
          re.lastIndex = c + 1;
          const loc = (/(^|\n)\s*location\s*=\s*(\d+)/.exec(b) || [, , ""])[2];
          const tpl = (/division_template\s*=\s*"([^"]*)"/.exec(b) || [, ""])[1];
          const nm = (/(^|\n)\s*name\s*=\s*"([^"]*)"/.exec(b) || [, , ""])[2];
          if (!loc || !tpl) continue;
          const k2 = tpl + "@" + loc;
          if (!groups.has(k2)) groups.set(k2, []);
          groups.get(k2).push(nm);
        }
        for (const [k2, names] of groups) {
          if (names.length < 2) continue;
          if (new Set(names).size > 1) {
            uneven++;
            filesWith.add(f);
            if (!example) example = { file: f, group: k2, names: names.slice(0, 2) };
          }
        }
      }
      rec("vanilla stacks two or more DIFFERENT divisions on one template+province",
        uneven > 5, { groups: uneven, files: filesWith.size });
      rec("…across several order-of-battle files", filesWith.size > 2, [...filesWith].slice(0, 6));
      if (example) console.log(`       e.g. ${example.file}  ${example.group}  ->  ${example.names.join("  |  ")}`);
    }

    console.log("\n[the render] one tile per division, not one per group");
    const render = fnBody(ARMY, "renderDivisionList");
    rec("renderDivisionList was found", !!render, "not found");
    rec("…and no longer groups by template@province",
      !/\(d\.template \|\| ""\) \+ "@" \+ d\.location/.test(render), "still grouping");
    rec("…it maps over the divisions themselves", /S\._depOrder = divs\.slice\(\)/.test(render), "no per-division order");
    // Matched as a whole class value: "dep-count" is a prefix of "dep-counter", which is the NATO box and
    // must stay. A bare substring test passes the wrong thing.
    rec("…and draws no ×N count badge", !/class="dep-count"/.test(render), "the ×N badge is still there");
    rec("…each tile carries its index into that order", /data-i="\$\{di\}"/.test(render), "no per-tile index");
    rec("…and the tile shows THIS division's commander by name",
      /dep-chip">🎖 \$\{esc\(g\.officer\)\}/.test(render), "still a commander COUNT");
    rec("…the delete button is per-division too", /class="dep-del" data-i="\$\{di\}"/.test(render), "delete is still per group");

    console.log("\n[identity] object, not index — the array is filtered on delete");
    rec("delete removes exactly the clicked division",
      /S\.model\.divisions\.filter\(\(y\) => y !== d\)/.test(render), "still filters by loc+tpl");
    rec("…and does not match on (location, template)",
      !/!\(d\.location === loc && \(d\.template \|\| ""\) === tpl\)/.test(render), "still deletes the whole stack");
    rec("the edit compares by identity", /S\.deployEdit\.div === d/.test(render), "compares loc+tpl");

    console.log("\n[the edit] acts on the one division");
    const start = fnBody(ARMY, "startDeployEdit");
    const apply = fnBody(ARMY, "applyDeployEdit");
    rec("startDeployEdit takes a division", /function startDeployEdit\(div\)/.test(start), "still takes (loc, tpl)");
    rec("…and refuses one that is no longer placed",
      /S\.model\.divisions \|\| \[\]\)\.includes\(div\)/.test(start), "no membership check");
    rec("…it reads the fields off THAT division, not off whichever one has a value",
      !/firstWith/.test(start) && /div\.officer/.test(start), "still scavenges across the group");
    rec("applyDeployEdit writes to that division only",
      /const mine = \[div\];/.test(apply), "still filters a group");
    rec("…and keeps the only-write-what-changed safeguard",
      /const changed = \(k\) =>/.test(apply) && /changed\("officer"\)/.test(apply), "safeguard lost");
    rec("…and no longer numbers a lone commander \"Name 1\"",
      !/\$\{officer\} \$\{i \+ 1\}/.test(apply), "still appends an index");

    console.log("\n[the count box] means \"how many to place\", so it is out of play while editing");
    rec("editing disables it", /cnt\.disabled = true/.test(start), "left enabled during an edit");
    rec("cancelling hands it back", /cnt\.disabled = false/.test(fnBody(ARMY, "endDeployEdit")), "stays disabled after cancel");
    rec("…and so does pressing Update — which does not go through endDeployEdit",
      /cnt\.disabled = false/.test(apply), "stuck disabled after an update");

    console.log("\n[stockpile rows] the amount no longer runs into the remove ×");
    // ⚠️ There is more than one stockpile row renderer now. #stockpile-shows-only-the-part-nova-wrote added a
    // read-only list of the entries the modder wrote by hand, with the same meta markup, ABOVE the managed
    // one — so "the first occurrence is spaced" stopped meaning "every row is spaced". Count them: every
    // `dr-meta">×` must carry the space, or one list reads "infantry_equipment_1×14000×" and the other does
    // not, which is worse than both being wrong.
    {
      // Counted on the marker itself rather than on `Number(e.amount)`: the air-group row next door had the
      // identical defect with a different variable name (`it.amount`), and an assertion keyed to one
      // renderer's variable would have kept walking past it.
      const all = (ARMY.match(/dr-meta">×/g) || []).length;
      const spaced = (ARMY.match(/dr-meta">× /g) || []).length;
      rec(`the count is spaced away from the equipment name in all ${all} × rows`,
        all > 0 && spaced === all, { all, spaced });
    }

    console.log("\n[back-out] group them again");
    {
      const reverted = ARMY.replace(/S\._depOrder = divs\.slice\(\);/, 'S._depOrder = divs.slice(); /* grouped */');
      rec("the control patched cleanly", reverted !== ARMY, "anchor did not match");
      // The real control: put the ×N badge back and watch the per-division assertions fail.
      const withBadge = ARMY.replace(/data-i="\$\{di\}" title="Click to edit this division/, 'data-loc="${g.location}" title="Click to edit these');
      rec("…restoring a group-keyed tile breaks the per-division identity check",
        !/data-i="\$\{di\}" title="Click to edit this division/.test(withBadge), "assertion does not depend on it");
      // replaceALL — String.replace takes only the first match, and with two row renderers that left the
      // second one spaced, so the control silently stopped biting. That is the same trap in reverse: the
      // suite caught it the day the second renderer was added, which is the only reason this note exists.
      const noSpace = ARMY.replace(/dr-meta">× /g, 'dr-meta">×');
      rec("…and removing the space brings ×14000× back",
        (noSpace.match(/dr-meta">× /g) || []).length === 0
        && (noSpace.match(/dr-meta">×/g) || []).length === (ARMY.match(/dr-meta">×/g) || []).length,
        "spacing assertion is not load-bearing");
    }

    console.log("\n[still valid]");
    rec("army.js parses", (() => { try { new Function(ARMY); return true; } catch (e) { return String(e.message); } })() === true,
      (() => { try { new Function(ARMY); return "ok"; } catch (e) { return String(e.message); } })());
    rec("army.js is versioned so the change ships", /army\.js\?v=\d+/.test(HTML), "no version");

    console.log(`\n=== deploy tiles per division: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  }
})();
