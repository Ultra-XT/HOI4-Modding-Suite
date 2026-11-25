// #spirit-rename-seeds-from-the-new-id — THE SOURCE KNOWS THE OLD NAME.
//
// Overriding an inherited spirit seeds the block from the source and merges the form's sections into it, so
// script the form does not model survives. The seed looked the source block up by `ideaId` — which on a
// RENAME is the NEW id, a name the source has never heard of. The lookup missed, the seed came back empty,
// and the minimal builder ran instead: every un-modelled block gone.
//
// ⚠️ THE PAYLOAD SHAPE IS THE WHOLE BALLGAME HERE, and I got it wrong twice before getting it right.
//
// `/api/ideas/edit-payload` returns `selectedEffects` as STRUCTURED {effectId, values} objects. The Ideas
// page never posts those back: it fills its boxes from the raw block text and, on save, emits PLAIN SCRIPT
// STRINGS — `modifier = {\n…\n}` — one per filled box. The two shapes take different merge paths, and
// posting the structured one back drops `research_bonus`, `targeted_modifier` and `equipment_bonus`. That is
// a real inconsistency between two sibling endpoints, but it is NOT what the editor does, and a test written
// against it would be guarding a path no user can reach.
//
// So this test sends what the client sends. Two further details of that flow, both mistakes of mine first:
//
//   * the editor DELIBERATELY clears its extraScript box on load ("the server preserves un-modelled blocks
//     itself", public/ideas.js), so sending nothing there is correct, not a handicap;
//   * it DOES send `formSections`, naming the boxes it drew. Omitting that makes the server fall back to the
//     full form-owned list, which made `research_bonus` clearable and produced a loss I had caused myself.
//
// Measured under the client's shape, renaming an inherited spirit:
//
//     with the fix        5/5 un-modelled blocks kept
//     fix backed out      0/5   LOST cancel_if, on_remove, ai_will_do, rule, targeted_modifier
//
// and bisecting one block at a time across all twelve the editor can carry, there is NO asymmetry between
// the in-place and seeded paths under this shape — every block survives both.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-sprnm-"));
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

