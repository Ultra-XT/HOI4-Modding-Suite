#!/usr/bin/env node
/*
 * build-hoi4-spec.cjs — generate data/hoi4-spec.json from the CWTools HOI4 config.
 *
 * The CWTools config (reference/cwtools-hoi4-config) is a DEV-TIME source only — it is
 * gitignored and NOT bundled in the exe. This script distills it into a small, checked-in
 * data/hoi4-spec.json (effect / trigger / modifier names + scope + one-line docs) that DOES
 * ship with the app and grounds the pickers / AI prompts / Mod Health.
 *
 * Source: https://github.com/cwtools/cwtools-hoi4-config  (MIT, (c) 2018 tboby)
 * Re-run after updating the clone:  node scripts/build-hoi4-spec.cjs
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CONFIG = path.join(ROOT, "reference", "cwtools-hoi4-config", "Config");
const OUT = path.join(ROOT, "data", "hoi4-spec.json");

// Map a CWT filename suffix to the DLC/expansion it belongs to (for an optional DLC filter).
const DLC_BY_SUFFIX = {
  aat: "aat", // Arms Against Tyranny
  bba: "bba", // By Blood Alone
  goe: "goe", // Graveyard of Empires
  gtd: "gtd", // Götterdämmerung
  ncns: "ncns", // No Conscription No Service / misc
  new: "base", // newer base-game additions
  nsb: "nsb", // No Step Back
  taog: "taog", // Trial of Allegiance / Arms of Glory
  toa: "toa",
};

function fail(msg) {
  console.error("ERROR: " + msg);
  process.exit(1);
}

if (!fs.existsSync(CONFIG)) {
  fail(
    "CWTools config not found at " +
      CONFIG +
      "\nClone it first:  git clone --depth 1 https://github.com/cwtools/cwtools-hoi4-config.git reference/cwtools-hoi4-config"
  );
}

// ---- parse effect/trigger alias files -----------------------------------------------------
// Format per entry:
//   ### one-line description (optional, may repeat)
//   ## scope = country            (optional annotation)
//   alias[effect:add_stability] = <type>
function parseAliasFile(file, kind /* "effect" | "trigger" */, dlc) {
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);
  const out = [];
  let desc = "";
  let scope = "";
  // Capture the right-hand side too: `alias[effect:set_capital] = {` (a BLOCK) vs
  // `alias[effect:add_stability] = variable_field` (a SCALAR value). The picker uses this to insert
  // `name = { … }` for blocks and `name = ` for scalars.
  const aliasRe = new RegExp("^\\s*alias\\[" + kind + ":([^\\]]+)\\]\\s*=\\s*(.*)$");
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("###")) {
      // documentation line
      const d = line.replace(/^#+/, "").trim();
      if (d) desc = d;
      continue;
    }
    if (line.startsWith("##")) {
      const m = line.match(/^##\s*scope\s*=\s*(.+)$/);
      if (m) scope = m[1].replace(/[{}]/g, " ").replace(/\s+/g, " ").trim();
      continue;
    }
    const am = line.match(aliasRe);
    if (am) {
      const name = am[1].trim();
      // skip meta placeholders like <scripted_effect> and piped variants' junk
      if (!/^[a-z][a-z0-9_]*$/.test(name)) {
        desc = "";
        scope = "";
        continue;
      }
      const block = (am[2] || "").trim().startsWith("{");
      out.push({ name, scope, desc, dlc, block });
      desc = "";
      scope = "";
      continue;
    }
    // a blank line resets a dangling description so it can't bleed into an unrelated alias
    if (line === "") {
      desc = "";
    }
  }
  return out;
}

function collectAliases(kind, baseFile, prefix) {
  const files = fs
    .readdirSync(CONFIG)
    .filter((f) => f === baseFile || f.startsWith(prefix));
  const byName = new Map();
  for (const f of files) {
    const suffix = f === baseFile ? "base" : f.replace(prefix, "").replace(/\.cwt$/, "");
    const dlc = DLC_BY_SUFFIX[suffix] || "base";
    const entries = parseAliasFile(path.join(CONFIG, f), kind, dlc);
    for (const e of entries) {
      const prev = byName.get(e.name);
      if (!prev) {
        byName.set(e.name, e);
      } else {
        // merge: keep the first non-empty description and union the scopes
        if (!prev.desc && e.desc) prev.desc = e.desc;
        if (e.scope && prev.scope && !prev.scope.split(" ").includes(e.scope)) {
          // keep prev.scope; scopes for the same name are usually identical
        } else if (e.scope && !prev.scope) {
          prev.scope = e.scope;
        }
      }
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// ---- parse modifiers ----------------------------------------------------------------------
// Format:  name = category   (inside a modifiers = { ... } wrapper, # comments group them)
function parseModifiers() {
  const text = fs.readFileSync(path.join(CONFIG, "modifiers.cwt"), "utf8");
  const lines = text.split(/\r?\n/);
  const byName = new Map();
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([a-z][a-z0-9_]*)\s*=\s*([a-z][a-z0-9_]*)\s*$/);
    if (!m) continue;
    const name = m[1];
    const category = m[2];
    if (name === "modifiers") continue; // the wrapper
    if (!byName.has(name)) byName.set(name, { name, category });
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const effects = collectAliases("effect", "effects.cwt", "effects_");
const triggers = collectAliases("trigger", "triggers.cwt", "triggers_");
const modifiers = parseModifiers();

if (effects.length < 200) fail("suspiciously few effects parsed (" + effects.length + ")");
if (triggers.length < 200) fail("suspiciously few triggers parsed (" + triggers.length + ")");
if (modifiers.length < 500) fail("suspiciously few modifiers parsed (" + modifiers.length + ")");

const spec = {
  _meta: {
    description:
      "Authoritative HOI4 script tokens (effects/triggers/modifiers) for grounding Nova's pickers, AI prompts and Mod Health.",
    source: "https://github.com/cwtools/cwtools-hoi4-config",
    // The notice that SHIPS: reference/ is gitignored and never packed, so pointing there named a file no user has.
    // THIRD-PARTY-NOTICES.txt carries the MIT text (third-party/licenses/cwtools-hoi4-config-LICENSE.txt), and
    // scripts/gen-third-party-notices.js refuses a build whose data names a licence that is not there.
    license: "MIT (c) 2018 tboby; see THIRD-PARTY-NOTICES.txt",
    generatedBy: "scripts/build-hoi4-spec.cjs",
    generatedAt: new Date().toISOString().slice(0, 10),
    counts: { effects: effects.length, triggers: triggers.length, modifiers: modifiers.length },
  },
  effects,
  triggers,
  modifiers,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(spec, null, 1) + "\n", "utf8");
console.log(
  "Wrote " +
    path.relative(ROOT, OUT) +
    `  (effects=${effects.length}, triggers=${triggers.length}, modifiers=${modifiers.length})`
);
