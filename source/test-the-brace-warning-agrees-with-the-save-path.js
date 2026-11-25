// ⛔ #brace-message-outlived-its-own-fix — TWO PARTS OF NOVA SAID OPPOSITE THINGS ABOUT THE SAME FILE.
//
// Mod Health's file_unbalanced_braces rule said: "Nova can't read this file, so anything defined in it is
// missing from the makers." That was true when the rule was written. It stopped being true on 2026-09-03,
// when four readers were taught to close an unclosed block at end of file the way Clausewitz does
// (#ideas-file-missing-its-last-brace) — the change that made 485 vanilla national spirits visible.
//
// Measured on a scratch mod whose ideas file is one "}" short: the spirit APPEARS in the catalogue, while
// Mod Health told the modder it was missing from the makers.
//
// Meanwhile the save path had it exactly right the whole time:
//     "Nova can read past a missing one, but it will not write into a file whose braces do not add up."
//
// So a modder met a confident, wrong claim in the health panel and the correct one only if they tried to
// save. ⭐ Reading past a missing brace and writing into the file are different questions, and only the
// first has a good answer.
//
// This test pins the AGREEMENT rather than either wording: whatever the panel claims about reading and
// saving must match what the reader and the writer actually do. A message is a claim about behaviour, and
// the way to test a claim is against the behaviour.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { buildModIndex } = require("./mod-index.js");
const { createApp } = require("./server.js");

const PORT = 53699;
const BASE = "http://127.0.0.1:" + PORT;

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail === undefined ? "" : "   " + (typeof detail === "string" ? detail.slice(0, 200) : JSON.stringify(detail).slice(0, 200))));
  if (!ok) fails.push(label);
};

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nova-braceagree-"));
  const server = await new Promise((res) => { const s = createApp().listen(PORT, () => res(s)); });
  try {
    fs.writeFileSync(path.join(root, "descriptor.mod"), 'name="brace agreement"\n', "utf8");
    const w = (rel, body) => {
      const p = path.join(root, rel);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, body, "utf8");
    };
    // Exactly vanilla's SOV.txt shape: one closing brace short.
    w(path.join("common", "ideas", "short.txt"),
      "ideas = {\n\tcountry = {\n\t\tbrace_agree_spirit = {\n\t\t\tremoval_cost = -1\n\t\t\tmodifier = { political_power_gain = 0.05 }\n\t\t}\n\t}\n");
    w(path.join("localisation", "english", "b_l_english.yml"),
      "﻿l_english:\n brace_agree_spirit:0 \"Brace Agree\"\n");

    console.log("\n-- what the READER actually does --");
    const cat = await (await fetch(BASE + "/api/ideas/catalog?modPath=" + encodeURIComponent(root))).json();
    const readable = JSON.stringify(cat).includes("brace_agree_spirit");
    rec("the spirit in the short file IS in the catalogue", readable, readable);

    console.log("\n-- what the WRITER actually does --");
    const shortPath = path.join(root, "common", "ideas", "short.txt");
    const before = fs.readFileSync(shortPath);
    // ONE save, never a loop: repeatedly re-saving a spirit file is what got two test files quarantined by
    // behavioural antivirus on this machine.
    const save = await fetch(BASE + "/api/ideas/upsert-definition", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modPath: root, ideaId: "brace_agree_spirit",
        targetRelativeFile: "common/ideas/short.txt",
        targetLocalizationPath: "localisation/english/custom_ideas_l_english.yml",
        name: "Brace Agree", desc: "", picture: "", selectedEffects: [],
        formSections: ["allowed", "equipment_bonus", "visible", "on_add", "modifier", "allowed_civil_war"],
        mode: "edit", category: "country", traits: [], cost: 0, removalCost: -1,
      }),
    });
    const saveJson = await save.json().catch(() => ({}));
    const refused = !save.ok || saveJson.ok === false;
    rec("the save is REFUSED", refused, saveJson.error || save.status);
    // Compare BYTES. An assertion that cannot fail is worse than no assertion — this one read the file and
    // then `|| true`'d the result away, which is the shape of a check that passes for ever.
    rec("...and the file is byte-for-byte unchanged", Buffer.compare(before, fs.readFileSync(shortPath)) === 0,
      before.length + " bytes before, " + fs.readFileSync(shortPath).length + " after");

    console.log("\n-- and the WARNING must agree with both --");
    const problem = buildModIndex(root, {}).problems.find((p) => p.rule === "file_unbalanced_braces");
    rec("the file is still reported", !!problem, problem && problem.file);
    const msg = (problem && problem.message) || "";
    rec("it does not claim Nova cannot read the file", !/can't read this file|cannot read this file/i.test(msg), msg);
    rec("it does not claim the content is missing from the makers", !/missing from the makers/i.test(msg), msg);
    rec("it DOES warn that saving is refused", /will NOT save|cannot be edited|nothing in it can be edited/i.test(msg), msg);
    rec("it names how many braces are missing", /\b1 block\b/.test(msg), msg);

    console.log("\n-- the two cases are worded differently, because they are different --");
    const root2 = fs.mkdtempSync(path.join(os.tmpdir(), "nova-braceextra-"));
    fs.writeFileSync(path.join(root2, "descriptor.mod"), 'name="extra"\n', "utf8");
    fs.mkdirSync(path.join(root2, "common", "ideas"), { recursive: true });
    fs.writeFileSync(path.join(root2, "common", "ideas", "extra.txt"), "ideas = {\n\tcountry = {\n\t}\n}\n}\n", "utf8");
    const p2 = buildModIndex(root2, {}).problems.find((p) => p.rule === "file_unbalanced_braces");
    const msg2 = (p2 && p2.message) || "";
    rec("a stray closer is reported", !!p2, p2 && p2.file);
    rec("...and is NOT told that end of file will rescue it", !/closes an open block at end of file/i.test(msg2), msg2);
    rec("...because nothing can supply a { that was never written", /cannot recover|may be dropped/i.test(msg2), msg2);
    rec("...and it too warns that saving is refused", /will not save/i.test(msg2), msg2);
    try { fs.rmSync(root2, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
  } catch (e) {
    console.error(e);
    fails.push("threw: " + e.message);
  } finally {
    server.closeAllConnections && server.closeAllConnections();
    server.close();
    try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
  }

  console.log("\n" + (fails.length ? "FAILED " + fails.length + "/" + checks : "PASSED " + checks + "/" + checks));
  process.exitCode = fails.length ? 1 : 0;
})();
