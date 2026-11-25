// #spirit-edit-drops-non-modifier-effects — EDITING A SPIRIT DELETED ITS MODIFIER AND IGNORED THE CHANGE.
//
// Found by coverage, not by reading. Running the whole suite under NODE_V8_COVERAGE and merging the results
// showed 55 of server.js's 840 named functions are entered by no test at all; 42 of those are outside the
// map. Among them was a contiguous cluster of spirit-writer helpers — mergeEditModeModifierIntoIdeaBlock,
// sanitizeModifierOnlyPayload, replaceOrInsertModifierBlock, findModifierSectionRange,
// buildModifierSectionString, insertModifierBeforeIdeaClose — every one of them a live write path reached
// from /api/ideas/upsert-definition, and none of them exercised.
//
// A spirit effect has four types: modifier, research_bonus, equipment_bonus, targeted_modifier. The CREATE
// path sanitises and writes all four. The EDIT path, given the structured [{effectId, values}] payload, ran
// it through sanitizeModifierOnlyPayload — which keeps only type "modifier" — and then unconditionally
// rewrote the `modifier` block from whatever survived. So:
//
//   • a research_bonus / equipment_bonus / targeted_modifier was silently DISCARDED — the edit the user
//     asked for did not happen, and the response said ok; and
//   • a payload carrying no modifier-type effect at all ("set a research bonus on this spirit") sanitised to
//     nothing, and the existing `modifier = { … }` was DELETED. Every modifier the spirit had, gone, on a
//     save meant to add something.
//
// The same payload through `create` wrote both sections correctly, which is what made the asymmetry obvious.
//
// The fix replaces exactly the sections the payload speaks to and leaves the rest alone. Rerouting to the
// create-path merge would have been wrong: that strips all four owned sections and rebuilds them, so a
// modifier-only payload would delete a `research_bonus` it never mentioned. Clearing everything at once is a
// different gesture and already has its own branch.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-spedit-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

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

