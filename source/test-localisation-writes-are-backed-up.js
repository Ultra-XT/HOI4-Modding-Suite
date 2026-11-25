// #localisation-written-without-a-backup
//
// EVERY MAKER BACKED UP THE FILE THAT DEFINES A THING AND NOT THE FILE THAT NAMES IT.
//
// A save writes two files: the script file (.txt) that defines the item, and the localisation file (.yml)
// that gives it its name and description. The script half goes through safeModWrite — byte-copy backup,
// prune, atomic temp-and-rename with fsync, a retry for transient antivirus/sync locks, a readable error for
// the permanent causes, and a refusal to write into the vanilla directory unless the user turned that on.
//
// The localisation half went through writeUtf8BomFile, which was:
//
//     fs.writeFileSync(targetPath, `﻿${text}`, "utf8");
//
// A bare truncating write. No backup, no atomic write, no retry — for the file that holds every display name
// in the mod. Interrupt it (a crash, a full disk, an AV lock landing mid-write) and the file is left short
// with nothing to recover from, while the .txt written by the same save has both.
//
// ~35 call sites, one function. Delegating to safeModWrite fixes all of them and makes the two halves of one
// save behave the same way, which is the actual defect.
//
// MEASURED end to end against the running server, on a throwaway mod under os.tmpdir(). Backups whose reason
// is "localisation" went 0 → 4 across two saves of the same spirit (that reason string did not exist before
// this change, so every one of them is proof). The .yml kept its BOM and carried the new name.
//
// ⚠️ The probe that measured it failed first with "Pick a target idea file under common/ideas." — the payload
// was invented rather than copied from the fetch() in public/ideas.js. The endpoint was fine.
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
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 320));
  }
}
const { stripJsComments } = require("./testlib-strip-comments.js");
// #map-writers-had-no-owner — safeModWrite and the helpers this file inspects moved out of server.js into
// safe-write.js so map-data.js could require the same one. The checks below are about the WRITE PATH, not
// about which file it lives in, so they read both. Reading only server.js is how this test went quiet the
// moment the code moved: every assertion about safeModWrite's body passed vacuously on an empty string.
const readSrc = (rel) => stripJsComments(fs.readFileSync(path.join(__dirname, rel), "utf8"));
const SRV = readSrc("server.js") + "\n" + readSrc("safe-write.js");

function fnSource(header) {
  const at = SRV.indexOf(header);
  if (at === -1) return "";
  let i = SRV.indexOf("{", at + header.length - 1), d = 0;
  for (; i < SRV.length; i++) {
    if (SRV[i] === "{") d++;
    else if (SRV[i] === "}") { d--; if (d === 0) return SRV.slice(at, i + 1); }
  }
  return "";
}
// by NAME too: it gained a `reason` parameter (review of e1f3586, finding 2 — a map rename's other-language writes were filed in the
// makers' "localisation" backup pool), and the whole signature as the anchor made every check below read an empty string
const LOC = fnSource("function writeUtf8BomFile(");
// by NAME, not by the whole signature: safeModWrite gained an `opts` parameter (#a-failed-redraw-puts-back-bytes) and the full
// signature as the anchor made every check below read an empty string
const SAFE = fnSource("function safeModWrite(");

