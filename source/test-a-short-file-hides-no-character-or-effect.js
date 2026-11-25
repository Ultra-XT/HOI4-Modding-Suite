// #ideas-file-missing-its-last-brace, readers three and four.
//
// Clausewitz closes an unclosed block at end of file. Four of Nova's readers did not, and each answered with
// silence instead of content:
//
//     common/ideas            findMatchingBraceMasked -> -1   485 spirits, 3 vanilla files   (fixed)
//     common/national_focus   matchBraceForward       -> -1   a whole tree, and every tree AFTER it (fixed)
//     common/characters       findMatchingBraceInText -> -1   an EMPTY LIST for the file      (here)
//     common/scripted_effects balancedEnd             -> -1   that effect and every one after (here)
//
// The two here are smaller than the ideas one — a mod's 7 KB `KAL.txt` with 9 characters, and one effect in
// a 73 KB toolpack — but they are the same defect, and the `break`-on--1 shape means a file that goes wrong
// EARLY loses everything after it, not just the block that was short.
//
// ⚠️ Only "missing". End of file can close a block that was left open; nothing can supply a `{` that was
// never written, so padding an EXTRA brace would be inventing. Section 3 pins that.
//
// ⛔ SCRATCH MODS IN TEMP ONLY.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 53574;
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-shortfile-"));
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

const made = [];
const mk = (sub, file, text) => {
  const m = fs.mkdtempSync(path.join(os.tmpdir(), "nova-shortfile-mod-"));
  made.push(m);
  fs.mkdirSync(path.join(m, ...sub), { recursive: true });
  fs.writeFileSync(path.join(m, "descriptor.mod"), 'name="Short File"\nsupported_version="1.16.*"\n');
  fs.writeFileSync(path.join(m, ...sub, file), text, "utf8");
  return m;
};

// Two characters, so the second proves the reader did not merely stop at the first.
const CHAR_BODY = `characters = {
\tprobe_char_one = {
\t\tname = probe_char_one
\t\tportraits = { army = { small = GFX_idea_unknown } }
\t\tcorps_commander = { traits = {} skill = 3 attack_skill = 2 defense_skill = 2 planning_skill = 2 logistics_skill = 2 }
\t}
\tprobe_char_two = {
\t\tname = probe_char_two
\t\tportraits = { army = { small = GFX_idea_unknown } }
\t\tcorps_commander = { traits = {} skill = 3 attack_skill = 2 defense_skill = 2 planning_skill = 2 logistics_skill = 2 }
\t}
`;
const EFFECT_BODY = `probe_effect_one = {
\tadd_political_power = 10
}

probe_effect_two = {
\tadd_stability = 0.05
`;

(async () => {
  let server;
  try {
    server = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });

    console.log("1. A characters file one brace short still reads");
    {
      const closed = CHAR_BODY + "}\n";
      rec("CONTROL: the fixtures differ by exactly one closing brace", closed === CHAR_BODY + "}\n", "drifted");
      const uS = describeBraceImbalance(CHAR_BODY), uC = describeBraceImbalance(closed);
      rec("CONTROL: …and the judge says short vs balanced",
        !!uS && uS.kind === "missing" && uC === null, JSON.stringify({ uS, uC }));
      const count = async (text) => {
        const mod = mk(["common", "characters"], "zz_probe.txt", text);
        const j = await fetch(`${BASE}/api/characters/list?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
        let n = 0;
        for (const f of (j.files || [])) n += ((f.characters || f.items || []).length || 0);
        return n;
      };
      const a = await count(closed), b = await count(CHAR_BODY);
      rec("CONTROL: the well-formed file yields two characters", a === 2, a);
      rec("⭐ the short one yields the SAME two", b === a, `${b} vs ${a}`);
    }

    console.log("\n2. …and so does a scripted_effects file");
    {
      const closed = EFFECT_BODY + "}\n";
      const uS = describeBraceImbalance(EFFECT_BODY), uC = describeBraceImbalance(closed);
      rec("CONTROL: the judge says short vs balanced",
        !!uS && uS.kind === "missing" && uC === null, JSON.stringify({ uS, uC }));
      const count = async (text) => {
        const mod = mk(["common", "scripted_effects"], "zz_probe.txt", text);
        const j = await fetch(`${BASE}/api/scripted-effects?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
        const all = (j && typeof j === "object") ? (j.effects || j.items || j) : {};
        return Object.keys(all).filter((k) => k.startsWith("probe_effect_")).length;
      };
      const a = await count(closed), b = await count(EFFECT_BODY);
      rec("CONTROL: the well-formed file yields two effects", a === 2, a);
      // ⭐ The second effect is the one that proves it: `balancedEnd` returns -1 and the loop BREAKS, so a
      // file that goes short early loses everything after it, not only the block that was short.
      rec("⭐ the short one yields the SAME two", b === a, `${b} vs ${a}`);
    }

    console.log("\n3. CONTROL: an EXTRA brace is still reported, not papered over");
    {
      const extra = CHAR_BODY + "}\n}\n";
      const u = describeBraceImbalance(extra);
      rec("⭐ the judge still calls out the extra brace", !!u && u.kind === "extra", JSON.stringify(u));
    }

    console.log("\n4. Measured on the installed corpus");
    {
      // ⚠️ DERIVE the files: ask the judge which shipped files under each directory are short, then require
      // the reader to show their content. Naming them would rot the moment a mod is updated.
      const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
      const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
      const roots = [GAME];
      try { for (const d of fs.readdirSync(WS)) roots.push(path.join(WS, d)); } catch (_) {}
      const cases = [
        { sub: ["common", "characters"], label: "characters",
          ask: async (mod) => {
            const j = await fetch(`${BASE}/api/characters/list?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
            let n = 0;
            for (const f of (j.files || [])) n += ((f.characters || f.items || []).length || 0);
            return n;
          } },
        { sub: ["common", "scripted_effects"], label: "scripted_effects",
          ask: async (mod) => {
            const j = await fetch(`${BASE}/api/scripted-effects?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
            const all = (j && typeof j === "object") ? (j.effects || j.items || j) : {};
            return Object.keys(all).length;
          } },
      ];
      let ran = 0, good = 0;
      for (const c of cases) {
        for (const root of roots) {
          const dir = path.join(root, ...c.sub);
          let fl = [];
          try { fl = fs.readdirSync(dir).filter((f) => /\.txt$/i.test(f)); } catch (_) { continue; }
          for (const f of fl) {
            let t = "";
            try { const st = fs.statSync(path.join(dir, f)); if (st.size > 4e6) continue; t = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
            const u = describeBraceImbalance(t);
            if (!u || u.kind !== "missing") continue;
            ran++;
            const asIs = await c.ask(mk(c.sub, f, t));
            const fixed = await c.ask(mk(c.sub, f, t + "\n" + "}".repeat(u.count)));
            console.log(`     ${c.label}/${f}: as shipped ${asIs}, braces evened up ${fixed}`);
            if (asIs === fixed && asIs > 0) good++;
          }
        }
      }
      if (!ran) {
        console.log("     (no installed file under those directories is currently short — nothing to measure)");
        rec("the corpus check ran", true, "none installed");
      } else {
        rec("⭐ every short shipped file reads the same as its evened-up copy", good === ran, `${good} of ${ran}`);
      }
    }

    console.log(`\n=== a short file hides no character or effect: ${checks} checks, ${fails.length} failed ===`);
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
