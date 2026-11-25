"use strict";
// Mod Health — consumes GET /api/mod/index and renders validation results.
(function () {
  const $ = (id) => document.getElementById(id);
  let lastProblems = [];
  let lastCounts = {};
  let activeSeverity = "all";
  let searchQuery = "";
  // Cap how many problem cards we put in the DOM at once. A huge mod (e.g. Millennium Dawn) can
  // report ~10k problems; rendering them all — each with a <details> help block + a fix button +
  // the whole problem object serialised into a data- attribute — froze the tab for seconds. We
  // render a page at a time with a "show more" control; the counts/breakdown above still reflect ALL.
  const DEFAULT_RENDER_LIMIT = 300;
  let renderLimit = DEFAULT_RENDER_LIMIT;
  let ruleFilter = null; // when set (via a category chip), show only problems of this rule

  // Each problem's entity belongs to one maker — so the card can deep-link "Open in <Maker>".
  const MAKER_BY_TYPE = {
    focus: ["index.html", "Focus Tree"], focus_tree: ["index.html", "Focus Tree"],
    idea: ["ideas.html", "National Spirits"], character: ["characters.html", "Characters"],
    event: ["events.html", "Event Maker"], decision: ["decisions.html", "Decision Maker"],
    tech: ["research.html", "Research Tree"], equipment: ["research.html", "Research Tree"],
    country: ["country-setup.html", "Country Setup"],
  };
  // Friendly category names for the rules (shared by the score sub-line + the filter chips).
  const RULE_LABEL = {
    broken_reference: "broken references", missing_localization: "missing names",
    loc_missing_bom: "missing file headers", loc_duplicate_key: "duplicate loc keys",
    loc_duplicate_key_across_files: "the same key in two files",
    focus_icon_unresolved: "focus icons that don't exist",
    loc_value_malformed: "unclosed quotes",
    orphan_spirit: "ungranted spirits", duplicate_id: "duplicate ids",
    country_no_flag: "countries without a flag",
    file_unbalanced_braces: "files that will not parse",
    file_unreadable: "files Nova couldn’t open",
    tooltip_key_no_localization: "tooltips with no text",
    division_names_group_undefined: "nameless divisions",
    event_no_options: "soft-lock events", event_no_title: "untitled events",
    event_namespace_undeclared: "undeclared namespaces", event_option_no_name: "unnamed options",
    focus_no_icon: "icon-less focuses", focus_self_reference: "self-referential focuses",
    tech_unknown_folder: "techs without a folder", tech_negative_position: "off-grid techs",
    recruit_character_misplaced: "misplaced recruits",
    dependency_not_found: "a dependency that isn't installed",
  };

  // THE DETERMINISTIC FIX TIER — the one place that says which problems Nova repairs itself.
  //
  // These are the problems with exactly ONE correct answer, so the repair is a derivation rather than a
  // guess: it is free, offline, instant, and it cannot invent. The AI tier stays for everything whose fix
  // needs judgement. Every fix in either tier is backed up first.
  //
  // #deterministic-tier-typed-in-four-places — this membership used to be written out by hand at four
  // separate sites: the per-card button, the "Fix all" banner, the batch runner's own filter, and the
  // confirm-dialog wording. Widening the tier therefore meant finding all four, and missing one degraded
  // silently — the card would offer a blue "Auto-fix" while the batch skipped it, or the banner counted a
  // problem the runner would not touch. One set, four readers.
  //
  // ⚠️ Adding a rule here is a claim that the fix has exactly one correct answer AND that it is a text edit
  // in a file that already exists.
  //
  // EVERY RULE WAS ASSESSED AGAINST THAT TEST, so this is a closed question rather than a standing invite.
  //
  // Counts re-measured 2026-09-04 across 11 roots — the base game plus every installed workshop mod. The
  // mods go through /api/mod/index, which RESOLVES DEPENDENCIES; vanilla goes through buildModIndex
  // directly, because the payload deliberately discards the base game's own problems.
  //
  // ⚠️ Measure them that way or not at all. Calling buildModIndex straight on a mod skips its dependencies,
  // and every inherited reference is then reported broken: "Easybuff — Millennium Dawn" reads as 785
  // broken_reference on its own and 92 problems in total once MD is resolved. A first pass at this table
  // did exactly that and would have written 1475 into the line below, doubling a number that had been
  // right. The VERDICTS have not changed; only the evidence under them, and loc_duplicate_key moved because
  // scanLocalization now reads the localisation folder the way the game does.
  //
  //   IN  missing_localization        7980  write the key the entity displays under
  //   IN  tooltip_key_no_localization  229  the identical repair, for a custom_effect_tooltip's key
  //   IN  loc_duplicate_key           3746  ONLY the byte-identical copies (see the gate below)
  //   IN  loc_value_malformed           60  a value is one line, so the quote has one place to go
  //   IN  loc_missing_bom                3  re-save as UTF-8 with a BOM
  //   IN  event_namespace_undeclared     1  the namespace is DERIVED from the event id — nothing to choose.
  //       Corpus count is 1, so it was previously judged not worth the work. It is in now for a different
  //       reason: it is the first fix in this tier that is NOT a localisation edit. The batch runner used to
  //       reject anything but a .yml outright, which made the tier structurally incapable of repairing a
  //       script file however single-answer the repair was, and this is the safest possible case to open
  //       that path with — prepend one line whose content the author already wrote.
  //
  //   OUT orphan_spirit               6111  needs a country chosen; has its own targeted picker
  //   OUT duplicate_id                3656  which copy survives is the author's call
  //   OUT broken_reference             698  which thing they meant is a judgement
  //   OUT focus_no_icon                 213  needs an icon chosen
  //   OUT dependency_not_found           95  the fix is to install or fix the dependency, not to edit a file
  //   OUT event_option_no_name           54  two answers: name it, or mark the event hidden
  //   OUT file_unbalanced_braces         49  where the brace goes is a guess; the reader already recovers
  //   OUT division_names_group_undefined 15  needs a names list written
  //   OUT country_no_flag                 6  needs an image, not script
  //   OUT event_no_options / no_title   2/1  two answers, same as event_option_no_name
  //   OUT recruit_character_misplaced     2  moving it needs judgement about which history file
  //
  //   OUT focus_self_reference           12  DECLINED DELIBERATELY, and this is the close call. The repair
  //       is single-answer — drop the self-entry — but it comes in two shapes (a sole-entry
  //       `mutually_exclusive = { focus = SELF }` block to remove, and one entry inside a multi-entry
  //       line), and both splice into common/national_focus/*.txt. That file format already has an owner
  //       in the focus tree maker; a second writer for it is the "two writers, one guard" shape this
  //       codebase keeps having to repair. Twelve warnings across every installed mod does not buy that.
  // The value is a precondition: `true` when the rule is always safe, otherwise a test against the problem
  // itself. Some repairs are a derivation only for SOME instances of the rule, and the tier has to be able
  // to say so rather than being all-or-nothing per rule.
  const DETERMINISTIC_FIXES = {
    missing_localization: true,         // write the name key the entity displays under (a row the scan vetoed
                                        // with autoFix: false is not, see isDeterministicFix)
    tooltip_key_no_localization: true,  // same repair, for a custom_effect_tooltip's key
    loc_missing_bom: true,              // re-save the .yml as UTF-8 with a BOM
    // #locdup-fix-is-only-safe-when-the-copies-match — HOI4 keeps the LAST copy, so earlier ones are dead
    // text and removing them cannot change the game. That is a derivation only when the copies say the same
    // thing: 1,027 of the corpus's 2,256 duplicated keys (46%) carry DIFFERENT text, and it is real authored
    // content — a title on one line and a paragraph of description on the other. Which of those survives is
    // the author's call, so only the byte-identical ones are offered here. The server re-derives this from
    // disk before deleting anything; a guard the client supplies is not a guard.
    loc_duplicate_key: (p) => p.allIdentical === true,
    // #unterminated-quote-has-one-repair — a loc value is ONE line, so a missing closing quote has exactly
    // one place to go: the end of it. Only fires now when the value never closes at all (60 in the corpus).
    loc_value_malformed: true,
    // #the-fix-tier-could-only-touch-localisation — the first deterministic fix that is NOT a .yml edit.
    // An event id is `<namespace>.<number>` and HOI4 will not register the event unless its file declares
    // `add_namespace = <namespace>`, so the declaration is DERIVED from the id the author already wrote —
    // there is nothing to choose, which is exactly the test for this tier. The server re-reads the file and
    // adds only the namespaces it is actually missing, after any leading comment block.
    event_namespace_undeclared: true,
  };
  const isDeterministicFix = (p) => {
    // #a-name-the-game-cannot-localise — `autoFix: false` is the scan's veto on ONE problem, and Fix all honours it
    // for every rule, as the card already did. Fix all read only the rule, so it wrote what the card would never
    // offer: RULE 3 marks a missing name whose key the game reads cannot be a localisation key at all, like Rise
    // of Nations' `name = GER_jürgen_wagner` — that key cannot be written, and any other is one the game never
    // reads. Before the scan read such names whole, Fix all wrote 55 cut keys (`GER_j`, `COL_`) into a copy of
    // Rise of Nations.
    if (!p || p.autoFix === false) return false;
    const rule = p && p.rule;
    if (!Object.prototype.hasOwnProperty.call(DETERMINISTIC_FIXES, rule)) return false;
    const gate = DETERMINISTIC_FIXES[rule];
    return gate === true || gate(p);
  };
  // A problem whose repair only ever touches a localisation .yml, never the script file the card names.
  // #confirm-names-the-wrong-file — the dialog must not ask to modify a file that is left byte-identical.
  const LOC_ONLY_FIXES = new Set(["missing_localization", "tooltip_key_no_localization"]);
  // Name the tier in the UI from the rules actually present, rather than repeating a frozen phrase that
  // stops being true the moment the set above changes.
  const describeFixes = (problems) => {
    const names = [...new Set(problems.map((p) => RULE_LABEL[p.rule] || p.rule))];
    if (names.length === 1) return names[0];
    return names.slice(0, -1).join(", ") + " & " + names[names.length - 1];
  };

  function normalizePath(p) {
    return String(p || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  }

  async function initModSelector() {
    const sel = $("modSelector");
    try {
      const data = await fetch("/api/mods/list").then((r) => r.json());
      sel.innerHTML = "";
      if (!data.mods || !data.mods.length) {
        sel.innerHTML = '<option value="">-- No mods found --</option>';
        return;
      }
      let active = localStorage.getItem("activeModPath") || "";
      data.mods.forEach((m) => {
        const opt = document.createElement("option");
        opt.value = m.path;
        opt.textContent = m.name;
        if (active && normalizePath(m.path) === normalizePath(active)) opt.selected = true;
        sel.appendChild(opt);
      });
      // Stored mod missing from THIS list → keep it via a "(not detected)" placeholder (self-heals) rather
      // than silently showing the first mod.
      if (active && !data.mods.some((m) => normalizePath(m.path) === normalizePath(active))) {
        const o = document.createElement("option");
        o.value = active; o.textContent = (active.split(/[\\/]/).filter(Boolean).pop() || active) + " (not detected)";
        sel.insertBefore(o, sel.firstChild); sel.value = active;
      }
      if (!active && data.mods.length) {
        // #modhealth-vanilla-substring — the list entry carries an authoritative `isVanilla` from the
        // server; matching the word against the NAME instead would pick a user's "Vanilla Plus" as the
        // default when nothing is selected yet. Same mistake the crash panel made against the path.
        const vanilla = data.mods.find((m) => m.isVanilla);
        active = (vanilla || data.mods[0]).path;
        localStorage.setItem("activeModPath", active);
        sel.value = active;
      }
      sel.addEventListener("change", () => {
        localStorage.setItem("activeModPath", sel.value);
        scan();
      });
    } catch (e) {
      sel.innerHTML = '<option value="">-- error loading mods --</option>';
    }
  }

  function chip(n, label, cls) {
    return `<div class="mh-chip ${cls || ""}"><div class="n">${n}</div><div class="l">${label}</div></div>`;
  }

  function renderSummary(data) {
    const c = data.counts || {};
    const errs = c.errors || 0;
    const warns = c.warnings || 0;
    const parts = [];
    // `spirit` is the true national-spirit count (idea entities minus characters); fall back to the
    // raw idea count for older index payloads that didn't split them out.
    const spirits = (c.spirit != null) ? c.spirit : (c.idea || 0);
    parts.push(chip(errs, "Errors", errs ? "err" : "ok"));
    parts.push(chip(warns, "Warnings", warns ? "warn" : "ok"));
    parts.push(chip(c.focus || 0, "Focuses"));
    parts.push(chip(spirits, "Spirits"));
    parts.push(chip(c.character || 0, "Characters"));
    parts.push(chip(c.event || 0, "Events"));
    parts.push(chip(c.decision || 0, "Decisions"));
    parts.push(chip(c.tech || 0, "Techs"));
    parts.push(chip(c.country || 0, "Countries"));
    $("summary").innerHTML = parts.join("");
    if (data.isVanilla) {
      $("summary").innerHTML +=
        '<div class="mh-chip" style="border-color:#1f6feb;"><div class="l" style="color:#58a6ff;">Viewing vanilla<br/>(read-only)</div></div>';
    }
  }

  let lastIsVanilla = false;

  // A single at-a-glance health score (0-100) with an SVG ring. Errors are real in-game breaks →
  // weighted heavily; warnings are polish → light and capped, so a big mod with lots of cosmetic
  // warnings isn't unfairly hammered. Purely a friendly summary of the counts already shown — it
  // scans nothing new.
  function renderScore(data) {
    const el = $("mhScore"); if (!el) return;
    if (data.isVanilla) { el.innerHTML = ""; return; }
    const c = data.counts || {};
    const errors = c.errors || 0, warnings = c.warnings || 0;
    const score = Math.max(0, Math.round(100 - Math.min(60, errors * 9) - Math.min(22, warnings * 0.3)));
    let color, grade, headline, sub;
    if (errors > 0) {
      color = "#f85149"; grade = score >= 60 ? "C" : score >= 40 ? "D" : "F"; headline = "Needs attention";
      sub = "<b>" + errors + "</b> error" + (errors === 1 ? "" : "s") + " will break or do nothing in-game — fix these first" +
        (warnings ? ", plus <b>" + warnings + "</b> warning" + (warnings === 1 ? "" : "s") : "") + ".";
    } else if (warnings > 0) {
      color = "#d29922"; grade = score >= 95 ? "A−" : "B"; headline = "Good — a little polish left";
      sub = "<b>" + warnings + "</b> warning" + (warnings === 1 ? "" : "s") + " — these load fine, but won't look or work quite right.";
    } else {
      color = "#2ea043"; grade = "A+"; headline = "Healthy"; sub = "No problems detected — every reference resolves and every spirit is granted.";
    }
    const R = 30, CIRC = 2 * Math.PI * R, off = CIRC * (1 - score / 100);
    el.innerHTML =
      '<div class="mh-score">' +
        '<svg width="74" height="74" viewBox="0 0 74 74" aria-hidden="true">' +
          '<circle cx="37" cy="37" r="' + R + '" fill="none" stroke="#30363d" stroke-width="7"/>' +
          '<circle cx="37" cy="37" r="' + R + '" fill="none" stroke="' + color + '" stroke-width="7" stroke-linecap="round" ' +
            'stroke-dasharray="' + CIRC.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '" transform="rotate(-90 37 37)"/>' +
          '<text x="37" y="35" text-anchor="middle" font-size="20" font-weight="800" fill="' + color + '">' + score + '</text>' +
          '<text x="37" y="50" text-anchor="middle" font-size="10" fill="#8b949e">' + grade + '</text>' +
        '</svg>' +
        '<div class="mh-score-info"><h2 style="color:' + color + '">' + headline + '</h2>' +
          '<p class="mh-score-sub">' + sub + '</p></div>' +
      '</div>';
  }

  // Clickable category chips — turn the problem list into a triage board: each chip filters to one
  // rule (most-frequent first), so a non-coder can tackle "missing names" then "broken references"
  // one bucket at a time instead of scrolling a flat list of thousands.
  function renderCats() {
    const el = $("mhCats"); if (!el) return;
    if (lastIsVanilla || lastProblems.length < 3) { el.style.display = "none"; el.innerHTML = ""; return; }
    const byRule = {}, sev = {};
    lastProblems.forEach((p) => { byRule[p.rule] = (byRule[p.rule] || 0) + 1; if (p.severity === "error") sev[p.rule] = true; });
    const ranked = Object.entries(byRule).sort((a, b) => b[1] - a[1]);
    let html = '<span class="lbl">Tackle by type:</span>' +
      '<button data-rule="" class="' + (ruleFilter ? "" : "active") + '">All <span class="cnt">' + lastProblems.length + '</span></button>';
    html += ranked.map(([r, n]) =>
      '<button data-rule="' + escapeHtml(r) + '" class="' + (ruleFilter === r ? "active " : "") + (sev[r] ? "err-cat" : "") + '">' +
        escapeHtml(RULE_LABEL[r] || r.replace(/_/g, " ")) + ' <span class="cnt">' + n + '</span></button>').join("");
    el.innerHTML = html;
    el.style.display = "flex";
  }

  // Plain-English explanation of each rule — the CONCEPT and how to fix it, beyond the per-instance
  // message. Shown in a collapsible "What does this mean?" so a non-coder understands why something is
  // flagged without reading the wiki. Educational only; never changes what is scanned or flagged.
  const RULE_HELP = {
    duplicate_id: "Every focus, idea, event, decision, and tech needs a unique id. When two share one, HOI4 keeps a single definition and the other silently vanishes or behaves unpredictably. Rename one so each id appears only once.",
    division_names_group_undefined: "A division template names a division_names_group, and HOI4 looks it up in common/units/names_divisions. If nothing defines it, every division built from that template is nameless in game. Define the group, or clear the field so the country’s default division names are used.",
    tooltip_key_no_localization: "custom_effect_tooltip prints the localisation for a key into a tooltip. With no text behind that key the player is shown the raw id instead of a sentence. The effect and its text live in different files, so writing one and forgetting the other is easy — add the key to a localisation file, or drop the tooltip line. One case has no loc key to add: a key spelled with a letter outside ASCII (an accented token, say) can never be a localisation key, so the fix is in the script — point the tooltip at an ASCII key and localise that, or write the text itself in quotes, which the game prints as written.",
    // #help-text-contradicted-its-own-finding — this said a whole file becomes unreadable and everything in
    // it disappears from the makers. That stopped being true when the readers were taught to close an open
    // block at end of file, the way Clausewitz does, and the finding one line below now says the opposite.
    // The two shapes are genuinely different and the help has to say which is which.
    file_unbalanced_braces: "The file's braces don't balance, and the two shapes behave very differently. A MISSING closing brace is the mild one: HOI4 closes an open block at end of file and Nova reads it the same way, so the content is usually still there — but if the brace went missing in the MIDDLE of the file, everything after it gets swallowed into the wrong block and can vanish from the makers or turn up with the wrong parent. A stray extra \"}\" is the bad one: HOI4 cannot recover from it, whatever follows may be dropped, and Nova refuses to save the file while it is in that state so nothing gets damaged. Either way, fix the brace and the file reads normally again. Only files this mod ships are checked.",
    country_no_flag: "A country with no gfx/flags/<TAG>.tga gets a blank placeholder everywhere its flag would appear — country select, diplomacy, unit counters, event popups. Only flagged for countries this mod introduces itself. Country Setup → Flag writes the .tga plus the medium/small sizes and the ideology variants from one image.",
    orphan_spirit: "A national spirit only shows up in-game if something grants it. If no focus reward, event, decision, or the country's game-start setup adds it, it's defined but never used. Grant it (the one-click fix adds it at game start) or delete it.",
    broken_reference: "References must point to something that exists in your mod or the base game. A mistyped or renamed id makes the reward/effect silently do nothing, and the game logs an error. Correct the id to match the real one, or create the thing it points to.",
    missing_localization: "Readable names and descriptions live in localisation .yml files, keyed by id. With no matching key the game shows the raw id (or a blank) instead of a name. Add the loc key — the one-click fix writes a sensible default you can edit. One case has no loc key to add: a key spelled with a letter outside ASCII (an accented name token, say) can never be a localisation key, so the fix is in the script — spell the token in ASCII and localise that, or write the name as a quoted literal.",
    loc_missing_bom: "HOI4 localisation files must begin with a UTF-8 byte-order mark (BOM). Without it the game ignores the entire file, so every name and description in it breaks. The one-click fix re-saves the file with the BOM and changes nothing else — and if the file turns out to be in an older encoding (Windows-1252, UTF-16) it says so instead of guessing, because re-saving it blindly would replace every accented character.",
    loc_duplicate_key: "The same localisation key is defined more than once in one file. HOI4 keeps only the last occurrence, so the earlier copies are dead text — typically an accidental copy-paste that silently overwrote the string you meant. Delete the duplicate lines (or rename them if they were supposed to be different keys).",
    focus_icon_unresolved: "The focus names a sprite that nothing declares — not this mod, its dependencies, or the base game. In game the node draws the default \"?\" placeholder, exactly like a focus with no icon at all. Sprite names are case-sensitive: GFX_goal_generic_Neutrality_focus does not find GFX_goal_generic_neutrality_focus, so check the capitals as well as the spelling. Nova's focus editor substitutes its own placeholder image for a missing sprite, so the node can look right there while the game shows a question mark.",
    loc_duplicate_key_across_files: "The same key is defined with DIFFERENT text in two files of the same language. This is the one HOI4 has no rule for: within a single file it keeps the last line, but between two files the wiki says the winner \"does not seem to have a consistent pattern\" — so which text a player sees is not something you chose, and it can differ between installs. Keep the wording you want in one file and delete it from the other. Nova will not pick for you: that is the author's call, so there is no auto-fix.",
    event_no_options: "A visible event with no options has no button to dismiss it, so the player is soft-locked staring at it. Add at least one option (even a simple “OK”), or make the event hidden if it's meant to fire silently.",
    event_no_title: "An event with no title shows a blank header in-game. Give it a title (a localisation key) so the player knows what's happening.",
    event_namespace_undeclared: "Every event id has the form namespace.number (e.g. germany.3). The namespace must be declared once with “add_namespace = germany” — in this mod, a dependency, or the base game — or HOI4 never registers the event, so it (and anything that tries to fire it) does nothing. Add the missing add_namespace line at the top of the events file.",
    event_option_no_name: "An option with no name renders as a blank, unlabeled button. Name each option so the player can tell what they're choosing.",
    focus_self_reference: "A focus listed as its own prerequisite, mutually-exclusive, or relative position can never be taken and can break the tree's layout. Point it at a different focus, or remove the self-reference.",
    focus_no_icon: "Focuses need an explicit icon — unlike ideas, they don't fall back to a default sprite. Without one the focus shows as a blank placeholder. Set an icon (a GFX_… key) on it.",
    tech_unknown_folder: "This technology is assigned to a research folder that isn't defined, so it won't appear in any research tab. Use an existing folder name, or create the custom folder it expects.",
    tech_negative_position: "A technology at a negative grid position can render off-screen or overlap others in the research tree. Give it a non-negative x/y position.",
    recruit_character_misplaced: "recruit_character only runs in a country's game-start history file. Inside a focus, event, or decision it does nothing. Move the recruit into the country's history setup, or use the appropriate runtime effect.",
  };

  function renderProblems() {
    const box = $("content");
    if (lastIsVanilla) {
      box.innerHTML =
        '<div class="mh-empty" style="border-color:#1f6feb;color:#58a6ff;">You are viewing the <b>vanilla game files</b> (read-only). ' +
        'Health checks run on <b>your mod</b> — pick your mod in the “Active Mod” dropdown above to validate it.<br/><br/>' +
        'The counts above show the full vanilla inventory for reference.</div>';
      return;
    }
    let list = activeSeverity === "all"
      ? lastProblems
      : lastProblems.filter((p) => p.severity === activeSeverity);

    // Free-text filter: match the entity id, message, rule, file, or type. Multiple space-separated
    // terms are AND-ed (e.g. "missing GRE" shows rows matching BOTH terms), so you can narrow a huge
    // mod down fast instead of scrolling thousands of cards.
    const q = searchQuery.trim().toLowerCase();
    const terms = q.split(/\s+/).filter(Boolean);
    if (terms.length) {
      list = list.filter((p) => {
        const hay = [p.entityId, p.message, p.rule, p.file, p.entityType]
          .map((v) => String(v || "").toLowerCase()).join(" ");
        return terms.every((t) => hay.includes(t));
      });
    }

    // Category chip filter (one rule at a time).
    if (ruleFilter) list = list.filter((p) => p.rule === ruleFilter);

    if (!lastProblems.length) {
      box.innerHTML = '<div class="mh-empty">✓ No problems found. Every spirit is granted and all references resolve.</div>';
      return;
    }
    if (!list.length) {
      box.innerHTML = '<div class="mh-empty">No problems match' + (q ? ' “' + escapeHtml(searchQuery.trim()) + '”' : " this filter") + ". 🎉</div>";
      return;
    }
    // errors first, then warnings
    const order = { error: 0, warning: 1 };
    const sorted = [...list].sort((a, b) => (order[a.severity] - order[b.severity]));
    const shown = sorted.slice(0, renderLimit);
    const hiddenCount = sorted.length - shown.length;
    box.innerHTML = shown.map((p) => {
      const icon = p.severity === "error" ? "⛔" : "⚠️";
      const meta = [p.entityType + " · " + p.entityId, p.file].filter(Boolean).join("  —  ");
      
      let fixHtml = "";
      // Orphan spirits get a one-click "grant at game start" fix.
      if (p.rule === "orphan_spirit") {
        fixHtml += '<div class="mh-fix" data-spirit="' + escapeHtml(p.entityId) + '" style="margin-top: 8px;">' +
            '<button class="mh-fixbtn">🛠 Add to a country at game start</button>' +
          "</div>";
      }
      
      // One-click fix on everything fixable EXCEPT orphan spirits — those already have the
      // targeted "grant at game start" button above (the backend would just redirect here).
      // Some rules are repaired DETERMINISTICALLY server-side (no AI, no quota, can't corrupt), so
      // label them plainly instead of "AI Auto-Fix" and skip the AI confirmation.
      // #fix-button-on-a-file-that-isnt-there — country_no_flag's `file` is gfx/flags/<TAG>.tga, a path whose
      // ABSENCE is the entire problem, and it is a binary image an LLM cannot author. The card still got the
      // AI button, so confirm() asked permission to let a model rewrite a .tga that does not exist; the server
      // has no branch for this rule, so it fell through to the generic AI path and died on "File not found in
      // the mod" — or, with no API key, blamed the key, implying it would work once one was added. The
      // problem's own message already names the real fix ("Add one in Country Setup → Flag").
      const NO_AUTOFIX = new Set([
        "orphan_spirit",     // has its own targeted "grant at game start" button above
        "country_no_flag",   // needs an image, not script
        // #fix-button-on-a-file-nova-could-not-open — the same shape as country_no_flag, one step further on.
        // file_unreadable means Nova itself could not READ the file, so handing it to a model is asking it to
        // repair something nobody can open: the fix path reads first and dies exactly where the scan did. And
        // if the read happens to succeed on a retry, the problem was a LOCK rather than the contents, so a
        // model would rewrite a file that was never wrong. The message already names the real fix — close
        // HOI4 and any editor holding it, then scan again — which is the whole argument for not offering one.
        "file_unreadable",
        // The fix is to INSTALL the mod, or to correct its name to one that is installed — neither of which
        // a model can know, because it cannot see what the user has subscribed to. Its `file` is
        // descriptor.mod, which unlike the two above DOES exist, so the generic path would not fail safely:
        // it would edit the descriptor, and the likeliest edit is deleting the dependency line. That
        // silently changes load order and stops Nova resolving the base mod's content at all. The
        // deterministic tier already says as much — "the fix is to install or fix the dependency, not to
        // edit a file".
        "dependency_not_found",
        // ⛔ THE CARD CONTRADICTED ITS OWN EXPLANATION. This rule's help text ends "Nova will not pick for
        // you: that is the author's call, so there is no auto-fix" — and the card offered one anyway. Which
        // of two different wordings survives is exactly the judgement the text says Nova will not make.
        "loc_duplicate_key_across_files",
        // ── Withdrawn 2026-09-07 after auditing all 13 rules that had an AI button. Each was probed with a
        // real fixture and then adversarially refuted; these three failed on the same test as the four
        // above — the repair a model can actually perform DESTROYS information while reporting success.
        //
        // The fix needs a file the AI path never opens. It resolves ONE file from problem.file and writes
        // back to that same path, and the repair is to MOVE the recruit_character into the country's
        // history file. Measured: the prompt is also malformed here — refContext is absent, so the model is
        // told `It references character "X" via undefined.`
        "recruit_character_misplaced",
        // The model is handed ONE file and cannot know which copy of a duplicated id is canonical, and
        // deleting the wrong one loses the author's work. The same-file case is repairable, but it is
        // 17 of 3,656 rows (0.46%) across every installed mod — one of those 17 a scanner false positive —
        // so the button is offered on thousands of problems it can help with in sixteen. The deterministic
        // tier already refused this rule for the same reason: "which copy survives is the author's call".
        "duplicate_id",
        // The subtle one, and the argument that decided it runs OPPOSITE to the obvious reading. A model CAN
        // do this — a focus file shows it hundreds of sibling `icon = GFX_…` lines (median 65 resolving
        // names in context), so it need not invent. That is exactly why it is dangerous: 225 of the 233
        // distinct unresolved names have no match anywhere in mod or vanilla, because they are the author's
        // own not-yet-drawn art (Novum Vexillum's `armor`, `drone`, `university`). The broken name is the
        // ONLY record of what art was intended, and its real repair is a new spriteType plus a .dds — a
        // different file and a binary image. So the likeliest model behaviour is the maximally destructive
        // one: a plausible, resolving, silent substitution that erases the author's intent and deletes the
        // mod's own to-do marker. The other available edit — deleting the icon line — merely converts this
        // into focus_no_icon, which mod-index itself says renders the identical "?" in game: laundering,
        // reported as a fix.
        "focus_icon_unresolved",
      ]);
      // ⭐ THE OTHER HALF OF THE ANSWER, and the reason three rules had to be withdrawn in one night.
      //
      // DETERMINISTIC_FIXES carries a rule-by-rule assessment and says so — "EVERY RULE WAS ASSESSED AGAINST
      // THAT TEST, so this is a closed question rather than a standing invite." NO_AUTOFIX had no such
      // header: it was two entries grown reactively, so every rule nobody had thought about got an AI button
      // by DEFAULT. That is how a button ended up on a missing .tga, on a file Nova could not open, and on a
      // rule whose own help text promised there was no auto-fix.
      //
      // So the three sets are now exhaustive between them, and a test derives the rule list from the
      // scanners and fails if any rule is missing from all three. A new rule cannot get a fix affordance by
      // accident — somebody has to decide.
      //
      // These are the rules where handing the file to a model IS the right offer: the repair is a text edit
      // in a file that already exists, and it needs judgement of a kind a model can actually supply.
      // ⚠️ This set does not GATE anything — NO_AUTOFIX above is what the render path reads. It records the
      // decision, so "nobody has looked at this yet" and "we looked and AI is right" stop being the same
      // state.
      const AI_APPROPRIATE = new Set([
        "broken_reference",              // a mistyped id, where the near-match is a real answer
        "division_names_group_undefined",// a names list is ordinary authored text
        "event_no_options",              // add an option, or mark it hidden
        "event_no_title",                // write the title key
        "event_option_no_name",          // name the option
        "file_unbalanced_braces",        // a guess, but the file is right there and the reader recovers
        "focus_no_icon",                 // same, for a focus with none at all
        "focus_self_reference",          // drop the self-entry; single-answer, kept out of the tier above
        "tech_negative_position",        // an off-grid coordinate
        "tech_unknown_folder",           // point it at a folder that exists
      ]);
      void AI_APPROPRIATE; // documentation + the exhaustiveness test; the render path reads NO_AUTOFIX
      // A rule can be fixable in general and this ONE problem still not be. broken_reference is normally a
      // mistyped id, where offering a model the near-match is reasonable; the same rule also covers "the
      // folder this lived in was unloaded by your own replace_path", whose only repairs are to author the
      // missing content (asking a model to invent a vanilla event into somebody's mod) or to edit the
      // descriptor. The scanner marks those `autoFix: false` rather than making the card re-read its own
      // sentence to work it out. #replace-path
      if (p.file && !NO_AUTOFIX.has(p.rule) && p.autoFix !== false) {
        const deterministic = isDeterministicFix(p);
        const label = p.rule === "loc_missing_bom" ? "🩹 Add the BOM"
          : (deterministic ? "🩹 Auto-fix" : "✨ AI Auto-Fix");
        const bg = deterministic ? "#1f6feb" : "#5d3b8e";
        const border = deterministic ? "#388bfd" : "#8c60ce";
        fixHtml += '<div class="mh-aifix-container" data-problem="' + escapeHtml(JSON.stringify(p)) + '" data-deterministic="' + (deterministic ? "1" : "0") + '" style="margin-top: 8px; display: flex; align-items: center; gap: 8px;">' +
            '<button class="mh-aifixbtn" style="background:' + bg + '; border:1px solid ' + border + '; color:#fff; border-radius:6px; padding:5px 12px; font-size:12px; font-weight:600; cursor:pointer; transition:background 0.15s;">' + label + '</button>' +
            '<span class="mh-aifixstatus" style="font-size:12px; color:#8b949e;"></span>' +
          '</div>';
      } else if (p.locKeyCannotBeWritten) {
        // #a-name-the-game-cannot-localise — where the button would be, say why there is none, so a modder
        // does not read its absence as "Nova forgot".
        fixHtml += '<div class="mh-nofix" style="margin-top: 8px; font-size:12px; color:#8b949e;">' +
            '🚫 No auto-fix: the key the game reads here cannot be a localisation key, and writing any other key would change nothing in game. The repair is in the script, as above.' +
          '</div>';
      }

      const help = RULE_HELP[p.rule];
      const whyHtml = help
        ? '<details class="mh-why"><summary>ⓘ What does this mean?</summary><div class="mh-why-body">' + escapeHtml(help) + "</div></details>"
        : "";

      // Deep-link straight to the maker that owns this entity — no more guessing which tab fixes it.
      const maker = MAKER_BY_TYPE[p.entityType];
      const openHtml = maker
        ? '<a class="mh-open" href="' + maker[0] + '" title="Open the ' + maker[1] + ' to fix “' + escapeHtml(p.entityId || "") + '”">↗ Open in ' + maker[1] + "</a>"
        : "";

      return (
        '<div class="mh-problem ' + p.severity + '">' +
        '<div class="ic">' + icon + "</div>" +
        '<div class="body"><div class="msg">' + escapeHtml(p.message) + "</div>" +
        '<div class="meta">' + escapeHtml(meta) + "</div>" + whyHtml + fixHtml +
        (openHtml ? "<div>" + openHtml + "</div>" : "") + "</div></div>"
      );
    }).join("") +
      (hiddenCount > 0
        ? '<div class="mh-more">Showing <b>' + shown.length + '</b> of <b>' + sorted.length + '</b> problems.' +
            ' <button id="mhShowMore" type="button">Show ' + Math.min(hiddenCount, 500) + ' more</button>' +
            ' <button id="mhShowAll" type="button">Show all (' + sorted.length + ')</button>' +
          "</div>"
        : "");

    // "Show more" / "Show all" — raise the render cap and re-render. Wired here because innerHTML
    // is rebuilt each call. Counts/breakdown above always reflect ALL problems regardless of the cap.
    const moreBtn = $("mhShowMore");
    if (moreBtn) moreBtn.addEventListener("click", () => { renderLimit += 500; renderProblems(); });
    const allBtn = $("mhShowAll");
    if (allBtn) allBtn.addEventListener("click", () => { renderLimit = Infinity; renderProblems(); });

    // "Fix all" batch for the deterministic auto-fixes (missing localisation names / missing file
    // BOM headers). Each is a safe per-file re-save that the server backs up first, so they can run
    // in sequence from one click — a big time-saver on mods with many missing names.
    const autoFixable = lastProblems.filter((p) => p.file && isDeterministicFix(p));
    if (!lastIsVanilla && autoFixable.length >= 2) {
      box.insertAdjacentHTML("afterbegin",
        '<div class="mh-fixall">' +
          '<span>🩹 <b>' + autoFixable.length + '</b> issues can be fixed automatically (' +
            escapeHtml(describeFixes(autoFixable)) + '). Each file is backed up first.</span>' +
          '<button class="mh-fixallbtn" type="button">Fix all ' + autoFixable.length + '</button>' +
        "</div>");
    }

    // (The "by type" triage now lives in the clickable #mhCats chips above the list — see renderCats.)
  }

  // Run every deterministic auto-fix in sequence. Each call re-reads the file fresh and is backed up
  // server-side, so batching is just sequential single-fixes; one rescan at the end shows the result.
  async function fixAllDeterministic(btn) {
    const targets = lastProblems.filter((p) => p.file && isDeterministicFix(p));
    if (!targets.length) return;
    if (!confirm("Auto-fix all " + targets.length + " fixable issues (" + describeFixes(targets) + ")? Each file is backed up first.")) return;
    btn.disabled = true;
    const modPath = localStorage.getItem("activeModPath") || "";

    // #fix-all-floods-the-backup-pool — ONE REQUEST, not one per problem.
    //
    // This loop posted /api/modhealth/fix once per target, and each of those took its own backup and
    // rewrote the whole file. Most problems in a mod resolve to the SAME localisation .yml, so the run
    // rewrote one file hundreds of times: 3,114 backups for 84 files on Rise of Nations, 1,441 for 10 on
    // The Road to 56. The real-mod backup pool is capped at 200, so a single click evicted every genuine
    // backup the user had — under this very button's promise that each file is backed up first.
    //
    // The server now groups by file and takes one backup and one write per file. It also runs in a
    // fraction of the time: 3,114 fixes at ~74ms each was nearly four minutes of continuous rewriting.
    btn.textContent = "🩹 Fixing " + targets.length + " issues…";
    let ok = 0, fail = 0;
    try {
      const res = await fetch("/api/modhealth/fix-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modPath: modPath, problems: targets })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      ok = data.fixed || 0;
      fail = data.failed || 0;
      btn.textContent = "✓ Fixed " + ok + (fail ? " · " + fail + " failed" : "")
        + " in " + (data.filesWritten || 0) + " file" + ((data.filesWritten === 1) ? "" : "s") + " — rescanning…";
    } catch (e) {
      fail = targets.length;
      btn.textContent = "✗ " + (e && e.message ? e.message : "Fix all failed") + " — rescanning…";
    }
    setTimeout(scan, 700);
  }

  // ---- one-click fix: grant an orphan spirit at game start ----
  let countriesPromise = null;
  let countriesModKey = null;
  function loadCountries() {
    // #modhealth-country-list-outlives-the-mod — THIS MEMO USED TO OUTLIVE THE MOD IT WAS FETCHED FOR.
    //
    // The promise was cached at module scope with modPath read only on the FIRST call, and nothing reset
    // it — not the mod selector's change handler, not scan(). Switch mod mid-session and the orphan-spirit
    // fix picker still offered mod A's country tags, while the POST below sends the CURRENT activeModPath.
    // So Nova wrote `<modB>/history/countries/<modA tag> - Custom.txt`, which HOI4 ignores entirely ("is
    // not in the tag list") — and mod-index's grant walk then finds the add_ideas line and reports the
    // orphan spirit as fixed.
    //
    // Key the cache on what it was fetched FOR, the same rule the focus-tree localisation map now follows
    // (#loc-map-follows-open-tree): a cache key that can disagree with the request turns one wrong answer
    // into a permanent one.
    const modPath = localStorage.getItem("activeModPath") || "";
    if (countriesPromise && countriesModKey === modPath) return countriesPromise;
    countriesModKey = modPath;
    const url = "/api/countries/catalog" + (modPath ? "?modPath=" + encodeURIComponent(modPath) : "");
    countriesPromise = fetch(url)
      .then((r) => r.json())
      .then((j) => (Array.isArray(j) ? j : (j.countries || [])))
      .catch(() => []);
    return countriesPromise;
  }

  async function openFixPicker(fixEl) {
    if (fixEl.querySelector(".mh-fixrow")) return; // already open
    const spirit = fixEl.dataset.spirit;
    const countries = await loadCountries();
    const row = document.createElement("div");
    row.className = "mh-fixrow";
    row.style.cssText = "display:flex;gap:6px;align-items:center;margin-top:8px;flex-wrap:wrap;";
    if (!countries.length) {
      row.innerHTML = '<span style="color:#d29922;font-size:12px;">No countries found for this mod. Add a country first, then retry.</span>';
      fixEl.appendChild(row);
      return;
    }
    const opts = countries.map((c) => '<option value="' + c.tag + '">' + escapeHtml(c.tag + " — " + (c.displayName || c.name || c.tag)) + "</option>").join("");
    row.innerHTML =
      '<select class="mh-country" style="background:#0d1117;border:1px solid #30363d;color:#c9d1d9;border-radius:4px;padding:5px 8px;font-size:12px;max-width:260px;">' + opts + "</select>" +
      '<button class="mh-confirm mh-btn" style="padding:5px 12px;">Add</button>' +
      '<button class="mh-cancel mh-btn secondary" style="padding:5px 12px;">Cancel</button>' +
      '<span class="mh-fixstatus" style="font-size:12px;color:#8b949e;"></span>';
    fixEl.appendChild(row);

    row.querySelector(".mh-cancel").addEventListener("click", () => row.remove());
    row.querySelector(".mh-confirm").addEventListener("click", async () => {
      const tag = row.querySelector(".mh-country").value;
      const status = row.querySelector(".mh-fixstatus");
      status.textContent = "Adding…";
      try {
        const res = await fetch("/api/history/set-startup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tag, itemId: spirit, itemType: "spirit", active: true,
            modPath: localStorage.getItem("activeModPath") || "",
          }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || "Save failed");
        // #modhealth-country-list-outlives-the-mod — refWarning is the one diagnostic that says the write
        // is INERT: the server staples it onto the reply when the tag is not a country in this mod, its
        // dependencies or the base game, which means HOI4 ignores the whole file. It was computed,
        // returned and dropped, and the rescan then reported the problem fixed because mod-index's grant
        // walk finds the add_ideas line regardless. The pages that load loading-overlay.js drain this into
        // a modal; modhealth.html does not, so it has to be read here.
        if (typeof data.refWarning === "string" && data.refWarning.trim()) {
          status.style.color = "#f0a44e";
          status.textContent = "⚠ " + data.refWarning.trim();
          return; // no rescan: nothing was actually granted, and a rescan would say otherwise
        }
        status.textContent = "✓ Added to " + tag + ". Rescanning…";
        setTimeout(scan, 400);
      } catch (e) {
        status.style.color = "#f85149";
        status.textContent = "Failed: " + (e.message || e);
      }
    });
  }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  // Plain-text report of the current scan — for pasting into a forum post, bug report, or AI assistant.
  function buildReport() {
    const sel = $("modSelector");
    const modName = sel && sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : "(unknown mod)";
    const lines = ["Nova — Mod Health report", "Mod: " + modName, "Generated: " + new Date().toLocaleString()];
    if (lastIsVanilla) {
      lines.push("", "(Viewing the read-only vanilla game files — health checks only run on a mod.)");
      return lines.join("\n");
    }
    const errs = lastProblems.filter((p) => p.severity === "error");
    const warns = lastProblems.filter((p) => p.severity === "warning");
    lines.push("Errors: " + errs.length + "    Warnings: " + warns.length, "");
    // Mod contents at a glance (matches the overview chips; spirit excludes characters).
    const c = lastCounts || {};
    const spirits = (c.spirit != null) ? c.spirit : (c.idea || 0);
    lines.push("Contents: " + [
      (c.focus || 0) + " focuses", spirits + " spirits", (c.character || 0) + " characters",
      (c.event || 0) + " events", (c.decision || 0) + " decisions", (c.tech || 0) + " techs",
      (c.country || 0) + " countries"
    ].join(", "), "");
    // By-type summary (most frequent first) so a pasted report is triageable at a glance.
    if (lastProblems.length) {
      const byRule = {};
      lastProblems.forEach((p) => { byRule[p.rule] = (byRule[p.rule] || 0) + 1; });
      const parts = Object.entries(byRule).sort((a, b) => b[1] - a[1]).map(([r, n]) => n + " " + r);
      lines.push("By type: " + parts.join(", "), "");
    }
    if (!lastProblems.length) {
      lines.push("✓ Content scan: no problems found. Every spirit is granted and all references resolve.");
    } else {
      // #copy-report-is-too-big-to-paste — A REPORT YOU CANNOT PASTE IS NOT A REPORT.
      //
      // This listed every problem. Measured: Rise of Nations produced 3.05 MB, Road to 56 0.73 MB,
      // Millennium Dawn 0.47 MB. A GitHub issue caps around 65 KB and a Discord message at 2,000
      // characters, so the button people press to ask for help produced something they could not send —
      // and the panel itself renders only the first 300, so the two never agreed anyway.
      //
      // Capped PER RULE rather than per severity, deliberately: five examples of each of eighteen rules
      // diagnoses far more than two hundred instances of duplicate_id. The counts and the by-type summary
      // above are already complete, so nothing needed for triage is lost — and every omission is stated,
      // because a silently truncated report is worse than a big one.
      const PER_RULE = 5;
      const shown = {};
      const omitted = {};
      const fmt = (p, i) => `${i + 1}. [${String(p.severity).toUpperCase()}] (${p.rule})\n   ${p.message}` + (p.file ? `\n   file: ${p.file}` : "");
      const section = (title, list) => {
        if (!list.length) return;
        lines.push("=== " + title + " ===");
        let n = 0;
        list.forEach((p) => {
          shown[p.rule] = (shown[p.rule] || 0) + 1;
          if (shown[p.rule] > PER_RULE) { omitted[p.rule] = (omitted[p.rule] || 0) + 1; return; }
          lines.push(fmt(p, n++));
        });
        const left = Object.entries(omitted).filter(([r]) => list.some((p) => p.rule === r));
        if (left.length) {
          lines.push("", "(showing up to " + PER_RULE + " per type. Not listed: "
            + left.map(([r, n2]) => n2 + " more " + r).join(", ") + " — open Mod Health for the full list.)");
        }
        lines.push("");
      };
      section("ERRORS", errs);
      section("WARNINGS", warns);
    }
    // Map & version "Will it crash?" findings (published by modhealth-crashcheck.js).
    const crash = (typeof window !== "undefined" && window.__mhCrashReport) ? window.__mhCrashReport.items : null;
    if (Array.isArray(crash)) {
      lines.push("", "=== MAP & VERSION (Will it crash?) ===");
      if (!crash.length) lines.push("✓ No map or version problems found.");
      else {
        // Capped the same way, and for the same reason: Old World Blues produces 760 map findings, Novum
        // Vexillum 404, Millennium Dawn 297. Capping only the CONTENT problems above would have left this
        // section free to blow the report past what anyone can paste — which is how a partial fix quietly
        // fails to fix the thing it was for. Grouped by `label`, this section's equivalent of a rule.
        const PER_LABEL = 5;
        const seen = {}, left = {};
        let n = 0;
        crash.forEach((c) => {
          seen[c.label] = (seen[c.label] || 0) + 1;
          if (seen[c.label] > PER_LABEL) { left[c.label] = (left[c.label] || 0) + 1; return; }
          lines.push(`${++n}. [${String(c.sev).toUpperCase()}] ${c.label}\n   ${c.msg}`);
        });
        const rest = Object.entries(left);
        if (rest.length) {
          lines.push("", "(showing up to " + PER_LABEL + " per type. Not listed: "
            + rest.map(([l, k]) => k + " more " + l).join(", ") + " — open Mod Health for the full list.)");
        }
      }
    }
    return lines.join("\n");
  }

  async function copyReport(btn) {
    const report = buildReport();
    const flash = (txt) => { const old = "📋 Copy report"; btn.textContent = txt; setTimeout(() => { btn.textContent = old; }, 1500); };
    try {
      await navigator.clipboard.writeText(report);
      flash("✓ Copied");
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = report; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); flash("✓ Copied"); } catch (_) { flash("Copy failed"); }
      ta.remove();
    }
  }

  async function scan() {
    const modPath = localStorage.getItem("activeModPath") || "";
    $("content").className = "mh-loading";
    $("content").textContent = "Scanning mod…";
    $("summary").innerHTML = "";
    $("mhScore").innerHTML = "";
    $("mhCats").style.display = "none";
    $("filterBar").style.display = "none";
    ruleFilter = null; // a fresh scan clears the category drill-down
    try {
      // fresh=1: Mod Health always does an authoritative rescan (it must reflect fixes the user just
      // applied). The Home dashboard reads the same endpoint WITHOUT fresh, so it gets the fast cached
      // snapshot warmed at startup.
      const url = "/api/mod/index?fresh=1" + (modPath ? "&modPath=" + encodeURIComponent(modPath) : "");
      const res = await fetch(url);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      lastProblems = data.problems || [];
      lastCounts = data.counts || {};
      lastIsVanilla = Boolean(data.isVanilla);
      renderLimit = DEFAULT_RENDER_LIMIT; // a fresh scan starts capped again
      renderSummary(data);
      renderScore(data);
      renderCats();
      $("content").className = "";
      $("filterBar").style.display = (!lastIsVanilla && lastProblems.length) ? "flex" : "none";
      renderProblems();
    } catch (e) {
      $("content").className = "mh-error";
      $("content").textContent = "Could not scan mod: " + (e.message || e);
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    $("rescanBtn").addEventListener("click", scan);
    const copyBtn = $("copyReportBtn");
    if (copyBtn) copyBtn.addEventListener("click", () => copyReport(copyBtn));
    // Delegate clicks.
    $("content").addEventListener("click", async (e) => {
      const fixAllBtn = e.target.closest(".mh-fixallbtn");
      if (fixAllBtn) { await fixAllDeterministic(fixAllBtn); return; }

      const fixbtn = e.target.closest(".mh-fixbtn");
      if (fixbtn) {
        const fixEl = fixbtn.closest(".mh-fix");
        if (fixEl) openFixPicker(fixEl);
        return;
      }

      const aifixbtn = e.target.closest(".mh-aifixbtn");
      if (aifixbtn) {
        const container = aifixbtn.closest(".mh-aifix-container");
        if (!container) return;
        const problem = JSON.parse(container.dataset.problem);
        const status = container.querySelector(".mh-aifixstatus");
        const deterministic = container.dataset.deterministic === "1";

        // Deterministic fixes (add loc key / add BOM) are safe re-saves — no AI, no quota, can't
        // corrupt — so they don't need the "let the AI try" warning, only AI fixes do.
        // #confirm-names-the-wrong-file — this asked to re-save `problem.file`, but for missing_localization
        // that is the ENTITY's script file (the focus tree / ideas / decisions .txt), and the server never
        // opens it: it appends the key to a localisation .yml instead, leaving the named file byte-identical.
        // So the dialog took consent for one file and changed another — and it read as far more invasive than
        // it is, which made cautious modders refuse a safe one-line loc append.
        // #confirm-names-the-wrong-file, again: a dialog must describe what actually changes. The generic
        // deterministic wording is "Re-save …", which is true of the BOM fix and false of this one — this
        // one DELETES lines, and consent to a re-save is not consent to a deletion.
        const confirmMsg = problem.rule === "loc_value_malformed"
          ? `Close the quote at the end of line ${problem.line} in "${problem.file}"? `
            + `The value never closes, so HOI4 stops reading it there — and a localisation value is one line, `
            + `so the end of that line is the only place the quote can go. (A backup is kept.)`
          : problem.rule === "loc_duplicate_key"
          ? `Delete ${(problem.copies || 2) - 1} duplicate line(s) for "${problem.entityId}" from "${problem.file}"? `
            + `Every copy says exactly the same thing and HOI4 already ignores all but the last, so nothing changes in game. (A backup is kept.)`
          : LOC_ONLY_FIXES.has(problem.rule)
          ? `Add the missing text for "${problem.entityId || problem.file}" to this mod's English localisation? `
            + `Only a localisation .yml is touched — "${problem.file}" is not modified. (A backup is kept.)`
          : deterministic
            ? `Re-save "${problem.file}" to fix this automatically? (A backup is kept.)`
            : `Let the AI try to fix this error in "${problem.file}"? (A backup is kept.)`;
        if (!confirm(confirmMsg)) {
          return;
        }

        aifixbtn.disabled = true;
        status.textContent = deterministic ? "Fixing…" : "AI is working on a fix...";
        status.style.color = "#8b949e";

        try {
          const storedKey = localStorage.getItem("gemini_api_key") || localStorage.getItem("geminiApiKey") || "";
          const response = await fetch("/api/modhealth/fix", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              modPath: localStorage.getItem("activeModPath") || "",
              problem,
              apiKey: storedKey
            })
          });

          const data = await response.json();
          if (data.error) throw new Error(data.error);

          status.textContent = "✓ " + (data.summary || "Fix applied!") + " Rescanning...";
          status.style.color = "#2ea043";
          setTimeout(scan, 1200);
        } catch (err) {
          status.textContent = "Failed: " + err.message;
          status.style.color = "#f85149";
          aifixbtn.disabled = false;
        }
      }
    });
    document.querySelectorAll("#filterBar button").forEach((b) => {
      b.addEventListener("click", () => {
        activeSeverity = b.dataset.sev;
        renderLimit = DEFAULT_RENDER_LIMIT; // switching filter resets the cap
        document.querySelectorAll("#filterBar button").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        renderProblems();
      });
    });
    const searchEl = $("mhSearch");
    if (searchEl) {
      let searchDebounce = null;
      searchEl.addEventListener("input", () => {
        searchQuery = searchEl.value;
        renderLimit = DEFAULT_RENDER_LIMIT; // a new query starts from the top of the (smaller) result set
        // Debounce: on a big mod (thousands of problems) re-sorting + rebuilding the DOM on every
        // keystroke is janky. Coalesce rapid typing into one render ~140ms after you stop typing.
        if (searchDebounce) clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => { searchDebounce = null; renderProblems(); }, 140);
      });
      // Escape clears the filter instantly (and cancels any pending debounced render).
      searchEl.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && searchEl.value) {
          searchEl.value = ""; searchQuery = ""; renderLimit = DEFAULT_RENDER_LIMIT;
          if (searchDebounce) { clearTimeout(searchDebounce); searchDebounce = null; }
          renderProblems();
        }
      });
    }
    // Category chips: click one to drill the list down to that single rule (or "All" to clear).
    const catsEl = $("mhCats");
    if (catsEl) catsEl.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-rule]");
      if (!btn) return;
      ruleFilter = btn.dataset.rule || null;
      renderLimit = DEFAULT_RENDER_LIMIT;
      renderCats();      // refresh the active-chip highlight
      renderProblems();  // apply the filter
    });

    await initModSelector();
    scan();
  });
})();
