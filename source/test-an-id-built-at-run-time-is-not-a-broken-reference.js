// ⛔ #runtime-built-id-guard-not-adopted — AN ID BUILT AT RUN TIME IS NOT A REFERENCE.
//
// HOI4 script can build an id at run time: The Digital Frontier's events/00_Ages_events.txt does
// `remove_ideas = age_ability_[ABILITY]` inside a meta_effect, with ABILITY = "[?v]" naming one of its 52
// age_ability_<n>. Every id class in mod-index.js's extractRefs stops at the `[`, so a reader that does not ask what
// follows its match captures only the literal prefix — and RULE 2 reported a missing idea "age_ability_", an ERROR
// with an AI fix button, on content the game runs. Three readers asked (add_ideas, add_timed_idea, swap_ideas'
// add_idea); remove_ideas, activate_decision, the keyed `{ idea = X }` form and every event, focus and tech reader did
// not. Over the base game and the installed Workshop items that was one row today; any of the others is one meta_effect
// away from the next.
//
// What this holds:
//   • THE READERS ARE DERIVED, NOT LISTED. Every regex extractRefs hands to matchAll is read out of its own source and
//     instantiated into the shortest text it matches, its capture replaced by a probe id (a construct the instantiator
//     does not know fails this test rather than being probed with the wrong text). Each reader whose probe reaches a
//     context RULE 2 judges is then given the same text with the id built at run time — `X_[A]`, and `X.[A]`, which a
//     trailing \b gives back the `.` of — on its own and inside every block form extractRefs reads, and nothing may be
//     pushed for it. A bare id inside each block form is probed the same way. A probe that reaches nothing FAILS: a
//     reader that could not be probed is not a reader that passed.
//   • the shapes the finding measured, as a mod, through buildModIndex: no broken_reference for any of them, while
//     the control — an id that exists nowhere — is still reported;
//   • on the installed game and on The Digital Frontier, if they are here: no broken_reference row names an id its
//     own file continues into a `[`.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { extractRefs, buildModIndex, isHoi4GameFolder, BROKEN_REFERENCE_SKIPPED_CONTEXTS } = require("./mod-index.js");
const { stripJsComments } = require("./testlib-strip-comments.js");

let checks = 0, skips = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail === undefined ? "" : "   " + (typeof detail === "string" ? detail.slice(0, 240) : JSON.stringify(detail).slice(0, 240))));
  if (!ok) fails.push(label);
};
const skip = (label) => { skips++; console.log("  SKIP " + label); };

