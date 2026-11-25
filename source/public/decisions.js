document.addEventListener("DOMContentLoaded", () => {
  // Exact inverse of the server's escapeLocalizationValue (loc stores a line break as the two-char "\n",
  // a quote as \" and a backslash as \\). Loading the RAW loc form into the editor and re-saving would
  // re-escape the backslashes (\n -> \\n -> ...), corrupting the text a little more on EVERY save — the
  // live-e2e class found in the Event Maker; every maker that loads loc-backed text applies this on load.
  function unescapeLocForEdit(value) {
    const s = String(value || "");
    let out = "";
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c !== "\\" || i === s.length - 1) { out += c; continue; }
      const n = s[i + 1];
      if (n === "\\") { out += "\\"; i++; }
      else if (n === "n") { out += "\n"; i++; }
      else if (n === "r") { out += "\r"; i++; }
      else if (n === "t") { out += "\t"; i++; }
      else if (n === '"') { out += '"'; i++; }
      else out += c;
    }
    return out;
  }

  // Image fallback (CSP-safe): inline image error handlers are blocked by the page CSP (script-src 'self'),
  // so a thumbnail/preview whose image is missing would just show the browser's broken-image glyph. Images
  // are marked with data-fallback="…" and swapped here via one capture-phase error listener (the error event
  // doesn't bubble, so capture is required). Guarded so a failing fallback can't loop.
  document.addEventListener("error", (e) => {
    const t = e.target;
    if (t && t.tagName === "IMG" && t.dataset && t.dataset.fallback && t.src.indexOf(t.dataset.fallback) < 0) t.src = t.dataset.fallback;
  }, true);

  const decisionPictureUpload = document.getElementById("decisionPictureUpload");
  const decisionPictureId = document.getElementById("decisionPictureId");
  const uploadStatus = document.getElementById("uploadStatus");
  const decisionPicturePreview = document.getElementById("decisionPicturePreview");

  // Retrieve active mod path from localStorage
  function getModPath() {
    return localStorage.getItem("activeModPath") || "";
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function makeReadableDecisionName(id) {
    return String(id || "new_decision")
      .replace(/_/g, " ")
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  function cleanScriptId(value, fallback) {
    let cleaned = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "");
    // PDX tokens must start with a letter or underscore — HOI4 lexes a leading digit as a number and the
    // block key fails to parse (a year-prefixed id like "2024_budget" would corrupt the decisions file).
    // Prefix an underscore so an AI-suggested or typed digit-leading id stays a valid identifier.
    if (/^[0-9]/.test(cleaned)) cleaned = "_" + cleaned;
    return cleaned || fallback;
  }

  function normalizePath(p) {
    return String(p || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  }

  function getEffectiveCountryTag() {
    const lastPath = localStorage.getItem("lastLoadedFocusFilePath") || "";
    const base = lastPath.split(/[/\\]/).pop() || "";
    const m = base.match(/^([A-Z0-9]{3})[_\-]/i);
    if (m) return m[1].toUpperCase();
    const lower = base.toLowerCase();
    if (lower.startsWith("afghanistan")) return "AFG";
    if (lower.startsWith("albania")) return "ALB";
    if (lower.startsWith("austria")) return "AUT";
    if (lower.startsWith("france")) return "FRA";
    if (lower.startsWith("germany")) return "GER";
    if (lower.startsWith("italy")) return "ITA";
    if (lower.startsWith("japan")) return "JAP";
    if (lower.startsWith("soviet_union")) return "SOV";
    if (lower.startsWith("united_kingdom")) return "ENG";
    if (lower.startsWith("usa")) return "USA";
    return "ZZZ";
  }

  // Multi-country "activate this decision at game start for…" bridge (shared owner-chip component).
  let decisionBridge = null;
  function updateStartupCheckbox() {
    if (!decisionBridge) return;
    const itemId = (document.getElementById("decisionId").value || "").trim();
    if (!itemId || itemId.startsWith("new_decision")) decisionBridge.clear();
    else decisionBridge.load(itemId);
  }

  // Advanced Settings opt-in: does the server currently allow writing into the real vanilla HOI4 install?
  // Off on every fresh launch. When vanilla is active and this is false, the write endpoints reject AFTER
  // the round-trip (a raw error toast), so grey out the write controls up-front instead. #vanilla-ro
  let vanillaEditsAllowed = false;
  const DEC_WRITE_BTN_IDS = ["saveDecisionBtn", "duplicateDecisionBtn", "deleteDecisionBtn", "decisionPictureUploadBtn"];
  function setWriteControlsLocked(locked) {
    const why = "Vanilla is read-only. Select or create a mod (or enable “Allow editing vanilla game files” in Settings) to edit.";
    DEC_WRITE_BTN_IDS.forEach((id) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      if (locked) {
        if (!btn.disabled) {
          if (btn.dataset.origTitle === undefined) btn.dataset.origTitle = btn.getAttribute("title") || "";
          btn.disabled = true; btn.dataset.vanillaLocked = "1"; btn.title = why;
        }
      } else if (btn.dataset.vanillaLocked === "1") {
        btn.disabled = false; delete btn.dataset.vanillaLocked; btn.title = btn.dataset.origTitle || "";
      }
    });
  }
  function updateVanillaBanner() {
    const banner = document.getElementById("vanillaBanner");
    if (!banner) return;
    const sel = document.getElementById("headerModSelector") || document.getElementById("modSelector");
    if (!sel) return;
    const selectedText = sel.options[sel.selectedIndex]?.text || "";
    // #vanilla-by-name — the flag set on the option, never the option's TEXT. A mod called
    // "Vanilla Plus" was locked read-only: its write controls were disabled and its banner shown.
    const isVanilla = !!(sel.options[sel.selectedIndex] && sel.options[sel.selectedIndex].dataset.vanilla === "1");
    banner.style.display = isVanilla ? "" : "none";
    setWriteControlsLocked(isVanilla && !vanillaEditsAllowed);
  }

  // Initialize Active Mod Selector
  async function initModSelector(onChangedCallback) {
    const selector = document.getElementById("headerModSelector");
    if (!selector) return;
    try {
      // Learn whether vanilla writes are permitted (advanced Settings) before the banner/lock first runs.
      try {
        const s = await fetch("/api/settings/allow-vanilla-edits").then((r) => r.json());
        vanillaEditsAllowed = Boolean(s && s.allowed);
      } catch (_) { vanillaEditsAllowed = false; }
      const response = await fetch("/api/mods/list");
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      
      selector.innerHTML = "";
      if (!data.mods || data.mods.length === 0) {
        selector.innerHTML = `<option value="">-- No Mods Found --</option>`;
        return;
      }
      
      let active = localStorage.getItem("activeModPath") || "";
      if (!active) {
        const lastPath = localStorage.getItem("lastLoadedFocusFilePath") || "";
        const match = lastPath.match(/(.*)[\\/]common[\\/]national_focus/i);
        if (match) {
          active = match[1];
          localStorage.setItem("activeModPath", active);
        }
      }
      
      data.mods.forEach(mod => {
        const opt = document.createElement("option");
        opt.value = mod.path;
        opt.textContent = mod.name;
        // #vanilla-by-name — the server publishes a PATH-based `isVanilla`, and its own comment says to
        // key off that and NOT a "vanilla" substring in the name, which false-positives on real mods
        // like "Vanilla Plus". The path check is only a fallback for an older server.
        if (mod.isVanilla === true
          || (mod.isVanilla === undefined && normalizePath(mod.path).includes('steamapps/common/hearts of iron iv'))) {
          opt.dataset.vanilla = '1';
        }
        if (active && normalizePath(mod.path) === normalizePath(active)) {
          opt.selected = true;
          active = mod.path;
          localStorage.setItem("activeModPath", active);
        }
        selector.appendChild(opt);
      });

      // A stored mod missing from THIS list is usually a TRANSIENT enumeration miss (Steam re-validating a
      // workshop item, the library drive not mounted yet, a swallowed getWorkshopModDirs error → 200 without
      // the mod). Do NOT blank + persist the fallback (index 0 = the prepended vanilla entry) over a non-empty
      // selection — that turns every custom sprite into the beige placeholder and STICKS across reloads. Keep
      // the stored value (it self-heals when the mod reappears) and show it as a "(not detected)" placeholder
      // so the selector isn't blank. Only adopt+persist a default when nothing was stored.
      if (active && !data.mods.some(m => normalizePath(m.path) === normalizePath(active))) {
        const opt = document.createElement("option");
        opt.value = active;
        opt.textContent = (String(active).split(/[\\/]/).filter(Boolean).pop() || active) + " (not detected)";
        selector.insertBefore(opt, selector.firstChild);
      }
      if (!active && data.mods.length > 0) {
        active = data.mods[0].path;
        localStorage.setItem("activeModPath", active);
      }
      selector.value = active;
      updateVanillaBanner();
      
      selector.addEventListener("change", (e) => {
        const selected = e.target.value;
        localStorage.setItem("activeModPath", selected);
        localStorage.setItem("lastLoadedFocusFilePath", selected + "/common/national_focus/mod.txt");
        updateVanillaBanner();
        if (typeof window.loadGenesisScriptedDefs === "function") window.loadGenesisScriptedDefs();
        if (typeof onChangedCallback === "function") onChangedCallback();
      });
    } catch (err) {
      console.error("Failed to initialize mod selector:", err);
    }
  }

  let allCategories = [];

  // ── Unsaved-changes guard ────────────────────────────────────────────────────────────────────────────
  // There was none: editing the Effect and the Name and then clicking another decision in the list threw the
  // work away with no prompt, and so did reloading the page. Snapshot the editable fields whenever a
  // decision is loaded or saved, and compare before anything replaces them.
  // ⭐ DERIVE THE FIELD SET FROM THE PAGE. NEVER HOLD A LIST OF IT. #decision-guard-list-goes-stale
  //
  // This was a hand-written array of 38 ids and the editor had grown to 42 fields. The ones it did not know
  // about were invisible to the guard: type in one, click another decision, and the work went with no
  // prompt, because "is it dirty?" was answered by reading fields that had not changed.
  //
  //   · decisionCategoryIcon  — the category's tab art, sent as `categoryIcon` on every save
  //   · decisionCountryLock   — baked into the Allowed block as `tag = X`, and the reason
  //                             test-decision-country-lock.js exists
  //   · decisionVisibleToggle — the one harmless omission: ticking it writes into decisionVisible, which the
  //                             list did contain, so the change was still noticed second-hand
  //
  // This file already carries a SECOND hand-written list of the same fields (the one clearNewDecisionForm
  // clears) and the two disagree — that one has decisionCategoryIcon and this one did not. Its own comment
  // records being bitten by exactly that omission once already
  // (#category-icon-retargets-another-category). A list that must be updated by hand every time a field is
  // added will be missed again, so this asks the DOM instead: every id-bearing control in the editor panel.
  //
  // Scoped to .decision-editor-panel, which is exactly the editor — the decision-list search box and the
  // icon-picker modal's search box both sit outside it, so neither can mark the form dirty by being typed
  // in. Only elements with an id are read: those are the deliberate, stable ones, and picking up anonymous
  // controls that a re-render replaces would raise a prompt when nothing had actually changed.
  const DEC_EDITOR_SELECTOR = ".decision-editor-panel";
  // In the panel, but not part of the decision: the AI prompt box is an instruction to the generator, never
  // written to the mod, and treating it as unsaved work would prompt after every generated decision.
  const DEC_UNTRACKED_IDS = new Set(["aiDecisionPrompt"]);
  const decEditorSnapshot = () => {
    const root = document.querySelector(DEC_EDITOR_SELECTOR);
    if (!root) return "";
    const parts = [];
    for (const el of root.querySelectorAll("input, textarea, select")) {
      if (!el.id || DEC_UNTRACKED_IDS.has(el.id)) continue;
      const type = String(el.type || "").toLowerCase();
      if (type === "button" || type === "submit" || type === "reset" || type === "file") continue;
      // A checkbox's .value does not change when you tick it, so reading .value would leave every checkbox
      // in this panel permanently clean — a field can be in the list and still not be watched.
      parts.push(el.id + "=" + (type === "checkbox" || type === "radio" ? (el.checked ? "1" : "0") : el.value));
    }
    // #owner-chips-are-unsaved-work — the "activate at game start for…" chips are spans over a JS Set, so
    // the loop above cannot see them: five staged countries left the editor looking untouched, and a click in
    // the decision list discarded them without asking. Sorted, so the order they were added in is not
    // mistaken for a change.
    // The guard goes INSIDE the try. Reading an identifier that is not defined yet — or not defined at
    // all, which is what a stand-in document in a test gives you — throws a ReferenceError before `if`
    // gets to decide anything, and a dirty check must never be the thing that breaks.
    try { if (decisionBridge) parts.push("\u0002owners=" + [...decisionBridge.owners()].sort().join(",")); } catch (_e) {}
    return parts.join("\u0001"); // same separator as before, written as an escape rather than a raw byte
  };
  let decCleanSnapshot = null; // null = nothing loaded yet, so nothing to lose
  const markDecisionEditorClean = () => { decCleanSnapshot = decEditorSnapshot(); };
  const decisionEditorIsDirty = () => decCleanSnapshot !== null && decEditorSnapshot() !== decCleanSnapshot;
  /** Run `proceed` unless there are unsaved edits the user wants to keep. */
  const confirmDiscardDecisionEdits = (proceed) => {
    if (!decisionEditorIsDirty()) { proceed(); return; }
    const who = (document.getElementById("decisionId") || {}).value || "this decision";
    const ask = window.novaConfirm;
    if (typeof ask !== "function") { proceed(); return; } // never block on a missing dialog
    ask(`You have unsaved changes to "${who}". Discard them?`,
      () => { decCleanSnapshot = null; proceed(); },
      { title: "Unsaved changes", yesLabel: "Discard", danger: true });
  };
  // #suite-nav-discards-unsaved-work — this used to register `beforeunload` directly, with no Electron gate.
  // Electron shows no "Leave site?" prompt; it just CANCELS the navigation. So in the desktop app a nav click
  // here did nothing at all — no dialog, no move — and since this page never published
  // window.__focusEditorHasUnsavedChanges, main.js's quit handler was told there was nothing to save, set
  // allowWindowClose and called close(), which this handler then cancelled: the app could not be quit.
  //
  // The shared guard in loading-overlay.js owns all three halves — the nav-link click (the path that works
  // under Electron), the browser-only beforeunload, and the exit hook.
  if (typeof window.novaGuardSuiteNav === "function") {
    // onSave drives this page's own Save button, so Electron's quit dialog can honour its DEFAULT choice.
    // Without it the guard answered "yes, unsaved" and offered no way to save, so Save reported a spurious
    // failure and the window would not close. #suite-nav-discards-unsaved-work
    window.novaGuardSuiteNav(decisionEditorIsDirty, "the Decisions maker", {
      onSave: () => { const b = document.getElementById("saveDecisionBtn"); if (b) b.click(); },
    });
  }

  // The identity the currently-loaded decision was SAVED under. The id and category boxes are plain
  // editable inputs, so retyping either is how a user renames or re-files a decision — but without telling
  // the server what it used to be, the save simply added a second decision and left the original live
  // in-game (load-order roulette, plus orphaned localisation). null while composing something new.
  let loadedIdentity = null;

  // Which decisions FILE does this decision already live in?
  //
  // A category id is not a filename: ~100% of real decisions sit in a file named after a country or a
  // theme (AFG.txt, 02_pmc_decisions.txt), and one category is often split across many files. The
  // sidebar has always shown the real filename beside each folder; it just never told the server. Without
  // this hint the server had to guess <categoryId>.txt, so editing a real decision wrote a stripped-down
  // duplicate into a new file and deleting one silently missed. Server-side #decision-home-file searches
  // for the decision anyway, so an empty or stale answer here is safe — this only makes it exact.
  function homeFileFor(categoryId, decisionId) {
    const cats = allCategories || [];
    const withDecision = cats.find((c) => c && c.id === categoryId && c.fileName &&
      (c.decisions || []).some((d) => d && d.id === decisionId));
    if (withDecision) return withDecision.fileName;
    // New decision in an existing category → the file that category already lives in.
    const byCategory = cats.find((c) => c && c.id === categoryId && c.fileName);
    return byCategory ? byCategory.fileName : "";
  }
  let activeDraft = null;

  const expandedCategories = new Set();
  let autoSelectId = null;

  function getKnownDecisionCategories() {
    const ids = new Set(["custom_decisions"]);
    allCategories.forEach(cat => {
      if (cat.id && cat.id !== "Drafts") ids.add(cat.id);
    });
    return Array.from(ids).sort((a, b) => {
      if (a === "custom_decisions") return -1;
      if (b === "custom_decisions") return 1;
      return a.localeCompare(b);
    });
  }

  function populateDecisionCategoryOptions(selected = "custom_decisions") {
    const select = document.getElementById("decisionCategory");
    if (!select) return;
    const current = selected || select.value || "custom_decisions";
    const ids = getKnownDecisionCategories();
    if (current && !ids.includes(current) && current !== "__create_new__") ids.push(current);
    select.innerHTML = "";
    ids.forEach(id => {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = id;
      select.appendChild(opt);
    });
    
    // Add "+ Create New Category..." option
    const newOpt = document.createElement("option");
    newOpt.value = "__create_new__";
    newOpt.textContent = "➕ Create New Category...";
    newOpt.style.color = "#10b981";
    select.appendChild(newOpt);
    
    select.value = current;
  }

  function setDecisionCategory(value) {
    populateDecisionCategoryOptions(value || "custom_decisions");
  }

  function syncVisibleToggleFromValue() {
    const hidden = document.getElementById("decisionVisible");
    const toggle = document.getElementById("decisionVisibleToggle");
    const hint = document.getElementById("decisionVisibleHint");
    if (!hidden || !toggle) return;
    const val = hidden.value.trim();
    const isHidden = /^always\s*=\s*no$/i.test(val);
    toggle.checked = !isHidden;
    if (hint) hint.textContent = toggle.checked ? "Visible in the decision list" : "Hidden from the decision list";
  }

  // The `visible` block the loaded decision actually had. Rich visible blocks are the norm in real content,
  // and the toggle used to overwrite whatever was there with "" or "always = no" — so toggling off and back
  // on (a change of mind) destroyed the authored block outright, with no sign in the UI that one existed.
  let loadedVisibleBody = "";

  function syncVisibleValueFromToggle() {
    const hidden = document.getElementById("decisionVisible");
    const toggle = document.getElementById("decisionVisibleToggle");
    const hint = document.getElementById("decisionVisibleHint");
    if (!hidden || !toggle) return;
    // Turning it back on restores the author's own conditions rather than clearing them.
    hidden.value = toggle.checked ? loadedVisibleBody : "always = no";
    if (hint) {
      hint.textContent = toggle.checked
        ? (loadedVisibleBody ? "Visible when its own conditions are met (kept as written)" : "Visible in the decision list")
        : "Hidden from the decision list";
    }
  }

  function renderDecisionsList(categories, filterText = "") {
    const decisionsList = document.getElementById("decisionsList");
    if (!decisionsList) return;
    decisionsList.innerHTML = "";

    const renderCategories = [...categories];

    if (activeDraft) {
      let draftCat = renderCategories.find(c => c.id === "Drafts");
      if (!draftCat) {
        draftCat = {
          id: "Drafts",
          fileName: "Drafts",
          decisions: []
        };
        renderCategories.unshift(draftCat);
      }
      draftCat.decisions = [{
        id: activeDraft.id,
        isDraft: true,
        name: activeDraft.name,
        cost: activeDraft.cost,
        icon: activeDraft.icon,
        days: activeDraft.days,
        fireOnce: activeDraft.fireOnce,
        available: activeDraft.available,
        modifier: activeDraft.modifier,
        effect: activeDraft.effect
      }];
    }

    if (renderCategories.length === 0) {
      decisionsList.innerHTML = `<div style="padding: 12px; color: #8b949e; font-size: 12px; text-align: center;">No decisions found in mod folder. Click "+ Create New Decision" to start fresh!</div>`;
      return;
    }

    let anyMatched = false;
    renderCategories.forEach(cat => {
      const isDraftFolder = cat.id === "Drafts";
      let matchedDecisions = cat.decisions || [];

      if (filterText) {
        // Match the name the user can actually SEE as well as the id, and the category too. Searching only
        // the id meant typing "golden" found nothing for a decision displayed as "§YGolden§! Plan", and a
        // category name was never searchable at all. §colour codes and [tokens] are stripped so the text
        // being matched is the text on screen.
        const catHit = cat.id.toLowerCase().includes(filterText);
        matchedDecisions = matchedDecisions.filter((dec) => {
          if (dec.id.toLowerCase().includes(filterText)) return true;
          if (catHit) return true;
          const shown = stripLocDisplayCodes(dec.name || "").toLowerCase();
          return !!shown && shown.includes(filterText);
        });
        if (matchedDecisions.length === 0) return;
      }
      anyMatched = true;

      const catDiv = document.createElement("div");
      catDiv.className = "category-container";

      const fileTitle = document.createElement("div");
      const hasAutoSelect = autoSelectId && matchedDecisions.some(dec => dec.id === autoSelectId);
      const isExpanded = !!filterText || isDraftFolder || expandedCategories.has(cat.id) || hasAutoSelect;
      fileTitle.className = "category-title" + (isExpanded ? " expanded" : "");
      const fileNameSuffix = (cat.fileName && !isDraftFolder) ? ` <span style="font-size: 11px; color: rgba(255,255,255,0.45); font-weight: normal; margin-left: 4px;">(${cat.fileName})</span>` : "";
      // A CATEGORY NOTHING DEFINES TAKES ITS DECISIONS DOWN WITH IT (#decision-category-undefined). The
      // server now answers whether the game will load this category at all — from the mod, a dependency or
      // vanilla. Undefined means every decision inside it is invisible in game, which is exactly what the
      // user hit with vrf51_cat. `categoryDefined === false` only, so an older server that does not send
      // the field never draws a warning it cannot substantiate.
      const undefinedCat = !isDraftFolder && cat.categoryDefined === false;
      // …and the way out is now a BUTTON, not a sentence in a tooltip. The old copy told the user to "save any
      // decision in it" — a correct instruction the user had to carry out by hand to fix something Nova can
      // fix itself. Same server helper either way.
      const undefinedBadge = undefinedCat
        ? ` <span title="Nothing defines the decision_category &quot;${cat.id}&quot; — not this mod, not a dependency, not the base game. HOI4 will not load this category, so none of its decisions appear in game." style="font-size:11px; color:#f0883e; font-weight:600; margin-left:6px;">⚠ category not defined</span>` +
          ` <button type="button" class="cat-define-btn" data-cat="${cat.id}" title="Write the decision_category definition for &quot;${cat.id}&quot; into this mod, so HOI4 loads it and its decisions appear in game." style="font-size:11px; padding:1px 7px; margin-left:5px; background:#f0883e20; border:1px solid #f0883e60; color:#f0883e; border-radius:4px; cursor:pointer; font-weight:600;">Define it</button>`
        : "";
      fileTitle.innerHTML = `
        <svg class="folder-chevron-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
        <svg class="folder-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
        <span class="folder-name-text">${cat.id}${fileNameSuffix}</span>${undefinedBadge}
        <span class="folder-count-badge">${matchedDecisions.length}</span>
      `;
      catDiv.appendChild(fileTitle);

      const itemsContainer = document.createElement("div");
      itemsContainer.className = "category-items";
      itemsContainer.style.display = isExpanded ? "block" : "none";
      catDiv.appendChild(itemsContainer);

      let rendered = false;
      const doRenderItems = () => {
        if (rendered) return;
        rendered = true;
        itemsContainer.innerHTML = "";

        matchedDecisions.forEach(dec => {
          const item = document.createElement("div");
          item.className = "decision-item" + (dec.isDraft ? " draft" : "");
          // #pickers-show-raw-tokens — draw the NAME the server already resolved, with the id beneath it.
          // This printed nothing but `dec.id` while `dec.name` sat on the same object: 3,839 of vanilla's
          // 4,125 decisions and 4,581 of Millennium Dawn's 4,651 have one. The list's own search already
          // filtered on that name ("Match the name the user can actually SEE"), so you could search for a
          // name the list never showed you. Same two-line shape as the Events and Characters cards, which
          // this card already shares a CSS rule with.
          const decName = stripLocDisplayCodes(dec.name || "");
          if (decName && decName !== dec.id) {
            const t = document.createElement("div");
            t.className = "t";
            t.textContent = decName;
            const f = document.createElement("div");
            f.className = "f";
            f.textContent = dec.id;
            item.appendChild(t);
            item.appendChild(f);
            item.title = `${decName}\n${dec.id}`;
          } else {
            // No localisation, or a name that strips to nothing (a pure [scope] token): the id is all there
            // is, and it is better than an empty row.
            item.textContent = dec.id;
          }

          if (dec.isDraft) {
            item.id = "draft-item-decision";
          }
          if (dec.id === document.getElementById("decisionId")?.value) {
            item.classList.add("active");
          }

          item.addEventListener("click", (ev) => {
            // Don't throw away unsaved edits without asking. Once discarded, the re-dispatched click runs
            // through cleanly because the snapshot has been cleared.
            if (decisionEditorIsDirty()) {
              if (ev) ev.preventDefault();
              confirmDiscardDecisionEdits(() => item.click());
              return;
            }
            document.querySelectorAll(".decision-item").forEach(el => el.classList.remove("active"));
            item.classList.add("active");

            setDecisionCategory(isDraftFolder ? "custom_decisions" : cat.id);
            // #category-icon-retargets-another-category — this box is written only by the icon picker and
            // read only by Save, and nothing ever reset it: not this handler (which repopulates ~30 other
            // fields), not New, not Duplicate, not the mod switch. So picking a category icon for one
            // decision and later saving a decision in a DIFFERENT category rewrote that other category's
            // `icon =` line to the first one's sprite, silently. Selecting a decision means "show me THIS
            // decision", so the box starts empty like every other field.
            { const ci = document.getElementById("decisionCategoryIcon"); if (ci) ci.value = ""; }
            document.getElementById("decisionId").value = dec.id;
            // Remember what it's saved as, so renaming it moves it instead of cloning it. An unsaved draft
            // has no on-disk identity to move.
            loadedIdentity = (isDraftFolder || dec.isDraft) ? null : { id: dec.id, categoryId: cat.id };
            const nameInput = document.getElementById("decisionName");
            if (nameInput) nameInput.value = unescapeLocForEdit(dec.name || makeReadableDecisionName(dec.id));
            // A decision with no `cost` line costs 0 PP in-game — show 0, not a blank box. (Missions
            // hide the cost field entirely, handled by updateDecisionTypeLabels.)
            document.getElementById("decisionCost").value = (dec.cost !== "" && dec.cost != null) ? dec.cost : "0";
            document.getElementById("decisionPictureId").value = dec.icon || "";
            updateIconPreview(dec.icon || "");
            document.getElementById("decisionDays").value = dec.days || "0";
            document.getElementById("decisionFireOnce").value = dec.fireOnce === "yes" ? "yes" : "no";
            document.getElementById("decisionAvailable").value = dec.available || "";
            document.getElementById("decisionModifier").value = dec.modifier || "";
            document.getElementById("decisionEffect").value = dec.effect || "";
            document.getElementById("decisionType").value = dec.decisionType || "normal";
            document.getElementById("decisionScope").value = dec.scope || "country";
            document.getElementById("decisionCooldown").value = dec.cooldown || "0";
            document.getElementById("decisionTargetTrigger").value = dec.targetTrigger || "";
            document.getElementById("decisionRemoveEffect").value = dec.removeEffect || "";
            if (document.getElementById("decisionActivation")) document.getElementById("decisionActivation").value = dec.activation || "";
            if (document.getElementById("decisionCancelTrigger")) document.getElementById("decisionCancelTrigger").value = dec.cancelTrigger || "";
            if (document.getElementById("decisionIsGood")) document.getElementById("decisionIsGood").value = dec.isGood === "yes" ? "yes" : "no";
            if (document.getElementById("decisionSelectableMission")) document.getElementById("decisionSelectableMission").value = dec.selectableMission === "yes" ? "yes" : "no";
            if (document.getElementById("decisionVisible")) document.getElementById("decisionVisible").value = dec.visible || "";
            // Remember it, so the Show-Decision toggle can put it back instead of wiping it.
            loadedVisibleBody = /^\s*always\s*=\s*no\s*$/.test(dec.visible || "") ? "" : (dec.visible || "");
            if (document.getElementById("decisionAllowed")) {
              const _cl = extractCountryLock(dec.allowed || "");
              document.getElementById("decisionAllowed").value = _cl.allowed;
              // …and the KEYWORD it used, or the save writes `tag` back over an `original_tag`.
              setCountryLockValue(_cl.tag, _cl.keyword);
            }
            if (document.getElementById("decisionAiWillDo")) document.getElementById("decisionAiWillDo").value = dec.aiWillDo || "";
            // ⚙️ Advanced fields (round-trip: repopulate so editing never drops them on save).
            const setAdv = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ""; };
            setAdv("decisionPriority", dec.priority);
            setAdv("decisionCancelIfNotVisible", dec.cancelIfNotVisible === "yes" ? "yes" : "");
            setAdv("decisionCustomCostText", dec.customCostText);
            setAdv("decisionCustomCostTrigger", dec.customCostTrigger);
            setAdv("decisionTargetedModifier", dec.targetedModifier);
            setAdv("decisionRemoveTrigger", dec.removeTrigger);
            // Keys real content uses that the maker previously could not author (#decision-more-keys).
            // cancel_trigger lives here rather than in the mission block: 481 of vanilla's 603 users are
            // ordinary decisions, so gating it behind mission mode hid it from most of the people who need it.
            setAdv("decisionCancelTriggerAdv", dec.cancelTrigger);
            setAdv("decisionCancelEffect", dec.cancelEffect);
            setAdv("decisionTargetRootTrigger", dec.targetRootTrigger);
            setAdv("decisionTargetArray", dec.targetArray);
            setAdv("decisionAiHintPpCost", dec.aiHintPpCost);
            setAdv("decisionFixedRandomSeed", dec.fixedRandomSeed);
            setAdv("decisionTargetNonExisting", dec.targetNonExisting);
            setAdv("decisionTargetsDynamic", dec.targetsDynamic);
            setAdv("decisionOnMapMode", dec.onMapMode);
            setAdv("decisionHighlightStates", dec.highlightStates);
            syncVisibleToggleFromValue();
            updateDecisionTypeLabels();
            updateScopeVisibility();
            updateLivePreview();
            if (window.__novaRefreshGenesisPreviews) window.__novaRefreshGenesisPreviews();

            if (dec.isDraft) {
              document.getElementById("aiStatus").textContent = "Editing Draft Decision template!";
              document.getElementById("aiStatus").style.color = "#e8a849";
              if (decisionBridge) decisionBridge.clear(); // a draft has no saved id yet
              if (document.getElementById("deleteDecisionBtn")) document.getElementById("deleteDecisionBtn").classList.add("is-hidden");
            } else {
              document.getElementById("aiStatus").textContent = `Loaded decision ${dec.id}!`;
              document.getElementById("aiStatus").style.color = "#2ea043";

              updateStartupCheckbox(); // show which countries already start with this decision active

              if (document.getElementById("deleteDecisionBtn")) document.getElementById("deleteDecisionBtn").classList.remove("is-hidden");
            }
            markDecisionEditorClean(); // this is now the baseline; further typing counts as unsaved work
          });

          if (activeDraft && dec.isDraft && activeDraft.autoSelect) {
            activeDraft.autoSelect = false;
            setTimeout(() => item.click(), 50);
          }

          if (autoSelectId && dec.id === autoSelectId) {
            autoSelectId = null;
            setTimeout(() => item.click(), 50);
          }

          itemsContainer.appendChild(item);
        });
      };

      if (isExpanded) {
        doRenderItems();
      }

      // Wired before the folder toggle below and stops propagation, or defining the category would also
      // collapse the folder the user is looking at. #decision-category-undefined
      const defineBtn = fileTitle.querySelector(".cat-define-btn");
      if (defineBtn) {
        defineBtn.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          const mod = getModPath();
          if (!mod) { nbAlert("Please select an active mod first."); return; }
          defineBtn.disabled = true;
          const original = defineBtn.textContent;
          defineBtn.textContent = "Defining…";
          try {
            const resp = await fetch("/api/decisions/define-category", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ modPath: mod, categoryId: cat.id }),
            });
            const data = await resp.json();
            if (data.error) throw new Error(data.error);
            if (data.created) {
              nbAlert(`Defined "${cat.id}" in ${data.path ? data.path.replace(/^.*[\\/](common[\\/].*)$/, "$1") : "this mod"}.\n\nHOI4 will now load the category, so its decisions can appear in game.`, "Category defined");
            } else if (data.alreadyDefined) {
              // Not a failure: something in the load order defines it after all, so writing would duplicate it.
              nbAlert(`"${cat.id}" is already defined by the base game or a dependency, so nothing was written.`, "Nothing to do");
            }
            await loadDecisionsList(); // repaint so the warning clears (or stays, honestly, if it did not)
          } catch (e) {
            defineBtn.disabled = false;
            defineBtn.textContent = original;
            nbAlert("Could not define the category: " + e.message);
          }
        });
      }

      fileTitle.addEventListener("click", () => {
        if (itemsContainer.style.display === "none") {
          doRenderItems();
          itemsContainer.style.display = "block";
          fileTitle.classList.add("expanded");
          expandedCategories.add(cat.id);
        } else {
          itemsContainer.style.display = "none";
          fileTitle.classList.remove("expanded");
          expandedCategories.delete(cat.id);
        }
      });

      decisionsList.appendChild(catDiv);
    });

    if (filterText && !anyMatched) {
      decisionsList.innerHTML = `<div style="padding: 12px; color: #8b949e; font-size: 12px; text-align: center;">No decisions match "<span style="color:#c9d1d9;">${escapeHtml(filterText)}</span>". Try a different search or clear the box.</div>`;
    }
  }

  // Live search input filtering
  const decisionsSearchInput = document.getElementById("decisionsListSearch");

  async function loadDecisionsList() {
    const decisionsList = document.getElementById("decisionsList");
    if (!decisionsList) return;
    try {
      const response = await fetch(`/api/decisions/list?modPath=${encodeURIComponent(getModPath())}`);
      const data = await response.json();
      if (data.error) throw new Error(data.error);

      if (!data.categories || data.categories.length === 0) {
        allCategories = [];
      } else {
        allCategories = data.categories;
      }
      populateDecisionCategoryOptions(document.getElementById("decisionCategory")?.value || "custom_decisions");
      const searchVal = decisionsSearchInput ? decisionsSearchInput.value.toLowerCase().trim() : "";
      renderDecisionsList(allCategories, searchVal);
    } catch (err) {
      decisionsList.innerHTML = `<div style="padding: 12px; color: #f85149; font-size: 13px;">Error: ${err.message}</div>`;
    }
  }

  if (decisionsSearchInput) {
    decisionsSearchInput.addEventListener("input", (e) => {
      const val = e.target.value.toLowerCase().trim();
      renderDecisionsList(allCategories, val);
    });
  }

  // Reset everything that belongs to the mod we are leaving.
  //
  // Nothing here used to be reset, so after switching mods the editor still held the previous mod's decision:
  // every field populated, the status line reading "Loaded decision …", the Delete button visible, and the
  // Category dropdown still listing the old mod's categories. Pressing Save then wrote mod A's decision into
  // mod B, and Delete aimed at a decision that isn't in the new mod at all.
  function clearDecisionEditorForModSwitch() {
    loadedIdentity = null;
    loadedVisibleBody = "";
    decCleanSnapshot = null; // nothing loaded any more, so there is nothing unsaved to warn about
    activeDraft = null;
    autoSelectId = null;
    allCategories = [];
    allDecisionSprites = null; // the icon list is per-mod; it was fetched once and never refreshed
    const clear = (id, v = "") => { const el = document.getElementById(id); if (el) el.value = v; };
    ["decisionId", "decisionName", "decisionAvailable", "decisionModifier", "decisionEffect",
     "decisionTargetTrigger", "decisionRemoveEffect", "decisionActivation", "decisionCancelTrigger",
     "decisionVisible", "decisionAllowed", "decisionAiWillDo", "decisionPictureId", "decisionPriority",
     "decisionCancelIfNotVisible", "decisionCustomCostText", "decisionCustomCostTrigger",
     "decisionTargetedModifier", "decisionRemoveTrigger", "decisionOnMapMode", "decisionHighlightStates",
     "decisionCancelTriggerAdv", "decisionCancelEffect", "decisionTargetRootTrigger", "decisionTargetArray",
     "decisionAiHintPpCost", "decisionFixedRandomSeed", "decisionTargetNonExisting", "decisionTargetsDynamic",
     // …and the category icon, which this list had missed, so it survived a mod switch and could then be
     // written into a category in the newly-opened mod. #category-icon-retargets-another-category
     "decisionCategoryIcon",
     "aiDecisionPrompt"].forEach((id) => clear(id));
    const del = document.getElementById("deleteDecisionBtn");
    if (del) del.classList.add("is-hidden");
    const status = document.getElementById("aiStatus");
    if (status) { status.textContent = "Pick a decision from the list, or create a new one."; status.style.color = "#8b949e"; }
    document.querySelectorAll(".decision-item").forEach((el) => el.classList.remove("active"));
    try { setCountryLockValue(""); } catch (_) {}
    if (decisionBridge) decisionBridge.clear();
    try { updateIconPreview(""); } catch (_) {}
    try { updateLivePreview(); } catch (_) {}
  }

  // Delete Decision integration
  const deleteDecisionBtn = document.getElementById("deleteDecisionBtn");
  if (deleteDecisionBtn) {
    deleteDecisionBtn.addEventListener("click", async () => {
      // Delete what is actually ON DISK, not what the form boxes currently say. Both boxes are editable, so
      // changing the Category dropdown (or retyping the id) before pressing Delete used to aim the request at
      // a category the decision was never in: the confirmation named the wrong category and the server
      // answered with a raw 400. The loaded identity is the only trustworthy answer to "what am I deleting".
      const categoryId = loadedIdentity ? loadedIdentity.categoryId : document.getElementById("decisionCategory").value.trim();
      const id = loadedIdentity ? loadedIdentity.id : document.getElementById("decisionId").value.trim();

      if (!categoryId || !id) return;

      window.novaConfirm(`Are you sure you want to delete Decision "${id}" from category "${categoryId}"?`, async () => {

      deleteDecisionBtn.disabled = true;
      deleteDecisionBtn.textContent = "Deleting...";

      try {
        const response = await fetch("/api/decisions/delete-definition", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modPath: getModPath(),
            categoryId,
            decisionId: id,
            fileName: homeFileFor(categoryId, id)
          })
        });
        
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        nbAlert(`Deleted ${id}.\n\nA backup of the original file was saved automatically, so this can be recovered if it was a mistake.`);
        activeDraft = null;
        autoSelectId = null;
        loadedIdentity = null; // it's gone from disk; nothing left to rename
        decCleanSnapshot = null;
        document.getElementById("decisionId").value = "";
        document.getElementById("decisionCost").value = "";
        document.getElementById("deleteDecisionBtn").classList.add("is-hidden");
        loadDecisionsList();
      } catch (err) {
        nbAlert(`Delete failed: ${err.message}`);
      } finally {
        deleteDecisionBtn.disabled = false;
        deleteDecisionBtn.textContent = "Delete Decision";
      }
      }, { title: "Delete Decision", yesLabel: "Delete", danger: true });
    });
  }

  // Draft Live Sync
  const decIdInput = document.getElementById("decisionId");
  if (decIdInput) {
    decIdInput.addEventListener("input", (e) => {
      const val = e.target.value.trim();
      const draftEl = document.getElementById("draft-item-decision");
      if (draftEl && activeDraft) {
        draftEl.textContent = val || "New Decision";
        activeDraft.id = val;
      }
    });
  }
  const decNameInput = document.getElementById("decisionName");
  if (decNameInput) {
    decNameInput.addEventListener("input", (e) => {
      if (activeDraft) activeDraft.name = e.target.value.trim();
    });
  }

  // ── Country-lock: a friendly "restrict this decision to one country" picker ─────────────────────
  // HOI4 scopes a decision to a country with `allowed = { tag = X }` (checked once at game start).
  // Rather than make modders hand-write that, a dropdown writes a marked `tag = X #nova_country_lock`
  // line into the Allowed block on save, and we pull it back into the dropdown on load (stripping it
  // from the visible Allowed box). The marker means Nova owns that one line: a user's own conditions in
  // the box are never clobbered, and re-saving never duplicates it. Same pattern as the event fire-date.
  const NOVA_COUNTRY_LOCK_RE = /^[ \t]*(original_tag|tag)\s*=\s*([A-Za-z0-9_]+)[^\n]*#\s*nova_country_lock[^\n]*$/m;
  // A hand-written `allowed = { tag = GRE }` is the ordinary way to restrict a decision to one country, but
  // the picker only ever recognised its OWN #nova_country_lock line. So the dropdown read "Any country" for
  // every real decision written that way, and choosing a country ADDED a second tag line:
  //     tag = FRA #nova_country_lock
  //     tag = GRE
  // which is `tag == FRA AND tag == GRE` — never true, so the decision became unavailable to every country
  // in the game. Recognise a bare tag line as the lock as well, but ONLY at brace depth 0: a `tag` inside an
  // OR/AND block is a different condition entirely and is left strictly alone.
  // …and `original_tag` counts too. That fix only ever covered a bare `tag`, but real content overwhelmingly
  // writes `original_tag`, and Nova's OWN Allowed label and placeholder both say `original_tag = GRE`. So a
  // decision restricted the recommended way still read "— Any country —", and saving still produced the
  // impossible `tag = FRA` AND `original_tag = GRE`. #country-lock-misses-original-tag
  //
  // The keyword is captured, not normalised: `tag` is the country's CURRENT tag and `original_tag` the one it
  // started as (they differ after a civil war, a formable nation, or a release), so rewriting one as the other
  // would quietly change which countries the decision applies to.
  function findBareCountryLock(text) {
    const lines = String(text || "").replace(/\r/g, "").split("\n");
    let depth = 0;
    for (let i = 0; i < lines.length; i++) {
      const bare = /^[ \t]*(original_tag|tag)[ \t]*=[ \t]*([A-Za-z0-9_]{2,4})[ \t]*$/.exec(lines[i]);
      if (depth === 0 && bare) return { index: i, tag: bare[2], keyword: bare[1] };
      const code = lines[i].replace(/#.*$/, "");
      for (const ch of code) { if (ch === "{") depth++; else if (ch === "}") depth--; }
    }
    return null;
  }
  function extractCountryLock(allowedText) {
    const text = String(allowedText == null ? "" : allowedText);
    const m = text.match(NOVA_COUNTRY_LOCK_RE);
    if (m) {
      const cleaned = text.replace(NOVA_COUNTRY_LOCK_RE, "").replace(/\n{3,}/g, "\n\n").replace(/^\s+|\s+$/g, "");
      return { tag: m[2], keyword: m[1], allowed: cleaned };
    }
    const bare = findBareCountryLock(text);
    if (bare) {
      const lines = text.replace(/\r/g, "").split("\n");
      lines.splice(bare.index, 1);
      return { tag: bare.tag, keyword: bare.keyword, allowed: lines.join("\n").replace(/\n{3,}/g, "\n\n").replace(/^\s+|\s+$/g, "") };
    }
    return { tag: "", keyword: "", allowed: text };
  }
  function injectCountryLock(allowedText, tag, keywordHint) {
    const found = extractCountryLock(allowedText); // strips a managed OR a bare tag/original_tag line first
    const cleaned = found.allowed;
    if (!tag) return cleaned;
    // Write back the SAME keyword the decision already used, so restricting it to a different country never
    // silently changes tag↔original_tag semantics. A brand-new lock keeps Nova's existing default of `tag`.
    //
    // THE HINT IS THE WHOLE POINT. `found.keyword` cannot work on its own from the only call site: the LOAD
    // path already stripped the lock line out of the textarea, so by the time this runs there is nothing left
    // to re-derive the keyword from and `found.keyword` is always "". The branch below was therefore
    // unreachable, and every save rewrote `original_tag = X` to `tag = X` — on 1,548 vanilla decisions and
    // 989 Millennium Dawn ones, the dominant idiom in real content. `tag` matches a country's CURRENT tag,
    // `original_tag` the one it started as, so the flip silently changes who ever sees the decision for any
    // formable, released or civil-war nation. #decision-country-lock-keyword
    const keyword = (keywordHint === "original_tag" || found.keyword === "original_tag") ? "original_tag" : "tag";
    const line = `${keyword} = ${tag} #nova_country_lock`;
    return cleaned ? `${line}\n${cleaned}` : line;
  }
  function setCountryLockValue(tag, keyword) {
    const sel = document.getElementById("decisionCountryLock");
    if (!sel) return;
    // Stash the keyword the decision actually used so the save can write the same one back. Every caller
    // that clears the lock passes nothing, which resets this too — so a new decision starts with no hint and
    // gets Nova's `tag` default. #decision-country-lock-keyword
    sel.dataset.lockKeyword = keyword === "original_tag" ? "original_tag" : "";
    if (tag && !Array.prototype.some.call(sel.options, (o) => o.value === tag)) {
      const o = document.createElement("option"); o.value = tag; o.textContent = tag; sel.appendChild(o);
    }
    sel.value = tag || "";
  }
  async function populateCountryLock() {
    const sel = document.getElementById("decisionCountryLock");
    if (!sel || !window.NovaCountryPicker) return;
    const prev = sel.value;
    try { await window.NovaCountryPicker.populate(sel, { modPath: getModPath(), all: true }); } catch (_e) {}
    if (!Array.prototype.some.call(sel.options, (o) => o.value === "")) {
      const blank = document.createElement("option");
      blank.value = ""; blank.textContent = "— Any country (no restriction) —";
      sel.insertBefore(blank, sel.firstChild);
    }
    sel.value = prev || "";
  }

  function initCountryDatalist() {
    // Attach the shared owner-chip bridge once; on later calls (mod change) just refresh its country list.
    if (!decisionBridge && window.NovaOwnerBridge) {
      decisionBridge = window.NovaOwnerBridge.attach({
        host: "decisionOwnerBridge", itemType: "decision",
        title: "Activate this decision at game start for…", applyVerb: "activate",
        getModPath,
      });
    } else if (decisionBridge) {
      decisionBridge.repopulate();
    }
    populateCountryLock(); // fill the "restrict to country" dropdown (also refreshes on mod change)
  }

  // ── Dynamic Toggle Helpers ──────────────────────────────────────────────
  function updateDecisionTypeLabels() {
    const type = document.getElementById("decisionType").value;
    const isMission = type === "mission";
    const lblDays = document.getElementById("lblDecisionDays");
    const lblRemove = document.getElementById("lblRemoveEffect");
    const lblAvail = document.getElementById("lblDecisionAvailable");
    if (isMission) {
      // "0 for none" invited exactly the value that stops it being a mission at all — the timeout key is
      // what makes a decision a mission, so with 0 nothing is written and an ordinary decision is saved.
      if (lblDays) lblDays.textContent = "Mission Timeout (Days — required; this is what makes it a mission)";
      if (lblRemove) lblRemove.textContent = "Timeout Effect (Runs when mission times out)";
      if (lblAvail) lblAvail.textContent = "Available (early-completion: mission succeeds if met before timeout)";
    } else {
      if (lblDays) lblDays.textContent = "Days to Remove (0 for permanent)";
      if (lblRemove) lblRemove.textContent = "Remove Effect (Runs when timed decision expires)";
      if (lblAvail) lblAvail.textContent = "Available Trigger (Conditions to take decision)";
    }
    // Mission-only fields + cost (missions aren't manually clicked, so no cost).
    const show = (id, on) => { const el = document.getElementById(id); if (el) el.style.display = on ? "" : "none"; };
    show("activationGroup", isMission);
    show("cancelTriggerGroup", isMission);
    show("isGoodGroup", isMission);
    show("selectableMissionGroup", isMission);
    show("costGroup", !isMission);
  }

  function updateScopeVisibility() {
    const scope = document.getElementById("decisionScope").value;
    const group = document.getElementById("targetTriggerGroup");
    if (group) group.style.display = scope === "state" ? "block" : "none";
    // on_map_mode and highlight_states are NOT state-only — 812 vanilla and 450 MD decisions use
    // highlight_states while only 25 and 1 of those are state-targeted. Hiding them behind state scope
    // blocked a legal, common use and meant an authored block could be neither seen nor cleared.
    const stateAdv = document.getElementById("decisionStateAdvanced");
    if (stateAdv) stateAdv.style.display = "flex";
  }

  const decisionTypeSelect = document.getElementById("decisionType");
  if (decisionTypeSelect) decisionTypeSelect.addEventListener("change", updateDecisionTypeLabels);
  const decisionScopeSelect = document.getElementById("decisionScope");
  if (decisionScopeSelect) decisionScopeSelect.addEventListener("change", updateScopeVisibility);

  // Background pre-warm of the icon sprite maps so the first picture browse/preview is instant (#2/#3).
  function warmSprites() { try { fetch(`/api/mod/warm-sprites?modPath=${encodeURIComponent(getModPath())}`).catch(() => {}); } catch (_) {} }
  initModSelector(() => {
    // Switching mod used to leave the PREVIOUS mod's decision loaded, with every field populated, the
    // status line still saying "Loaded decision …" and the Delete button visible — so pressing Save wrote
    // mod A's decision into mod B. Clear the editor and drop the caches that belong to the old mod.
    clearDecisionEditorForModSwitch();
    loadDecisionsList();
    initCountryDatalist();
    warmSprites();
  }).then(() => {
    loadDecisionsList();
    initCountryDatalist();
    warmSprites();
  });

  // Handle DDS Image Upload
  decisionPictureUpload.addEventListener("change", async (e) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    // Clear the input's value so picking the SAME file again still fires a change event. Without this,
    // re-selecting one icon — to retry after a failed conversion, or to reuse it on a second decision — was
    // a silent no-op: no request, no status text, nothing to tell the user why.
    const resetPicker = () => { try { e.target.value = ""; } catch (_) {} };
    const formData = new FormData();
    formData.append("image", file);
    
    const decisionIdValue = document.getElementById("decisionId").value || "custom_decision";
    formData.append("name", decisionIdValue);
    formData.append("type", "decision");

    const modPath = getModPath();
    if (modPath) formData.append("modPath", modPath);

    uploadStatus.textContent = "Uploading and converting to DDS...";
    uploadStatus.style.color = "#e8a849";

    try {
      const response = await fetch("/api/upload-gfx", {
        method: "POST",
        body: formData
      });
      const data = await response.json();
      
      if (data.error) throw new Error(data.error);
      
      uploadStatus.textContent = "Successfully converted to DDS & .gfx generated!" + (data.overwrote ? " ⚠ Replaced an existing icon (original backed up)." : "");
      uploadStatus.style.color = "#2ea043";
      decisionPictureId.value = data.spriteName;
      // Refresh BOTH the icon thumbnail AND the live decision-board preview (previewDecIcon). Setting the
      // value above doesn't fire the input listener, so without this the board icon never updated after an
      // upload. Pass the just-written DDS path so it loads instantly (no cold-map sprite-url miss).
      updateIconPreview(data.spriteName, data.ddsPath);
      resetPicker();
    } catch (err) {
      uploadStatus.textContent = `Error: ${err.message}`;
      uploadStatus.style.color = "#f85149";
      resetPicker(); // …especially after a failure, so the user can just try the same file again
    }
  });

  const decisionPictureUploadBtn = document.getElementById("decisionPictureUploadBtn");
  if (decisionPictureUploadBtn) {
    decisionPictureUploadBtn.addEventListener("click", () => {
      decisionPictureUpload.click();
    });
  }

  const decisionBrowseIconBtn = document.getElementById("decisionBrowseIconBtn");
  const decisionIconPickerModal = document.getElementById("decisionIconPickerModal");
  const closeDecisionIconPicker = document.getElementById("closeDecisionIconPicker");
  const decisionIconPickerSearch = document.getElementById("decisionIconPickerSearch");
  const decisionIconPickerGrid = document.getElementById("decisionIconPickerGrid");
  let allDecisionSprites = null;
  // The CATEGORY's sprites are a different set (GFX_decision_category_*), so they get their own cache —
  // and the picker remembers which field it was opened for (#decision-category-icon).
  let allDecisionCategorySprites = null;
  let decisionIconPickTarget = "decision";
  let filteredDecisionSprites = [];
  let renderedDecisionSpriteCount = 0;
  // Small first batch + fill-until-scrollable (below). Rendering all sprites fired ~120 DDS→PNG conversions
  // at once via /api/buildings/icon-file (native loading="lazy" is viewport-relative, so it doesn't defer).
  const DECISION_ICON_BATCH_SIZE = 24;

  function renderDecisionIconBatch() {
    if (!decisionIconPickerGrid) return;
    const batch = filteredDecisionSprites.slice(renderedDecisionSpriteCount, renderedDecisionSpriteCount + DECISION_ICON_BATCH_SIZE);
    const fragment = document.createDocumentFragment();
    batch.forEach(sprite => {
      const item = document.createElement("div");
      item.className = "icon-picker-item";
      item.innerHTML = `
        <img src="/api/buildings/icon-file?path=${encodeURIComponent(sprite.texturefile || "")}" alt="Icon" loading="lazy" style="width: 48px; height: 48px; object-fit: contain; margin-bottom: 8px;" data-fallback="/api/vanilla-ui?rel=gfx/interface/decisions/decision_generic_decision.dds" />
        <span style="font-size: 10px; color: #8b949e; word-break: break-all; font-family: monospace;">${escapeHtml(sprite.key.replace(/^gfx_decision_/i, ""))}</span>
      `;
      item.addEventListener("click", () => {
        if (decisionIconPickTarget === "category") {
          const catEl = document.getElementById("decisionCategoryIcon");
          if (catEl) { catEl.value = sprite.key; catEl.dispatchEvent(new Event("input", { bubbles: true })); }
        } else {
          decisionPictureId.value = sprite.key;
          updateIconPreview(sprite.key, sprite.texturefile); // use the exact image we already loaded
        }
        if (decisionIconPickerModal) decisionIconPickerModal.style.display = "none";
      });
      fragment.appendChild(item);
    });
    decisionIconPickerGrid.appendChild(fragment);
    renderedDecisionSpriteCount += batch.length;
    // Fill just enough to make the grid scrollable (so scroll-to-load-more takes over) — never all at once.
    if (renderedDecisionSpriteCount < filteredDecisionSprites.length && renderedDecisionSpriteCount < 96 && decisionIconPickerGrid.clientHeight > 0 && decisionIconPickerGrid.scrollHeight <= decisionIconPickerGrid.clientHeight + 40) requestAnimationFrame(renderDecisionIconBatch);
  }

  function filterDecisionIcons() {
    const pool = decisionIconPickTarget === "category" ? allDecisionCategorySprites : allDecisionSprites;
    if (!decisionIconPickerGrid || !pool) return;
    const val = (decisionIconPickerSearch?.value || "").toLowerCase().trim();
    filteredDecisionSprites = pool.filter(sprite => sprite.key.toLowerCase().includes(val));
    decisionIconPickerGrid.innerHTML = "";
    renderedDecisionSpriteCount = 0;
    if (!filteredDecisionSprites.length) {
      decisionIconPickerGrid.innerHTML = `<div style="grid-column: 1/-1; padding: 24px; color: #8b949e; text-align: center;">No icons found.</div>`;
      return;
    }
    renderDecisionIconBatch();
  }

  if (decisionBrowseIconBtn && decisionIconPickerModal && decisionIconPickerGrid) {
    decisionBrowseIconBtn.addEventListener("click", async () => {
      decisionIconPickTarget = "decision";
      decisionIconPickerModal.style.display = "block";
      if (decisionIconPickerSearch) { decisionIconPickerSearch.value = ""; setTimeout(() => { try { decisionIconPickerSearch.focus(); } catch (_) {} }, 0); } // type to search at once

      if (allDecisionSprites !== null) {
        filterDecisionIcons();
        decisionIconPickerGrid.scrollTop = 0;
        return;
      }

      decisionIconPickerGrid.innerHTML = `<div style="grid-column: 1/-1; padding: 24px; color: #8b949e; text-align: center;">Scanning game files for decision icons...</div>`;
      try {
        const res = await fetch(`/api/sprites?type=decision&modPath=${encodeURIComponent(getModPath())}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        allDecisionSprites = data.sprites || [];
        filterDecisionIcons();
        decisionIconPickerGrid.scrollTop = 0;
      } catch (err) {
        decisionIconPickerGrid.innerHTML = `<div style="grid-column: 1/-1; padding: 24px; color: #f85149; text-align: center;">Error: ${escapeHtml(err.message)}</div>`;
      }
    });
    const browseCatBtn = document.getElementById("decisionBrowseCategoryIconBtn");
    if (browseCatBtn) {
      browseCatBtn.addEventListener("click", async () => {
        decisionIconPickTarget = "category";
        decisionIconPickerModal.style.display = "block";
        if (decisionIconPickerSearch) { decisionIconPickerSearch.value = ""; setTimeout(() => { try { decisionIconPickerSearch.focus(); } catch (_) {} }, 0); }
        if (allDecisionCategorySprites !== null) { filterDecisionIcons(); decisionIconPickerGrid.scrollTop = 0; return; }
        decisionIconPickerGrid.innerHTML = `<div style="grid-column: 1/-1; padding: 24px; color: #8b949e; text-align: center;">Scanning game files for category icons...</div>`;
        try {
          const res = await fetch(`/api/sprites?type=decision_category&modPath=${encodeURIComponent(getModPath())}`);
          const data = await res.json();
          if (data.error) throw new Error(data.error);
          allDecisionCategorySprites = data.sprites || [];
          filterDecisionIcons();
          decisionIconPickerGrid.scrollTop = 0;
        } catch (err) {
          decisionIconPickerGrid.innerHTML = `<div style="grid-column: 1/-1; padding: 24px; color: #f85149; text-align: center;">Error: ${escapeHtml(err.message)}</div>`;
        }
      });
    }

    decisionIconPickerGrid.addEventListener("scroll", () => {
      if (decisionIconPickerGrid.scrollTop + decisionIconPickerGrid.clientHeight >= decisionIconPickerGrid.scrollHeight - 60) {
        if (renderedDecisionSpriteCount < filteredDecisionSprites.length) renderDecisionIconBatch();
      }
    });
    if (closeDecisionIconPicker) {
      closeDecisionIconPicker.addEventListener("click", () => {
        decisionIconPickerModal.style.display = "none";
      });
    }
    if (decisionIconPickerSearch) decisionIconPickerSearch.addEventListener("input", filterDecisionIcons);
    window.addEventListener("click", (e) => {
      if (e.target === decisionIconPickerModal) decisionIconPickerModal.style.display = "none";
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && decisionIconPickerModal.style.display === "block") {
        decisionIconPickerModal.style.display = "none";
      }
    });
  }

  // Icon Preview Helper
  async function updateIconPreview(gfxKey, directTexturefile) {
    const liveIconEl = document.getElementById("previewDecIcon");
    if (!decisionPicturePreview) return;
    if (!gfxKey) {
      decisionPicturePreview.innerHTML = "Icon";
      if (liveIconEl) liveIconEl.src = "/api/vanilla-ui?rel=gfx/interface/decisions/decision_generic_decision.dds";
      return;
    }
    // The icon picker already knows the exact texture file (it rendered the thumbnail from it), so use it
    // directly — instant, and never falls back to a placeholder, even on a cold sprite map (Millennium Dawn).
    if (directTexturefile) {
      const directUrl = `/api/buildings/icon-file?path=${encodeURIComponent(directTexturefile)}`;
      decisionPicturePreview.innerHTML = `<img src="${directUrl}" alt="Decision Icon" data-fallback="/api/vanilla-ui?rel=gfx/interface/decisions/decision_generic_decision.dds" style="max-width: 100%; max-height: 100%; object-fit: contain;" />`;
      if (liveIconEl) liveIconEl.src = directUrl;
      return;
    }
    decisionPicturePreview.innerHTML = `<span style="font-size: 11px; color: #8b949e;">Loading...</span>`;
    try {
      const res = await fetch(`/api/ideas/sprite-url?key=${encodeURIComponent(gfxKey)}&modPath=${encodeURIComponent(getModPath())}`);
      const data = await res.json();
      if (data.url) {
        decisionPicturePreview.innerHTML = `<img src="${data.url}" alt="Decision Icon" data-fallback="/api/vanilla-ui?rel=gfx/interface/decisions/decision_generic_decision.dds" style="max-width: 100%; max-height: 100%; object-fit: contain;" />`;
        if (liveIconEl) liveIconEl.src = data.url;
      } else {
        const fallback = "/api/vanilla-ui?rel=gfx/interface/decisions/decision_generic_decision.dds";
        decisionPicturePreview.innerHTML = `<img src="${fallback}" alt="Decision Icon" style="max-width: 100%; max-height: 100%; object-fit: contain;" />`;
        if (liveIconEl) liveIconEl.src = fallback;
      }
    } catch (err) {
      decisionPicturePreview.innerHTML = `<span style="font-size: 11px; color: #f85149;">Error</span>`;
      if (liveIconEl) liveIconEl.src = "/api/vanilla-ui?rel=gfx/interface/decisions/decision_generic_decision.dds";
    }
  }

  // Mirror app.js's sanitizeLocalization for preview display: drop Paradox color codes (including
  // digit codes like §7 that the app.js copy misses) and [Dynamic.Tokens] so the live preview shows
  // the name the way a player reads it in-game. Display-only — never applied to the saved value.
  // Delegates to the one canonical implementation (#loc-display-strip in loading-overlay.js). Five makers had
  // grown their own near-copy and they disagreed — none stripped $KEY$ references or the [?var|%fmt] print
  // form, and the leading punctuation a removed token exposed was left behind.
  // DISPLAY ONLY: the editable field and the saved .yml keep the raw value.
  function stripLocDisplayCodes(s) {
    if (typeof window !== "undefined" && window.novaStripLocCodes) return window.novaStripLocCodes(s);
    return typeof s === "string" ? s.replace(/§[A-Za-z0-9!]/g, "").trim() : s;
  }

  // A name is often not plain text — 8.5% of vanilla's localisation values START with a runtime token, so
  // opening a real decision showed something like "[ROOT.GetNameDefCap] Reform Act" in the name box with no
  // explanation. The box keeps the RAW value (editing it must be lossless, and that is what gets saved), so
  // instead show what a player will actually read underneath it.
  function updateNameRenderedHint() {
    const el = document.getElementById("decisionNameRendered");
    const input = document.getElementById("decisionName");
    if (!el || !input) return;
    const raw = input.value || "";
    const dynamic = window.novaLocHasDynamicCodes ? window.novaLocHasDynamicCodes(raw) : /[§£[\]$]/.test(raw);
    if (!dynamic) { el.style.display = "none"; el.textContent = ""; return; }
    const shown = stripLocDisplayCodes(raw);
    el.style.display = "";
    el.textContent = shown
      ? "In game this reads: " + shown + "   (the [..] / $..$ / § parts are filled in by the game — they are kept exactly as typed)"
      : "Every part of this name is filled in by the game at runtime, so there is no fixed text to preview.";
  }

  function updateLivePreview() {
    updateNameRenderedHint();
    const cat = (document.getElementById("decisionCategory")?.value || "custom_decisions").trim().toUpperCase();
    const idVal = (document.getElementById("decisionId")?.value || "new_decision").trim();
    const nameVal = (document.getElementById("decisionName")?.value || "").trim();
    // Cost and duration may be script variables rather than numbers, so keep the raw token for display —
    // the preview used to hide a variable cost entirely and show a variable duration as no timer at all.
    const costRaw = (document.getElementById("decisionCost")?.value || "").trim();
    const costVal = parseInt(costRaw, 10);
    const typeVal = document.getElementById("decisionType")?.value || "normal";
    const daysRaw = (document.getElementById("decisionDays")?.value || "").trim();
    const daysVal = parseInt(daysRaw, 10) || 0;
    const isVar = (t) => t !== "" && !/^-?[0-9]+$/.test(t);

    // 1. Category header
    const previewCatEl = document.getElementById("previewDecCat");
    if (previewCatEl) previewCatEl.textContent = cat;

    // 2. Name
    const previewNameEl = document.getElementById("previewDecName");
    if (previewNameEl) {
      const readable = nameVal || makeReadableDecisionName(idVal);
      previewNameEl.textContent = stripLocDisplayCodes(readable) || "New Decision";
    }

    // 3. Cost
    const previewCostEl = document.getElementById("previewDecCost");
    if (previewCostEl) {
      if (typeVal === "mission" || costRaw === "" || costVal === 0) {
        previewCostEl.style.display = "none";
      } else {
        previewCostEl.style.display = "";
        // A variable's value isn't known until the game runs, so show the variable itself.
        previewCostEl.textContent = isVar(costRaw) ? `${costRaw} PP` : `${costVal} PP`;
      }
    }

    // 4. Badge
    const previewBadgeEl = document.getElementById("previewDecBadge");
    if (previewBadgeEl) {
      // -1 means the timer never runs out, and a variable duration is still a duration — both used to
      // render as "no timer at all".
      const timerLabel = isVar(daysRaw) ? daysRaw : daysVal === -1 ? "∞" : daysVal > 0 ? `${daysVal}d` : "";
      if (typeVal === "mission") {
        previewBadgeEl.style.display = "";
        previewBadgeEl.className = "hoi4-decision-badge mission";
        previewBadgeEl.textContent = timerLabel || "Active";
      } else if (timerLabel) {
        previewBadgeEl.style.display = "";
        previewBadgeEl.className = "hoi4-decision-badge timed";
        previewBadgeEl.textContent = timerLabel;
      } else {
        previewBadgeEl.style.display = "none";
      }
    }
  }

  if (decisionPictureId) {
    decisionPictureId.addEventListener("input", (e) => {
      updateIconPreview(e.target.value.trim());
      updateLivePreview();
    });
  }

  // Genesis "plain English" preview for the script textareas (read-only, additive — never touches
  // what is saved). Lets a modder confirm what a pasted/AI-written effect or condition does without
  // reading raw Paradox script. Uses DOM text nodes so script content can't inject markup.
  //   mode = "effect"  -> GenesisEngine.translate         (e.g. "Political power +50")
  //   mode = "trigger" -> GenesisEngine.translateTriggers (e.g. "has more than 50 political power")
  function refreshGenesisPreview(textareaId, previewId, mode, labelText) {
    const ta = document.getElementById(textareaId);
    const box = document.getElementById(previewId);
    if (!ta || !box) return;
    const raw = (ta.value || "").trim();
    if (!raw) { box.style.display = "none"; box.textContent = ""; return; }
    const isTrigger = mode === "trigger";
    const fnName = isTrigger ? "translateTriggers" : "translate";
    let english = "";
    try {
      if (window.GenesisEngine && typeof window.GenesisEngine[fnName] === "function") {
        english = window.GenesisEngine[fnName](raw);
      }
    } catch (_) { english = ""; }
    box.style.display = "";
    box.textContent = "";
    const label = document.createElement("span");
    label.className = "genesis-preview-label";
    label.textContent = labelText || "🔮 In plain English";
    box.appendChild(label);
    if (english) {
      box.classList.remove("genesis-preview-empty");
      box.appendChild(document.createTextNode(english));
    } else {
      box.classList.add("genesis-preview-empty");
      box.appendChild(document.createTextNode("Couldn't auto-translate this script — it will still be saved exactly as written."));
    }
  }
  function refreshAllGenesisPreviews() {
    refreshGenesisPreview("decisionEffect", "decisionEffectPreview", "effect");
    refreshGenesisPreview("decisionRemoveEffect", "decisionRemoveEffectPreview", "effect");
    refreshGenesisPreview("decisionModifier", "decisionModifierPreview", "effect", "🔮 While active");
    refreshGenesisPreview("decisionAvailable", "decisionAvailablePreview", "trigger", "🔮 Available when");
    refreshGenesisPreview("decisionAllowed", "decisionAllowedPreview", "trigger", "🔮 Allowed when");
    refreshGenesisPreview("decisionTargetTrigger", "decisionTargetTriggerPreview", "trigger", "🔮 Valid target when");
    refreshGenesisPreview("decisionActivation", "decisionActivationPreview", "trigger", "🔮 Activates when");
    refreshGenesisPreview("decisionCancelTrigger", "decisionCancelTriggerPreview", "trigger", "🔮 Cancelled when");
  }
  [
    ["decisionEffect", "decisionEffectPreview", "effect", "🔮 In plain English"],
    ["decisionRemoveEffect", "decisionRemoveEffectPreview", "effect", "🔮 In plain English"],
    ["decisionModifier", "decisionModifierPreview", "effect", "🔮 While active"],
    ["decisionAvailable", "decisionAvailablePreview", "trigger", "🔮 Available when"],
    ["decisionAllowed", "decisionAllowedPreview", "trigger", "🔮 Allowed when"],
    ["decisionTargetTrigger", "decisionTargetTriggerPreview", "trigger", "🔮 Valid target when"],
    ["decisionActivation", "decisionActivationPreview", "trigger", "🔮 Activates when"],
    ["decisionCancelTrigger", "decisionCancelTriggerPreview", "trigger", "🔮 Cancelled when"]
  ].forEach(([taId, prevId, mode, label]) => {
    const ta = document.getElementById(taId);
    if (ta) {
      const handler = () => refreshGenesisPreview(taId, prevId, mode, label);
      ta.addEventListener("input", handler);
      ta.addEventListener("change", handler);
    }
  });
  // #cancel-trigger-has-two-boxes — ONE FIELD, TWO BOXES, AND SAVE READ ONLY ONE OF THEM.
  //
  // cancel_trigger can be authored in two places: the mission block's "Cancelled when"
  // (#decisionCancelTrigger, shown when the type is Mission) and the Advanced section's
  // #decisionCancelTriggerAdv, which is on the page in both modes. Loading a decision fills BOTH from the
  // same dec.cancelTrigger, so they look like one field — they are one field.
  //
  // Save does not treat them as one. It reads the mission box in mission mode and the Advanced box
  // otherwise, each for a good reason: cancel_trigger is not mission-only (481 of vanilla's 603 users are
  // ordinary decisions) so the Advanced box has to work, and the mission box is the obvious one when it is
  // on screen. The gap is a mission with the Advanced section open: both boxes are visible, the user edits
  // the Advanced one, and Save reads the other — writing back the value that was loaded, then marking the
  // editor clean. Confirmed on the running page: with the type set to Mission, both boxes report
  // getClientRects().length > 0.
  //
  // Mirroring them makes "which one does Save read" stop mattering. Setting .value does not fire input, so
  // there is no loop; the guard is belt and braces for a future handler that dispatches one.
  (function mirrorCancelTriggerBoxes() {
    const mission = document.getElementById("decisionCancelTrigger");
    const advanced = document.getElementById("decisionCancelTriggerAdv");
    if (!mission || !advanced) return;
    let syncing = false;
    const link = (from, to) => {
      const copy = () => {
        if (syncing || to.value === from.value) return;
        syncing = true;
        to.value = from.value;
        syncing = false;
      };
      from.addEventListener("input", copy);
      from.addEventListener("change", copy);
    };
    link(mission, advanced);
    link(advanced, mission);
  })();

  window.__novaRefreshGenesisPreviews = refreshAllGenesisPreviews;

  // Wire other input elements to update preview
  ["decisionCategory", "decisionId", "decisionName", "decisionCost", "decisionType", "decisionDays"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", updateLivePreview);
      el.addEventListener("change", updateLivePreview);
    }
  });

  const decisionCategorySelect = document.getElementById("decisionCategory");
  if (decisionCategorySelect) {
    // Remember the real category shown BEFORE the dropdown opens. By the time the change event fires with
    // "__create_new__", the select has already committed that value, so the prior selection is otherwise
    // lost — and cancelling the prompt would silently drop a loaded decision into custom_decisions.
    const rememberPrevCategory = () => {
      if (decisionCategorySelect.value !== "__create_new__") decisionCategorySelect.dataset.prevCategory = decisionCategorySelect.value;
    };
    decisionCategorySelect.addEventListener("focus", rememberPrevCategory);
    decisionCategorySelect.addEventListener("mousedown", rememberPrevCategory);
    decisionCategorySelect.addEventListener("change", async () => {
      if (decisionCategorySelect.value === "__create_new__") {
        const newCat = await window.showCustomPrompt("Create New Decision Category", "e.g., custom_economic_decisions");
        if (newCat) {
          let sanitized = newCat.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
          if (/^[0-9]/.test(sanitized)) sanitized = "_" + sanitized; // leading digit → invalid PDX token
          if (sanitized) {
            setDecisionCategory(sanitized);
            updateLivePreview();
            return;
          }
        }
        // Cancelled or empty → restore the category that was selected before, not a hard-coded default.
        setDecisionCategory(decisionCategorySelect.dataset.prevCategory || "custom_decisions");
        updateLivePreview();
      } else {
        decisionCategorySelect.dataset.prevCategory = decisionCategorySelect.value;
      }
    });
  }

  const decisionVisibleToggle = document.getElementById("decisionVisibleToggle");
  if (decisionVisibleToggle) {
    decisionVisibleToggle.addEventListener("change", syncVisibleValueFromToggle);
    syncVisibleValueFromToggle();
  }

  // AI Help Dialog click listener
  const aiLogicHelpBtn = document.getElementById("aiLogicHelpBtn");
  if (aiLogicHelpBtn) {
    aiLogicHelpBtn.addEventListener("click", () => {
      window.showNovaAiHelpModal("aiDecisionPrompt");
    });
  }

  // AI Generator integration
  const generateAiDecisionBtn = document.getElementById("generateAiDecisionBtn");
  const aiDecisionPrompt = document.getElementById("aiDecisionPrompt");
  const aiStatus = document.getElementById("aiStatus");
  
  generateAiDecisionBtn.addEventListener("click", async () => {
    const prompt = aiDecisionPrompt.value.trim();
    if (!prompt) return;
    
    aiStatus.textContent = "Generating...";
    generateAiDecisionBtn.disabled = true;
    
    const storedKey = localStorage.getItem("gemini_api_key") || localStorage.getItem("geminiApiKey");
    const systemPrompt = `You are a Master-Level Hearts of Iron IV (HOI4) Decision Scripting AI.
Your purpose is to translate user requests into structured decision properties.
You MUST output ONLY a valid JSON object. Do NOT wrap the JSON in markdown code blocks. Do not include any explanation or chatter.
The JSON object must have this exact structure:
{
  "category": "custom_decisions",
  "id": "custom_decision_1",
  "name": "Custom Decision",
  "cost": "50",
  "days": "365",
  "fireOnce": "yes",
  "available": "has_political_power > 50",
  "modifier": "industrial_capacity_factory = 0.1",
  "effect": "add_political_power = -50"
}`;

    try {
      const response = await fetch("/api/ai/logic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          systemPrompt,
          modPath: localStorage.getItem("activeModPath") || "",
          apiKey: storedKey || ""
        })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      
      const parsedData = window.NovaAI.parseJsonResponse(data.script);

      const nextCategory = cleanScriptId(parsedData.category, "custom_decisions");
      const nextId = cleanScriptId(parsedData.id, "custom_decision_1");
      // #ai-generate-renames-the-open-decision — the generated decision REPLACES what is in the form, so it
      // is a new decision, not a rename of whatever happened to be open. Leaving loadedIdentity attached made
      // the next Save read the new id as a rename of the decision the user had merely been looking at: the
      // server stripped that block and deleted its localisation keys. ⧉ Duplicate clears this for exactly the
      // same reason, and says so in its own comment; the AI path never got the line.
      loadedIdentity = null;
      setDecisionCategory(nextCategory);
      document.getElementById("decisionId").value = nextId;
      const decisionNameInput = document.getElementById("decisionName");
      if (decisionNameInput) decisionNameInput.value = parsedData.name || makeReadableDecisionName(nextId);
      document.getElementById("decisionCost").value = parsedData.cost || "50";
      document.getElementById("decisionDays").value = parsedData.days || "365";
      document.getElementById("decisionFireOnce").value = parsedData.fireOnce || "yes";
      document.getElementById("decisionAvailable").value = parsedData.available || "";
      document.getElementById("decisionModifier").value = parsedData.modifier || "";
      document.getElementById("decisionEffect").value = parsedData.effect || "";
      if (document.getElementById("decisionAllowed")) document.getElementById("decisionAllowed").value = parsedData.allowed || "";
      if (document.getElementById("decisionAiWillDo")) document.getElementById("decisionAiWillDo").value = parsedData.aiWillDo || "";

      // Trigger input and change events to sync draft and update live preview
      ["decisionId", "decisionName", "decisionCost", "decisionDays", "decisionFireOnce", "decisionAvailable", "decisionModifier", "decisionEffect", "decisionAllowed", "decisionAiWillDo"].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });
      updateLivePreview();
      
      aiStatus.textContent = "AI Decision successfully parsed and loaded into the form!";
      aiStatus.style.color = "#2ea043";
    } catch (err) {
      aiStatus.textContent = "Error: " + err.message;
      aiStatus.style.color = "#f85149";
    } finally {
      generateAiDecisionBtn.disabled = false;
    }
  });

  // Duplicate: make an editable COPY of the loaded decision with a fresh, non-colliding id, ready to
  // Save as a new decision (the original is untouched). A big time-saver when building many variants.
  function allDecisionIds() {
    const ids = new Set();
    (allCategories || []).forEach((c) => (c.decisions || []).forEach((d) => { if (d && d.id) ids.add(d.id); }));
    return ids;
  }
  function uniqueDecisionId(base) {
    const ids = allDecisionIds();
    const root = String(base || "decision").replace(/_copy\d*$/i, "");
    let cand = root + "_copy", n = 2;
    while (ids.has(cand)) cand = root + "_copy" + n++;
    return cand;
  }
  const duplicateDecisionBtn = document.getElementById("duplicateDecisionBtn");
  if (duplicateDecisionBtn) {
    duplicateDecisionBtn.addEventListener("click", () => {
      // #create-new-discards-the-form — Duplicate rebuilds the form from the loaded decision, so anything
      // typed since is gone the same way.
      if (decisionEditorIsDirty()) {
        confirmDiscardDecisionEdits(() => duplicateDecisionBtn.click());
        return;
      }
      const cur = (document.getElementById("decisionId").value || "").trim();
      if (!cur) { (window.nbAlert || window.alert)("Load or select a decision first — Duplicate then makes an editable copy of it."); return; }
      const copyId = uniqueDecisionId(cur);
      document.getElementById("decisionId").value = copyId;
      const nameInput = document.getElementById("decisionName");
      if (nameInput) nameInput.value = (nameInput.value || makeReadableDecisionName(cur)).replace(/\s*\(copy\)\s*$/i, "") + " (copy)";
      // It's now a NEW, unsaved decision: drop the active selection + hide Delete until it's saved.
      // Critically, forget the on-disk identity — otherwise saving the copy would be read as renaming the
      // ORIGINAL and delete it, which is the opposite of duplicating.
      loadedIdentity = null;
      document.querySelectorAll(".decision-item").forEach((el) => el.classList.remove("active"));
      const delBtn = document.getElementById("deleteDecisionBtn"); if (delBtn) delBtn.classList.add("is-hidden");
      // A fresh copy owns no countries yet — clear the game-start owner chips so Save doesn't silently
      // write the ORIGINAL decision's startup-activation bindings onto the copy (mirrors New Decision).
      if (decisionBridge) decisionBridge.clear();
      ["decisionId", "decisionName"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) { el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }
      });
      if (typeof updateLivePreview === "function") updateLivePreview();
      markDecisionEditorClean(); // the copy as-created is the baseline
      if (window.nbAlert) window.nbAlert('Copy ready as "' + copyId + '". Tweak it if you like, then Save to create it — the original "' + cur + '" is untouched.', "Duplicated");
    });
  }

  // Create New buttons click handlers
  const newDecisionBtn = document.getElementById("newDecisionBtn");
  if (newDecisionBtn) {
    newDecisionBtn.addEventListener("click", () => {
      // #create-new-discards-the-form — the decision list's own click has asked before discarding since the
      // unsaved-changes guard went in; this button did not, and it replaces the same form.
      if (decisionEditorIsDirty()) {
        confirmDiscardDecisionEdits(() => newDecisionBtn.click());
        return;
      }
      const generatedId = "new_decision_" + Math.floor(Math.random() * 1000);
      activeDraft = {
        id: generatedId,
        name: "New Decision",
        cost: "50",
        icon: "GFX_decision_generic_decision",
        days: "365",
        fireOnce: "yes",
        available: "has_political_power > 50",
        modifier: "",
        effect: "add_political_power = -50",
        autoSelect: true
      };

      loadedIdentity = null; // a brand-new decision has nothing on disk to rename
      loadedVisibleBody = ""; // …and no authored visible conditions to restore
      decCleanSnapshot = null;  // a fresh template is baselined below, after the fields are filled in
      setDecisionCategory("custom_decisions");
      document.getElementById("decisionId").value = generatedId;
      const decisionNameInput = document.getElementById("decisionName");
      if (decisionNameInput) decisionNameInput.value = "New Decision";
      document.getElementById("decisionCost").value = "50";
      document.getElementById("decisionPictureId").value = "GFX_decision_generic_decision";
      updateIconPreview("GFX_decision_generic_decision");
      document.getElementById("decisionPictureUpload").value = "";
      document.getElementById("decisionDays").value = "365";
      document.getElementById("decisionFireOnce").value = "yes";
      document.getElementById("decisionAvailable").value = "has_political_power > 50";
      document.getElementById("decisionModifier").value = "";
      document.getElementById("decisionEffect").value = "add_political_power = -50";
      document.getElementById("decisionType").value = "normal";
      document.getElementById("decisionScope").value = "country";
      document.getElementById("decisionCooldown").value = "0";
      document.getElementById("decisionTargetTrigger").value = "";
      document.getElementById("decisionRemoveEffect").value = "";
      // ⚙️ Advanced fields start blank on a fresh decision.
      ["decisionPriority", "decisionCancelIfNotVisible", "decisionCustomCostText", "decisionCustomCostTrigger",
       "decisionTargetedModifier", "decisionRemoveTrigger", "decisionOnMapMode", "decisionHighlightStates",
       "decisionCancelTriggerAdv", "decisionCancelEffect", "decisionTargetRootTrigger", "decisionTargetArray",
       "decisionAiHintPpCost", "decisionFixedRandomSeed", "decisionTargetNonExisting", "decisionTargetsDynamic"]
        .forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
      const visibleToggle = document.getElementById("decisionVisibleToggle");
      if (visibleToggle) visibleToggle.checked = true;
      syncVisibleValueFromToggle();
      updateDecisionTypeLabels();
      updateScopeVisibility();
      updateLivePreview();
      if (window.__novaRefreshGenesisPreviews) window.__novaRefreshGenesisPreviews();
      document.getElementById("aiDecisionPrompt").value = "";
      document.getElementById("aiStatus").textContent = "Starter Decision Template Ready! Fill in details and click 'Save Decision' to save.";
      document.getElementById("aiStatus").style.color = "#58a6ff";
      if (decisionBridge) decisionBridge.clear(); // fresh template — no owner countries yet
      markDecisionEditorClean(); // the untouched template is the baseline; only real edits count as unsaved
      setCountryLockValue(""); // …and no country restriction
      if (document.getElementById("deleteDecisionBtn")) document.getElementById("deleteDecisionBtn").classList.add("is-hidden");

      // Refresh list to show Draft folder at top
      renderDecisionsList(allCategories);

      // Focus + select the name so you can immediately type the real name over the "New Decision" placeholder.
      if (decisionNameInput) setTimeout(() => { try { decisionNameInput.focus(); decisionNameInput.select(); } catch (_) {} }, 0);
    });
  }

  const newCategoryBtn = document.getElementById("newCategoryBtn");
  if (newCategoryBtn) {
    newCategoryBtn.addEventListener("click", () => {
      setDecisionCategory("custom_decisions");
    });
  }

  // Save Decision integration
  const saveDecisionBtn = document.getElementById("saveDecisionBtn");
  if (saveDecisionBtn) {
    saveDecisionBtn.addEventListener("click", async () => {
      const categoryId = document.getElementById("decisionCategory").value.trim();
      const id = document.getElementById("decisionId").value.trim();
      const name = document.getElementById("decisionName")?.value.trim() || makeReadableDecisionName(id);
      const cost = document.getElementById("decisionCost").value;
      const icon = document.getElementById("decisionPictureId").value.trim();
      const days = document.getElementById("decisionDays").value;
      const fireOnce = document.getElementById("decisionFireOnce").value;
      const available = document.getElementById("decisionAvailable").value.trim();
      const modifier = document.getElementById("decisionModifier").value.trim();
      const effect = document.getElementById("decisionEffect").value.trim();
      const decisionType = document.getElementById("decisionType").value;
      const scope = document.getElementById("decisionScope").value;
      const cooldown = document.getElementById("decisionCooldown").value;
      const targetTrigger = document.getElementById("decisionTargetTrigger").value.trim();
      const removeEffect = document.getElementById("decisionRemoveEffect").value.trim();
      const isMission = decisionType === "mission";
      // Declared HERE, above its first use. It used to be declared further down with the rest of the Advanced
      // fields while `cancelTrigger` already called it, so every save of an ORDINARY decision died on
      // "Cannot access 'advVal' before initialization" — before the fetch, before any status was set, with
      // nothing written and nothing said. Only missions saved, because the mission branch of that ternary
      // never reaches the call. The endpoint was fine the whole time, which is why the API-level tests never
      // saw it.
      const advVal = (elId) => { const el = document.getElementById(elId); return el ? el.value.trim() : ""; };
      const activation = isMission ? (document.getElementById("decisionActivation").value.trim()) : "";
      // `cancel_trigger` is NOT mission-only — 481 of vanilla's 603 users are ordinary decisions — so in
      // decision mode the Advanced box is the one on screen and therefore the source of truth. Reading only
      // the mission box meant an ordinary decision could never have one, and posting "" for it would have
      // deleted an authored one.
      const cancelTrigger = isMission
        ? document.getElementById("decisionCancelTrigger").value.trim()
        : advVal("decisionCancelTriggerAdv");
      const isGood = isMission ? (document.getElementById("decisionIsGood").value) : "no";
      const selectableMission = isMission ? (document.getElementById("decisionSelectableMission").value) : "";
      const visible = document.getElementById("decisionVisible").value.trim();
      const allowedEl = document.getElementById("decisionAllowed");
      const countryLockEl = document.getElementById("decisionCountryLock");
      // If a country is picked, bake `tag = X #nova_country_lock` into the Allowed block (merged with
      // anything the modder typed). Blank = no restriction (any country), so the lock line is stripped.
      const allowed = injectCountryLock(allowedEl ? allowedEl.value.trim() : "", countryLockEl ? countryLockEl.value : "", countryLockEl ? countryLockEl.dataset.lockKeyword : "");
      const aiWillDoEl = document.getElementById("decisionAiWillDo");
      const aiWillDo = aiWillDoEl ? aiWillDoEl.value.trim() : "";
      // ⚙️ Advanced fields (all optional). `advVal` is declared at the top of this handler.
      const priority = advVal("decisionPriority");
      const cancelIfNotVisible = advVal("decisionCancelIfNotVisible");
      const customCostText = advVal("decisionCustomCostText");
      const customCostTrigger = advVal("decisionCustomCostTrigger");
      const targetedModifier = advVal("decisionTargetedModifier");
      const removeTrigger = advVal("decisionRemoveTrigger");
      // cancel_trigger is valid on an ordinary decision too, so the Advanced box is the source of truth in
      // decision mode and the mission-mode box is used when the mission fields are on screen.
      const cancelEffect = advVal("decisionCancelEffect");
      const targetRootTrigger = advVal("decisionTargetRootTrigger");
      const targetArray = advVal("decisionTargetArray");
      const aiHintPpCost = advVal("decisionAiHintPpCost");
      const fixedRandomSeed = advVal("decisionFixedRandomSeed");
      const targetNonExisting = advVal("decisionTargetNonExisting");
      const targetsDynamic = advVal("decisionTargetsDynamic");
      const onMapMode = advVal("decisionOnMapMode");
      const highlightStates = advVal("decisionHighlightStates");

      if (!categoryId || !id) {
        nbAlert("Category ID and Decision ID are required.");
        return;
      }
      // Guard NEW ids, but never block editing one that already exists — mods really do ship categories like
      // `00_missile_decisions` and ids containing '-', and they work in-game. Say what's actually wrong
      // rather than always blaming a leading digit.
      {
        const idOk = (v) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(v);
        const explain = (what, v) => {
          if (/^[0-9]/.test(v)) return `${what} "${v}" can't start with a digit — the game reads that as a number, which breaks the file.`;
          if (/\s/.test(v)) return `${what} "${v}" can't contain spaces.`;
          if (/-/.test(v)) return `${what} "${v}" can't contain a hyphen — use an underscore.`;
          if (/\./.test(v)) return `${what} "${v}" can't contain a dot.`;
          return `${what} "${v}" can only contain letters, numbers and underscores, and must start with a letter or underscore.`;
        };
        const catExists = (allCategories || []).some((c) => c && c.id === categoryId);
        const decExists = allDecisionIds().has(id);
        if (!idOk(categoryId) && !catExists) { nbAlert(explain("Category ID", categoryId)); return; }
        if (!idOk(id) && !decExists) { nbAlert(explain("Decision ID", id)); return; }
      }

      // Two ways a "mission" quietly isn't one. Both WARN rather than block — the modder may be building
      // something deliberate — but neither used to be mentioned at all.
      if (isMission) {
        const notes = [];
        // The wiki: days_mission_timeout "is the attribute that turns a decision into a mission". With 0 the
        // key isn't written, so what gets saved is an ordinary decision carrying inert mission fields — while
        // the label invites exactly that by saying "0 for none".
        if (!String(days || "").trim() || String(days).trim() === "0") {
          notes.push("• No mission timeout, so this saves as an ordinary decision, not a mission. Give it a number of days (or a script variable) to make it a mission.");
        }
        // …and without either real Available conditions or "player clicks it", the complete effect fires the
        // instant the mission activates, so it finishes and disappears on the same tick.
        if (!available && selectableMission !== "yes") {
          notes.push('• Available is empty and it is set to complete on its own, so it will finish the moment it starts. Either add an Available condition or choose "The player clicks it".');
        }
        if (notes.length) {
          nbAlert("This mission may not behave the way you expect:\n\n" + notes.join("\n\n") + "\n\nSaving anyway.");
        }
      }

      // A DECISION THAT DOES NOTHING (#decision-no-effect). Everything above was inside `if (isMission)`,
      // so an ordinary decision with a cost and no effect at all saved with a plain success toast. The user
      // met nine of them in game — a button that charges 10 political power, runs a timer and then does
      // nothing. WARN, never block: an author may be building the effect in stages, and a decision whose
      // whole job is a `modifier` or a timer is legitimate. This only fires when EVERY way a decision can
      // act is empty.
      if (!isMission && !String(effect || "").trim() && !String(removeEffect || "").trim() && !String(modifier || "").trim()) {
        const costly = Number(String(cost || "0").trim()) > 0;
        nbAlert(
          "This decision has no Effect, no Remove effect and no Modifier, so clicking it will do nothing in game" +
          (costly ? ` — it will still charge ${String(cost).trim()} political power.` : ".") +
          "\n\nSaving anyway; add one of those three if it is meant to act."
        );
      }

      saveDecisionBtn.disabled = true;
      saveDecisionBtn.textContent = "Saving...";

      try {
        const response = await fetch("/api/decisions/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modPath: getModPath(),
            categoryId,
            id,
            fileName: homeFileFor(categoryId, id),
            // The CATEGORY tab art, chosen separately from the decision icon. Blank leaves the generic
            // default in place, which is what every category got before there was a control for it.
            categoryIcon: advVal("decisionCategoryIcon"),
            previousId: loadedIdentity ? loadedIdentity.id : "",
            previousCategoryId: loadedIdentity ? loadedIdentity.categoryId : "",
            name,
            cost,
            icon,
            days,
            fireOnce,
            available,
            modifier,
            effect,
            decisionType,
            scope,
            cooldown,
            targetTrigger,
            removeEffect,
            activation,
            cancelTrigger,
            selectableMission,
            cancelEffect,
            targetRootTrigger,
            targetArray,
            aiHintPpCost,
            fixedRandomSeed,
            targetNonExisting,
            targetsDynamic,
            isGood,
            visible,
            allowed,
            aiWillDo,
            priority,
            cancelIfNotVisible,
            customCostText,
            customCostTrigger,
            targetedModifier,
            removeTrigger,
            onMapMode,
            highlightStates
          })
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        // Activate this decision at game start for each chosen owner country (and unwire removed ones).
        // #owner-sync-result-discarded — sync() does not throw; it RETURNS what it could not write, and this
        // discarded it, so a refused owner write ended with "Successfully saved". Its own amber status line is
        // wiped ~50ms later by loadDecisionsList and the auto-select below, so the modal is where this belongs.
        const ownerSync = decisionBridge ? await decisionBridge.sync(id) : null;
        const ownerWarn = (ownerSync && ownerSync.failed.length)
          ? "\n\n⚠️ The decision was saved, but " + ownerSync.failed.length + " owner setting" +
            (ownerSync.failed.length === 1 ? "" : "s") + " could not be written:\n" +
            ownerSync.failed.map((f) => "• " + f.who + ": " + f.error).join("\n")
          : "";

        activeDraft = null; // Save succeeded, clear draft
        loadedIdentity = { id, categoryId }; // this is now what it's saved as — a further rename moves it again
        markDecisionEditorClean(); // saved, so there is nothing unsaved to warn about
        const movedNote = data.renamedFrom && (data.renamedFrom.id !== id || data.renamedFrom.categoryId !== categoryId)
          ? `\n\nRenamed from "${data.renamedFrom.id}" in "${data.renamedFrom.categoryId}" — the old definition was removed, so it isn't defined twice.`
          : "";
        nbAlert(`Successfully saved to ${data.decisionPath}!${movedNote}${ownerWarn}`);
        expandedCategories.add(categoryId);
        autoSelectId = id;
        loadDecisionsList();
      } catch (err) {
        nbAlert(`Save failed: ${err.message}`);
      } finally {
        saveDecisionBtn.disabled = false;
        saveDecisionBtn.textContent = "Save Decision";
      }
    });
  }
  // (Owner countries are managed by the shared owner-bridge chips; no single-tag listener needed.)

  // ── Reference Picker Modal ─────────────────────────────────────────────
  // Which KIND of block a decision textarea holds. HOI4 accepts completely different script in each, and the
  // quick-insert chips previously ignored the distinction entirely. #quick-insert-writes-effects-into-triggers
  function decisionBoxKind(textareaId) {
    const id = String(textareaId || "");
    if (/Effect$/.test(id) || id === "decisionEffect") return "effect";
    if (/Modifier$/i.test(id)) return "modifier";           // decisionModifier, decisionTargetedModifier
    if (/Trigger$/i.test(id)) return "trigger";             // cancel/remove/target/customCost triggers
    if (id === "decisionAvailable" || id === "decisionVisible" || id === "decisionAllowed") return "trigger";
    if (id === "decisionAiWillDo") return "aiwilldo";
    return "effect"; // unknown box: keep the previous behaviour rather than refusing something that worked
  }

  /** The right script for this entity in THIS box, or "" when the combination has no meaningful form. */
  function quickInsertSyntaxFor(type, textareaId, id) {
    const kind = decisionBoxKind(textareaId);
    if (kind === "effect") {
      if (type === "spirit") return `add_ideas = ${id}`;
      if (type === "tech") return `set_technology = {\n\t${id} = 1\n}`;
      if (type === "event") return `country_event = ${id}`;
      if (type === "decision") return `activate_decision = ${id}`;
      return "";
    }
    if (kind === "trigger") {
      if (type === "spirit") return `has_idea = ${id}`;
      if (type === "tech") return `has_tech = ${id}`;
      if (type === "decision") return `has_decision = ${id}`;
      // HOI4 has no "this event has fired" trigger — the idiom is for the event to set a country flag and
      // for the trigger to test that flag, which Nova cannot invent a name for.
      return "";
    }
    // A modifier block holds MODIFIERS (political_power_gain = 0.05 …). None of these four belong there.
    return "";
  }

  function quickInsertWhyNot(type, textareaId) {
    const kind = decisionBoxKind(textareaId);
    if (kind === "modifier") {
      return "This box holds MODIFIERS — things like political_power_gain = 0.05 that apply while the decision is active. A spirit, tech, event or decision reference isn't a modifier, so there's nothing valid to insert here. Use the Effect box to grant one.";
    }
    if (kind === "trigger" && type === "event") {
      return "This box holds CONDITIONS, and HOI4 has no \"has this event fired\" trigger. The usual approach is to set a country flag in the event (set_country_flag = my_flag) and test it here with has_country_flag = my_flag.";
    }
    return "There's no valid way to reference that here — this box holds conditions, not effects.";
  }

  async function showEntityPickerModal(type, targetTextarea) {
    const dialog = document.createElement("dialog");
    dialog.style.cssText = `
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      color: #c9d1d9;
      padding: 20px;
      width: 450px;
      max-width: 90%;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      outline: none;
    `;

    const titleMap = {
      spirit: "Select National Spirit (Idea)",
      tech: "Select Starting Technology",
      event: "Select Event to Fire",
      decision: "Select Decision to Activate"
    };

    const header = document.createElement("div");
    header.style.cssText = "display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;";
    header.innerHTML = `
      <h3 style="margin: 0; font-size: 16px; font-weight: 600; color: #e6edf3;">${titleMap[type] || "Select Entity"}</h3>
      <button class="close-btn" style="background: transparent; border: none; color: #8b949e; font-size: 18px; cursor: pointer; padding: 4px; line-height: 1;">✕</button>
    `;
    dialog.appendChild(header);

    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "🔍 Search by ID or name...";
    searchInput.style.cssText = "width: 100%; padding: 8px 12px; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; color: #c9d1d9; font-size: 13px; margin-bottom: 12px; outline: none;";
    dialog.appendChild(searchInput);

    const listContainer = document.createElement("div");
    listContainer.style.cssText = "max-height: 250px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; padding-right: 4px;";
    dialog.appendChild(listContainer);

    document.body.appendChild(dialog);
    dialog.showModal();

    const closeDialog = () => {
      dialog.close();
      dialog.remove();
    };

    header.querySelector(".close-btn").addEventListener("click", closeDialog);
    dialog.addEventListener("cancel", closeDialog);

    listContainer.innerHTML = `<div style="text-align: center; color: #8b949e; padding: 12px; font-size: 13px;">Loading...</div>`;

    try {
      const activeRoot = getModPath();
      let items = [];
      if (type === "spirit") {
        // withNames=1, or the catalogue returns no names at all; and the field is `localizedName` — `it.name`
        // does not exist on a catalogue item under any query, so this picker's grey name line was dead for
        // the spirit type while working for tech/event/decision. #pickers-show-raw-tokens
        const resp = await fetch(`/api/ideas/catalog?includeVanilla=1&includeActiveMod=1&withNames=1&modPath=${encodeURIComponent(activeRoot)}`);
        const data = await resp.json();
        items = (data.items || [])
          .map(it => ({ id: it.ideaId, name: it.localizedName || it.ideaId }))
          .filter(it => it.id && it.id !== "country" && it.id !== "hidden_ideas");
      } else if (type === "tech") {
        const qs = new URLSearchParams({ includeVanilla: "1", includeActiveMod: "1" });
        // `modPath` — the endpoint has never read `sourcePath` (that is /api/ideas/catalog's spelling, from
        // which this picker was copied). It fell back to the persisted active mod, listing vanilla only.
        // #tech-picker-sends-a-param-nobody-reads
        if (activeRoot) qs.set("modPath", activeRoot);
        qs.set("lite", "1"); // picker needs id + name only; skip the slow per-icon resolution
        const resp = await fetch(`/api/technologies/catalog?${qs}`);
        const data = await resp.json();
        // /api/technologies/catalog answers { technologies, equipments, customTabs, … } — there is no
        // `items`. Reading it gave undefined, the `|| data` fallback yielded the plain response OBJECT, and
        // `.map` threw, so this picker showed "Failed to load items." every single time it was opened. Same
        // defect, same chain, already fixed in public/app.js:9910 with a comment describing it — this is the
        // sibling that never adopted it. No `|| data` fallback: a bare object is never a list.
        // #tech-picker-reads-the-wrong-key
        items = (data.technologies || data.items || []).map(t => ({ id: t.id, name: t.name || t.id }));
      } else if (type === "event") {
        const resp = await fetch(`/api/events/list?modPath=${encodeURIComponent(activeRoot)}&includeInherited=1`);
        const data = await resp.json();
        items = (data.events || []).map(evt => ({ id: evt.fullId, name: evt.title || evt.fullId }));
      } else if (type === "decision") {
        const resp = await fetch(`/api/decisions/list?modPath=${encodeURIComponent(activeRoot)}&includeInherited=1`);
        const data = await resp.json();
        const cats = data.categories || [];
        items = cats.flatMap(cat => (cat.decisions || []).map(dec => ({ id: dec.id, name: dec.id })));
      }

      const renderList = (filter = "") => {
        listContainer.innerHTML = "";
        const filtered = items.filter(it => 
          it.id.toLowerCase().includes(filter) || 
          (it.name && it.name.toLowerCase().includes(filter))
        );

        if (!filtered.length) {
          listContainer.innerHTML = `<div style="text-align: center; color: #8b949e; padding: 12px; font-size: 13px;">No items found</div>`;
          return;
        }

        filtered.forEach(it => {
          const btn = document.createElement("button");
          btn.style.cssText = "text-align: left; background: #21262d; border: 1px solid #30363d; border-radius: 4px; padding: 8px 12px; color: #c9d1d9; font-size: 12px; cursor: pointer; display: flex; flex-direction: column; gap: 2px; width: 100%; transition: background 0.15s; margin-bottom: 2px;";
          btn.addEventListener("mouseenter", () => btn.style.background = "#30363d");
          btn.addEventListener("mouseleave", () => btn.style.background = "#21262d");

          btn.innerHTML = `
            <div style="font-family: monospace; font-weight: bold; color: #58a6ff;">${escapeHtml(it.id)}</div>
            ${it.name && it.name !== it.id ? `<div style="color: #8b949e; font-size: 11px;">${escapeHtml(stripLocDisplayCodes(it.name))}</div>` : ""}
          `;

          btn.addEventListener("click", () => {
            // #quick-insert-writes-effects-into-triggers — every chip used to emit EFFECT syntax regardless of
            // which box it was opened for. `add_ideas` / `set_technology` / `country_event` /
            // `activate_decision` are only valid in an effect block; in Available or Visible they must be
            // CONDITIONS, and a decision's `modifier = { }` holds modifiers, not entity references at all.
            // So 8 of the 12 chips wrote script that is invalid where it landed, Save accepted it, and the mod
            // shipped things like `available = { activate_decision = … }`.
            const syntax = quickInsertSyntaxFor(type, targetTextarea && targetTextarea.id, it.id);
            if (!syntax) {
              // No sensible equivalent exists for this box — say so rather than inserting something wrong.
              (window.nbAlert || window.alert)(quickInsertWhyNot(type, targetTextarea && targetTextarea.id), "Nothing to insert here");
              dialog.close();
              return;
            }

            const start = targetTextarea.selectionStart;
            const end = targetTextarea.selectionEnd;
            const val = targetTextarea.value;
            const prefix = val.substring(0, start);
            const suffix = val.substring(end);

            let insertText = syntax;
            if (prefix.length > 0 && !prefix.endsWith("\n")) {
              insertText = "\n" + insertText;
            }
            if (suffix.length > 0 && !suffix.startsWith("\n")) {
              insertText = insertText + "\n";
            }

            targetTextarea.value = prefix + insertText + suffix;
            targetTextarea.focus();
            targetTextarea.selectionStart = targetTextarea.selectionEnd = start + insertText.length;
            
            targetTextarea.dispatchEvent(new Event('input', { bubbles: true }));
            targetTextarea.dispatchEvent(new Event('change', { bubbles: true }));

            closeDialog();
          });

          listContainer.appendChild(btn);
        });
      };

      renderList();
      searchInput.addEventListener("input", (e) => renderList(e.target.value.toLowerCase().trim()));

    } catch (e) {
      console.error(e);
      listContainer.innerHTML = `<div style="text-align: center; color: #f85149; padding: 12px; font-size: 13px;">Failed to load items.</div>`;
    }
  }

  // Bind insert button clicks
  document.querySelectorAll(".quick-insert-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.type;
      const targetId = btn.dataset.target;
      const textarea = document.getElementById(targetId);
      if (textarea) {
        showEntityPickerModal(type, textarea);
      }
    });
  });
});
