/**
 * Tests for the Unified Mod Index (Roadmap Phase 1).
 * Builds a throwaway mod with known content and asserts the index + validation.
 *
 * Run:  node test-mod-index.js
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { buildModIndex } = require("./mod-index.js");

let passes = 0, failures = 0;
function ok(cond, msg) {
  if (cond) { passes++; console.log(`  ✓ ${msg}`); }
  else { failures++; console.error(`  ✗ FAIL: ${msg}`); }
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
}

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-index-"));
try {
  // --- focus tree: one focus grants a spirit, one references a missing event ---
  write(path.join(mod, "common", "national_focus", "test_focus.txt"), `
focus_tree = {
  id = test_tree
  country = { factor = 1 }
  focus = {
    id = focus_grant_spirit
    x = 0  y = 0
    completion_reward = {
      add_ideas = my_good_spirit
    }
  }
  focus = {
    id = focus_calls_event
    x = 2  y = 0
    prerequisite = { focus = focus_grant_spirit }
    completion_reward = {
      country_event = missing.99
      set_technology = { infantry_weapons = 1 }
    }
  }
}
`);

  // --- ideas: one granted (my_good_spirit), one orphan (my_orphan_spirit) ---
  write(path.join(mod, "common", "ideas", "test_ideas.txt"), `
ideas = {
  country = {
    my_good_spirit = {
      picture = generic
      modifier = { political_power_gain = 0.1 }
    }
    my_orphan_spirit = {
      picture = generic
      modifier = { stability_factor = 0.05 }
    }
  }
}
`);

  // --- a tech (so set_technology infantry_weapons would still be "external/vanilla") ---
  write(path.join(mod, "common", "technologies", "test_tech.txt"), `
technologies = {
  my_custom_tech = {
    research_cost = 1
    start_year = 1936
    folder = { name = infantry_folder position = { x = 0 y = 0 } }
  }
}
`);

  // --- localization for display names ---
  write(path.join(mod, "localisation", "english", "test_l_english.yml"),
    `﻿l_english:\n my_good_spirit:0 "My Good Spirit"\n my_orphan_spirit:0 "My Orphan Spirit"\n`);

  // Build index WITHOUT vanilla awareness so "infantry_weapons" and "missing.99"
  // are both unknown — lets us check broken-ref detection deterministically.
  const idx = buildModIndex(mod, {});

  console.log("\n[entities]");
  const ids = idx.entities.map(e => `${e.type}:${e.id}`);
  ok(ids.includes("focus:focus_grant_spirit"), "scanned focus focus_grant_spirit");
  ok(ids.includes("focus:focus_calls_event"), "scanned focus focus_calls_event");
  ok(ids.includes("focus_tree:test_tree"), "scanned focus_tree test_tree");
  ok(ids.includes("idea:my_good_spirit"), "scanned idea my_good_spirit");
  ok(ids.includes("idea:my_orphan_spirit"), "scanned idea my_orphan_spirit");
  ok(ids.includes("tech:my_custom_tech"), "scanned tech my_custom_tech");

  console.log("\n[display names]");
  const good = idx.entities.find(e => e.id === "my_good_spirit");
  ok(good && good.displayName === "My Good Spirit", "idea display name from localization");

  console.log("\n[references]");
  const grantFocus = idx.entities.find(e => e.id === "focus_grant_spirit");
  ok(grantFocus.refs.some(r => r.context === "add_ideas" && r.id === "my_good_spirit"), "focus add_ideas ref extracted");
  const evFocus = idx.entities.find(e => e.id === "focus_calls_event");
  ok(evFocus.refs.some(r => r.context === "country_event" && r.id === "missing.99"), "focus country_event ref extracted");
  ok(evFocus.refs.some(r => r.context === "focus_link" && r.id === "focus_grant_spirit"), "focus prerequisite link extracted");
  ok(evFocus.refs.some(r => r.context === "set_technology" && r.id === "infantry_weapons"), "focus set_technology ref extracted");

  console.log("\n[incoming map]");
  ok(idx.incoming["idea:my_good_spirit"] && idx.incoming["idea:my_good_spirit"].length === 1, "incoming refs for granted spirit");
  ok(!idx.incoming["idea:my_orphan_spirit"], "no incoming refs for orphan spirit");

  console.log("\n[validation]");
  const orphan = idx.problems.find(p => p.rule === "orphan_spirit" && p.entityId === "my_orphan_spirit");
  ok(!!orphan, "orphan spirit flagged (won't appear in game)");
  const goodNotFlagged = !idx.problems.some(p => p.rule === "orphan_spirit" && p.entityId === "my_good_spirit");
  ok(goodNotFlagged, "granted spirit NOT flagged as orphan");
  const brokenEvent = idx.problems.find(p => p.rule === "broken_reference" && p.refId === "missing.99");
  ok(!!brokenEvent, "broken country_event reference flagged");
  ok(orphan.severity === "warning", "orphan is a warning");
  ok(brokenEvent.severity === "error", "broken reference is an error");

  console.log("\n[counts]");
  ok(idx.counts.idea === 2, "counts.idea === 2");
  ok(idx.counts.focus === 2, "counts.focus === 2");
  ok(typeof idx.counts.errors === "number" && idx.counts.errors >= 1, "counts.errors populated");

  // --- now confirm vanilla awareness suppresses a false broken-ref ---
  console.log("\n[vanilla awareness]");
  const fakeVanilla = fs.mkdtempSync(path.join(os.tmpdir(), "nova-vanilla-"));
  write(path.join(fakeVanilla, "common", "technologies", "inf.txt"),
    `technologies = { infantry_weapons = { research_cost = 1 } }`);
  // event still missing in vanilla, but infantry_weapons now exists there
  const { clearVanillaCache } = require("./mod-index.js");
  clearVanillaCache();
  const idx2 = buildModIndex(mod, { vanillaRoot: fakeVanilla });
  const techBroken = idx2.problems.some(p => p.rule === "broken_reference" && p.refId === "infantry_weapons");
  ok(!techBroken, "ref to vanilla tech infantry_weapons NOT flagged broken");
  const eventStillBroken = idx2.problems.some(p => p.rule === "broken_reference" && p.refId === "missing.99");
  ok(eventStillBroken, "still-missing event remains flagged");
  fs.rmSync(fakeVanilla, { recursive: true, force: true });

  // --- history-granted spirit (the game-start fix) is NOT an orphan ---
  console.log("\n[game-start grant via country history]");
  const mod3 = fs.mkdtempSync(path.join(os.tmpdir(), "nova-hist-"));
  write(path.join(mod3, "common", "ideas", "i.txt"),
    `ideas = { country = { granted_at_start = { picture = generic } orphan_too = { picture = generic } } }`);
  // country history grants granted_at_start with the bare `ideas = { ... }` startup form
  write(path.join(mod3, "history", "countries", "GER - Germany.txt"),
    `capital = 64\nideas = {\n  granted_at_start\n}\n`);
  const idx3 = buildModIndex(mod3, {});
  const grantedFlagged = idx3.problems.some(p => p.rule === "orphan_spirit" && p.entityId === "granted_at_start");
  const orphanFlagged = idx3.problems.some(p => p.rule === "orphan_spirit" && p.entityId === "orphan_too");
  ok(!grantedFlagged, "spirit granted in country history is NOT orphan");
  ok(orphanFlagged, "ungranted spirit is still orphan");
  fs.rmSync(mod3, { recursive: true, force: true });

  // --- duplicate IDs and missing localization tests ---
  console.log("\n[duplicate IDs and missing localization]");
  const mod4 = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dup-loc-"));
  try {
    // 1. Focuses: one duplicate ID, one missing localization, one fully localized
    write(path.join(mod4, "common", "national_focus", "f1.txt"), `
focus_tree = {
  id = tree_1
  focus = { id = dup_focus x = 0 y = 0 }
  focus = { id = missing_loc_focus x = 2 y = 0 }
}
`);
    write(path.join(mod4, "common", "national_focus", "f2.txt"), `
focus_tree = {
  id = tree_2
  focus = { id = dup_focus x = 0 y = 0 }
  focus = { id = localized_focus x = 2 y = 0 }
}
`);

    // 2. Ideas: one duplicate ID, one missing localization, one fully localized (and granted so it's not an orphan)
    write(path.join(mod4, "common", "ideas", "i1.txt"), `
ideas = {
  country = {
    dup_idea = { picture = generic }
    missing_loc_idea = { picture = generic }
  }
}
`);
    write(path.join(mod4, "common", "ideas", "i2.txt"), `
ideas = {
  country = {
    dup_idea = { picture = generic }
    localized_idea = { picture = generic }
  }
}
`);

    // 3. Events: one duplicate ID, event doesn't require localization name check
    write(path.join(mod4, "events", "e1.txt"), `
country_event = { id = dup_event }
`);
    write(path.join(mod4, "events", "e2.txt"), `
country_event = { id = dup_event }
`);

    // 4. Decisions: one missing localization, one fully localized
    write(path.join(mod4, "common", "decisions", "d1.txt"), `
cat_1 = {
  missing_loc_decision = {}
  localized_decision = {}
}
`);

    // 5. Localization file
    write(path.join(mod4, "localisation", "english", "loc_l_english.yml"), `﻿l_english:
 localized_focus:0 "Localized Focus"
 localized_idea:0 "Localized Idea"
 localized_decision:0 "Localized Decision"
`);

    // Also grant ideas/focuses to avoid orphan warnings confusing the test counts
    write(path.join(mod4, "history", "countries", "GER - Germany.txt"), `
ideas = {
  dup_idea
  missing_loc_idea
  localized_idea
}
`);

    const idx4 = buildModIndex(mod4, {});

    // Check duplicate ID errors.
    // #duplicate-id-counted-once-per-copy — these asserted `length === 2`, one row per COPY. That was the
    // shipped behaviour and this test pinned it, so the two moved together: a duplicated id is ONE defect
    // and gets ONE row, which names every location and says how many copies there are.
    const dupFocusErrs = idx4.problems.filter(p => p.rule === "duplicate_id" && p.entityId === "dup_focus");
    ok(dupFocusErrs.length === 1, "a duplicated focus id is reported once, not once per copy");
    ok(dupFocusErrs[0].copies === 2, "the row says how many definitions there are");
    ok(dupFocusErrs.every(p => p.severity === "error"), "duplicate focus is error severity");

    const dupIdeaErrs = idx4.problems.filter(p => p.rule === "duplicate_id" && p.entityId === "dup_idea");
    ok(dupIdeaErrs.length === 1, "a duplicated idea id is reported once");

    const dupEventErrs = idx4.problems.filter(p => p.rule === "duplicate_id" && p.entityId === "dup_event");
    ok(dupEventErrs.length === 1, "a duplicated event id is reported once");

    // Check missing localization warnings
    const missFocus = idx4.problems.find(p => p.rule === "missing_localization" && p.entityId === "missing_loc_focus");
    ok(!!missFocus, "missing localization for focus flagged");
    ok(missFocus.severity === "warning", "missing localization is warning severity");

    const missIdea = idx4.problems.find(p => p.rule === "missing_localization" && p.entityId === "missing_loc_idea");
    ok(!!missIdea, "missing localization for idea flagged");

    const missDec = idx4.problems.find(p => p.rule === "missing_localization" && p.entityId === "missing_loc_decision");
    ok(!!missDec, "missing localization for decision flagged");

    // Check localized ones are NOT flagged
    const locFocusFlagged = idx4.problems.some(p => p.rule === "missing_localization" && p.entityId === "localized_focus");
    ok(!locFocusFlagged, "localized focus NOT flagged as missing localization");

    const locIdeaFlagged = idx4.problems.some(p => p.rule === "missing_localization" && p.entityId === "localized_idea");
    ok(!locIdeaFlagged, "localized idea NOT flagged as missing localization");

    const locDecFlagged = idx4.problems.some(p => p.rule === "missing_localization" && p.entityId === "localized_decision");
    ok(!locDecFlagged, "localized decision NOT flagged as missing localization");

  } finally {
    fs.rmSync(mod4, { recursive: true, force: true });
  }

  // --- vanilla localization resolution test ---
  console.log("\n[vanilla localization awareness]");
  const mod5 = fs.mkdtempSync(path.join(os.tmpdir(), "nova-loc-vanilla-mod-"));
  const fakeVanilla5 = fs.mkdtempSync(path.join(os.tmpdir(), "nova-loc-vanilla-van-"));
  try {
    write(path.join(mod5, "common", "national_focus", "f.txt"), `
focus_tree = {
  id = tree_5
  focus = { id = vanilla_localized_focus x = 0 y = 0 }
}
`);
    // Locate it in vanilla instead of the mod
    write(path.join(fakeVanilla5, "localisation", "english", "v_l_english.yml"), `﻿l_english:
 vanilla_localized_focus:0 "Vanilla Localized Focus"
`);

    clearVanillaCache();
    const idx5 = buildModIndex(mod5, { vanillaRoot: fakeVanilla5 });
    const locFlagged = idx5.problems.some(p => p.rule === "missing_localization" && p.entityId === "vanilla_localized_focus");
    ok(!locFlagged, "focus localized in vanilla is NOT flagged as missing localization");
  } finally {
    fs.rmSync(mod5, { recursive: true, force: true });
    fs.rmSync(fakeVanilla5, { recursive: true, force: true });
  }

} finally {
  fs.rmSync(mod, { recursive: true, force: true });
}

console.log(`\n========================================`);
console.log(`  ${passes} passed, ${failures} failed`);
console.log(`========================================`);
process.exit(failures === 0 ? 0 : 1);
