// ⛔ #a-write-that-failed-reported-nothing — "SAVED" OVER A WRITE THAT DID NOT HAPPEN.
//
// safeModWrite throws when the write cannot happen, and the causes are ordinary: Steam Workshop content is
// frequently read-only, HOI4 holds files while it runs, and an antivirus or sync client can lock a file for
// longer than the retry ladder. Its own error message says exactly that. So a call site that catches and
// discards turns a refusal into a silent success — the 43 KB-silent-corruption shape, one layer up.
//
// Nova already has the mechanism. `noteRefWriteFailure(file, err)` pushes onto a channel that
// installWriteNoteDrain empties into EVERY JSON response, so a reference-write failure reaches the request
// that caused it without the handler being edited. Its own comment names the failure this test guards:
// "editing all twelve to thread a new field is how a guard ends up adopted by one caller and not its
// siblings."
//
// That is exactly what had happened. Found by brace-matching every safeModWrite to the try that really
// encloses it (a line-proximity walk over-reported badly — in map-data.js the nearby
// `catch (_) { continue; }` wraps the fs.readFileSync above, not the write):
//
//   · spirit-rename-grant on the all-countries file — the loop TEN LINES ABOVE does the same operation and
//     reports it; this block discarded the error and skipped its own `changed++`.
//   · tech-rename per file — "ignore per-file" was right to CONTINUE and wrong to stay quiet: a file it
//     could not rewrite still names the old technology id while the user is told the rename worked.
//   · the equipment-variant reconcile — returns { filesChanged, pins }, both under-counting in silence.
//   · map renumberStateId — could not rewrite buildings.txt, so every building row still points at the OLD
//     state id, and the report merely LACKED a field. Absence is not a message.
//   · map fixCoastalNoPort — the buildings.txt write in the same function returns { error } on failure; the
//     definition.csv flip discarded it while the return counted what the fix MEANT to do.
"use strict";

const fs = require("fs");
const path = require("path");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500));
  }
}

const { maskJsComments } = require("./testlib-strip-comments.js");
const FILES = ["server.js", "map-data.js", "mod-index.js", "safe-write.js"];

// Genuinely honest by omission — the caller's own success signal already stays false, so there is nothing
// to report. Each carries its reason, and the staleness check below fails if one stops being a write site.
const EXEMPT = [{
  file: "map-data.js",
  reason: "map-fixAdjacenciesFile: `out.fixed` stays 0 and `out.changes` stays empty on failure, so the " +
    "caller already reports 'nothing fixed' — which is true.",
  marker: "map-fixAdjacenciesFile",
}, {
  file: "server.js",
  reason: "continuous-focus SEEDING: on failure `seeded` stays false and the loop tries the next candidate " +
    "file, so the caller's own signal is already honest — it keeps looking rather than claiming success.",
  marker: '"continuous-focus"',
}, {
  file: "server.js",
  reason: "country-name-list: the catch returns null, and the caller distinguishes that from the " +
    "{ file, sourceTag } it gets on success. A null IS the report.",
  marker: '"country-name-list"',
}];

// Every `try {` with its matching close and the body of the catch that follows it.
function tryBlocks(src) {
  const out = [];
  const re = /\btry\s*\{/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const open = src.indexOf("{", m.index);
    let d = 0, close = -1;
    for (let i = open; i < src.length; i++) {
      if (src[i] === "{") d++;
      else if (src[i] === "}") { d--; if (!d) { close = i; break; } }
    }
    if (close === -1) continue;
    const after = src.slice(close + 1, close + 400);
    const cm = /^\s*catch\s*\(([^)]*)\)\s*\{/.exec(after);
    let catchBody = null;
    if (cm) {
      const cOpen = close + 1 + after.indexOf("{", cm.index);
      let cd = 0, cClose = -1;
      for (let i = cOpen; i < src.length; i++) {
        if (src[i] === "{") cd++;
        else if (src[i] === "}") { cd--; if (!cd) { cClose = i; break; } }
      }
      if (cClose !== -1) catchBody = src.slice(cOpen + 1, cClose);
    }
    out.push({ open, close, catchBody });
  }
  return out;
}

