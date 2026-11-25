// ⛔ #ideas-file-missing-its-last-brace — 485 NATIONAL SPIRITS WERE INVISIBLE, INCLUDING ALL 338 SOVIET ONES.
//
// A `common/ideas` file opens with `ideas = {` and closes with a matching `}`… except in three files the
// base game ships, where it does not. `SOV.txt`, `persia.txt` and `switzerland.txt` each end one `}` short.
// The game loads them anyway: Clausewitz treats end-of-file as closing whatever is still open.
//
// Nova required the brace. `findMatchingBraceMasked` returned -1, the file was skipped, and nothing said so
// — the spirit editor showed an empty list for the Soviet Union and gave no reason:
//
//     SOV.txt          197 KB   338 ideas   0 listed
//     persia.txt        28 KB    79 ideas   0 listed
//     switzerland.txt   22 KB    68 ideas   0 listed
//
// The catalogue went from 5,998 ideas to 6,483 once the reader closed them the way the engine does.
//
// ⚠️ READ PATH ONLY. `#unbalanced-file-blamed-the-spirit` still refuses to WRITE into a file whose braces do
// not add up, and names the file and the line — which is the right answer for a save, and is section 3.
//
// ⛔ SCRATCH MODS IN TEMP ONLY. This test does not save: the ideas write path writes a file per spirit and
// imports .dds icons, which is the behaviour behind CLAUDE.md ⛔2.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 53572;
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-ideabrace-"));
process.env.APPDATA = SANDBOX;
process.env.XDG_CONFIG_HOME = SANDBOX;
process.env.NOVA_APP_DATA_DIR = SANDBOX;

const { createApp, collectIdeaBlocksFromText, describeBraceImbalance } = require("./server.js");
const BASE = `http://127.0.0.1:${PORT}`;

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};

const BODY = `ideas = {

\tcountry = {

\t\tprobe_first_spirit = {
\t\t\tallowed = { always = no }
\t\t\tpicture = generic_intel_bonus
\t\t\tmodifier = { political_power_gain = 0.1 }
\t\t}

\t\tprobe_second_spirit = {
\t\t\tallowed = { always = no }
\t\t\tpicture = generic_intel_bonus
\t\t\tmodifier = { stability_factor = 0.05 }
\t\t}
\t}
`;
const CLOSED = BODY + "}\n";      // what a well-formed file looks like
const SHORT = BODY;               // …and what vanilla ships: one `}` short

const made = [];
(async () => {
  let server;
  try {
    server = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });

    console.log("1. A file one brace short still reads");
    {
      // ⚠️ CONTROL: the two fixtures differ ONLY by that brace, and the short one really is short.
      rec("CONTROL: the fixtures differ by exactly one closing brace", CLOSED === SHORT + "}\n", "the fixtures drifted");
      const uS = describeBraceImbalance(SHORT), uC = describeBraceImbalance(CLOSED);
      rec("CONTROL: …and the judge agrees which is which",
        !!uS && uS.kind === "missing" && uS.count === 1 && uC === null, JSON.stringify({ uS, uC }));
      const closed = collectIdeaBlocksFromText(CLOSED, "probe.txt") || [];
      const short = collectIdeaBlocksFromText(SHORT, "probe.txt") || [];
      rec("CONTROL: the well-formed file reads two ideas", closed.length === 2, closed.length);
      rec("⭐ the short one reads the SAME two", short.length === closed.length, `${short.length} vs ${closed.length}`);
      const ids = (a) => a.map((b) => b.id || b.ideaId || b.name || "").sort().join(",");
      rec("⭐ …the same ids, not just the same count", ids(short) === ids(closed), `${ids(short)} vs ${ids(closed)}`);
    }

    console.log("\n2. …and the endpoint shows them");
    {
      const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-ideabrace-mod-"));
      made.push(mod);
      fs.mkdirSync(path.join(mod, "common", "ideas"), { recursive: true });
      fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Idea Brace"\nsupported_version="1.16.*"\n');
      fs.writeFileSync(path.join(mod, "common", "ideas", "zz_probe_short.txt"), SHORT, "utf8");
      const j = await fetch(`${BASE}/api/ideas/catalog?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
      const mine = (j.items || []).filter((x) => String(x.definitionFile || "").endsWith("zz_probe_short.txt"));
      rec("⭐ the catalogue lists the mod's own two", mine.length === 2, mine.map((x) => x.ideaId).join(","));
      rec("CONTROL: …attributed to the mod, not the game",
        mine.every((x) => x.sourceType !== "game"), mine.map((x) => x.sourceType).join(","));
    }

    console.log("\n3. CONTROL: the file is still JUDGED unbalanced, so the save still refuses");
    {
      // Reading past a missing brace must not make Nova think the file is fine. The save path asks the same
      // judge and tells the modder which file and which line — that is the right answer for a WRITE, and it
      // has its own test (test-unbalanced-file-message.js). What must hold here is that the read tolerance
      // did not quietly change the verdict.
      const u = describeBraceImbalance(SHORT);
      rec("⭐ the judge still calls it unbalanced", !!u && u.kind === "missing", JSON.stringify(u));
      rec("⭐ …and an EXTRA brace is NOT papered over", (() => {
        const extra = CLOSED + "}\n";
        const blocks = collectIdeaBlocksFromText(extra, "probe.txt") || [];
        const v = describeBraceImbalance(extra);
        return !!v && v.kind === "extra" && blocks.length === 2;
      })(), "an extra closing brace changed the reading");
    }

    console.log("\n4. Measured on the base game");
    {
      // ⚠️ DERIVE the files, do not name them — a patch could fix or add one. Ask the judge which shipped
      // idea files are short, then require the catalogue to list ideas from each.
      const DIR = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/common/ideas";
      let names = [];
      try { names = fs.readdirSync(DIR).filter((f) => /\.txt$/i.test(f)); } catch (_) { names = []; }
      if (!names.length) {
        rec("the base game's ideas folder is installed", false, "cannot verify against the corpus");
      } else {
        const short = [];
        for (const f of names) {
          let t = "";
          try { t = fs.readFileSync(path.join(DIR, f), "utf8"); } catch (_) { continue; }
          const u = describeBraceImbalance(t);
          if (u && u.kind === "missing" && t.length > 200) short.push([f, t]);
        }
        // ⚠️ CONTROL: the shape still exists in the shipped game. If Paradox ever fixes those three files
        // this goes to zero and every star below would pass on nothing.
        rec("CONTROL: the base game still ships idea files that are one brace short", short.length > 0,
          short.map(([f]) => f).join(" ") || "none — the game may have been patched");
        let listed = 0, blocks = 0;
        for (const [f, t] of short) {
          const n = (collectIdeaBlocksFromText(t, f) || []).length;
          blocks += n;
          if (n > 0) listed++;
          console.log(`     ${f}: ${n} ideas`);
        }
        rec("⭐ every one of them reads", short.length > 0 && listed === short.length, `${listed} of ${short.length}`);
        rec("⭐ …and together they are worth hundreds of spirits", blocks > 300, `${blocks} ideas`);
      }
    }

    console.log(`\n=== an idea file missing its last brace still reads: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { for (const f of fails) console.log("   FAILED: " + f); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    if (server) { try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {} await new Promise((r) => server.close(r)); }
    try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
    for (const p of made) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (_) {} }
  }
})();