console.log("\n[the localisation write goes through the same door as the script write]");
{
  rec("writeUtf8BomFile was extracted", LOC.length > 300, LOC.length);
  rec("it no longer writes the file itself", !/fs\.writeFileSync\(targetPath,/.test(LOC),
    "a bare truncating write, for the file holding every display name in the mod");
  rec("…it delegates to safeModWrite", /safeModWrite\(targetPath, `\\uFEFF\$\{text\}`, reason\);/.test(LOC),
    "the localisation half still bypasses the backup the script half gets");
  rec("…filed under \"localisation\" unless its caller names the pool", /^function writeUtf8BomFile\(targetPath, content, reason = "localisation"\)/.test(LOC),
    LOC.slice(0, 90));
  rec("…keeping the BOM", /`\\uFEFF\$\{text\}`/.test(LOC), "HOI4 will not read a .yml without the byte-order mark");
  rec("…and stripping any BOM the caller already added", /replace\(\/\^\\uFEFF\/, ""\)/.test(LOC), "a double BOM would corrupt the first key");
  // The localisation-specific message is the one worth keeping: safeModWrite's says a file could not be
  // written; this one says the NAME was not saved and what the user will see in game instead.
  rec("…and still explains a locked file in localisation terms", /the localisation file is read-only or in use/.test(LOC),
    "the user would get a generic file error for a very specific consequence");
}

console.log("\n[what delegating inherits]");
{
  rec("safeModWrite was extracted", SAFE.length > 800, SAFE.length);
  rec("it copies the bytes for the backup", /fs\.copyFileSync\(absPath, backupPath\);/.test(SAFE),
    "a decode/re-encode backup can be as damaged as what it protects against");
  // The existence check may be taken ONCE, before the write, into `existed`: the scope counts a file the write CREATED by it
  // (#generate-land-created-what-its-copies-cannot-cover), and the backup's condition then reads that same answer
  const EXISTS = /const existed = fs\.existsSync\(absPath\);/.test(SAFE) ? "existed" : "fs\\.existsSync\\(absPath\\)";
  rec("…only when there is something to back up", new RegExp(`if \\(${EXISTS}(\\)| && )`).test(SAFE), "");
  // …and the one way round the pool copy is an explicit `poolBackup: false` (a restore writing back what a scope already holds)
  rec("…with the pool copy skipped ONLY on an explicit poolBackup: false", new RegExp(`if \\(${EXISTS} && !\\(opts && opts\\.poolBackup === false\\)\\)`).test(SAFE), SAFE.slice(0, 400));
  rec("…prunes so backups cannot grow without bound", /pruneBackups\(MAX_BACKUP_FILES\);/.test(SAFE), "");
  rec("…never lets a failed backup stop the write", /backupPath = ""; \/\/ best-effort/.test(SAFE) || /catch \(_err\) \{/.test(SAFE), "");
  rec("…writes atomically through a temp file", /const tmpPath = `\$\{absPath\}\.tmp-\$\{process\.pid\}-\$\{Date\.now\(\)\}`;/.test(SAFE),
    "a truncating write can leave the file short");
  rec("…and fsyncs before the rename", /fs\.fsyncSync\(fd\);/.test(SAFE), "the rename could beat the data to disk");
  // The guard is now in TWO halves, because safe-write.js cannot know where the game is installed or whether
  // the user has ticked "allow editing vanilla files" — server.js hands it over at startup. Assert both, or
  // the half that is left passes while the wire is cut: a safeModWrite whose assertWritable is still the
  // do-nothing default refuses nothing at all, silently.
  rec("…and refuses the vanilla directory unless the user allowed it", /cfg\.assertWritable\(absPath\);/.test(SAFE),
    "localisation could be written into the game install while the script half was refused");
  // ⚠️ DERIVE the registered name rather than pinning it — this asserted `assertPathNotInGameRoot` literally
  // and broke when the guard grew a second refusal behind a wrapper, i.e. when it got STRONGER.
  // #nova-wrote-into-the-hoi4-user-folder
  const SRVSRC = readSrc("server.js");
  const wired = (SRVSRC.match(/assertWritable:\s*([A-Za-z0-9_$]+)\s*,/) || [])[1] || "";
  rec("…with server.js supplying the real guard, not the do-nothing default",
    !!wired && wired !== "undefined",
    "safe-write.js defaults assertWritable to a no-op; if server.js never registers the real one the door is open");
  rec("…and that guard still reaches the vanilla-install refusal",
    !!wired && new RegExp("function\\s+" + wired + "\\b[\\s\\S]{0,800}?assertPathNotInGameRoot").test(SRVSRC),
    `the registered guard (${wired}) never reaches assertPathNotInGameRoot`);
}

console.log("\n[⭐ no mod write bypasses the door]");
{
  // DERIVED: every direct write in server.js that targets a path built from a mod root should go through
  // safeModWrite. Nova's OWN files (AppData caches, .nova/ state, backups) legitimately do not.
  const direct = [...SRV.matchAll(/fs\.writeFileSync\(([^,]+),/g)].map((m) => ({ arg: m[1].trim(), at: m.index }));
  const suspicious = direct.filter((d) => {
    if (/tmpPath|backupPath|fd\b/.test(d.arg)) return false;            // inside safeModWrite itself
    const around = SRV.slice(Math.max(0, d.at - 400), d.at);
    if (/BACKUP_DIR|NOVA_APP_DATA|appDataDir|\.nova|cachePath|CACHE/i.test(around)) return false; // Nova's own
    return /targetPath|absPath|abs\b|filePath|dest|outPath/.test(d.arg);
  });
  console.log("     direct writeFileSync calls with a file-path argument: " + direct.length + ", of which not obviously Nova's own: " + suspicious.length);
  // This is a watch number rather than a hard gate: server.js writes plenty of its own state. What matters
  // is that the LOCALISATION drain — the one shared by every maker — is not among them.
  rec("the shared localisation drain is not one of them",
    !suspicious.some((d) => SRV.slice(Math.max(0, d.at - 600), d.at).includes("function writeUtf8BomFile")),
    "writeUtf8BomFile writes directly again");
  rec("…and there is exactly one localisation drain to fix", (SRV.match(/function writeUtf8BomFile\(/g) || []).length === 1,
    (SRV.match(/function writeUtf8BomFile\(/g) || []).length);
  const callers = (SRV.match(/writeUtf8BomFile\(/g) || []).length - 1;
  console.log("     call sites that inherit the fix: " + callers);
  rec("…shared by many makers, so fixing it once is the point", callers >= 15, callers);
}

console.log(`\n=== localisation writes are backed up: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
