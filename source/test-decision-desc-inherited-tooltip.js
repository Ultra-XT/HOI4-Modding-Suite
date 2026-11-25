// #decision-desc-blanks-inherited-tooltip — AN EMPTY PLACEHOLDER MUST NOT OVERRIDE A TOOLTIP THAT EXISTS.
//
// HOI4 looks up `<id>_desc` for a decision's tooltip and shows the raw key in red when it is missing, so a
// decision Nova CREATES gets an empty `<id>_desc` written to suppress that. Correct — for content nobody else
// defines.
//
// But localisation is one namespace shared by vanilla, every dependency mod and the active mod, and the guard
// only looked in the active mod:
//
//     isNewDecision && !findModLocalizationEntry(activeRoot, descKey)
//
// Redefining an existing decision id — the ordinary and only way to change one — is "new" to the mod, so the
// save wrote `<id>_desc:0 ""` and blanked the tooltip the player was already reading. Measured against the
// game's own files: 1319 of vanilla's 4065 decisions ship a non-empty `_desc`. Every one of them is exposed,
// and so is every decision inherited from a base mod like Millennium Dawn.
//
// A second, quieter bug sat underneath it. `parseLocalizationFile` splits its output in two —
// `if (key.endsWith("_desc")) descriptions[key] = value; else names[key] = value;` — and the upsert's
// "already says this" short-circuit consulted `names` only. For a `_desc` key that lookup could never hit, so
// the check was dead for exactly the keys this bug is about. Fixing the scope without fixing the lookup would
// have left the endpoint writing a redundant override of a description that already said the same thing.
//
// The placeholder still gets written where it was always meant to be: a genuinely new id that no layer
// describes.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-decdesc-"));
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
  const n = "ZZDec" + (++seq);
  const dir = path.join(ROOT, "mod" + seq);
  fs.mkdirSync(path.join(dir, "common", "decisions"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"),
    'name="' + n + '"\nsupported_version="1.19.*"\n' + (deps ? 'dependencies={ "' + deps + '" }\n' : ""), "utf8");
  fs.writeFileSync(path.join(ROOT, "mod" + seq + ".mod"),
    'name="' + n + '"\npath="' + toPosix(dir) + '"\nsupported_version="1.19.*"\n', "utf8");
  return { name: n, dir };
}
function writeLoc(dir, lines) {
  const d = path.join(dir, "localisation", "english");
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, "zz_probe_l_english.yml"), "\uFEFFl_english:\n" + lines.map((l) => " " + l + "\n").join(""), "utf8");
}
// Every `<key>:N "value"` line the mod itself wrote for this key, across all of its .yml files.
function locLinesFor(dir, key) {
  const d = path.join(dir, "localisation", "english");
  if (!fs.existsSync(d)) return [];
  const out = [];
  for (const f of fs.readdirSync(d)) {
    for (const line of fs.readFileSync(path.join(d, f), "utf8").split("\n")) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_.-]*):\d*\s*"(.*)"\s*$/.exec(line);
      if (m && m[1] === key) out.push({ file: f, value: m[2] });
    }
  }
  return out;
}

