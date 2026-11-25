// The guard on every immediate map write must count the same unsaved work the Save button counts.
// #state-panel-is-not-in-the-save-pipeline (the other half)
//
// Two functions in public/map.js answer "is there unsaved map work?":
//
//   updateSaveButton()   — what the modder SEES. Counts pendingWrites + paintDiff + stateFormDirty().
//   hasPendingMapEdits() — what the CODE acts on. Guards Move country, Generate land, Save baseline,
//                          Auto-fix, Fix all, Remove country and the rest, every one of which writes
//                          immediately and then reloads the map.
//
// They disagreed on the third term. The province panel stages its typing on Save, so an unstaged edit is
// real unsaved work — the Save button said "1 unsaved change" while the guard said there was nothing
// pending, let the immediate write through, and the reload afterwards discarded the typing.
//
// ⚠️ Anchored on the SHARED TERM rather than on either function's text: the rule is that these two agree,
// so derive both lists from source and compare them. Spelling one of them out here would just be a third
// copy to drift.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 300) : "")); }
};

const MAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
const { maskJsComments } = require("./testlib-strip-comments.js");
const MASKED = maskJsComments(MAP);
const grab = (needle, endNeedle) => {
  const s = MASKED.indexOf(needle);
  if (s < 0) return "";
  const e = MASKED.indexOf(endNeedle, s);
  return e < 0 ? "" : MAP.slice(s, e + endNeedle.length);
};

console.log("\n=== the two answers to \"is there unsaved work?\" agree ===");
{
  const guard = grab("function hasPendingMapEdits", "\n  }");
  const button = grab("function updateSaveButton", "\n  }");
  ok(guard.length > 40, "hasPendingMapEdits was found", guard.length);
  ok(button.length > 100, "updateSaveButton was found", button.length);

  // The three things that constitute unsaved map work. Derived from the button, which is the one the modder
  // reads and therefore the definition of record.
  const TERMS = ["pendingWrites", "paintDiff", "stateFormDirty"];
  const inButton = TERMS.filter((t) => button.indexOf(t) >= 0);
  const inGuard = TERMS.filter((t) => guard.indexOf(t) >= 0);
  ok(inButton.length === 3, "the Save button counts all three kinds of unsaved work", inButton);
  ok(inGuard.length === inButton.length,
    "⭐⭐⭐ …and the guard on the immediate writes counts exactly the same three", { inButton, inGuard });
  const missing = inButton.filter((t) => inGuard.indexOf(t) < 0);
  ok(missing.length === 0,
    "⭐⭐ nothing the modder is shown as unsaved is invisible to the guard", missing);
}

console.log("\n=== …and it really returns true for unstaged typing ===");
{
  const sig = grab("function stateFormFieldSignature", "\n  }");
  const dirty = grab("function stateFormDirty", "\n  }");
  const rebase = grab("function rebaselineStateForm", "\n  }");
  const read = grab("function readStateForm", "\n  }");
  const guard = grab("function hasPendingMapEdits", "\n  }");

  const fields = {};
  const sandbox = {
    console,
    stateFormBaseline: null,
    selected: { stateId: 5, provinceId: 7 },
    pendingWrites: [],
    paintDiff: new Map(),
    collectVps: () => [],
    // Just enough DOM: the signature bails unless #miEditFields is display:block, reads six inputs by id,
    // and walks three lists.
    $: (id) => {
      if (id === "miEditFields") return { style: { display: "block" } };
      if (id === "miVpList") return { querySelectorAll: () => [] };
      return { value: fields[id] !== undefined ? fields[id] : "", style: {} };
    },
    document: { querySelectorAll: () => [] },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  try {
    vm.runInContext([sig, dirty, rebase, read, guard].join("\n"), sandbox);
    ok(true, "the guard and the panel functions evaluate standalone");
  } catch (e) { ok(false, "the guard and the panel functions evaluate standalone", e.message); }

  const ids = [...new Set((sig.match(/v\("([A-Za-z0-9_]+)"\)/g) || []).map((s) => s.slice(3, -2)))];
  for (const id of ids) fields[id] = "1000";
  vm.runInContext("rebaselineStateForm();", sandbox);
  ok(vm.runInContext("hasPendingMapEdits()", sandbox) === false,
    "an untouched map has nothing pending", vm.runInContext("hasPendingMapEdits()", sandbox));

  for (const id of ids) fields[id] = "9999";                       // the modder types into the panel
  ok(vm.runInContext("stateFormDirty()", sandbox) === true, "the panel is dirty after typing");
  ok(vm.runInContext("hasPendingMapEdits()", sandbox) === true,
    "⭐⭐⭐ …and the guard now says so, so an immediate write cannot reload over it",
    vm.runInContext("hasPendingMapEdits()", sandbox));

  // …and the two terms it already had still work, so this widened the guard rather than replacing it.
  vm.runInContext("stateFormBaseline = null;", sandbox);
  ok(vm.runInContext("hasPendingMapEdits()", sandbox) === false, "clean again once the panel is disarmed");
  // ⚠️ Truthiness, not `=== true`: the first two terms are `.length` and `.size`, so the guard answers with
  // a COUNT. Every caller uses it in an `if`, so that is fine — but asserting `=== true` here would have
  // been the test being wrong about Nova rather than the other way round.
  vm.runInContext("pendingWrites = [{ url: '/api/map/set-owner' }];", sandbox);
  ok(!!vm.runInContext("hasPendingMapEdits()", sandbox) === true, "a queued write still counts",
    vm.runInContext("hasPendingMapEdits()", sandbox));
  vm.runInContext("pendingWrites = []; paintDiff = new Map([['1,1', {}]]);", sandbox);
  ok(!!vm.runInContext("hasPendingMapEdits()", sandbox) === true, "…and so do unsaved painted pixels",
    vm.runInContext("hasPendingMapEdits()", sandbox));
}

console.log(`\n=== the unsaved guard counts what the save button counts: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
