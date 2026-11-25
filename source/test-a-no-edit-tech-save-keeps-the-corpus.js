// CORPUS ROUND TRIP over the technology writer — real mod files, chosen for the shapes that break it.
//
// test-technology-save-keeps-its-text.js round-trips TWO vanilla files. The corpus is 6,496 technology
// blocks across the vanilla install and nine installed workshop mods, and a one-off sweep of ALL of them
// (kept in the scratchpad, not here — see the budget note below) found four real defects in one pass:
//
//   #tech-id-dot                  a dotted id was invisible, so saving deleted the edges pointing at it
//   #dangling-path-deleted        84 authored edges to a tech nothing defines, silently removed
//   #tech-header-comment-dropped  211 notes on a technology's own opening line, deleted
//   (and the duplication bug the third fix nearly shipped, caught by counting rather than matching)
//
// It measures three things, because the first two are not enough:
//   • leaf assignments (multiset)  — survives reformatting and indentation
//   • comment texts   (multiset)   — did a note vanish
//   • ⭐ a CAPTION MAP (comment -> the key on the next code line) — A MULTISET IS BLIND TO POSITION. A writer
//     that keeps every comment and re-attaches it to the wrong statement passes a multiset at identical byte
//     count; that blindness hid two real bugs for a whole campaign. The header-comment bug is exactly this
//     shape: the multiset said "nothing lost" while every `#Panzer I` had moved onto enable_equipments.
//
// ⛔ THE RESIDUE IS CLASSIFIED, NOT ALLOWED AS A NUMBER. What is still lost is understood and listed below;
// anything ELSE is a regression. An "under N" budget would let a brand-new shape hide inside it.
//
// ⚠️ IT PICKS FILES BY THE PROPERTY THEY EXHIBIT, AND THE SMALLEST OF EACH — it does not sweep everything.
// The first version round-tripped two files per root, and cost 335 SECONDS: more than the entire unit
// suite's budget, in one file. Each round trip builds a fresh catalogue for a fresh scratch mod, so the cost
// scales with the technologies in the file, and the suite went from ~6 minutes to over 10.
//
// The broad sweep is a HUNTING tool and lives in the scratchpad; a committed guard only has to fail when one
// of these shapes regresses. So it selects the smallest file carrying each shape the fixes were about — a
// header comment, a dotted id, a dangling edge, a self-path — which is what a regression would break.
//
// ⛔ SCRATCH MODS IN TEMP ONLY — the corpus files are read and copied, never written back.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 53543;
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-techrt-appdata-"));
process.env.APPDATA = SANDBOX;
process.env.XDG_CONFIG_HOME = SANDBOX;
process.env.NOVA_APP_DATA_DIR = SANDBOX;

const { createApp } = require("./server.js");
const BASE = `http://127.0.0.1:${PORT}`;
const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};

