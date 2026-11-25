// Mod Health: a VISIBLE event whose option has no name shows no clickable button in game (the player
// can't dismiss it — a soft-lock). A hidden event legitimately uses a nameless option, so it's exempt.
const fs = require("fs");
const os = require("os");
const path = require("path");
const mi = require("./mod-index.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "novamod-evtopt-"));
try {
  fs.writeFileSync(path.join(tmp, "descriptor.mod"), 'name="Evt Opt Test"\n', "utf8");
  fs.mkdirSync(path.join(tmp, "events"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "events", "test.txt"), `add_namespace = test

# Visible event, one good option + one nameless option → should flag the nameless one.
country_event = {
  id = test.1
  title = test.1.t
  desc = test.1.d
  is_triggered_only = yes
  option = { name = test.1.a add_political_power = 10 }
  option = { add_political_power = 20 }
}

# Visible event, all options named → clean.
country_event = {
  id = test.2
  title = test.2.t
  desc = test.2.d
  is_triggered_only = yes
  option = { name = test.2.a }
}

# Hidden event with a nameless option → exempt (legitimately fires effects with no button).
country_event = {
  id = test.3
  hidden = yes
  is_triggered_only = yes
  option = { add_political_power = 5 }
}
`, "utf8");

  const { problems } = mi.buildModIndex(tmp, {});
  const flagged = problems.filter((p) => p.rule === "event_option_no_name").map((p) => p.entityId);

  check("flags a visible event with a nameless option (test.1)", flagged.includes("test.1"), JSON.stringify(flagged));
  check("does NOT flag a visible event whose options are all named (test.2)", !flagged.includes("test.2"), JSON.stringify(flagged));
  check("does NOT flag a HIDDEN event with a nameless option (test.3)", !flagged.includes("test.3"), JSON.stringify(flagged));
  const p1 = problems.find((p) => p.rule === "event_option_no_name" && p.entityId === "test.1");
  check("the problem is a warning attributed to the event file", !!p1 && p1.severity === "warning" && p1.entityType === "event" && !!p1.file, JSON.stringify(p1));
} catch (e) {
  fail++; console.log("  FAIL harness →", e.message);
} finally {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
}

console.log(`\nEVENT-OPTION-NAME TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
