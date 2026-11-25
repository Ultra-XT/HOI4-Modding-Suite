// ⛔ #character-named-by-its-instance — A CHARACTER BUILT OF `instance` BLOCKS IS NAMED BY THEM.
//
// The base game writes a DLC-dependent character as two complete alternative bodies:
//
//     CHL_jorge_gonzález_von_marées = {
//         instance = { allowed = { has_dlc = "Trial of Allegiance" }          name = CHL_jorge_gonzalez_von_marees … }
//         instance = { allowed = { NOT = { has_dlc = "Trial of Allegiance" } } name = CHL_jorge_gonzalez_von_marees … }
//     }
//
// The game shows the name of whichever instance applies, and vanilla localises that key. missing_localization
// read the character's DEPTH-0 name only — it has none — so it demanded a key equal to the token, and Fix all wrote
// one: on a copy of a mod that ships vanilla's CHL.txt unchanged it added ` es:0 "Es"` and ` rola:0 "Rola"`
// (the tokens were also read by their tails, which test-a-character-key-is-read-whole.js holds). The same shape,
// in ASCII, made it write ` F2X_jose_garcia:0 "F2X Jose Garcia"` — a key nothing reads, either way.
//
// Measured 2026-11-13 over the base game and the 14 installed Workshop items: 883 characters are built of
// instances, none with a depth-0 name; 772 cover every case with a complementary pair, 2 with an instance that
// has no `allowed`, and 109 do not cover every case. Reading the instances removes 46 false rows (vanilla 9, Old
// World Blues 14, Road to 56 22, Rise of Nations 1) and adds one real one: Rise of Nations' ETH_john_robinson,
// whose no-DLC instance says `name= allowed`, which nothing localises.
//
// What this holds, on a fixture of each shape:
//   • the key a character can show is each instance's own name — or, where an instance names none, the
//     character's — and EVERY one of them has to resolve; a quoted literal needs nothing;
//   • the character's own name (here its token) is required too when the instances may leave a case where none
//     applies. They cover every case when one has no `allowed`, or two are each other's complement: T and
//     NOT = { T } however it is spaced, or x = yes and x = no. A lone DLC instance does not;
//   • an `allowed` nested inside a role block is that role's, not the instance's;
//   • on the installed game, if it is here: no base-game character whose instances are a has_dlc / NOT has_dlc
//     pair naming keys the base game localises is reported — derived from the files with a reader of its own.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { buildModIndex, isHoi4GameFolder, scanLocalization } = require("./mod-index.js");

let checks = 0, skips = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail === undefined ? "" : "   " + (typeof detail === "string" ? detail.slice(0, 220) : JSON.stringify(detail).slice(0, 220))));
  if (!ok) fails.push(label);
};
const skip = (label) => { skips++; console.log("  SKIP " + label); };

const scratch = [];
const mk = (prefix, files) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  scratch.push(root);
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body, "utf8");
  }
  return root;
};

const a_ = "\u00e1";
const GONZ = "XB_gonz" + a_ + "lez";                    // the CHL shape: a non-ASCII token, named in ASCII
const inst = (allowed, body) => `\t\tinstance = {\n${allowed === null ? "" : `\t\t\tallowed = { ${allowed} }\n`}${body}\t\t}\n`;
const leader = "\t\t\tcountry_leader = { ideology = despotism expire = \"1965.1.1.1\" id = -1 }\n";
const named = (n) => `\t\t\tname = ${n}\n${leader}`;
const D1 = 'has_dlc = "D1"', NOT_D1 = 'NOT = { has_dlc = "D1" }';
const ch = (key, body) => `\t${key} = {\n${body}\t}\n`;

