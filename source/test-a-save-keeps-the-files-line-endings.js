// #save-mixes-line-endings — A SAVE SPLIT THE FILE'S LINE ENDINGS.
//
// Every serializer in server.js emits "\n", and twenty writers SPLICE that output into text they read
// from disk. In a CRLF file the spliced lines came out LF while every untouched line stayed CRLF, so a
// modder who changed one thing got a diff covering the whole block — and in version control, lines they
// never touched.
//
// Measured on real files while chasing three separate bugs:
//
//     one no-edit spirit save        21 of Road to 56 switzerland.txt's lines became lone LF
//     one equipment rebuild          11 of Rise of Nations infantry.txt's lines
//     the module writer              splits its own file too
//
// 170 of the 243 installed equipment files are CRLF, so this is not an edge case.
//
// Fixed at safeModWrite — the one function all 103 mod writes go through — rather than at each writer
// that happens to remember. The writers that DO remember are the exception, which is what made this worth
// moving to the chokepoint: found by asking which members of a family do a thing the others don't.
//
// Deliberately conservative, and the controls below pin that down: the normalisation applies only when
// the file on disk is ENTIRELY CRLF. A file that is already mixed is left alone, because converting it
// would rewrite lines the save was never asked to touch.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-eol-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const PORT = 53603;
const BASE = "http://127.0.0.1:" + PORT;
const W = "D:/SteamLibrary/steamapps/workshop/content/394360/";
const CORPORA = [
  ["vanilla", "D:/SteamLibrary/steamapps/common/Hearts of Iron IV"],
  ["Millennium Dawn", W + "2777392649"],
  ["Road to 56", W + "820260968"],
  ["Old World Blues", W + "2265420196"],
  ["Rise of Nations", W + "2026448968"],
  ["Novum Vexillum", W + "1827273767"],
];

const eolStats = (t) => { const crlf = (t.match(/\r\n/g) || []).length; return { crlf, lf: (t.match(/\n/g) || []).length - crlf }; };
let seq = 0;
const mkMod = (sub) => {
  const mod = path.join(ROOT, "mod" + (++seq));
  fs.mkdirSync(path.join(mod, ...sub), { recursive: true });
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Nova line endings"\n');
  return mod;
};
const toCRLF = (t) => t.replace(/\r?\n/g, "\r\n");

const postModule = (mod, soft) => fetch(`${BASE}/api/equipment/module`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    modPath: mod, id: "probe_module", category: "ballistics_module",
    gui_category: "", abbreviation: "pm", add_stats: { soft_attack: soft }, multiply_stats: {},
  }),
}).then((r) => r.json());

const postTrait = (mod, cost) => fetch(`${BASE}/api/characters/trait`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    modPath: mod, id: "probe_trait", type: "corps_commander", trait_type: "basic_trait",
    cost, modifier: { army_defence_factor: 0.05 },
  }),
}).then((r) => r.json());

function onlyFile(dir) {
  const f = fs.readdirSync(dir).filter((x) => x.toLowerCase().endsWith(".txt"));
  return f.length ? path.join(dir, f[0]) : "";
}