// Does this catch do anything the caller or the user can see?
function reportsSomething(body) {
  return /\bthrow\b/.test(body)
    || /res\s*\.\s*(status|json)/.test(body)
    || /noteRefWriteFailure\s*\(|noteWriteWarning\s*\(/.test(body)
    || /console\s*\.\s*(warn|error|log)/.test(body)
    || /\.\s*push\s*\(/.test(body)
    || /\breturn\b[^;]*\berror\b/i.test(body)
    // a return that hands the caller the list of what failed, its entries carrying the caught error's words:
    // giveEditedLandItsRows answers every state it meant to give rows as `failed`, each with the write's reason, and every
    // caller passes that on as `buildingRows`, which the page says ("Nova could not add the building positions ... needs").
    // A `failed` with no error in it reports nothing, so the words must be there.
    || (/\breturn\b[^;]*\bfailed\s*:/.test(body) && /\.message\b/.test(body))
    // an assignment whose target names a failure the caller reads back
    || /[A-Za-z_$][\w$.]*\s*(Error|Warning|Note|Warn|Failure)\s*=/.test(body)
    || /\b(csvWarning|oobNote)\s*=/.test(body);
}

console.log("\n[⭐ every write that can fail says so]");
let totalCalls = 0;
const offenders = [];
for (const f of FILES) {
  let raw = ""; try { raw = fs.readFileSync(path.join(__dirname, f), "utf8"); } catch (_) { continue; }
  const src = maskJsComments(raw);   // a fix's own prose names the mechanism this greps for
  const blocks = tryBlocks(src);
  const lineOf = (i) => src.slice(0, i).split("\n").length;
  const re = /safeModWrite\s*\(/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    totalCalls++;
    let inner = null;
    for (const b of blocks) if (b.open < m.index && m.index < b.close && (!inner || b.open > inner.open)) inner = b;
    if (!inner || inner.catchBody == null) continue;       // not caught here — it propagates, which is fine
    if (reportsSomething(inner.catchBody)) continue;
    const line = lineOf(m.index);
    const context = src.slice(Math.max(0, m.index - 400), m.index + 200);
    const exempt = EXEMPT.find((e) => e.file === f && context.includes(e.marker));
    if (exempt) continue;
    offenders.push(`${f}:${line}  catch { ${inner.catchBody.replace(/\s+/g, " ").trim().slice(0, 70)} }`);
  }
}
console.log(`     ${totalCalls} safeModWrite call sites across ${FILES.join(", ")}`);
rec("there are enough of them for this to mean anything", totalCalls > 100, totalCalls);
rec("⭐ none of them catches its own failure and reports nothing", offenders.length === 0,
  offenders.concat(['a discarded write means the user is told "saved" over a file that was not written']));

console.log("\n[the mechanism they use]");
{
  const SRV = maskJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));
  rec("noteRefWriteFailure exists", /function noteRefWriteFailure\(/.test(SRV));
  rec("…and drains into every JSON response by itself", /function installWriteNoteDrain\(/.test(SRV),
    "without the drain, a reported failure still never reaches the user");
  const uses = (SRV.match(/noteRefWriteFailure\s*\(/g) || []).length;
  rec(`…and is used by ${uses} call sites, not one`, uses >= 8, uses);
}

console.log("\n[the five that were fixed, by name]");
{
  const SRV = maskJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));
  const MAP = maskJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
  rec("spirit-rename-grant on the all-countries file reports",
    /catch \(e\) \{ noteRefWriteFailure\(path\.join\(modRoot, NOVA_ALL_COUNTRIES_REL\), e\); \}/.test(SRV));
  rec("tech-rename names the file it could not rewrite", /noteRefWriteFailure\(abs, e\);/.test(SRV));
  rec("the equipment-variant reconcile reports", /noteRefWriteFailure\("an equipment variant file", e\);/.test(SRV));
  rec("map renumberStateId names the stale building rows", /report\.buildingsError\s*=/.test(MAP));
  rec("map fixCoastalNoPort warns instead of counting a write that failed", /csvWarning\s*=/.test(MAP));
  rec("…and returns that warning to the caller", /\.\.\.\(csvWarning \? \{ warning: csvWarning \} : \{\}\)/.test(MAP));
}

console.log("\n[⭐ CONTROL: the exemptions still describe real write sites]");
{
  // An allow-list entry that outlives the call it excused becomes permanent. #allow-list-staleness
  for (const e of EXEMPT) {
    const src = maskJsComments(fs.readFileSync(path.join(__dirname, e.file), "utf8"));
    rec(`${e.file}: "${e.marker}" is still a write site`, src.includes(e.marker) && /safeModWrite/.test(src),
      "this exemption no longer excuses anything — delete it");
  }
  rec(`the list is short (${EXEMPT.length})`, EXEMPT.length <= 3, EXEMPT.map((e) => e.marker));
}

console.log("\n[⭐ CONTROL: the detector actually bites]");
{
  // A guard that cannot fail is not a guard. Feed it a call site that discards, and it must be caught.
  const sample = 'function f() {\n  try {\n    safeModWrite(p, out, "x");\n  } catch (_) {}\n}\n';
  const blocks = tryBlocks(sample);
  const at = sample.indexOf("safeModWrite(");
  let inner = null;
  for (const b of blocks) if (b.open < at && at < b.close && (!inner || b.open > inner.open)) inner = b;
  rec("a bare `catch (_) {}` around a write is detected", !!inner && inner.catchBody != null && !reportsSomething(inner.catchBody));
  const good = 'function f() {\n  try {\n    safeModWrite(p, out, "x");\n  } catch (e) { noteRefWriteFailure(p, e); }\n}\n';
  const gb = tryBlocks(good);
  const ga = good.indexOf("safeModWrite(");
  let gi = null;
  for (const b of gb) if (b.open < ga && ga < b.close && (!gi || b.open > gi.open)) gi = b;
  rec("…and one that reports is not", !!gi && reportsSomething(gi.catchBody));
  // the `failed` list shape (giveEditedLandItsRows): a report only while the caught error's words are in the list
  const innermost = (s) => {
    const bs = tryBlocks(s), a = s.indexOf("safeModWrite(");
    let b0 = null;
    for (const b of bs) if (b.open < a && a < b.close && (!b0 || b.open > b0.open)) b0 = b;
    return b0;
  };
  const listed = innermost('function f() {\n  try {\n    safeModWrite(p, out, "x");\n  } catch (e) {\n    const reason = String((e && e.message) || e);\n    return { placed: [], failed: done.map((d) => ({ id: d.id, reason })) };\n  }\n}\n');
  rec("…a catch that answers what failed, with the error's words, is a report", !!listed && listed.catchBody != null && reportsSomething(listed.catchBody));
  const unsaid = ['  } catch (e) { return { placed: [], failed: [] }; }\n', '  } catch (_) { return { placed: [], failed: done }; }\n']
    .map((c) => innermost('function f() {\n  try {\n    safeModWrite(p, out, "x");\n' + c + '}\n'));
  rec("…but one whose `failed` carries no error is still detected", unsaid.every((b) => !!b && b.catchBody != null && !reportsSomething(b.catchBody)));
}

console.log(`\n=== a write that failed says so: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
