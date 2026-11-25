// #extra-script-leaks-between-spirits — the National Spirits "Extra script" box was never cleared, so raw
// script typed for one spirit was written into the NEXT spirit saved, under a success message.
//
// Neither the sidebar select handler nor the new-spirit reset ever touched the box. Every other field is
// reset; this one was missed. So: type `ai_will_do = { factor = 99 }` while editing spirit A, click spirit B,
// press Save — and spirit B gains that block. "+ Create New Spirit" carried it too.
//
// The box's label also claimed "each block round-trips", which it does not — the box is not populated from
// the spirit. It does not need to be: the SERVER preserves blocks it doesn't model, which this test proves
// rather than assumes, since the label now promises exactly that.
//
// So the box means "raw script to ADD", it starts empty like every other field, and un-modelled blocks
// already in the file are kept by the writer.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-esleak-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "probe");
fs.mkdirSync(path.join(MOD, "common", "ideas"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="ES"\nsupported_version="1.18.*"\n');

const FILE = path.join(MOD, "common", "ideas", "probe_ideas.txt");
fs.writeFileSync(FILE, `ideas = {
	country = {
		probe_alpha = {
			removal_cost = -1
			picture = GFX_idea_generic
			modifier = { political_power_gain = 0.05 }
			targeted_modifier = {
				tag = ENG
				attack_bonus_against = 0.1
			}
			on_remove = {
				add_political_power = -25
			}
			rule = {
				can_declare_war_on_neighbours_while_civil_war = no
			}
		}
		probe_beta = {
			removal_cost = -1
			picture = GFX_idea_generic
			modifier = { stability_factor = 0.10 }
		}
	}
}
`, "utf8");

// ── the client must clear the box, or the leak comes straight back ────────────────────────────────
const csrc = fs.readFileSync(path.join(__dirname, "public", "ideas.js"), "utf8");
ok("selecting a spirit clears the Extra script box",
  /extra-script-leaks-between-spirits[\s\S]{0,400}?ideaExtraScript[\s\S]{0,120}?value = ""/.test(csrc),
  "select handler does not clear it");
ok("＋ Create New Spirit clears it too",
  /ideaExtraScript"\);\s*if \(es\) es\.value = ""/.test(csrc), "new-spirit reset does not clear it");
const hsrc = fs.readFileSync(path.join(__dirname, "public", "ideas.html"), "utf8");
ok("the label no longer claims the box round-trips", !/each block round-trips/.test(hsrc),
  (hsrc.match(/Extra script[^<]*<span[^>]*>[^<]*/) || [])[0]);

const read = () => fs.readFileSync(FILE, "utf8");
const blockOf = (id) => {
  const t = read(); const i = t.indexOf(id + " = {");
  if (i === -1) return "";
  let d = 0, end = -1;
  for (let j = t.indexOf("{", i); j < t.length; j++) {
    if (t[j] === "{") d++; else if (t[j] === "}") { d--; if (d === 0) { end = j; break; } }
  }
  return t.slice(i, end + 1);
};

const PORT = 39963, app = createApp();
const server = app.listen(PORT, async () => {
  const save = (body) => fetch(`http://127.0.0.1:${PORT}/api/ideas/upsert-definition`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      modPath: MOD, targetRelativeFile: "common/ideas/probe_ideas.txt",
      targetLocalizationPath: "localisation/english/custom_ideas_l_english.yml",
      category: "country", traits: [], cost: "", removalCost: "-1", ledger: "",
      picture: "GFX_idea_generic", ...body,
    }),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

  try {
    ok("precondition: alpha carries three un-modelled blocks",
      /targeted_modifier/.test(blockOf("probe_alpha")) && /on_remove/.test(blockOf("probe_alpha")) && /rule/.test(blockOf("probe_alpha")));

    // ── the promise the label now makes: un-modelled blocks survive a save that does not mention them ──
    const r1 = await save({
      ideaId: "probe_alpha", name: "Alpha", desc: "d", mode: "edit",
      selectedEffects: ["modifier = {\npolitical_power_gain = 0.05\n}"],
    });
    ok("saving alpha with no extra script succeeds", r1.s === 200 && r1.b && r1.b.ok !== false, r1.b);
    const a = blockOf("probe_alpha");
    ok("…its targeted_modifier survives", /targeted_modifier/.test(a) && /attack_bonus_against = 0\.1/.test(a), a);
    ok("…its on_remove survives", /on_remove/.test(a) && /add_political_power = -25/.test(a), a);
    ok("…its rule survives", /can_declare_war_on_neighbours_while_civil_war = no/.test(a), a);

    // ── and beta must not inherit anything from alpha ────────────────────────────────────────────────
    const r2 = await save({
      ideaId: "probe_beta", name: "Beta", desc: "d", mode: "edit",
      selectedEffects: ["modifier = {\nstability_factor = 0.10\n}"],
    });
    ok("saving beta succeeds", r2.s === 200 && r2.b && r2.b.ok !== false, r2.b);
    const b = blockOf("probe_beta");
    ok("beta did not inherit alpha's targeted_modifier", !/targeted_modifier/.test(b), b);
    ok("…nor its on_remove", !/on_remove/.test(b), b);
    ok("…nor its rule", !/can_declare_war_on_neighbours_while_civil_war/.test(b), b);
    ok("beta kept its own modifier", /stability_factor = 0\.10/.test(b), b);

    // ── extra script the user really did type still lands, on the right spirit ──────────────────────
    const r3 = await save({
      ideaId: "probe_beta", name: "Beta", desc: "d", mode: "edit",
      selectedEffects: ["modifier = {\nstability_factor = 0.10\n}", "ai_will_do = {\nfactor = 99\n}"],
    });
    ok("saving beta WITH extra script succeeds", r3.s === 200 && r3.b && r3.b.ok !== false, r3.b);
    ok("…the block lands on beta", /factor = 99/.test(blockOf("probe_beta")), blockOf("probe_beta"));
    ok("…and not on alpha", !/factor = 99/.test(blockOf("probe_alpha")), blockOf("probe_alpha"));
    ok("the file is still brace-balanced",
      (() => { let d = 0; for (const c of read()) { if (c === "{") d++; else if (c === "}") d--; } return d === 0; })(), read());

    console.log("\ntest-spirit-extra-script-leak: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 15 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
