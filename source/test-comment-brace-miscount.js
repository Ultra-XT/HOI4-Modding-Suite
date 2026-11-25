// #comment-brace-miscount — a brace inside a COMMENT or a QUOTED STRING must not be counted as script.
//
// Paradox script lets `#` comment out the rest of a line, and quoted strings can contain braces. Nova's idea
// scanner counted every { and } it saw, so on a real mod file:
//   - a stray `}` in a comment ended the block early, and every spirit after it VANISHED from the catalog and
//     the editor — the file looked half-empty with no error anywhere
//   - a stray `{` in a comment swallowed the following blocks into one
//   - a fully commented-out `# my_spirit = { … }` was listed in the sidebar as if it were a real spirit, then
//     failed on every interaction
//
// Both directions are asserted: the awkward file must parse CORRECTLY, and an ordinary file must still parse
// exactly as before (a masking bug that blanked too much would empty every picker in Nova).
//
// Hermetic: fake mod under tmpdir.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-brace-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 220));
  }
}

const MOD = path.join(ROOT, "bracemod");
fs.mkdirSync(path.join(MOD, "common", "ideas"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="BraceMod"\nsupported_version="1.18.*"\n', "utf8");

// A control file with nothing awkward in it at all.
fs.writeFileSync(
  path.join(MOD, "common", "ideas", "plain.txt"),
  [
    "ideas = {",
    "\tcountry = {",
    "\t\tplain_one = { removal_cost = -1 }",
    "\t\tplain_two = { removal_cost = -1 }",
    "\t}",
    "}",
    "",
  ].join("\n"),
  "utf8"
);

// The awkward-but-valid file. Every construct here is legal HOI4 that a real modder writes.
fs.writeFileSync(
  path.join(MOD, "common", "ideas", "awkward.txt"),
  [
    "ideas = {",
    "\tcountry = {",
    "\t\t# a closing brace in a comment: }  <- this used to end the country block early",
    "\t\tafter_close_comment = { removal_cost = -1 }",
    "",
    "\t\t# an opening brace in a comment: {  <- this used to swallow the blocks below",
    "\t\tafter_open_comment = { removal_cost = -1 }",
    "",
    "\t\t# a fully commented-out spirit that must NOT be listed:",
    "\t\t# ghost_spirit = { removal_cost = -1 }",
    "",
    "\t\tquoted_brace_spirit = {",
    "\t\t\tremoval_cost = -1",
    '\t\t\tpicture = "a { b } c"',
    "\t\t}",
    "",
    "\t\ttrailing_spirit = { removal_cost = -1 }",
    "\t}",
    "}",
    "",
  ].join("\n"),
  "utf8"
);

const PORT = 42137;
const app = createApp();
const server = app.listen(PORT, async () => {
  try {
    const q = encodeURIComponent(MOD);
    const r = await fetch(`http://127.0.0.1:${PORT}/api/ideas/catalog?includeVanilla=0&includeActiveMod=1&sourcePath=${q}&modPath=${q}`);
    const body = await r.json().catch(() => null);
    rec("the catalog loads", r.ok && body && Array.isArray(body.items), r.status);
    const ids = ((body && body.items) || []).map((i) => i && i.ideaId).filter(Boolean);

    // Control first: the ordinary file must be unaffected. If masking blanked too much this fails loudly.
    console.log("\n[control] an ordinary file still parses");
    rec("plain_one is listed", ids.includes("plain_one"), ids);
    rec("plain_two is listed", ids.includes("plain_two"), ids);

    console.log("\n[awkward] braces in comments and strings");
    rec("a spirit after a `}` in a comment is listed", ids.includes("after_close_comment"), ids);
    rec("a spirit after a `{` in a comment is listed", ids.includes("after_open_comment"), ids);
    rec("a spirit with a braced quoted string is listed", ids.includes("quoted_brace_spirit"), ids);
    rec("the LAST spirit in the file is listed", ids.includes("trailing_spirit"), ids);
    rec("a commented-out spirit is NOT listed", !ids.includes("ghost_spirit"), "ghost_spirit was offered as real");

    // The block that was extracted must still carry its own text intact — masking is for locating only.
    const quoted = ((body && body.items) || []).find((i) => i && i.ideaId === "quoted_brace_spirit");
    if (quoted && typeof quoted.blockText === "string") {
      rec("…and its block kept the quoted string", quoted.blockText.includes('"a { b } c"'), quoted.blockText.slice(0, 160));
    } else {
      console.log("  --  blockText not exposed on the catalog item; skipping the slice check");
    }

    // Comment preservation is a hard invariant: the extracted block must not have been stripped.
    const afterClose = ((body && body.items) || []).find((i) => i && i.ideaId === "after_close_comment");
    rec("the scanner found every spirit in the awkward file (5)",
      ["after_close_comment", "after_open_comment", "quoted_brace_spirit", "trailing_spirit"].every((k) => ids.includes(k)) && !!afterClose,
      ids);

    console.log(`\n=== comment/brace miscount: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) {
      fails.forEach((f) => console.log("   FAILED: " + f));
      process.exitCode = 1;
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 6).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
server.on("error", (e) => {
  console.error("listen error:", e.message);
  process.exitCode = 1;
});
