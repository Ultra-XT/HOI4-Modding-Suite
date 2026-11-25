// #ideas-file-missing-its-last-brace, the same class one maker over — the focus tree reader.
//
// Clausewitz closes an unclosed block at end of file. `matchBraceForward` does not, so
// `extractFocusTreeCountries` lost the tree the missing brace belonged to — and because it `break`s on a
// -1, every tree after it in the file went too. An installed mod ships a 34 KB focus file that is one `}`
// short: the maker listed 67 country trees where the game loads 68.
//
// ⚠️ ONLY "missing". An EXTRA `}` is a different problem: end of file can close a block that was left open,
// but nothing can supply a `{` that was never written, so padding there would be inventing. Vanilla's
// `TSR_lingguang_incident_joint_branch.txt` has an extra one and costs nothing — the stray brace sits past
// everything the parser needs — and section 3 pins that it is still not papered over.
//
// ⛔ SCRATCH MODS IN TEMP ONLY.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 53573;
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-focusbrace-"));
process.env.APPDATA = SANDBOX;
process.env.XDG_CONFIG_HOME = SANDBOX;
process.env.NOVA_APP_DATA_DIR = SANDBOX;

const { createApp, describeBraceImbalance } = require("./server.js");
const BASE = `http://127.0.0.1:${PORT}`;

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};

// Two trees, so the second proves the reader did not merely stop at the first.
const BODY = `focus_tree = {
\tid = probe_tree_one
\tcountry = {
\t\tfactor = 0
\t\tmodifier = { add = 10 tag = SWE }
\t}
\tfocus = {
\t\tid = probe_focus_a
\t\ticon = GFX_goal_generic_construct_civilian
\t\tx = 0
\t\ty = 0
\t\tcost = 10
\t\tcompletion_reward = { add_political_power = 100 }
\t}
}

focus_tree = {
\tid = probe_tree_two
\tcountry = {
\t\tfactor = 0
\t\tmodifier = { add = 10 tag = NOR }
\t}
\tfocus = {
\t\tid = probe_focus_b
\t\ticon = GFX_goal_generic_construct_civilian
\t\tx = 0
\t\ty = 0
\t\tcost = 10
\t\tcompletion_reward = { add_political_power = 50 }
\t}
`;
const CLOSED = BODY + "}\n";
const SHORT = BODY;

const made = [];
(async () => {
  let server;
  try {
    server = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });

    const mk = (name, text) => {
      const m = fs.mkdtempSync(path.join(os.tmpdir(), "nova-focusbrace-" + name + "-"));
      made.push(m);
      fs.mkdirSync(path.join(m, "common", "national_focus"), { recursive: true });
      fs.writeFileSync(path.join(m, "descriptor.mod"), `name="${name}"\nsupported_version="1.16.*"\n`);
      fs.writeFileSync(path.join(m, "common", "national_focus", "zz_probe_focus.txt"), text, "utf8");
      return m;
    };
    const treesOf = async (mod) => {
      const j = await fetch(`${BASE}/api/focus/country-trees?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
      return (j.trees || []).filter((t) => String(t.fileName || "") === "zz_probe_focus.txt");
    };

    console.log("1. A focus file one brace short still reads both trees");
    {
      // ⚠️ CONTROL: the fixtures differ ONLY by that brace, and the judge agrees which is which.
      rec("CONTROL: the fixtures differ by exactly one closing brace", CLOSED === SHORT + "}\n", "the fixtures drifted");
      const uS = describeBraceImbalance(SHORT), uC = describeBraceImbalance(CLOSED);
      rec("CONTROL: …and the judge says short vs balanced",
        !!uS && uS.kind === "missing" && uS.count === 1 && uC === null, JSON.stringify({ uS, uC }));
      const closed = await treesOf(mk("closed", CLOSED));
      const short = await treesOf(mk("short", SHORT));
      rec("CONTROL: the well-formed file yields two trees", closed.length === 2, closed.map((t) => t.treeId).join(","));
      rec("⭐ the short one yields the SAME two", short.length === closed.length, `${short.length} vs ${closed.length}`);
      rec("⭐ …the same tree ids, not just the same count",
        short.map((t) => t.treeId).sort().join(",") === closed.map((t) => t.treeId).sort().join(","),
        `${short.map((t) => t.treeId).sort().join(",")} vs ${closed.map((t) => t.treeId).sort().join(",")}`);
      // ⭐ The second tree is the one that proves it: a reader that stopped at the first -1 would drop it.
      rec("⭐ …including the one AFTER the unclosed block",
        short.some((t) => t.treeId === "probe_tree_two"), short.map((t) => t.treeId).join(","));
    }

    console.log("\n2. Measured on the installed corpus");
    {
      // ⚠️ DERIVE the file: ask the judge which shipped focus files are short, then require their trees.
      const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
      const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
      const roots = [GAME];
      try { for (const d of fs.readdirSync(WS)) roots.push(path.join(WS, d)); } catch (_) {}
      const shortFiles = [];
      for (const root of roots) {
        const dir = path.join(root, "common", "national_focus");
        let fl = [];
        try { fl = fs.readdirSync(dir).filter((f) => /\.txt$/i.test(f)); } catch (_) { continue; }
        for (const f of fl) {
          let t = "";
          try { t = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
          const u = describeBraceImbalance(t);
          if (u && u.kind === "missing") shortFiles.push([f, t, u]);
        }
      }
      if (!shortFiles.length) {
        console.log("     (no installed focus file is currently one brace short — nothing to measure)");
        rec("the corpus check ran", true, "no short focus files installed");
      } else {
        let ok = 0;
        for (const [f, t] of shortFiles) {
          const declared = (t.match(/(^|\n)\s*focus_tree\s*=\s*\{/g) || []).length;
          const m = fs.mkdtempSync(path.join(os.tmpdir(), "nova-focusbrace-real-"));
          made.push(m);
          fs.mkdirSync(path.join(m, "common", "national_focus"), { recursive: true });
          fs.writeFileSync(path.join(m, "descriptor.mod"), 'name="real"\nsupported_version="1.16.*"\n');
          fs.writeFileSync(path.join(m, "common", "national_focus", f), t, "utf8");
          const j = await fetch(`${BASE}/api/focus/country-trees?modPath=${encodeURIComponent(m)}`).then((r) => r.json());
          const mine = (j.trees || []).filter((x) => String(x.fileName || "") === f);
          console.log(`     ${f}: declares ${declared} focus_tree blocks, Nova lists ${mine.length}`);
          if (declared > 0 && mine.length >= declared) ok++;
        }
        rec("⭐ every short file's trees are all listed", ok === shortFiles.length, `${ok} of ${shortFiles.length}`);
      }
    }

    console.log("\n3. CONTROL: an EXTRA brace is not papered over");
    {
      // Padding is only ever right for a block left open. A stray `}` means something else is wrong, and
      // guessing a `{` would be inventing — the judge must still call it out.
      const extra = CLOSED + "}\n";
      const u = describeBraceImbalance(extra);
      rec("⭐ the judge still reports the extra brace", !!u && u.kind === "extra", JSON.stringify(u));
      const trees = await treesOf(mk("extra", extra));
      rec("CONTROL: …and the trees before it still read", trees.length === 2, trees.map((t) => t.treeId).join(","));
    }

    console.log(`\n=== a focus file missing its last brace still reads: ${checks} checks, ${fails.length} failed ===`);
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