// ── the readers, out of extractRefs' own source ────────────────────────────────────────────────────────────────
const fnSrc = stripJsComments(extractRefs.toString());
const EVENT_KINDS = /const EVENT_KINDS\s*=\s*"([^"]+)"/.exec(fnSrc);
const readers = [];
for (const m of fnSrc.matchAll(/\.matchAll\(\s*\//g)) {
  let i = m.index + m[0].length, inClass = false, src = "";
  for (; i < fnSrc.length; i++) {
    const c = fnSrc[i];
    if (c === "\\") { src += c + fnSrc[i + 1]; i++; continue; }
    if (inClass) { if (c === "]") inClass = false; src += c; continue; }
    if (c === "[") { inClass = true; src += c; continue; }
    if (c === "/") break;
    src += c;
  }
  readers.push({ src, flags: /^[a-z]*/.exec(fnSrc.slice(i + 1))[0] });
}
for (const m of fnSrc.matchAll(/\.matchAll\(\s*new RegExp\(\s*`((?:\\.|[^`\\])*)`\s*,\s*"([a-z]*)"\s*\)/g)) {
  readers.push({ src: m[1].replace(/\$\{EVENT_KINDS\}/g, EVENT_KINDS ? EVENT_KINDS[1] : "$${EVENT_KINDS}").replace(/\\\\/g, "\\"), flags: m[2] });
}
const matchAllCalls = (fnSrc.match(/\.matchAll\(/g) || []).length;

// The shortest text a reader's regex matches, its one capture group replaced by `value`. It knows exactly the
// constructs these readers are written with and throws on anything else.
function instantiate(src, flags, value) {
  let i = 0, captures = 0;
  const pick = (cls) => {
    const re = new RegExp("^" + cls + "$", flags.includes("u") ? "u" : "");
    for (const c of ["x", "a", "A", "1", "0", "_"]) if (re.test(c)) return c;
    throw new Error("no sample character for the class " + cls);
  };
  const quant = () => { // "zero" for * and *?, "one" for none, + and ? (an optional piece is included)
    const q = src[i];
    if (q !== "*" && q !== "+" && q !== "?") return "one";
    i++; if (src[i] === "?") i++;
    return q === "*" ? "zero" : "one";
  };
  const seq = () => { let out = ""; while (i < src.length && src[i] !== ")" && src[i] !== "|") out += atom(); return out; };
  const atom = () => {
    const c = src[i];
    if (c === "\\") {
      const e = src[i + 1]; i += 2;
      if (e === "b") return "";
      if (e === "s") { quant(); return " "; }            // one space either way: tokens stay apart
      if ("{}[].-\\".includes(e)) return quant() === "zero" ? "" : e;
      throw new Error("an escape the instantiator does not know: \\" + e);
    }
    if (c === "(") {
      i++;
      let capturing = true;
      if (src[i] === "?") { if (src[i + 1] !== ":") throw new Error("a group the instantiator does not know: (?" + src[i + 1]); capturing = false; i += 2; }
      const first = seq();
      while (src[i] === "|") { i++; seq(); }              // the first alternative stands for the group
      if (src[i] !== ")") throw new Error("an unclosed group in " + src);
      i++;
      if (quant() === "zero") return "";
      if (capturing) { captures++; return value; }
      return first;
    }
    if (c === "[") {
      let j = i + 1;
      if (src[j] === "^") j++;
      if (src[j] === "]") j++;
      while (j < src.length && src[j] !== "]") { if (src[j] === "\\") j++; j++; }
      const cls = src.slice(i, j + 1); i = j + 1;
      return quant() === "zero" ? "" : pick(cls);
    }
    if ("^$.*+?{}|)".includes(c)) throw new Error("a metacharacter the instantiator does not know: " + c + " in " + src);
    i++;
    return quant() === "zero" ? "" : c;
  };
  const out = seq();
  if (i !== src.length) throw new Error("unread rest of " + src + ": " + src.slice(i));
  if (captures !== 1) throw new Error(captures + " capture groups in " + src);
  return out;
}
// The first capture group's own source: a block reader captures a body (`[^{}]*`), every other reader an id.
const captureOf = (src) => {
  for (let i = 0, inClass = false; i < src.length; i++) {
    const c = src[i];
    if (c === "\\") { i++; continue; }
    if (inClass) { if (c === "]") inClass = false; continue; }
    if (c === "[") { inClass = true; continue; }
    if (c === "(" && src[i + 1] !== "?") {
      let depth = 0, k = i;
      for (let cls = false; k < src.length; k++) {
        const d = src[k];
        if (d === "\\") { k++; continue; }
        if (cls) { if (d === "]") cls = false; continue; }
        if (d === "[") { cls = true; continue; }
        if (d === "(") depth++;
        else if (d === ")" && --depth === 0) break;
      }
      return src.slice(i + 1, k);
    }
  }
  return null;
};

const ID = "nova_probe_id";
const BUILT = [ID + "_[RUNTIME]", ID + ".[RUNTIME]"];
const judged = (r) => !BROKEN_REFERENCE_SKIPPED_CONTEXTS.has(r.context);
const probeIds = (text) => extractRefs(text).filter((r) => r.id === ID || r.id.startsWith(ID));

try {
  console.log("\n-- the readers, derived from extractRefs --");
  for (const r of readers) {
    r.capture = captureOf(r.src);
    r.kind = r.capture === "[^{}]*" ? "block" : "id";
    r.sample = (() => { try { return instantiate(r.src, r.flags, r.kind === "block" ? " … " : ID); } catch (e) { r.error = e.message; return null; } })();
    console.log(`     ${r.kind.padEnd(5)} /${r.src}/${r.flags}${r.error ? "   !! " + r.error : ""}`);
  }
  rec(`every matchAll in extractRefs is a reader this test read (${readers.length} of ${matchAllCalls})`, readers.length === matchAllCalls && readers.length > 0, { readers: readers.length, matchAllCalls });
  rec("every reader can be instantiated", readers.every((r) => !r.error), readers.filter((r) => r.error).map((r) => r.src + " :: " + r.error));
  const blocks = readers.filter((r) => r.kind === "block" && !r.error);
  const ids = readers.filter((r) => r.kind === "id" && !r.error);
  rec("the derivation found both kinds: block forms and id readers", blocks.length > 0 && ids.length > 0, { blocks: blocks.length, ids: ids.length });

  // Where a probe is placed: on its own, and as the body of every block form.
  const placements = [{ name: "on its own", put: (s) => s }]
    .concat(blocks.map((b) => ({ name: "inside " + instantiate(b.src, b.flags, " … ").trim(), put: (s) => instantiate(b.src, b.flags, " " + s + " ") })));

  console.log("\n-- each id reader: what it reaches, and that an id built at run time pushes nothing --");
  for (const r of ids) {
    const reached = [], reachedJudged = [];
    for (const p of placements) {
      const got = probeIds(p.put(instantiate(r.src, r.flags, ID)));
      if (got.length) reached.push(p);
      if (got.some((x) => x.id === ID && judged(x))) reachedJudged.push(p);
    }
    const label = `/${r.src.slice(0, 70)}${r.src.length > 70 ? "…" : ""}/`;
    rec(`${label}: its probe reaches the index`, reached.length > 0,
      reached.length ? reached.map((p) => p.name).join(" | ") : "no placement of `" + r.sample + "` pushed the probe id");
    if (!reachedJudged.length) {
      const ctx = [...new Set(reached.flatMap((p) => probeIds(p.put(instantiate(r.src, r.flags, ID))).map((x) => x.context)))];
      console.log(`       (pushes only into ${ctx.join(", ") || "nothing"}, which RULE 2 does not judge)`);
      continue;
    }
    const wrong = [];
    for (const p of reachedJudged) for (const built of BUILT) {
      const text = p.put(instantiate(r.src, r.flags, built));
      for (const x of probeIds(text).filter(judged)) wrong.push(`${p.name}: \`${text.trim()}\` -> ${x.context} ${x.type} "${x.id}"`);
    }
    rec(`${label}: an id built at run time is not pushed (${reachedJudged.length} placement(s) x ${BUILT.length} shapes)`, wrong.length === 0, wrong.slice(0, 3));
  }

  console.log("\n-- a bare id built at run time inside each block form --");
  for (const b of blocks) {
    const put = (s) => instantiate(b.src, b.flags, " " + s + " ");
    const ctl = probeIds(put(ID)).filter(judged);
    if (!ctl.length) { console.log(`       ${put("X").trim()}: a bare id here is not a reference form, nothing to probe`); continue; }
    const wrong = BUILT.flatMap((built) => probeIds(put(built)).filter(judged).map((x) => `${put(built).trim()} -> ${x.context} "${x.id}"`));
    rec(`${put("X").trim()}: a bare id built at run time is not pushed`, wrong.length === 0, wrong);
  }

  // ── the shapes the finding measured, as a mod ───────────────────────────────────────────────────────────────
  console.log("\n-- as a mod, through buildModIndex --");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nova-runtime-id-"));
  try {
    const put = (rel, body) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body, "utf8"); };
    put("descriptor.mod", 'name="ids built at run time"\n');
    put("common/ideas/f1x.txt", "ideas = {\n\tcountry = {\n\t\tf1x_age_1 = { }\n\t\tf1x_age_2 = { }\n\t}\n}\n");
    put("common/decisions/f1x.txt", "f1x_category = {\n\tf1x_dec_1 = { }\n}\n");
    put("events/f1x.txt", "add_namespace = f1x\n"
      + "country_event = {\n\tid = f1x.1\n\thidden = yes\n\tis_triggered_only = yes\n\timmediate = {\n"
      + "\t\tmeta_effect = {\n\t\t\ttext = {\n\t\t\t\tremove_ideas = f1x_age_[ABILITY]\n\t\t\t}\n\t\t\tABILITY = \"[?v]\"\n\t\t}\n"
      + "\t\tremove_ideas = { idea = f1x_age_[ABILITY] }\n"
      + "\t\tadd_ideas = { idea = f1x_age_[ABILITY] }\n"
      + "\t\tadd_ideas = f1x_age_[ABILITY]\n"
      + "\t\tadd_timed_idea = { idea = f1x_age_[ABILITY] days = 30 }\n"
      + "\t\tactivate_decision = f1x_dec_[ABILITY]\n"
      + "\t\tcountry_event = f1x.[ABILITY]\n"
      + "\t\tcountry_event = { id = f1x.[ABILITY] days = 1 }\n"
      + "\t\tcomplete_national_focus = f1x_focus_[ABILITY]\n"
      + "\t\tadd_ideas = f1x_genuinely_missing\n"
      + "\t}\n}\n");
    const idx = buildModIndex(root, { vanillaRoot: null, dependencyRoots: [] });
    const rows = idx.problems.filter((p) => p.rule === "broken_reference");
    rec("no broken_reference for an id built at run time, in any of the nine forms", !rows.some((p) => p.refId !== "f1x_genuinely_missing"),
      rows.map((p) => `${p.refContext} ${p.refType} "${p.refId}"`));
    rec("...and the control, an id that exists nowhere, is still reported", rows.some((p) => p.refId === "f1x_genuinely_missing" && p.refContext === "add_ideas"),
      rows.map((p) => p.refId));
  } finally {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
  }

  // ── on real content, read-only, if it is here ──────────────────────────────────────────────────────────────
  console.log("\n-- on the installed game and The Digital Frontier, if they are here --");
  const G = process.env.HOI4_ROOT || "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
  const TDF = path.join(path.dirname(path.dirname(G)), "workshop", "content", "394360", "3721160655");
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // A broken_reference row whose id its own file continues into a `[` (past any `.` or `-`): an id built at run time.
  const runtimeRows = (idx, base) => idx.problems.filter((p) => p.rule === "broken_reference").filter((p) => {
    const f = path.isAbsolute(String(p.file || "")) ? p.file : path.join(base, String(p.file || ""));
    let text = ""; try { text = fs.readFileSync(f, "utf8").replace(/#[^\r\n]*/g, ""); } catch (_) { return false; }
    return new RegExp("(?<![A-Za-z0-9_.\\-])" + esc(p.refId) + "[.\\-]*\\[").test(text);
  });
  // How many places the derived readers would have read an id built at run time, in the files a scan reads: the
  // check below means something only where this is not zero.
  const builtSites = (base) => {
    let n = 0;
    const walk = (d) => { let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
      for (const e of es) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.txt$/i.test(e.name)) {
        const t = fs.readFileSync(p, "utf8").replace(/#[^\r\n]*/g, "");
        if (t.indexOf("[") === -1) continue;
        for (const r of ids) for (const m of t.matchAll(new RegExp(r.src, r.flags.includes("g") ? r.flags : r.flags + "g"))) {
          let j = m.index + m[0].length; while (t[j] === "." || t[j] === "-") j++; if (t[j] === "[") n++;
        }
      } } };
    for (const sub of ["common", "events", "history"]) walk(path.join(base, sub));
    return n;
  };
  if (isHoi4GameFolder(G)) {
    const v = buildModIndex(G, { vanillaRoot: null, dependencyRoots: [] });
    const bad = runtimeRows(v, G);
    rec(`the base game: no broken_reference names an id built at run time (${builtSites(G)} such sites read)`, bad.length === 0, bad.map((p) => p.refContext + " " + p.refId));
    if (fs.existsSync(path.join(TDF, "descriptor.mod"))) {
      const sites = builtSites(TDF);
      if (!sites) skip("The Digital Frontier holds no id built at run time any more; its check did NOT run.");
      else {
        const t = buildModIndex(TDF, { vanillaRoot: G, dependencyRoots: [] });
        const badT = runtimeRows(t, TDF);
        rec(`The Digital Frontier: no broken_reference names an id built at run time (${sites} such sites read)`, badT.length === 0,
          badT.map((p) => `${p.entityId} ${p.refContext} "${p.refId}"`));
      }
    } else skip("The Digital Frontier is not installed at " + TDF + "; its check did NOT run.");
  } else {
    skip("the real-content checks: no game at " + G + " (set HOI4_ROOT). They did NOT run; the probes above hold every reader.");
  }
} catch (e) {
  console.error(e);
  fails.push("threw: " + e.message);
}

console.log("\n" + (fails.length ? "FAILED " + fails.length + "/" + checks : "PASSED " + checks + "/" + checks)
  + (skips ? " — " + skips + " SKIPPED: did not run, not counted as passes" : ""));
process.exitCode = fails.length ? 1 : 0;