let PORT = 49560;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      save: (body) => fetch("http://127.0.0.1:" + PORT + "/api/decisions/save", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

(async () => {
  let api = null;
  try {
    console.log("\n[the corpus] how much of the game is exposed");
    const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
    let vanillaDecs = 0, vanillaWithDesc = [];
    if (fs.existsSync(GAME)) {
      const ids = new Set();
      const dd = path.join(GAME, "common", "decisions");
      for (const f of fs.readdirSync(dd).filter((x) => x.endsWith(".txt"))) {
        const txt = fs.readFileSync(path.join(dd, f), "latin1");
        // Decisions are the second nesting level: category = { id = { … } }.
        let depth = 0, m;
        const re = /([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*\{|\{|\}/g;
        while ((m = re.exec(txt))) {
          if (m[0] === "}") { depth--; continue; }
          if (m[0] === "{") { depth++; continue; }
          if (depth === 1) ids.add(m[1]);
          depth++;
        }
      }
      const described = new Set();
      const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, e.name);
          if (e.isDirectory()) { walk(p); continue; }
          if (!/_l_english\.yml$/i.test(e.name)) continue;
          for (const line of fs.readFileSync(p, "utf8").split("\n")) {
            const mm = /^\s*([A-Za-z_][A-Za-z0-9_.-]*):\d*\s*"(.*)"\s*$/.exec(line);
            if (mm && mm[2].trim()) described.add(mm[1]);
          }
        }
      };
      walk(path.join(GAME, "localisation", "english"));
      vanillaDecs = ids.size;
      vanillaWithDesc = [...ids].filter((id) => described.has(id + "_desc"));
      console.log(`  ${vanillaWithDesc.length} of vanilla's ${vanillaDecs} decisions ship a non-empty <id>_desc`);
      rec("the game really does describe its decisions (else this test proves nothing)",
        vanillaWithDesc.length > 500, vanillaWithDesc.length);
    } else {
      console.log("  (no HOI4 install — corpus skipped; the fixture cases below still run)");
    }

    api = await serve(createApp());

    console.log("\n[a decision another layer already describes] the base mod case");
    {
      const base = mkMod(null);
      const child = mkMod(base.name);
      fs.writeFileSync(path.join(base.dir, "common", "decisions", "zz_base.txt"),
        "zz_cat = {\n\tzz_shared_decision = {\n\t\tcost = 5\n\t}\n}\n", "utf8");
      writeLoc(base.dir, ['zz_shared_decision:0 "Base Title"', 'zz_shared_decision_desc:0 "The base mod explains what this does."']);

      // Fixture control: the property this test depends on must actually hold before the save.
      rec("fixture: the base mod really does describe the decision",
        locLinesFor(base.dir, "zz_shared_decision_desc")[0]?.value.length > 10, locLinesFor(base.dir, "zz_shared_decision_desc"));

      const r = await api.save({ modPath: child.dir, categoryId: "zz_cat", id: "zz_shared_decision",
        name: "My Version", cost: "10", decisionType: "standard" });
      rec("the save succeeds", r.b.success === true || r.b.ok === true, r.b);
      const wrote = locLinesFor(child.dir, "zz_shared_decision_desc");
      rec("…and does NOT blank the base mod's tooltip", wrote.length === 0, wrote);
      rec("…while the title the user actually typed IS written",
        locLinesFor(child.dir, "zz_shared_decision").some((l) => l.value === "My Version"),
        locLinesFor(child.dir, "zz_shared_decision"));
      rec("…and the base mod's own files are untouched",
        locLinesFor(base.dir, "zz_shared_decision_desc")[0]?.value === "The base mod explains what this does.",
        locLinesFor(base.dir, "zz_shared_decision_desc"));
    }

    console.log("\n[a decision vanilla already describes] the case every mod hits");
    if (vanillaWithDesc.length) {
      const victim = vanillaWithDesc[0];
      const mod = mkMod(null);
      const r = await api.save({ modPath: mod.dir, categoryId: "zz_cat", id: victim,
        name: "My Version", cost: "10", decisionType: "standard" });
      rec("the save succeeds", r.b.success === true || r.b.ok === true, r.b);
      const wrote = locLinesFor(mod.dir, victim + "_desc");
      rec(`…and does NOT blank vanilla's tooltip for ${victim}`, wrote.length === 0, wrote);
    } else {
      console.log("  (skipped — no HOI4 install)");
    }

    console.log("\n[genuinely new content] the placeholder the guard exists for is still written");
    {
      const mod = mkMod(null);
      const r = await api.save({ modPath: mod.dir, categoryId: "zz_cat", id: "zz_nobody_describes_this",
        name: "Brand New", cost: "10", decisionType: "standard" });
      rec("the save succeeds", r.b.success === true || r.b.ok === true, r.b);
      const wrote = locLinesFor(mod.dir, "zz_nobody_describes_this_desc");
      rec("an id no layer describes still gets the empty placeholder", wrote.length === 1 && wrote[0].value === "", wrote);
    }

    console.log("\n[why blanking mattered so much] there is no description field to type into");
    {
      // `upsertDecisionLocalization` takes a `description`, but the save endpoint hardcodes "" at the call
      // site and the Decisions page has no field for one. So the ONLY `<id>_desc` Nova can write today is the
      // empty placeholder — which is precisely why writing it over an inherited tooltip was pure loss with
      // nothing gained. Asserted rather than assumed, so that wiring a real field later trips this and gets
      // the case above written properly.
      const SRV = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
      rec("the save endpoint still passes no description",
        /upsertDecisionLocalization\(activeRoot, id, name, "", explicitNameKey/.test(SRV), "a description is now wired — extend this test");
      const base = mkMod(null);
      const child = mkMod(base.name);
      writeLoc(base.dir, ['zz_authored:0 "Base"', 'zz_authored_desc:0 "Base text."']);
      const r = await api.save({ modPath: child.dir, categoryId: "zz_cat", id: "zz_authored",
        name: "Mine", cost: "10", decisionType: "standard", description: "My own tooltip." });
      rec("the save succeeds", r.b.success === true || r.b.ok === true, r.b);
      rec("…and a description sent by a client that guessed the field name changes nothing",
        locLinesFor(child.dir, "zz_authored_desc").length === 0, locLinesFor(child.dir, "zz_authored_desc"));
    }

    console.log("\n[the dead short-circuit] a _desc the mod does not own is not taken over");
    {
      // parseLocalizationFile files `<key>_desc` under `descriptions`, never `names`, and the "already says
      // this" check consulted `names` alone — so for _desc keys it could never hit. The reachable case is a
      // layer that defines the key as an EMPTY string: the placeholder guard above lets that through (there
      // IS red missing-text to worry about), and the mod then wrote its own copy of a key it does not own.
      const base = mkMod(null);
      const child = mkMod(base.name);
      writeLoc(base.dir, ['zz_blank:0 "Blank"', 'zz_blank_desc:0 ""']);
      rec("fixture: the base mod defines the key, but empty",
        locLinesFor(base.dir, "zz_blank_desc").length === 1 && locLinesFor(base.dir, "zz_blank_desc")[0].value === "",
        locLinesFor(base.dir, "zz_blank_desc"));
      const r = await api.save({ modPath: child.dir, categoryId: "zz_cat", id: "zz_blank",
        name: "Mine", cost: "10", decisionType: "standard" });
      rec("the save succeeds", r.b.success === true || r.b.ok === true, r.b);
      rec("…and does not write its own copy of a key that already says the same thing",
        locLinesFor(child.dir, "zz_blank_desc").length === 0, locLinesFor(child.dir, "zz_blank_desc"));
    }

    console.log("\n[unchanged is unchanged] a title identical to the inherited one is not re-written either");
    {
      const base = mkMod(null);
      const child = mkMod(base.name);
      writeLoc(base.dir, ['zz_same:0 "Same"', 'zz_same_desc:0 "Identical text."']);
      const r = await api.save({ modPath: child.dir, categoryId: "zz_cat", id: "zz_same",
        name: "Same", cost: "10", decisionType: "standard", description: "Identical text." });
      rec("the save succeeds", r.b.success === true || r.b.ok === true, r.b);
      rec("…writing no redundant override of a description that already says this",
        locLinesFor(child.dir, "zz_same_desc").length === 0, locLinesFor(child.dir, "zz_same_desc"));
      rec("…and the same is true of the title (the half that already worked)",
        locLinesFor(child.dir, "zz_same").length === 0, locLinesFor(child.dir, "zz_same"));
    }

    api.stop(); api = null;
    console.log(`\n=== decision desc inherited tooltip: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (api) api.stop(); } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