(async () => {
  const app = createApp();
  const server = await new Promise((r) => { const s = app.listen(PORT, () => r(s)); });

  try {
    // ---------------------------------------------------------- the module writer
    console.log("\n-- the equipment-module writer --");
    for (const crlf of [true, false]) {
      const tag = crlf ? "CRLF" : "LF";
      const sub = ["common", "units", "equipment", "modules"];
      const mod = mkMod(sub);
      const created = await postModule(mod, 1);
      rec(tag + " the module is created", created && created.ok, created);
      const fp = onlyFile(path.join(mod, ...sub));
      rec(tag + " the file exists", !!fp, "");
      if (!fp) continue;
      if (crlf) fs.writeFileSync(fp, toCRLF(fs.readFileSync(fp, "utf8")), "utf8");
      const before = fs.readFileSync(fp, "utf8");
      rec(tag + " CONTROL: the file really is all " + tag,
        crlf ? (eolStats(before).lf === 0 && eolStats(before).crlf > 3) : (eolStats(before).crlf === 0),
        eolStats(before));

      const again = await postModule(mod, 2);
      const after = fs.readFileSync(fp, "utf8");
      rec(tag + " the second save is accepted", again && again.ok, again);
      rec(tag + " CONTROL: ⭐ the file really changed — the writer is not idling",
        after !== before && /soft_attack = 2\b/.test(after), { changed: after !== before });
      if (crlf) rec(tag + " RUN: ⭐ every line is still CRLF", eolStats(after).lf === 0, { before: eolStats(before), after: eolStats(after) });
      else rec(tag + " CONTROL: ⭐ an LF file is not converted to CRLF", eolStats(after).crlf === 0, eolStats(after));
    }

    // ---------------------------------------------------------- the leader-trait writer
    console.log("\n-- the leader-trait writer --");
    for (const crlf of [true, false]) {
      const tag = crlf ? "CRLF" : "LF";
      const sub = ["common", "unit_leader"];
      const mod = mkMod(sub);
      await postTrait(mod, 1);
      const fp = path.join(mod, "common", "unit_leader", "nova_custom_traits.txt");
      if (!fs.existsSync(fp)) { rec(tag + " the trait file exists", false, ""); continue; }
      if (crlf) fs.writeFileSync(fp, toCRLF(fs.readFileSync(fp, "utf8")), "utf8");
      const before = fs.readFileSync(fp, "utf8");
      const again = await postTrait(mod, 2);
      const after = fs.readFileSync(fp, "utf8");
      rec(tag + " the second save is accepted", again && again.ok, again);
      rec(tag + " CONTROL: ⭐ the file really changed", after !== before && /cost = 2\b/.test(after), { changed: after !== before });
      if (crlf) rec(tag + " RUN: ⭐ every line is still CRLF", eolStats(after).lf === 0, { before: eolStats(before), after: eolStats(after) });
      else rec(tag + " CONTROL: ⭐ an LF file is not converted to CRLF", eolStats(after).crlf === 0, eolStats(after));
    }

    // ---------------------------------------------------------- the deliberate limit
    console.log("\n-- control: a file that is ALREADY mixed is left alone --");
    {
      const sub = ["common", "unit_leader"];
      const mod = mkMod(sub);
      await postTrait(mod, 1);
      const fp = path.join(mod, "common", "unit_leader", "nova_custom_traits.txt");
      // Make it genuinely mixed: CRLF everywhere except one line.
      let t = toCRLF(fs.readFileSync(fp, "utf8"));
      t = t.replace(/\r\n/, "\n"); // the first line ending only
      fs.writeFileSync(fp, t, "utf8");
      const before = fs.readFileSync(fp, "utf8");
      const b = eolStats(before);
      rec("CONTROL: the fixture really is mixed", b.crlf > 0 && b.lf > 0, b);
      await postTrait(mod, 2);
      const after = fs.readFileSync(fp, "utf8");
      const a = eolStats(after);
      rec("CONTROL: ⭐ a mixed file is not silently converted", a.lf > 0, { before: b, after: a });
      rec("CONTROL: the edit still landed", /cost = 2\b/.test(after), after);
    }

    // ---------------------------------------------------------- how much of the corpus is CRLF
    console.log("\n-- how much of the corpus this protects --");
    {
      let crlfFiles = 0, total = 0, corpora = 0;
      for (const [, root] of CORPORA) {
        const dir = path.join(root, "common", "units", "equipment");
        let names = [];
        try { names = fs.readdirSync(dir).filter((n) => n.toLowerCase().endsWith(".txt")); } catch (_) { continue; }
        corpora++;
        for (const n of names) {
          let raw;
          try { raw = fs.readFileSync(path.join(dir, n), "utf8"); } catch (_) { continue; }
          total++;
          const s = eolStats(raw);
          if (s.crlf > 0 && s.lf === 0) crlfFiles++;
        }
      }
      console.log("     " + crlfFiles + " of " + total + " equipment files across " + corpora + " corpora are entirely CRLF");
      rec("CONTROL: CRLF files really are common in the corpus", corpora === 0 || crlfFiles >= 20, { crlfFiles, total, corpora });
    }

    // ── /api/save, the one mod writer that is NOT safeModWrite ────────────────
    //
    // Fixing this at safeModWrite covered 103 write sites and missed the busiest one. /api/save is a
    // hand-rolled copy of safeModWrite — its own comments say so, having already had to be taught the
    // backup and the rename retry separately — and it writes req.body.content verbatim. The content comes
    // from the browser, where the focus-tree rewrite splices new lines in with "\n", so every focus tree
    // save dropped lone LFs into an all-CRLF file. 561 of the 746 shipping focus-tree files are pure CRLF.
    //
    // Both callers now go through matchExistingLineEndings, so there is one implementation to keep right.
    console.log("\n-- /api/save (focus trees) --");
    {
      const mod = path.join(ROOT, "focus_eol_mod");
      const rel = path.join("common", "national_focus", "eol_tree.txt");
      const fp = path.join(mod, rel);
      fs.mkdirSync(path.dirname(fp), { recursive: true });
      fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="eol focus"\n');
      const crlfBody = [
        "focus_tree = {", "\tid = eol_tree", "\tcountry = {", "\t\tfactor = 0", "\t}",
        "\tfocus = {", "\t\tid = EOL_first", "\t\ticon = GFX_goal_generic_production",
        "\t\tx = 0", "\t\ty = 0", "\t\tcost = 10", "\t}", "}", "",
      ].join("\r\n");
      fs.writeFileSync(fp, crlfBody);
      const before = eolStats(fs.readFileSync(fp, "utf8"));
      rec("CONTROL: the fixture really is entirely CRLF", before.crlf > 0 && before.lf === 0, before);

      // What the browser sends: the same tree with a block spliced in using "\n".
      const edited = crlfBody.replace("\t\tcost = 10",
        "\t\tcost = 20\n\t\tavailable = {\n\t\t\talways = yes\n\t\t}");
      const r = await fetch(BASE + "/api/save", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: fp, content: edited, baseFingerprint: "", createBackup: false,
          backupReason: "manual-save", snapshot: false,
        }),
      }).then((x) => x.json()).catch((e) => ({ error: String(e) }));
      rec("CONTROL: the save reported success", !!(r && r.ok && !r.error), r);

      const txt = fs.readFileSync(fp, "utf8");
      rec("CONTROL: the edit really landed (else a clean file proves nothing)", /cost = 20/.test(txt), txt.slice(0, 200));
      const after = eolStats(txt);
      rec("⭐ /api/save leaves an all-CRLF focus tree entirely CRLF", after.lf === 0, after);
      rec("…and it really did add lines", after.crlf > before.crlf, { before: before.crlf, after: after.crlf });

      // The same conservatism as safeModWrite: an already-mixed file is left alone.
      const mixedFp = path.join(mod, "common", "national_focus", "mixed_tree.txt");
      const mixedBody = "focus_tree = {\r\n\tid = mixed_tree\n\tcountry = {\r\n\t\tfactor = 0\n\t}\r\n}\r\n";
      fs.writeFileSync(mixedFp, mixedBody);
      const mixedBefore = eolStats(fs.readFileSync(mixedFp, "utf8"));
      rec("CONTROL: the mixed fixture really is mixed", mixedBefore.crlf > 0 && mixedBefore.lf > 0, mixedBefore);
      const r2 = await fetch(BASE + "/api/save", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: mixedFp, content: mixedBody.replace("factor = 0", "factor = 1"),
          baseFingerprint: "", createBackup: false, backupReason: "manual-save", snapshot: false,
        }),
      }).then((x) => x.json()).catch((e) => ({ error: String(e) }));
      rec("CONTROL: the mixed save reported success", !!(r2 && r2.ok && !r2.error), r2);
      const mixedAfter = eolStats(fs.readFileSync(mixedFp, "utf8"));
      rec("an ALREADY-MIXED file is left alone, not converted", mixedAfter.lf === mixedBefore.lf,
        { before: mixedBefore, after: mixedAfter });
    }

    rec("the fixture was measured", checks >= 24, checks);
  } finally {
    try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }

  console.log("\n=== a save keeps the file's line endings: " + checks + " checks, " + fails.length + " failed ===");
  if (fails.length) fails.forEach((x) => console.log("   FAILED: " + x));
  process.exitCode = fails.length ? 1 : 0;
})();