const toPosix = (p) => p.split(path.sep).join("/");
let seq = 0;
function mkMod(deps) {
  const n = "SN" + ++seq;
  const dir = path.join(ROOT, "m" + seq);
  fs.mkdirSync(path.join(dir, "common", "ideas"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"),
    'name="' + n + '"\nsupported_version="1.19.*"\n' + (deps ? 'dependencies={ "' + deps + '" }\n' : ""));
  fs.writeFileSync(path.join(ROOT, "m" + seq + ".mod"),
    'name="' + n + '"\npath="' + toPosix(dir) + '"\nsupported_version="1.19.*"\n');
  return { name: n, dir };
}
const SPIRIT = [
  "ideas = {",
  "\tcountry = {",
  "\t\tsn_spirit_idea = {",
  "\t\t\tpicture = generic_morale_bonus",
  "\t\t\tallowed = { original_tag = SNA }",
  "\t\t\tcancel_if = { has_war = yes }",
  "\t\t\tremoval_cost = -1",
  "\t\t\ton_remove = { add_political_power = 10 }",
  "\t\t\tai_will_do = { factor = 2 }",
  "\t\t\trule = { can_declare_war = no }",
  "\t\t\ttargeted_modifier = { tag = GER attack_bonus_against = 0.1 }",
  "\t\t\tmodifier = { political_power_gain = 0.5 }",
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n");
// targeted_modifier is in here deliberately: under the client's payload shape it survives both paths, and an
// earlier version of this file wrongly declared it lost. Keeping it is what stops that claim coming back.
const UNMODELLED = ["allowed", "cancel_if", "on_remove", "ai_will_do", "rule", "targeted_modifier"];
const has = (t, k) => new RegExp("(^|\\n)\\s*" + k + "\\s*=").test(t);
// What the real client sends for a COUNTRY spirit (public/ideas.js).
const FORM_SECTIONS = ["allowed", "modifier", "equipment_bonus", "visible", "on_add", "allowed_civil_war"];

let PORT = 50050;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      payload: (mod, defFile, sourceRoot) => fetch("http://127.0.0.1:" + PORT + "/api/ideas/edit-payload?ideaId=sn_spirit_idea"
        + "&definitionFile=" + encodeURIComponent(defFile) + "&modPath=" + encodeURIComponent(mod)
        + (sourceRoot ? "&sourceRoot=" + encodeURIComponent(sourceRoot) : ""))
        .then((r) => r.json()).catch((e) => ({ error: String(e) })),
      upsert: (b) => fetch("http://127.0.0.1:" + PORT + "/api/ideas/upsert-definition", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b),
      }).then((r) => r.json()).catch((e) => ({ error: String(e) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

(async () => {
  let api = null;
  try {
    api = await serve(createApp());

    // The client's own extractBraceBlock: the INNER text of `<key> = { … }`.
    const extractInner = (text, key) => {
      const m = new RegExp("(^|\\n)\\s*" + key + "\\s*=\\s*\\{").exec(text);
      if (!m) return "";
      const open = text.indexOf("{", m.index + m[0].length - 1);
      let d = 0;
      for (let i = open; i < text.length; i++) {
        const c = text[i];
        if (c === "{") d++; else if (c === "}") { d--; if (!d) return text.slice(open + 1, i).trim(); }
      }
      return "";
    };

    // Round-trip helper. The editor loads via edit-payload, then rebuilds its payload from its own boxes as
    // PLAIN SCRIPT STRINGS — it never posts edit-payload's structured selectedEffects back. Do the same, or
    // this guards a path no user can reach (see the header).
    const roundTrip = async ({ modPath, sourceRoot, defFile, targetFile, newId }) => {
      const p = await api.payload(modPath, defFile, sourceRoot);
      if (!p.ok) return { error: p };
      const selectedEffects = [];
      for (const box of FORM_SECTIONS) {
        const inner = extractInner(SPIRIT, box);
        if (inner) selectedEffects.push(box + " = {\n" + inner + "\n}");
      }
      const r = await api.upsert({
        modPath, sourceRoot: sourceRoot || undefined, category: p.category || "country",
        ideaId: newId || "sn_spirit_idea", previousIdeaId: newId ? "sn_spirit_idea" : undefined,
        targetRelativeFile: targetFile, previousRelativeFile: defFile,
        mode: sourceRoot ? "create" : "edit",
        name: p.localizedName || "SN Spirit", desc: p.localizedDesc || "",
        picture: p.pictureToken || "", cost: p.cost || "", removalCost: p.removalCost || "",
        ledger: p.ledger || "", traits: p.traits || "",
        selectedEffects, formSections: FORM_SECTIONS,
      });
      const dir = path.join(modPath, "common", "ideas");
      let txt = "";
      for (const f of (fs.existsSync(dir) ? fs.readdirSync(dir) : [])) {
        const t = fs.readFileSync(path.join(dir, f), "utf8");
        if (/sn_(spirit|renamed)_idea\s*=/.test(t)) txt += t;
      }
      return { r, txt, kept: UNMODELLED.filter((k) => has(txt, k)) };
    };

    console.log("\n[control] the mod's own spirit, saved back unchanged");
    const own = mkMod(null);
    fs.writeFileSync(path.join(own.dir, "common", "ideas", "sn_own.txt"), SPIRIT);
    const a = await roundTrip({ modPath: own.dir, defFile: "common/ideas/sn_own.txt", targetFile: "common/ideas/sn_own.txt" });
    rec("the save succeeds", a.r && a.r.ok === true, a.r || a.error);
    rec("…keeping every un-modelled block", a.kept.length === UNMODELLED.length,
      { kept: a.kept, lost: UNMODELLED.filter((k) => !a.kept.includes(k)) });

    console.log("\n[an inherited spirit, overridden] the seeded path");
    const base = mkMod(null);
    fs.writeFileSync(path.join(base.dir, "common", "ideas", "sn_base.txt"), SPIRIT);
    const addon1 = mkMod(base.name);
    const b = await roundTrip({ modPath: addon1.dir, sourceRoot: base.dir,
      defFile: "common/ideas/sn_base.txt", targetFile: "common/ideas/custom_ideas.txt" });
    rec("the save succeeds", b.r && b.r.ok === true, b.r || b.error);
    rec("…seeded from the source, not rebuilt from the form", b.kept.length === UNMODELLED.length,
      { kept: b.kept, lost: UNMODELLED.filter((k) => !b.kept.includes(k)) });
    rec("…and the base mod is untouched",
      fs.readFileSync(path.join(base.dir, "common", "ideas", "sn_base.txt"), "utf8") === SPIRIT, "base changed");

    console.log("\n[the same spirit, RENAMED] must match the case above exactly");
    const addon2 = mkMod(base.name);
    const c = await roundTrip({ modPath: addon2.dir, sourceRoot: base.dir,
      defFile: "common/ideas/sn_base.txt", targetFile: "common/ideas/custom_ideas.txt", newId: "sn_renamed_idea" });
    rec("the save succeeds", c.r && c.r.ok === true, c.r || c.error);
    rec("…written under the NEW id", /sn_renamed_idea\s*=/.test(c.txt), c.txt.slice(0, 160));
    rec("…and NOT under the old one", !/sn_spirit_idea\s*=/.test(c.txt), c.txt.slice(0, 160));
    rec("…keeping every un-modelled block", c.kept.length === UNMODELLED.length,
      { kept: c.kept, lost: UNMODELLED.filter((k) => !c.kept.includes(k)) });
    // The parity assertion is the durable one: a rename must never lose more than the plain override does.
    rec("…parity with the un-renamed override", c.kept.length === b.kept.length, { renamed: c.kept, plain: b.kept });
    rec("…and the base mod is still untouched",
      fs.readFileSync(path.join(base.dir, "common", "ideas", "sn_base.txt"), "utf8") === SPIRIT, "base changed");

    console.log("\n[the source lookup] names the id the source knows");
    {
      const SRV = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
      rec("the seed looks up by the previous id when there is one",
        /const lookupId = String\(sourceIdeaId \|\| ""\)\.trim\(\) \|\| ideaId;/.test(SRV), "still looking up by the new id");
      rec("…and retitles the seeded block", /lookupId !== ideaId/.test(SRV), "no retitle");
      rec("…with a replacement FUNCTION, never a $1 string", /\(_m, tail\) => ideaId \+ tail/.test(SRV), "string replacement");
    }

    api.stop(); api = null;
    console.log(`\n=== spirit rename seeds source: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (api) api.stop(); } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