function maskComments(t) {
  let out = "", inStr = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inStr) { out += c; if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === "#") { while (i < t.length && t[i] !== "\n") { out += " "; i++; } out += "\n"; continue; }
    out += c;
  }
  return out;
}
const leaves = (text) => {
  const out = [];
  for (const m of maskComments(text).matchAll(/([A-Za-z_][A-Za-z0-9_.]*)\s*(=|<|>)\s*("(?:[^"\\]|\\.)*"|[^\s{}#]+)/g)) out.push(`${m[1]} ${m[2]} ${m[3]}`);
  return out;
};
const commentTexts = (t) => String(t).replace(/\r/g, "").split("\n")
  .map((l) => { const h = l.indexOf("#"); return h < 0 ? null : ((l.slice(0, h).match(/"/g) || []).length % 2 === 1 ? null : l.slice(h).trim().replace(/\s+/g, " ")); })
  .filter(Boolean);
function lossOf(was, now) {
  const left = now.slice();
  const lost = [];
  for (const x of was) { const i = left.indexOf(x); if (i >= 0) left.splice(i, 1); else lost.push(x); }
  return lost;
}
// Every technology that declares a path to ITSELF — the one leaf loss that is deliberate.
function selfPathTechs(text) {
  const out = new Set();
  const t = String(text).replace(/#[^\n]*/g, "");
  const marks = [];
  const re = /(^|\n)\t([A-Za-z0-9_@.\-]+)\s*=\s*\{/g;
  let m;
  while ((m = re.exec(t))) marks.push([m[2], m.index]);
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1][1] : t.length;
    const body = t.slice(marks[i][1], end);
    const esc = marks[i][0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp("leads_to_tech\\s*=\\s*" + esc + "(?![A-Za-z0-9_@.\\-])").test(body)) out.add(marks[i][0]);
  }
  return out;
}

(async () => {
  let server;
  try {
    if (!fs.existsSync(path.join(GAME, "common", "technologies"))) {
      rec("a vanilla install to round-trip against", false, "cannot run the corpus sweep");
      console.log(`\n=== a no-edit tech save keeps the corpus: ${checks} checks, ${fails.length} failed ===`);
      process.exitCode = 1;
      return;
    }
    server = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });

    const roots = [["vanilla", GAME]];
    try {
      for (const d of fs.readdirSync(WS)) {
        const p = path.join(WS, d);
        if (fs.existsSync(path.join(p, "common", "technologies"))) roots.push([d, p]);
      }
    } catch (_) {}
    rec("there are corpora to sweep", roots.length >= 3, roots.length + " roots");

    // ── Pick the SMALLEST real file carrying each shape the fixes were about ────────────────────────────
    // Derived from the corpus, so it keeps working as the installed mods change, and it fails loudly if a
    // shape disappears from every installed mod rather than quietly testing nothing.
    const SHAPES = {
      "a header comment": (t) => /^\t[A-Za-z0-9_@.\-]+\s*=\s*\{[ \t]*#/m.test(t),
      "a dotted id": (t) => /^\t[A-Za-z0-9_@\-]*\.[A-Za-z0-9_@.\-]*\s*=\s*\{/m.test(t),
      "a self-path": (t) => selfPathTechs(t).size > 0,
      "many path edges": (t) => (t.match(/leads_to_tech/g) || []).length >= 20,
    };
    const chosen = new Map();
    for (const [rootName, root] of roots) {
      let files = [];
      try { files = fs.readdirSync(path.join(root, "common", "technologies")).filter((f) => f.endsWith(".txt")); } catch (_) { continue; }
      for (const f of files) {
        const full = path.join(root, "common", "technologies", f);
        let size = 0;
        try { size = fs.statSync(full).size; } catch (_) { continue; }
        let text = "";
        try { text = fs.readFileSync(full, "utf8"); } catch (_) { continue; }
        for (const [shape, has] of Object.entries(SHAPES)) {
          if (!has(text)) continue;
          const cur = chosen.get(shape);
          if (!cur || size < cur.size) chosen.set(shape, { rootName, f, full, size });
        }
      }
    }
    for (const shape of Object.keys(SHAPES)) {
      const c = chosen.get(shape);
      rec(`a corpus file carrying ${shape}`, !!c,
        c ? `${c.rootName}/${c.f} (${Math.round(c.size / 1024)} KB)` : "no installed mod has this shape");
    }
    // ⚠️ AND A BYTE BUDGET ON TOP. Each round trip rebuilds a catalogue, so the cost tracks the file's size:
    // two files per root cost 335s and four shape-picked ones still cost 141s. The suite's ~6-minute budget
    // is a hard-won property (29.5 min -> 6), and one guard is not worth a third of it. Smallest first, until
    // the budget is spent — the shapes are ordered so the cheapest evidence is always kept.
    //
    // The dotted id is deliberately NOT bought here: test-a-tech-id-is-read-and-written-the-same-way.js
    // already round-trips that same 86 KB file, and paying for it twice buys nothing.
    const BUDGET_BYTES = 60 * 1024;
    const picked = [];
    let spent = 0;
    for (const v of [...chosen.values()]
      .filter((v, i, a) => a.findIndex((x) => x.full === v.full) === i)
      .sort((a, b) => a.size - b.size)) {
      if (spent && spent + v.size > BUDGET_BYTES) continue;
      picked.push(v);
      spent += v.size;
    }

    const made = [];
    const totals = { files: 0, techs: 0, leafLost: 0, leafGained: 0, commentLost: 0, unexplainedLeaf: 0, unexplainedComment: 0 };
    const unexplained = [];

    {
      for (const { rootName, f, full } of picked) {
        const original = fs.readFileSync(full, "utf8");
        const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-techrt-mod-"));
        made.push(mod);
        const dest = path.join(mod, "common", "technologies", "probe.txt");
        try {
          fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Nova Tech RT"\n');
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.writeFileSync(dest, original, "utf8");
          const cat = await fetch(`${BASE}/api/technologies/catalog?modPath=${encodeURIComponent(mod)}&lite=1`).then((r) => r.json());
          const mine = (cat.technologies || []).filter((t) => t && t.isMod);
          if (!mine.length) continue;
          await fetch(`${BASE}/api/technologies/save-batch`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ technologies: mine.map((t) => JSON.parse(JSON.stringify(t))), equipments: cat.equipments || {}, customTabs: [], modPath: mod, countryTag: null, countryTechIds: null, deletions: [], newTechIds: [] }),
          }).then((r) => r.json());
          const after = fs.readFileSync(dest, "utf8");

          totals.files++; totals.techs += mine.length;
          const lLost = lossOf(leaves(original), leaves(after));
          const lGain = lossOf(leaves(after), leaves(original));
          const cLost = lossOf(commentTexts(original), commentTexts(after));
          totals.leafLost += lLost.length; totals.leafGained += lGain.length; totals.commentLost += cLost.length;

          // ── KNOWN RESIDUE ────────────────────────────────────────────────────────────────────────────
          // (1) a technology's path to ITSELF. 11 of 6,496 blocks, all copy-paste slips in Rise of Nations
          //     and Millennium Dawn. The catalog has no representation for a self-edge and feeding one back
          //     would put a technology in its own prerequisite chain; reporting it belongs to Mod Health.
          const selfies = selfPathTechs(original);
          const explainedLeaf = (x) =>
            (/^leads_to_tech = /.test(x) && selfies.has(x.replace("leads_to_tech = ", "").trim()))
            || (/^research_cost_coeff = /.test(x) && selfies.size > 0);
          // (2) a note on the opening line of a `path` block, and a note trailing a ONE-LINE modelled block
          //     (`xor = { a b } #fixed`). serializeTechnology rebuilds both lines from the model, which has
          //     nowhere to put them. 2 and 1 occurrences respectively across the whole corpus.
          // (3) a repeated separator captioning several `path` blocks (`###########`): leadComments is keyed
          //     by KEY NAME and is deliberately one-shot, so a key emitted many times carries one caption.
          //
          // ⚠️ DERIVED FROM THE SOURCE, NOT A WORD LIST. My first version ended with
          // `/path|xor|…/.test(x + " path xor")`, which is ALWAYS TRUE — it explained every loss and the
          // check passed while measuring nothing. A classifier that cannot fail is worse than none.
          const rebuiltLineNotes = new Set();
          for (const line of original.split(/\r?\n/)) {
            // a note on a modelled block's opening line, or trailing a complete one-line modelled block
            const m = /^[ \t]+(path|xor|mutually_exclusive|prerequisite)\s*=\s*\{[^#\n]*(#.*)$/.exec(line);
            if (m) rebuiltLineNotes.add(m[2].trim().replace(/\s+/g, " "));
          }
          const explainedComment = (x) =>
            /^#+$/.test(x)                     // a bare separator: one caption per key name (leadComments)
            || rebuiltLineNotes.has(x);        // sat on a line serializeTechnology rebuilds from the model

          for (const x of lLost) if (!explainedLeaf(x)) { totals.unexplainedLeaf++; if (unexplained.length < 8) unexplained.push(`LEAF ${rootName}/${f}: ${x}`); }
          for (const x of cLost) if (!explainedComment(x)) { totals.unexplainedComment++; if (unexplained.length < 8) unexplained.push(`COMMENT ${rootName}/${f}: ${x.slice(0, 60)}`); }
        } finally {
          try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
        }
      }
    }

    console.log("\n1. The sweep really exercised the corpus");
    rec("files round-tripped", totals.files >= 2, `${totals.files} files, ${totals.techs} technologies`);
    rec("…across several mods, not just vanilla", roots.length >= 3, roots.length + " roots");

    console.log("\n2. Nothing is INVENTED");
    // A gained leaf means the writer wrote something the author never did — always a defect, no exceptions.
    rec("no leaf assignment appeared that was not in the source", totals.leafGained === 0, totals.leafGained);

    console.log("\n3. Nothing is lost but the known residue");
    rec("no unexplained leaf assignment was lost", totals.unexplainedLeaf === 0,
      `${totals.leafLost} lost, ${totals.unexplainedLeaf} unexplained`);
    rec("no unexplained comment was lost", totals.unexplainedComment === 0,
      `${totals.commentLost} lost, ${totals.unexplainedComment} unexplained`);
    if (unexplained.length) { console.log("\n  unexplained:"); unexplained.forEach((u) => console.log("    " + u)); }

    console.log(`\n=== a no-edit tech save keeps the corpus: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    if (server) { try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {} await new Promise((r) => server.close(r)); }
    try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
  }
})();
