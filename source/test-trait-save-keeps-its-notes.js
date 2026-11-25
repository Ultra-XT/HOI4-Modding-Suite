// #trait-save-eats-comments — THE ONE MERGE IN THE FILE THAT NEVER LEARNED TO CARRY A NOTE.
//
// Not found by a sweep. Found by listing every mergePreserved*Block helper in server.js and asking which
// of them handle comments. Six do. mergePreservedTraitBlock did not — it carried the modder's un-modelled
// KEY across a rebuild and dropped the comment that explains it.
//
// The reachable path is ordinary: create a leader trait in the Characters maker, open
// common/unit_leader/nova_custom_traits.txt in a text editor and annotate it — which is what modders do
// with their own files — then save that trait again from Nova.
//
//     #the whole point of this trait
//     custom_gain_xp_factor = 0.1        <- the KEY survived
//                                        <- the NOTE did not
//
// Both halves are now carried, and the walk-back logic is extracted to pdxLeadingComment rather than
// copy-pasted a third time. That duplication is exactly how this spread: each merge had to remember the
// rule on its own, and one of them didn't. The equipment merge, fixed one commit earlier, now delegates
// to the same helper.
//
// The comment is carried for statements the rebuild RE-EMITS as well as for the ones it preserves — the
// same blind spot #equipment-comment-on-a-managed-stat had, where a note above a key the serializer
// writes itself has no preserved statement to travel with.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-trait-"));
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

const PORT = 53599;
const BASE = "http://127.0.0.1:" + PORT;
const TRAIT_FILE = ["common", "unit_leader", "nova_custom_traits.txt"];

let seq = 0;
function mkMod() {
  const mod = path.join(ROOT, "mod" + (++seq));
  fs.mkdirSync(path.join(mod, "common", "unit_leader"), { recursive: true });
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Nova trait notes"\n');
  return mod;
}
const traitFileOf = (mod) => {
  const p = path.join(mod, ...TRAIT_FILE);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
};
const commentCount = (t) => (t.match(/#[^\r\n]*/g) || []).length;
const balanced = (t) => {
  let d = 0, inC = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inC) { if (c === "\n") inC = false; continue; }
    if (c === "#") { inC = true; continue; }
    if (c === "{") d++;
    else if (c === "}") { d--; if (d < 0) return false; }
  }
  return d === 0;
};

const saveTrait = (mod, cost) => fetch(`${BASE}/api/characters/trait`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    modPath: mod, id: "probe_trait", type: "corps_commander", trait_type: "basic_trait",
    cost, modifier: { army_defence_factor: 0.05 },
  }),
}).then((r) => r.json());

(async () => {
  const app = createApp();
  const server = await new Promise((r) => { const s = app.listen(PORT, () => r(s)); });

  try {
    console.log("\n-- a trait the modder annotated in their own file --");
    {
      const mod = mkMod();
      const created = await saveTrait(mod, 1);
      rec("the trait is created", created && created.ok, created);

      // The modder opens the file and annotates it, adding a key Nova does not model and a note above a
      // key it DOES (`cost`), so both halves of the carry are exercised.
      let text = traitFileOf(mod);
      rec("CONTROL: the created file is where the endpoint said it is", !!text, created);
      text = text
        .replace(/(\n[ \t]*probe_trait[ \t]*=[ \t]*\{)/, "$1\n\t\t#the whole point of this trait\n\t\tcustom_gain_xp_factor = 0.1")
        .replace(/(\n[ \t]*cost[ \t]*=)/, "\n\t\t#balance pass 3 — was 1\n\t\tcost =");
      fs.writeFileSync(path.join(mod, ...TRAIT_FILE), text, "utf8");
      const before = traitFileOf(mod);
      rec("CONTROL: the fixture really carries both kinds of note", commentCount(before) === 2, commentCount(before));
      rec("CONTROL: …and an un-modelled key to hang one of them on", /custom_gain_xp_factor/.test(before), before);

      // Saving the same trait again is what re-creating an existing id does.
      const again = await saveTrait(mod, 2);
      rec("the second save is accepted", again && again.ok, again);
      const after = traitFileOf(mod);

      rec("CONTROL: ⭐ the file really changed — the writer is not idling", after !== before, "");
      rec("CONTROL: the edit landed", /cost = 2\b/.test(after), after);
      rec("CONTROL: the un-modelled key was preserved (it always was)", /custom_gain_xp_factor = 0\.1/.test(after), after);
      rec("RUN: ⭐ the note above the un-modelled key survives", after.includes("#the whole point of this trait"), after);
      rec("RUN: ⭐ the note above a key the rebuild RE-EMITS survives", after.includes("#balance pass 3 — was 1"), after);
      rec("RUN: ⭐ not one comment was lost", commentCount(after) === commentCount(before),
        { before: commentCount(before), after: commentCount(after) });
      rec("the file is still brace-balanced", balanced(after), after);
    }

    console.log("\n-- control: a blank line detaches a note --");
    {
      // A note separated by a blank line is not attached to the statement below it, and must not be
      // dragged onto one. This is the rule the walk-back implements; assert it, or a future change could
      // "improve" the carry into re-captioning unrelated statements.
      const mod = mkMod();
      await saveTrait(mod, 1);
      let text = traitFileOf(mod);
      text = text.replace(/(\n[ \t]*probe_trait[ \t]*=[ \t]*\{)/, "$1\n\t\t#a floating note\n\n\t\tcustom_gain_xp_factor = 0.1");
      fs.writeFileSync(path.join(mod, ...TRAIT_FILE), text, "utf8");
      const before = traitFileOf(mod);
      rec("CONTROL: the fixture separates the note from the key with a blank line",
        /#a floating note\r?\n\r?\n/.test(before), before);
      await saveTrait(mod, 2);
      const after = traitFileOf(mod);
      rec("CONTROL: the key is still preserved", /custom_gain_xp_factor/.test(after), after);
      rec("CONTROL: ⭐ a detached note is not re-captioned onto that key",
        !/#a floating note\r?\n[ \t]*custom_gain_xp_factor/.test(after), after);
      rec("the file is still brace-balanced", balanced(after), after);
    }

    console.log("\n-- control: an ordinary trait with no notes round-trips --");
    {
      const mod = mkMod();
      await saveTrait(mod, 1);
      const before = traitFileOf(mod);
      await saveTrait(mod, 1);
      const after = traitFileOf(mod);
      rec("CONTROL: ⭐ re-saving an unannotated trait unchanged leaves it alone", after === before, {
        before: before.length, after: after.length,
      });
      rec("CONTROL: and it gained no stray comment", commentCount(after) === 0, commentCount(after));
    }

    // The helper this now shares with the equipment merge must still be doing its job there — that test
    // owns the assertion, but a broken extraction would show up as a missing function here too.
    rec("the extracted helper exists and is used by both merges",
      (() => {
        const src = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
        return /function pdxLeadingComment\(/.test(src)
          && (src.match(/pdxLeadingComment\(/g) || []).length >= 3;
      })(), "");

    rec("the fixture was measured", checks >= 14, checks);
  } finally {
    try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }

  console.log("\n=== trait save keeps its notes: " + checks + " checks, " + fails.length + " failed ===");
  if (fails.length) fails.forEach((x) => console.log("   FAILED: " + x));
  process.exitCode = fails.length ? 1 : 0;
})();