try {
  const root = mk("nova-charinst-", {
    "descriptor.mod": 'name="instance names"\n',
    [path.join("common", "characters", "x.txt")]: "characters = {\n"
      + ch("XA_pair", inst(D1, named("XA_name")) + inst(NOT_D1, named("XA_name")))
      + ch(GONZ, inst(D1, named("XB_gonzalez")
          + "\t\t\tadvisor = {\n\t\t\t\tslot = political_advisor\n\t\t\t\tidea_token = " + GONZ + "\n\t\t\t\tallowed = { original_tag = XXX }\n\t\t\t}\n")
        + inst(NOT_D1, named("XB_gonzalez")))
      + ch("XC_lone", inst(D1, named("XC_name")))
      + ch("XD_aat", inst("has_aat = yes", named('"Dee Aat"')) + inst("has_aat = no", named('"Dee Aat"')))
      + ch("XE_pair", inst(D1, named("XE_pair")) + inst(NOT_D1, named("XE_missing_name")))
      + ch("XF_pair", inst(D1, named("XF_name")) + inst(NOT_D1, leader))
      + ch("XG_always", inst(null, named("XG_name")))
      + ch("XH_spacing", "\t\tinstance = {\n\t\t\tallowed={has_dlc=\"D1\"}\n" + named("XH_name") + "\t\t}\n"
        + "\t\tinstance = {\n\t\t\tallowed = {\n\t\t\t\tNOT = {\n\t\t\t\t\thas_dlc = \"D1\"\n\t\t\t\t}\n\t\t\t}\n" + named("XH_name") + "\t\t}\n")
      + ch("XI_unrelated", inst(D1, named("XI_name")) + inst('has_dlc = "D2"', named("XI_name")))
      + "}\n",
    [path.join("localisation", "english", "x_l_english.yml")]: "\ufeffl_english:\n"
      + ["XA_name", "XB_gonzalez", "XC_name", "XE_pair", "XF_name", "XG_name", "XH_name", "XI_name"].map((k) => ` ${k}:0 "${k}"`).join("\n") + "\n",
  });

  const idx = buildModIndex(root, {});
  const rows = idx.problems.filter((p) => p.rule === "missing_localization");
  const row = (id) => rows.find((p) => p.entityId === id);

  console.log("\n-- every key a character can show must resolve, and nothing else is asked for --");
  rec("a has_dlc / NOT has_dlc pair named by a localised key is not reported", !row("XA_pair"), rows.map((p) => p.entityId));
  rec("...nor vanilla's own shape: a non-ASCII token named in ASCII, with an advisor carrying its own allowed", !row(GONZ), row(GONZ) && row(GONZ).locKey);
  rec("a has_aat = yes / no pair named by quoted literals needs nothing", !row("XD_aat"), row("XD_aat") && row("XD_aat").locKey);
  rec("an instance with no allowed covers every case", !row("XG_always"), row("XG_always") && row("XG_always").locKey);
  rec("a complementary pair is recognised however it is spaced", !row("XH_spacing"), row("XH_spacing") && row("XH_spacing").locKey);

  console.log("\n-- ...and a key that can be shown and is missing is reported, under that key --");
  rec("an instance naming an unlocalised key is reported under it", !!row("XE_pair") && row("XE_pair").locKey === "XE_missing_name", row("XE_pair") && row("XE_pair").locKey);
  rec("...and the message says an instance declares it", !!row("XE_pair") && /an instance of it declares name = XE_missing_name/.test(row("XE_pair").message), row("XE_pair") && row("XE_pair").message);
  rec("an instance that names nothing shows the character's own key, which must resolve", !!row("XF_pair") && row("XF_pair").locKey === "XF_pair", row("XF_pair") && row("XF_pair").locKey);
  rec("a lone DLC instance may not apply, so the token must resolve too", !!row("XC_lone") && row("XC_lone").locKey === "XC_lone", row("XC_lone") && row("XC_lone").locKey);
  rec("two unrelated conditions do not cover every case either", !!row("XI_unrelated") && row("XI_unrelated").locKey === "XI_unrelated", row("XI_unrelated") && row("XI_unrelated").locKey);
  rec("exactly those four are reported", rows.length === 4, rows.map((p) => p.entityId + " -> " + p.locKey));

  console.log("\n-- on the installed game, if it is here --");
  const G = process.env.HOI4_ROOT || "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
  if (isHoi4GameFolder(G)) {
    // A reader of its own: statements at one depth, a token being a run of anything but whitespace, braces, `=`,
    // a quote or `#`. A character "certainly named by its instances" has 2+ instances, no depth-0 name, every
    // instance naming a key (or a literal), and between them an `allowed` of exactly `has_dlc = "X"` and another
    // of exactly `NOT = { has_dlc = "X" }`.
    const maskComments = (s) => s.replace(/#[^\r\n]*/g, (m) => " ".repeat(m.length));
    const matchBrace = (t, open) => { let d = 0; for (let i = open; i < t.length; i++) { if (t[i] === "{") d++; else if (t[i] === "}" && --d === 0) return i; } return -1; };
    const stmts = (t, from, to) => {
      const out = []; const re = /([^\s{}="#]+)\s*=\s*(\{|"(?:\\.|[^"\\])*"|[^\s{}="#]+)/y;
      for (let i = from; i < to;) {
        if (/\s/.test(t[i])) { i++; continue; }
        re.lastIndex = i; const m = re.exec(t);
        if (m && m.index === i) {
          if (m[2] === "{") { const open = i + m[0].length - 1; const close = matchBrace(t, open); out.push({ key: m[1], open, close: close === -1 ? to : close }); i = close === -1 ? to : close + 1; }
          else { out.push({ key: m[1], value: m[2] }); i += m[0].length; }
          continue;
        }
        if (t[i] === "{") { const c = matchBrace(t, i); i = c === -1 ? to : c + 1; continue; }
        const tk = /[^\s{}]+|[{}]/y; tk.lastIndex = i; const x = tk.exec(t); i += x ? x[0].length : 1;
      }
      return out;
    };
    const flat = (s) => s.replace(/\s+/g, " ").trim();
    const vloc = new Set(Object.keys(scanLocalization(G)));
    const certain = [];
    const keysOf = new Map(); // file -> every character key it defines, as spelled
    const dir = path.join(G, "common", "characters");
    for (const f of fs.readdirSync(dir).filter((n) => n.toLowerCase().endsWith(".txt"))) {
      const t = maskComments(fs.readFileSync(path.join(dir, f), "utf8"));
      keysOf.set(f, []);
      for (const top of stmts(t, 0, t.length)) {
        if (top.key !== "characters" || top.open === undefined) continue;
        for (const c of stmts(t, top.open + 1, top.close)) {
          if (c.open === undefined) continue;
          keysOf.get(f).push(c.key);
          const body = stmts(t, c.open + 1, c.close);
          if (body.some((s) => s.key === "name" && s.value !== undefined)) continue;
          const insts = body.filter((s) => s.key === "instance" && s.open !== undefined).map((ib) => {
            const ibody = stmts(t, ib.open + 1, ib.close);
            const nm = ibody.find((s) => s.key === "name" && s.value !== undefined);
            const al = ibody.filter((s) => s.key === "allowed" && s.open !== undefined);
            return { name: nm ? nm.value : null, allowed: al.length === 1 ? flat(t.slice(al[0].open + 1, al[0].close)) : null };
          });
          if (insts.length < 2 || insts.some((x) => x.name === null)) continue;
          const dlc = insts.map((x) => /^has_dlc = "([^"]+)"$/.exec(x.allowed || "")).filter(Boolean).map((m) => m[1]);
          const notDlc = insts.map((x) => /^NOT = \{ has_dlc = "([^"]+)" \}$/.exec(x.allowed || "")).filter(Boolean).map((m) => m[1]);
          if (!dlc.some((d) => notDlc.includes(d))) continue;
          const keys = insts.map((x) => x.name).filter((n) => !n.startsWith('"') || /^"[A-Za-z0-9_.\-]+"$/.test(n)).map((n) => n.replace(/^"|"$/g, ""));
          if (keys.every((k) => vloc.has(k))) certain.push({ key: c.key, file: f });
        }
      }
    }
    const v = buildModIndex(G, { vanillaRoot: null, dependencyRoots: [] });
    const reported = new Set(v.problems.filter((p) => p.rule === "missing_localization").map((p) => p.entityId));
    const wrong = certain.filter((c) => reported.has(c.key));
    rec(`no base-game character named only by a localised DLC pair is reported (${certain.length} such characters)`,
      certain.length > 100 && wrong.length === 0, wrong.slice(0, 10));

    // The most ordinary modder action: copy a vanilla country's character file to edit it.
    const files = {};
    for (const f of ["CHL.txt", "PRU.txt"]) files[path.join("common", "characters", f)] = fs.readFileSync(path.join(dir, f), "utf8");
    const mod = mk("nova-charinst-van-", Object.assign({ "descriptor.mod": 'name="vanilla files"\n',
      [path.join("localisation", "english", "m_l_english.yml")]: "\ufeffl_english:\n" }, files));
    const m = buildModIndex(mod, { vanillaRoot: G, dependencyRoots: [] });
    const own = m.problems.filter((p) => (p.rule === "missing_localization" || p.rule === "duplicate_id") && /common[\\/]characters[\\/](CHL|PRU)\.txt$/.test(p.file || ""));
    const defined = [...keysOf.get("CHL.txt"), ...keysOf.get("PRU.txt")];
    const certainHere = new Set(certain.filter((c) => c.file === "CHL.txt" || c.file === "PRU.txt").map((c) => c.key));
    const invented = own.filter((p) => !defined.includes(p.entityId));
    rec(`a mod shipping vanilla's CHL.txt and PRU.txt unchanged: every row names a character they define (${defined.length})`,
      defined.length > 10 && invented.length === 0, invented.map((p) => p.rule + " " + p.entityId));
    rec("...no duplicate_id, since the two files define each key once",
      new Set(defined).size === defined.length && !own.some((p) => p.rule === "duplicate_id"), own.filter((p) => p.rule === "duplicate_id").map((p) => p.entityId));
    rec(`...and nothing about the ${certainHere.size} named by a localised DLC pair`, certainHere.size > 0 && !own.some((p) => certainHere.has(p.entityId)),
      own.filter((p) => certainHere.has(p.entityId)).map((p) => p.entityId + " -> " + p.locKey));
  } else {
    skip("the real-install checks: no game at " + G + " (set HOI4_ROOT). They did NOT run; the fixture above holds every shape.");
  }
} catch (e) {
  console.error(e);
  fails.push("threw: " + e.message);
} finally {
  for (const r of scratch) { try { fs.rmSync(r, { recursive: true, force: true }); } catch (_) { /* scratch only */ } }
}

console.log("\n" + (fails.length ? "FAILED " + fails.length + "/" + checks : "PASSED " + checks + "/" + checks)
  + (skips ? " — " + skips + " SKIPPED: did not run, not counted as passes" : ""));
process.exitCode = fails.length ? 1 : 0;