const ctlFiles = [];
function controlApp(label, pairs) {
  // server.js is CRLF here, so a multi-line anchor spelled with \n matches nothing and the control passes
  // while patching none of the code it claims to back out.
  const raw = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  const wasCrlf = raw.includes("\r\n");
  let out = wasCrlf ? raw.replace(/\r\n/g, "\n") : raw;
  for (const [from, to] of pairs) {
    if (!out.includes(from)) return { error: "anchor missing: " + from.slice(0, 90) };
    if (out.split(from).length !== 2) return { error: "anchor not unique: " + from.slice(0, 90) };
    out = out.replace(from, to);
  }
  const p = path.join(__dirname, `.ctl-spedit-${process.pid}-${label}.js`);
  fs.writeFileSync(p, wasCrlf ? out.replace(/\n/g, "\r\n") : out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

const REL = "common/ideas/zz_rich.txt";
// A spirit carrying both a modifier block and a research_bonus, which is an ordinary shape: vanilla ideas
// routinely combine them.
const FIXTURE = `ideas = {
	country = {
		zz_rich_spirit = {
			picture = generic_political_support
			available = {
				has_government = fascism
			}
			modifier = {
				political_power_gain = 0.5
				stability_factor = 0.1
			}
			research_bonus = {
				air_equipment = 0.15
			}
		}
	}
}
`;

function mkMod(name) {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(path.join(dir, "common", "ideas"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), `name="${name}"\nsupported_version="1.19.*"\n`, "utf8");
  fs.writeFileSync(path.join(dir, REL), FIXTURE, "utf8");
  return dir;
}

function blockOf(text, id) {
  const i = text.indexOf(id + " = {");
  if (i === -1) return "";
  const open = text.indexOf("{", i);
  let d = 0;
  for (let k = open; k < text.length; k++) {
    const c = text[k];
    if (c === "#") { while (k < text.length && text[k] !== "\n") k++; continue; }
    if (c === "{") d++;
    else if (c === "}") { d--; if (d === 0) return text.slice(i, k + 1); }
  }
  return "";
}
const balanced = (t) => {
  const s = t.replace(/#[^\n]*/g, "");
  return (s.match(/\{/g) || []).length === (s.match(/\}/g) || []).length;
};

let PORT = 44320;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      post: (u, b) => fetch(`http://127.0.0.1:${PORT}${u}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) })
        .then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

// Reset the fixture, run one edit, hand back the resulting block.
async function edit(api, mod, effects) {
  fs.writeFileSync(path.join(mod, REL), FIXTURE, "utf8");
  const r = await api.post("/api/ideas/upsert-definition", {
    modPath: mod, ideaId: "zz_rich_spirit", name: "Rich", mode: "edit",
    category: "country", targetRelativeFile: REL, selectedEffects: effects,
  });
  return { r, block: blockOf(fs.readFileSync(path.join(mod, REL), "utf8"), "zz_rich_spirit") };
}

const MOD_EFFECT = { effectId: "political_power_gain", values: { value: 0.9 } };
const RB_EFFECT = { effectId: "research_bonus_industry", values: { category: "industry", value: 0.1 } };

(async () => {
  const api = await serve(createApp());
  try {
    const mod = mkMod("m");

    console.log("\n[unchanged] a modifier-only payload behaves exactly as before");
    {
      const { r, block } = await edit(api, mod, [MOD_EFFECT]);
      rec("the save succeeds", r.s === 200 && !r.b.error, r.b);
      rec("the modifier is rewritten from the payload",
        /political_power_gain\s*=\s*0\.9/.test(block) && !/stability_factor/.test(block), block);
      rec("a research_bonus the payload never mentioned is left alone",
        /air_equipment\s*=\s*0\.15/.test(block), block);
      rec("…and so is an unmodelled section", /has_government\s*=\s*fascism/.test(block), block);
    }

    console.log("\n[the bug] a non-modifier effect must actually be written");
    {
      const { r, block } = await edit(api, mod, [MOD_EFFECT, RB_EFFECT]);
      rec("the save succeeds", r.s === 200 && !r.b.error, r.b);
      rec("the research bonus the user asked for is written", /industry\s*=\s*0\.1/.test(block), block);
      rec("…and the modifier is still rewritten", /political_power_gain\s*=\s*0\.9/.test(block), block);
      rec("the block stays brace-balanced", balanced(block), block);
    }

    console.log("\n[the bug] a payload with NO modifier must not delete the modifier block");
    {
      const { r, block } = await edit(api, mod, [RB_EFFECT]);
      rec("the save succeeds", r.s === 200 && !r.b.error, r.b);
      rec("the existing modifier block survives untouched",
        /political_power_gain\s*=\s*0\.5/.test(block) && /stability_factor\s*=\s*0\.1/.test(block), block);
      rec("…and the research bonus is written", /industry\s*=\s*0\.1/.test(block), block);
      rec("the section it replaced is gone, not duplicated",
        (block.match(/research_bonus\s*=/g) || []).length === 1, block);
      rec("the spliced section is indented to the block it joined",
        /\n\t\t\tresearch_bonus = \{/.test(block), JSON.stringify(block));
    }

    console.log("\n[consistency] a malformed entry refuses the save, as it does on create");
    {
      const { r, block } = await edit(api, mod, [{ effectId: "research_bonus_industry", values: { value: 0.1 } }]);
      rec("the save is refused", r.s === 400 && /research bonus category/i.test(String(r.b.error)), r.b);
      rec("…and nothing was written", block === blockOf(FIXTURE, "zz_rich_spirit"), block);
    }

    console.log("\n[create parity] create writes both section types from the same payload");
    {
      fs.writeFileSync(path.join(mod, REL), FIXTURE, "utf8");
      const r = await api.post("/api/ideas/upsert-definition", {
        modPath: mod, ideaId: "zz_created", name: "Created", mode: "create",
        category: "country", targetRelativeFile: REL, selectedEffects: [MOD_EFFECT, RB_EFFECT],
      });
      const block = blockOf(fs.readFileSync(path.join(mod, REL), "utf8"), "zz_created");
      rec("create succeeds", r.s === 200 && !r.b.error, r.b);
      rec("…and writes the modifier and the research bonus",
        /political_power_gain\s*=\s*0\.9/.test(block) && /industry\s*=\s*0\.1/.test(block), block);
    }
    api.stop();

    console.log("\n[back-out] go back to the modifier-only merge");
    {
      // Both halves have to go to reproduce the original: dropping the non-modifier sections AND rewriting
      // `modifier` unconditionally. With only the first backed out, the guard still saves the modifier block.
      const built = controlApp("modonly", [
        ["  const full = sanitizeSpiritEffectsPayload(selectedEffectsRaw) || [];", "  const full = [];"],
        ["  if (safeMod.length) out = replaceOrInsertModifierBlock(out, safeMod, parsed.preservedModifierLines);",
         "  out = replaceOrInsertModifierBlock(out, safeMod, parsed.preservedModifierLines);"]]);
      if (built.error) rec("the control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        const cmod = mkMod("ctl");
        try {
          let out = await edit(capi, cmod, [MOD_EFFECT, RB_EFFECT]);
          rec("…and the research bonus is silently discarded",
            out.r.s === 200 && !/industry\s*=\s*0\.1/.test(out.block), out.block);
          out = await edit(capi, cmod, [RB_EFFECT]);
          rec("…and a payload with no modifier deletes the modifier block",
            out.r.s === 200 && !/political_power_gain/.test(out.block), out.block);
        } finally { capi.stop(); }
      }
    }

    console.log(`\n=== spirit edit non-modifier effects: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { api.stop(); } catch (_) {}
    for (const p of ctlFiles) { try { fs.unlinkSync(p); } catch (_) {} }
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
