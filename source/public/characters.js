"use strict";
// Character Maker — create/edit country leaders, advisors, and generals/admirals.
(function () {
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

  const $ = (id) => document.getElementById(id);
  let allFiles = [];
  let editingFile = null; // file of the character currently loaded (for delete)
  // The token this character was LOADED under. Editing the token box renames, so the save has to be
  // told which block to remove — without it the old one stays behind and you get two characters
  // (#character-rename). Null for a brand-new character, which has nothing to replace.
  let loadedToken = null;
  // Portrait categories the editor does not model but must not destroy (#character-navy-portrait).
  let carriedNavyPortraits = { large: "", small: "" };
  // #character-instance-editor — a DLC-gated character is a set of `instance = { … }` bodies, one per DLC
  // condition, and the form can only hold one at a time. These remember which one is on screen so Save can say
  // which to rewrite; the server refuses a save that does not name one rather than flattening the character.
  // Roles this character had when it was LOADED — see #role-checkbox-cannot-turn-off.
  let loadedRoles = null;
  let loadedInstances = [];
  let loadedInstanceIndex = 0;
  let allVanillaSprites = null; // cached sprites map/list
  let recruitRefresh = null; // set by initRecruitBridge: re-detect which country the loaded character is in
  let _traitPool = null; // { leader:[...], unit:[{name,type}] } — cached per mod for the trait picker
  let _traitPickerTarget = null; // textarea id the trait picker is currently appending to

  function normalizePath(p) { return String(p || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase(); }
  function modPath() { return localStorage.getItem("activeModPath") || ""; }

  function cleanScriptId(value, fallback) {
    const cleaned = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "");
    return cleaned || fallback;
  }

  // Advanced Settings opt-in: does the server allow writing into the real vanilla HOI4 install? Off on
  // every fresh launch. When vanilla is active and this is false, the write endpoints reject AFTER the
  // round-trip (a raw error toast), so grey out the write controls up-front instead. #vanilla-ro
  let vanillaEditsAllowed = false;
  const CHAR_WRITE_BTN_IDS = ["saveCharBtn", "duplicateCharBtn", "deleteCharBtn", "uploadCivLarge", "uploadCivSmall", "uploadArmyLarge", "uploadArmySmall"];
  function setWriteControlsLocked(locked) {
    const why = "Vanilla is read-only. Select or create a mod (or enable “Allow editing vanilla game files” in Settings) to edit.";
    CHAR_WRITE_BTN_IDS.forEach((id) => {
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
    // #vanilla-by-name — the flag on the option, never its TEXT. A mod called "Vanilla Plus" had its
    // write controls disabled and the read-only banner shown over it.
    const isVanilla = !!(sel.options[sel.selectedIndex] && sel.options[sel.selectedIndex].dataset.vanilla === "1");
    banner.style.display = isVanilla ? "" : "none";
    setWriteControlsLocked(isVanilla && !vanillaEditsAllowed);
  }

  const expandedFolders = new Set();

  // #makers-lose-unsaved-work — this page threw away a written character without asking: clicking another
  // one in the list, or a DLC-variant chip, or changing the mod, replaced the traits, the ideology, the
  // advisor slot and every general stat with no prompt and no way back.
  //
  // The shared watcher in loading-overlay.js owns the pattern. Scoped to .ch-main, which holds all 28
  // controls of the editor and excludes the list search, the portrait and trait picker searches, and the
  // "new trait" modal — none of which is the character being written.
  const chUnsaved = (typeof window.novaWatchUnsaved === "function") ? window.novaWatchUnsaved({
    root: ".ch-main",
    label: "the Character maker",
    saveButtonId: "saveCharBtn",
    ignoreIds: ["aiCharPrompt"],
  }) : null;

  async function initModSelector() {
    const sel = $("headerModSelector") || $("modSelector");
    if (!sel) return;
    try {
      // Learn whether vanilla writes are permitted (advanced Settings) before the banner/lock first runs.
      try {
        const s = await fetch("/api/settings/allow-vanilla-edits").then((r) => r.json());
        vanillaEditsAllowed = Boolean(s && s.allowed);
      } catch (_) { vanillaEditsAllowed = false; }
      const data = await fetch("/api/mods/list").then((r) => r.json());
      sel.innerHTML = "";
      (data.mods || []).forEach((m) => {
        const o = document.createElement("option");
        o.value = m.path; o.textContent = m.name;
        // #vanilla-by-name — the server publishes a PATH-based `isVanilla`; keying off a "vanilla"
        // substring in the NAME locked real mods like "Vanilla Plus" read-only.
        if (m.isVanilla === true
          || (m.isVanilla === undefined && normalizePath(m.path).includes("steamapps/common/hearts of iron iv"))) {
          o.dataset.vanilla = "1";
        }
        if (normalizePath(m.path) === normalizePath(modPath())) o.selected = true;
        sel.appendChild(o);
      });
      // Stored mod missing from THIS list (transient enumeration miss) → show it as "(not detected)" so the
      // header doesn't silently display the first (vanilla) mod while localStorage still points at the real one.
      const _act = modPath();
      if (_act && !(data.mods || []).some((m) => normalizePath(m.path) === normalizePath(_act))) {
        const o = document.createElement("option");
        o.value = _act; o.textContent = (_act.split(/[\\/]/).filter(Boolean).pop() || _act) + " (not detected)";
        sel.insertBefore(o, sel.firstChild); sel.value = _act;
      }
      if (!modPath() && data.mods && data.mods.length) {
        // …and the same when choosing a default: by the flag, so a mod merely NAMED "…Vanilla…" is a
        // perfectly good first choice rather than being skipped over.
        const nonVanilla = data.mods.find((m) => !m.isVanilla);
        const v = nonVanilla || data.mods[0];
        localStorage.setItem("activeModPath", v.path); sel.value = v.path;
      }
      updateVanillaBanner();
      sel.addEventListener("change", () => {
        // #makers-lose-unsaved-work — switching mod reloads the list and abandons the editor. Put the
        // selector back BEFORE asking, so cancelling leaves it naming the mod that is actually loaded.
        if (chUnsaved && chUnsaved.isDirty()) {
          const selected = sel.value;
          sel.value = localStorage.getItem("activeModPath") || "";
          chUnsaved.confirmDiscard("Switch mod", () => {
            sel.value = selected;
            sel.dispatchEvent(new Event("change"));
          });
          return;
        }
        localStorage.setItem("activeModPath", sel.value);
        allVanillaSprites = null; // Clear portrait cache for picker
        _traitPool = null; // re-fetch traits for the newly-selected mod
        updateVanillaBanner();
        // …and the advisor slots, which are per-mod for the same reason the traits are: a mod's own
        // common/idea_tags REPLACES vanilla's. Without this the dropdown keeps the previous mod's slots and
        // #advisor-slot-hardcoded comes straight back — vanilla → Millennium Dawn would still offer
        // political_advisor and theorist, which MD does not define. Re-baselined afterwards because the
        // refresh can change the selected value on its own, and a change the user did not make must not
        // read as unsaved work.
        loadAdvisorSlots().then(() => { if (chUnsaved) chUnsaved.markCleanUnlessTouched(); }).catch(() => {});
        loadList();
      });
    } catch (_) { sel.innerHTML = '<option>-- error --</option>'; }
  }

  function roleSummary(c) {
    const r = [];
    if (c.roleLeader) r.push("Leader");
    if (c.roleAdvisor) r.push("Advisor:" + (c.advisorSlot || "?"));
    if (c.roleGeneral) r.push(c.generalType || "general");
    return r.join(" · ") || "no roles";
  }

  function esc(s) { return String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  // Strip HOI4 loc DISPLAY codes (colour §R…§!, £text_icon sprites, [SCOPE.GetName] scripted refs) for
  // read-only labels — the same helper the other makers use. DISPLAY ONLY: the editable field and the
  // saved loc value keep the raw string, so this never changes what's written to the mod.
  // Delegates to the one canonical implementation (#loc-display-strip in loading-overlay.js). Five
  // makers had grown their own near-copy and they disagreed — none stripped $KEY$ references or the
  // [?var|%fmt] print form, and the leading punctuation a removed token exposed was left behind.
  // DISPLAY ONLY: the editable field and the saved .yml keep the raw value.
  function stripLocDisplayCodes(s) {
    if (typeof window !== "undefined" && window.novaStripLocCodes) return window.novaStripLocCodes(s);
    return typeof s === "string" ? s.replace(/§[A-Za-z0-9!]/g, "").trim() : s;
  }

  // parseInt(x) || default silently swallows a REAL 0 (0 is falsy) — a free advisor (Cost 0) would
  // preview as the 150 PP default, and a 0 attack/defense stat as 1. Keep 0, fall back only on NaN.
  function numOr(v, d) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; }

  async function loadList() {
    const box = $("charList");
    box.innerHTML = '<div style="color:#8b949e;font-size:12px;padding:8px;">Loading…</div>';
    const filterText = ($("charsListSearch")?.value || "").toLowerCase().trim();
    try {
      const data = await fetch("/api/characters/list?modPath=" + encodeURIComponent(modPath()) + "&includeBaseMod=1").then((r) => r.json());
      allFiles = data.files || [];
      const baseModFiles = data.baseModFiles || [];
      if (!allFiles.length && !baseModFiles.length) { box.innerHTML = '<div style="color:#8b949e;font-size:12px;padding:8px;">No characters yet. Click “+ New Character”.</div>'; return; }
      box.innerHTML = "";
      if (!allFiles.length) { const n = document.createElement("div"); n.style.cssText = "color:#8b949e;font-size:11px;padding:6px 8px;"; n.textContent = "This mod has no characters of its own yet — click “+ New Character”."; box.appendChild(n); }
      let anyMatched = false;
      allFiles.forEach((f) => {
        let matchedCharacters = f.characters || [];
        if (filterText) {
          matchedCharacters = matchedCharacters.filter(c =>
            (c.name || "").toLowerCase().includes(filterText) ||
            (c.token || "").toLowerCase().includes(filterText)
          );
          if (matchedCharacters.length === 0) return;
        }
        anyMatched = true;

        const fileDiv = document.createElement("div");
        fileDiv.className = "category-container";

        const fileTitle = document.createElement("div");
        const isExpanded = !!filterText || expandedFolders.has(f.file) || (editingFile && editingFile === f.file);
        fileTitle.className = "category-title" + (isExpanded ? " expanded" : "");
        fileTitle.innerHTML = `
          <svg class="folder-chevron-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
          <svg class="folder-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
          <span class="folder-name-text">${f.file}</span>
          <span class="folder-count-badge">${matchedCharacters.length}</span>
        `;
        fileDiv.appendChild(fileTitle);

        const itemsContainer = document.createElement("div");
        itemsContainer.className = "category-items";
        itemsContainer.style.display = isExpanded ? "block" : "none";
        fileDiv.appendChild(itemsContainer);

        matchedCharacters.forEach((c) => {
          const div = document.createElement("div");
          div.className = "ch-card";
          if (c.token === $("chToken").value) div.classList.add("active");
          div.innerHTML = `<div class="t">${esc(stripLocDisplayCodes(c.name) || c.token)}</div><div class="r">${esc(roleSummary(c))}</div><div class="f">${esc(c.token)}</div>`;
          div.addEventListener("click", () => { 
            loadChar(c, f.file); 
            document.querySelectorAll(".ch-card").forEach((x) => x.classList.remove("active")); 
            div.classList.add("active"); 
          });
          itemsContainer.appendChild(div);
        });

        fileTitle.addEventListener("click", () => {
          if (itemsContainer.style.display === "none") {
            itemsContainer.style.display = "block";
            fileTitle.classList.add("expanded");
            expandedFolders.add(f.file);
          } else {
            itemsContainer.style.display = "none";
            fileTitle.classList.remove("expanded");
            expandedFolders.delete(f.file);
          }
        });

        box.appendChild(fileDiv);
      });
      if (baseModFiles.length) renderBaseModCharacters(baseModFiles, box, filterText);
      // When a search matches none of this mod's own characters and there's no base-mod
      // reference section to give its own feedback, the list would otherwise go blank.
      if (filterText && !anyMatched && !baseModFiles.length && allFiles.length) {
        const e = document.createElement("div");
        e.style.cssText = "color:#8b949e;font-size:12px;padding:12px;text-align:center;";
        e.innerHTML = `No characters match "<span style="color:#c9d1d9;">${esc(filterText)}</span>". Try a different search or clear the box.`;
        box.appendChild(e);
      }
    } catch (e) { box.innerHTML = '<div style="color:#f85149;font-size:12px;padding:8px;">' + esc(e.message) + "</div>"; }
  }

  // #111: a read-only "base-mod characters (reference)" section. An add-on (e.g. on Millennium Dawn)
  // can browse the base mod's characters here. It's SEARCH-DRIVEN: cards render only when you type in
  // the search box (or expand + search), so a base mod's thousands of characters never flood the DOM.
  // Clicking one loads it into the editor — Save then copies it into YOUR mod (never the base mod).
  function renderBaseModCharacters(baseModFiles, box, filterText) {
    const all = [];
    for (const f of baseModFiles) for (const c of (f.characters || [])) all.push({ ...c, file: f.file, source: f.source });
    const chevron = '<svg class="folder-chevron-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';
    const wrap = document.createElement("div");
    wrap.className = "category-container";
    const title = document.createElement("div");
    const expanded = !!filterText;
    title.className = "category-title" + (expanded ? " expanded" : "");
    // Honour the active search in the badge like the mod's OWN folders do — otherwise a filtered list of
    // 3 cards sits under a badge reading the base mod's full 5095.
    const matchPredicate = (c) => (c.name || "").toLowerCase().includes(filterText) || (c.token || "").toLowerCase().includes(filterText);
    const badgeCount = filterText ? all.filter(matchPredicate).length : all.length;
    title.innerHTML = `${chevron}<span class="folder-name-text">📦 Base-mod characters (reference)</span><span class="folder-count-badge">${badgeCount}</span>`;
    wrap.appendChild(title);
    const items = document.createElement("div");
    items.className = "category-items";
    items.style.display = expanded ? "block" : "none";
    wrap.appendChild(items);
    const render = () => {
      items.innerHTML = "";
      if (!filterText) {
        const h = document.createElement("div");
        h.style.cssText = "color:#8b949e;font-size:11px;padding:6px 8px;line-height:1.5;";
        h.textContent = "Type in the search box above to find a base-mod character. Click one to copy it into your mod.";
        items.appendChild(h);
        return;
      }
      const list = all.filter(matchPredicate);
      list.slice(0, 300).forEach((c) => {
        const div = document.createElement("div");
        div.className = "ch-card";
        div.style.opacity = "0.9";
        div.innerHTML = `<div class="t">${esc(stripLocDisplayCodes(c.name) || c.token)} <span style="font-size:10px;color:#8b949e;">(${esc(c.source || "base")})</span></div><div class="r">${esc(roleSummary(c))}</div><div class="f">${esc(c.token)}</div>`;
        div.addEventListener("click", () => {
          loadChar(c, c.file);
          // #delete-unwires-what-it-did-not-delete — loadChar un-hides Delete for every character, but this
          // one lives in a base mod Nova must not touch. Offering Delete here was worse than useless: the
          // server skipped the (nonexistent) file, then unwired the token from the user's OWN history anyway,
          // stripping their recruit_character lines while reporting a successful delete. The server refuses
          // that now; the button should not be there in the first place. Save still works — it copies the
          // character into YOUR mod, which is exactly what the status line below promises.
          $("deleteCharBtn").classList.add("is-hidden");
          document.querySelectorAll(".ch-card").forEach((x) => x.classList.remove("active"));
          div.classList.add("active");
          const st = $("charStatus");
          if (st) { st.textContent = `Loaded base-mod character “${c.token}” for reference — Save copies it into YOUR mod (the base mod is never touched).`; st.style.color = "#8b949e"; }
        });
        items.appendChild(div);
      });
      if (list.length === 0) { const e = document.createElement("div"); e.style.cssText = "color:#8b949e;font-size:11px;padding:6px 8px;"; e.textContent = "No base-mod character matches that search."; items.appendChild(e); }
      else if (list.length > 300) { const m = document.createElement("div"); m.style.cssText = "color:#8b949e;font-size:11px;padding:6px 8px;"; m.textContent = `…and ${list.length - 300} more — narrow your search.`; items.appendChild(m); }
    };
    render();
    title.addEventListener("click", () => {
      if (items.style.display === "none") { items.style.display = "block"; title.classList.add("expanded"); render(); }
      else { items.style.display = "none"; title.classList.remove("expanded"); }
    });
    box.appendChild(wrap);
  }

  function setRole(boxId, checkId, on) {
    const cb = $(checkId); if (cb) cb.checked = !!on;
    const box = $(boxId); if (box) box.classList.toggle("on", !!on);
  }

  // Draw the DLC-variant picker and load the selected variant's fields into the form. A character built out of
  // instances has no fields of its own — each instance is a complete body — so there is nothing sensible to
  // show until one is picked, and index 0 is picked for you.
  function renderInstancePicker(c, file) {
    const row = $("instanceRow"), chips = $("instanceChips");
    if (!row || !chips) return;
    loadedInstances = (c && Array.isArray(c.instances)) ? c.instances : [];
    if (!loadedInstances.length) { row.style.display = "none"; chips.textContent = ""; loadedInstanceIndex = 0; return; }
    row.style.display = "";
    chips.textContent = "";
    loadedInstances.forEach((inst, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn-secondary" + (i === loadedInstanceIndex ? " active" : "");
      b.textContent = inst.label || ("Variant " + (i + 1));
      b.title = inst.allowed ? "allowed = { " + inst.allowed + " }" : "This variant has no condition.";
      if (i === loadedInstanceIndex) { b.style.borderColor = "#8c60ce"; b.style.background = "#5d3b8e"; }
      b.addEventListener("click", () => {
        if (i === loadedInstanceIndex) return;
        loadedInstanceIndex = i;
        loadChar(c, file);
      });
      chips.appendChild(b);
    });
  }

  function loadChar(c, file) {
    // #makers-lose-unsaved-work — guard the FUNCTION, not the call sites. Three places replace this form
    // today — the mod's own character list, the inherited (base-mod) list, and the DLC-variant chips — and
    // guarding each one is how the fourth gets forgotten. On "discard" the watcher is already clean, so the
    // re-entry below runs straight through instead of asking twice.
    if (chUnsaved && chUnsaved.isDirty()) {
      chUnsaved.confirmDiscard("Switch character", () => loadChar(c, file));
      return;
    }
    editingFile = file;
    loadedToken = (c && c.token) ? String(c.token) : null;
    // Pick the variant BEFORE reading any field: for a DLC-gated character every field below comes from the
    // selected instance, not from the character, which has none of its own.
    const hadInstances = Array.isArray(c.instances) && c.instances.length > 0;
    // A different character starts at its own first variant — carrying the last one's selection over would
    // silently point the form at "With Gotterdammerung" for somebody who has no such variant.
    if (String(c.token || "") !== String($("chToken").value || "")) loadedInstanceIndex = 0;
    if (!hadInstances) loadedInstanceIndex = 0;
    else if (loadedInstanceIndex >= c.instances.length) loadedInstanceIndex = 0;
    renderInstancePicker(c, file);
    const src = hadInstances ? Object.assign({ token: c.token }, c.instances[loadedInstanceIndex]) : c;
    c = src;
    $("chToken").value = c.token || "";
    $("chName").value = unescapeLocForEdit(c.name && c.name !== c.token ? c.name : "");
    if ($("charGender")) $("charGender").value = c.gender === "female" ? "female" : "";
    $("chFile").value = file || "custom_characters.txt";
    $("pCivLarge").value = c.portraitCivLarge || "";
    $("pCivSmall").value = c.portraitCivSmall || "";
    $("pArmyLarge").value = c.portraitArmyLarge || "";
    $("pArmySmall").value = c.portraitArmySmall || "";
    // The navy portrait category has no field in the UI — it is carried invisibly so an admiral's naval
    // portrait survives a save (#character-navy-portrait). 39 vanilla characters and 3 MD ones have one.
    carriedNavyPortraits = { large: c.portraitNavyLarge || "", small: c.portraitNavySmall || "" };
    setRole("boxPortraits", null, c.portraitCivLarge || c.portraitArmyLarge);
    setRole("boxLeader", "roleLeader", c.roleLeader);
    $("leaderIdeology").value = c.leaderIdeology || "";
    $("leaderExpire").value = c.leaderExpire || "";
    $("leaderTraits").value = c.leaderTraits || "";
    setRole("boxAdvisor", "roleAdvisor", c.roleAdvisor);
    if (c.advisorSlot) $("advisorSlot").value = c.advisorSlot;
    $("advisorCost").value = c.advisorCost || "";
    $("advisorLedger").value = c.advisorLedger || "";
    $("advisorIdeaToken").value = c.advisorIdeaToken || "";
    $("advisorTraits").value = c.advisorTraits || "";
    if (typeof window.syncAdvisorLedgerVisibility === "function") window.syncAdvisorLedgerVisibility();
    setRole("boxGeneral", "roleGeneral", c.roleGeneral);
    if (c.generalType) $("generalType").value = c.generalType;
    // #role-checkbox-cannot-turn-off — remember which roles this character HAD when it was loaded. The server
    // cannot otherwise tell "the user un-ticked this role" from "the maker doesn't model this role", and it
    // guessed preserve, so a role could never be turned off. Recording only what was LOADED is what keeps a
    // character holding two different commander roles safe — the reader shows the first, and the second is
    // never in this record, so it is never dropped.
    loadedRoles = {
      leader: !!c.roleLeader,
      advisor: !!c.roleAdvisor,
      generalType: c.roleGeneral ? (c.generalType || "corps_commander") : null,
    };
    updateGeneralStatLabels();
    $("genSkill").value = c.genSkill || "";
    $("genAttack").value = c.genAttack || "";
    $("genDefense").value = c.genDefense || "";
    $("genPlanning").value = c.genPlanning || "";
    $("genLogistics").value = c.genLogistics || "";
    $("generalTraits").value = c.generalTraits || "";
    $("deleteCharBtn").classList.remove("is-hidden");
    $("charStatus").textContent = "";
    updateLivePreview();
    // Keep the promise. recruitRefresh is autoDetectMembership, an async function whose fetch writes
    // into #recruitCountrySelect when it lands - which is INSIDE the watched root, so the re-baseline
    // below has to wait for it rather than for the next microtask.
    const recruitLoad = recruitRefresh ? recruitRefresh() : null; // which country this character is already in
    // The form is now fully populated: THIS is what "unchanged" means from here on. recruitRefresh is
    // asynchronous and repaints the recruit-country dropdown when it lands, so re-baseline then too —
    // …UnlessTouched, or that late call would adopt anything typed while it was in flight and let the next
    // click discard it. #makers-lose-unsaved-work
    if (chUnsaved) {
      chUnsaved.markClean();
      // Chained to the actual load, not to an already-resolved promise. A bare Promise.resolve() here
      // settled on the next microtask - before the fetch was even answered - so this re-snapshotted the
      // identical state markClean() had just taken one line above, and the late write to the recruit
      // picker then read as a user edit. events.js:828 has always passed its load promise; this is the
      // sibling that copied the shape and dropped it. #makers-lose-unsaved-work
      Promise.resolve(recruitLoad).then(() => chUnsaved.markCleanUnlessTouched()).catch(() => {});
    }
  }

  function newChar() {
    // #create-new-discards-the-form — the same discard as clicking another character in the list, which
    // has asked since #makers-lose-unsaved-work. Re-enters through the button on discard rather than
    // duplicating the body below.
    if (chUnsaved && chUnsaved.isDirty()) {
      chUnsaved.confirmDiscard("Start a new one", () => newChar());
      return;
    }
    editingFile = null;
    loadedToken = null;
    loadedRoles = null; // a blank form had no roles to turn off
    carriedNavyPortraits = { large: "", small: "" }; // a new character carries nothing over from the last one
    loadedInstances = []; loadedInstanceIndex = 0;
    if ($("instanceRow")) { $("instanceRow").style.display = "none"; $("instanceChips").textContent = ""; }
    ["chToken","chName","pCivLarge","pCivSmall","pArmyLarge","pArmySmall","leaderIdeology","leaderExpire","leaderTraits","advisorLedger","advisorIdeaToken","advisorTraits","generalTraits"].forEach((id) => { $(id).value = ""; });
    $("chFile").value = "custom_characters.txt";
    if ($("charGender")) $("charGender").value = "";
    $("advisorCost").value = "150";
    if (typeof window.syncAdvisorLedgerVisibility === "function") window.syncAdvisorLedgerVisibility();
    $("genSkill").value = "3"; $("genAttack").value = "3"; $("genDefense").value = "3"; $("genPlanning").value = "2"; $("genLogistics").value = "2";
    setRole("boxLeader", "roleLeader", true);
    setRole("boxAdvisor", "roleAdvisor", false);
    setRole("boxGeneral", "roleGeneral", false);
    setRole("boxPortraits", null, false);
    document.querySelectorAll(".ch-card").forEach((x) => x.classList.remove("active"));
    $("deleteCharBtn").classList.add("is-hidden");
    $("charStatus").textContent = "New character — fill in details and Save.";
    $("chToken").focus();
    updateLivePreview();
    if (recruitRefresh) recruitRefresh(); // reset membership status for the blank character
    // #new-draft-is-not-unsaved-work — the untouched blank is the baseline. Without this the form reads
    // dirty the instant it is cleared, and the next click in the character list asks whether to discard
    // the empty form the user just asked for. Only real typing counts from here.
    if (chUnsaved) chUnsaved.markClean();
  }

  function collect() {
    return {
      modPath: modPath(),
      // Which DLC variant these fields belong to. Sent only when the character actually has variants — on
      // anything else the server would reject an index it cannot place.
      ...(loadedInstances.length ? { instanceIndex: loadedInstanceIndex } : {}),
      token: $("chToken").value.trim(),
      // Which block the save should REPLACE. Sent only when the token actually changed, so an ordinary
      // re-save never asks the server to remove anything (#character-rename).
      // Where this character came FROM, so the save can remove the old block. Sent whenever the token or the
      // target file changed — a file move keeps the token, and without this the character ends up defined in
      // both files (#character-move).
      ...(loadedToken && (loadedToken !== $("chToken").value.trim() || (editingFile && editingFile !== ($("chFile").value.trim() || "custom_characters.txt")))
        ? { previousToken: loadedToken, previousFile: editingFile || "" }
        : {}),
      // Do NOT fall back to the token: for a country leader the token IS the country tag, so a blank
      // name would silently name the leader after the tag (e.g. an unnamed GER leader would show as "GER"). save() requires a name.
      name: $("chName").value.trim(),
      gender: $("charGender") ? $("charGender").value : "",
      file: $("chFile").value.trim() || "custom_characters.txt",
      portraitCivLarge: $("pCivLarge").value.trim(),
      portraitCivSmall: $("pCivSmall").value.trim(),
      portraitArmyLarge: $("pArmyLarge").value.trim(),
      portraitArmySmall: $("pArmySmall").value.trim(),
      portraitNavyLarge: carriedNavyPortraits.large,
      portraitNavySmall: carriedNavyPortraits.small,
      roleLeader: $("roleLeader").checked,
      leaderIdeology: $("leaderIdeology").value.trim(),
      leaderExpire: $("leaderExpire").value.trim(),
      leaderTraits: $("leaderTraits").value.trim(),
      roleAdvisor: $("roleAdvisor").checked,
      advisorSlot: $("advisorSlot").value,
      advisorCost: $("advisorCost").value,
      advisorLedger: $("advisorLedger").value,
      advisorIdeaToken: $("advisorIdeaToken").value.trim(),
      advisorTraits: $("advisorTraits").value.trim(),
      roleGeneral: $("roleGeneral").checked,
      generalType: $("generalType").value,
      // What the form was loaded with, so the server can tell a turned-off role from an unmodelled one.
      // #role-checkbox-cannot-turn-off
      loadedRoles: loadedRoles,
      genSkill: $("genSkill").value, genAttack: $("genAttack").value, genDefense: $("genDefense").value,
      genPlanning: $("genPlanning").value, genLogistics: $("genLogistics").value,
      generalTraits: $("generalTraits").value.trim(),
    };
  }

  async function save() {
    const body = collect();
    if (!body.token) { $("charStatus").textContent = "⛔ Token required."; $("charStatus").style.color = "#f85149"; return; }
    // #dotted-vanilla-token-listed-but-unsaveable — MIRROR MEANS MIRROR.
    //
    // This said it mirrored the server guard and did not: the server accepts a DOT
    // (`/^[\p{L}_][\p{L}\p{N}_.-]*$/u`, widened deliberately, with renameCharacterRecruits widened to match)
    // and this class left it out. The card listed the character, opened it and filled the form — and Save
    // returned here before issuing a single request, so the two characters the base game ships with a dot,
    // AST_florence_v._mckenzie and AST_eric_l._lloyd, could not be edited at all.
    //
    // The message was wrong too. A dot does not break the characters file: vanilla's AST.txt declares
    // `AST_florence_v._mckenzie={`, names it and its idea_token with the dot, and the localisation key carries
    // the dot as well (`AST_florence_v._mckenzie: "Florence V. McKenzie"`), referenced back through
    // `$AST_florence_v._mckenzie$`. Accented letters and hyphens are legal for the same reason — the base game
    // ships 33 such tokens and MD 14.
    if (!/^[\p{L}_][\p{L}\p{N}_.-]*$/u.test(body.token)) { $("charStatus").textContent = "⛔ Token must start with a letter or underscore, then only letters, numbers, underscores, dots and hyphens — no spaces or quotes."; $("charStatus").style.color = "#f85149"; return; }
    if (!body.name) { $("charStatus").textContent = "⛔ Name required — otherwise the character is named after its token (for a country leader that's the country tag, e.g. \"GER\")."; $("charStatus").style.color = "#f85149"; $("chName").focus(); return; }
    $("charStatus").textContent = "Saving…"; $("charStatus").style.color = "#8b949e";
    try {
      const res = await fetch("/api/characters/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Save failed");
      // A leader's large portrait must be a real large image. An advisor token sprite (GFX_idea_…)
      // renders at the small advisor size, which looks like "the leader is an advisor". Warn, don't block.
      if (body.roleLeader && /^GFX_idea_/i.test(body.portraitCivLarge)) {
        $("charStatus").textContent = "✓ Saved to " + data.file + " — ⚠ the leader's portrait is an advisor-style sprite (GFX_idea_…) and will render small in-game. Use a large GFX_portrait_… image for a proper leader portrait.";
        $("charStatus").style.color = "#d29922";
      } else {
        $("charStatus").textContent = "✓ Saved to " + data.file; $("charStatus").style.color = "#2ea043";
      }
      editingFile = body.file;
      // #character-rename-orphans-recruit — re-anchor to what was just written. loadedToken was set on load
      // and never refreshed, so a SECOND rename in the same session still sent the ORIGINAL token as
      // previousToken: the server removed an already-removed block and left the INTERMEDIATE character behind
      // as a duplicate. editingFile is updated just above for the same reason on a file move.
      loadedToken = body.token;
      // …and the ROLES, for exactly the same reason, which this line was missing. #role-checkbox-cannot-turn-off
      //
      // rolesRemovedByForm on the server compares what the form was LOADED with against what came back, and
      // only ever drops a role it can see the user turn off. loadedRoles was set on load and never refreshed,
      // so within one session:
      //   • tick Advisor, Save (added) → untick Advisor, Save → `was.advisor` is STILL false, nothing is
      //     dropped, and the role cannot be removed at all without reloading the character;
      //   • switch a commander corps_commander → field_marshal, Save → then → navy_leader, Save, and
      //     `was.generalType` is still corps_commander, so field_marshal is never dropped and the character
      //     ends up recruitable as BOTH — the precise harm that function exists to prevent.
      // The save just committed, so what the form holds now IS what is on disk. Derived the same way the
      // load path derives it, which is what keeps a character holding two commander roles safe: the second
      // one was never in this record and so can never be dropped.
      loadedRoles = {
        leader: !!body.roleLeader,
        advisor: !!body.roleAdvisor,
        generalType: body.roleGeneral ? (body.generalType || "corps_commander") : null,
      };
      // #save-does-not-rebaseline-the-watcher — the form now IS the file, so this is the new baseline.
      // This page does not auto-select after a save, so without it the prompt is deferred to the next
      // character the user clicks: "You have unsaved changes in the Character maker. Switch character?"
      // about work that was saved a moment ago.
      if (chUnsaved) chUnsaved.markClean();
      expandedFolders.add(body.file);
      await loadList();
    } catch (e) { $("charStatus").textContent = "Failed: " + e.message; $("charStatus").style.color = "#f85149"; }
  }

  async function del() {
    const token = $("chToken").value.trim();
    if (!token || !editingFile) return;
    window.novaConfirm(`Delete character "${token}" from ${editingFile}?`, async () => {
    try {
      const res = await fetch("/api/characters/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modPath: modPath(), token, file: editingFile }) });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Delete failed");
      // #delete-leaves-the-page-dirty — clear the watcher BEFORE newChar(). The character is gone from disk,
      // so there is nothing left to preserve, and newChar()'s own #create-new-discards-the-form guard would
      // otherwise ask "Start a new one anyway and lose them?" about a character that no longer exists — and
      // on cancel would leave the form still showing it, with its token still filled in for a later Save to
      // write back. newChar() re-baselines the blank afterwards.
      if (chUnsaved) chUnsaved.markClean();
      newChar();
      await loadList();
      $("charStatus").textContent = `Deleted ${token}. A backup of the original file was saved automatically — recoverable if needed.`;
      $("charStatus").style.color = "#3fb950";
    } catch (e) { $("charStatus").textContent = "Delete failed: " + e.message; $("charStatus").style.color = "#f85149"; }
    }, { title: "Delete character", yesLabel: "Delete", danger: true });
  }

  async function resolvePortraitUrl(inputPath, fallback) {
    if (!inputPath) return fallback;
    const clean = inputPath.trim();
    if (!clean) return fallback;
    if (clean.startsWith("http://") || clean.startsWith("https://") || clean.startsWith("data:")) {
      return clean;
    }
    try {
      const res = await fetch(`/api/ideas/sprite-url?key=${encodeURIComponent(clean)}&modPath=${encodeURIComponent(modPath())}`);
      const data = await res.json();
      if (data.url) return data.url;
    } catch (e) {
      console.error("Failed to resolve portrait sprite url:", e);
    }
    return fallback;
  }

  // LAST EDIT WINS, NOT LAST NETWORK REPLY (#preview-stale-portrait). Every keystroke starts another
  // run of this function, and each portrait is resolved over the network — so four quick edits leave four
  // runs in flight and whichever RESPONSE lands last paints the cards. Typing a new portrait key could
  // therefore settle back to the previous picture. Stamp each run and let only the newest one paint.
  let livePreviewRun = 0;
  async function updateLivePreview() {
    const myRun = ++livePreviewRun;
    const isStale = () => myRun !== livePreviewRun;
    const token = $("chToken").value.trim() || "new_character";
    const name = $("chName").value.trim() || token;
    
    const roleLeader = $("roleLeader").checked;
    const roleAdvisor = $("roleAdvisor").checked;
    const roleGeneral = $("roleGeneral").checked;
    
    const pCivLargeVal = $("pCivLarge").value.trim();
    const pArmyLargeVal = $("pArmyLarge").value.trim();
    const pCivSmallVal = $("pCivSmall").value.trim();
    const pArmySmallVal = $("pArmySmall").value.trim();
    
    // WHICH FIELD EACH ROLE ACTUALLY READS (#portrait-role-field). These previews used to resolve
    //     civLarge || armyLarge || civSmall || armySmall
    // for the Leader AND the Advisor card, and armyLarge || civLarge || armySmall || civSmall for the
    // General. HOI4 has no such fallback — it reads ONE field per role and draws nothing if that field is
    // empty. The user hit this in game: a character who is both field marshal and army_chief showed the
    // SAME picture on both Nova cards and two DIFFERENT pictures in game.
    //
    // Measured against the whole base game: of 4,459 advisor blocks, 4,433 carry a SMALL portrait and
    // ZERO rely on a large one — an advisor's icon is army.small (else civilian.small), never a large.
    // That is also why the old hint below, which told authors an Army portrait "only displays for a
    // Military Leader", was actively wrong: 948 vanilla political advisors keep their icon in army.small.
    const genTypeValForPortrait = ($("generalType") && $("generalType").value) || "";
    const isNavyCommander = genTypeValForPortrait === "navy_leader";
    const gameLeaderPortrait = pCivLargeVal;                                  // country_leader → civilian.large
    const gameAdvisorPortrait = pArmySmallVal || pCivSmallVal;                // advisor idea icon → a SMALL portrait
    const gameGeneralPortrait = isNavyCommander                               // navy_leader → navy.large
      ? ((carriedNavyPortraits && carriedNavyPortraits.large) || "")
      : pArmyLargeVal;                                                        // field_marshal/corps_commander → army.large
    const PORTRAIT_MISSING = "/api/vanilla-ui?rel=gfx/interface/ideas/idea_unknown.dds";
    // Paint the field the GAME reads, and when it is empty say so instead of quietly substituting another
    // field — a card that always looks finished is what hid this for the mod's 5 portrait-less commanders.
    const paintPortrait = async (el, key, reads) => {
      if (!el) return;
      const url = await resolvePortraitUrl(key, PORTRAIT_MISSING);
      if (isStale()) return; // a newer edit is already painting — do not overwrite it with this reply
      el.src = url;
      const missing = !key;
      el.style.outline = missing ? "2px dashed #f0883e" : "";
      el.style.outlineOffset = missing ? "-2px" : "";
      el.title = missing
        ? `No portrait. This role reads ${reads}, which is empty — the game will not draw a picture here.`
        : `${reads} → ${key}`;
    };

    const leadCard = $("previewLeaderCard");
    const advCard = $("previewAdvisorCard");
    const genCard = $("previewGeneralCard");
    const noRolesCard = $("previewNoRolesCard");
    const hasAnyRole = roleLeader || roleAdvisor || roleGeneral;
    
    if (leadCard) leadCard.style.display = roleLeader ? "" : "none";
    if (advCard) advCard.style.display = roleAdvisor ? "" : "none";
    if (genCard) genCard.style.display = roleGeneral ? "" : "none";
    if (noRolesCard) noRolesCard.style.display = !hasAnyRole ? "" : "none";

    // Just-in-time portrait/role hint, stated per FIELD rather than per category (#portrait-role-field).
    // The old version keyed on "any Army portrait" and told political advisors — whose icon correctly
    // lives in army.small, as 948 vanilla ones do — that their perfectly good authoring was broken.
    // The valuable direction is the other one: a role whose ONE field is empty draws nothing in game,
    // and nothing in Nova used to say so because the preview substituted a different picture.
    const hintEl = $("portraitRoleHint");
    if (hintEl) {
      const msgs = [];
      if (pArmyLargeVal && !roleGeneral) {
        msgs.push("You set an <b>Army LARGE</b> portrait, but only a <b>Military Leader (General/Admiral)</b> reads it — tick that role to use it. (An advisor's icon comes from <b>Army small</b>, which is fine to set on its own.)");
      }
      if (pCivLargeVal && !roleLeader) {
        msgs.push("You set a <b>Civilian LARGE</b> portrait, but only a <b>Country Leader</b> reads it — tick that role to use it.");
      }
      if (roleLeader && !gameLeaderPortrait) {
        msgs.push("This <b>Country Leader</b> has no <b>Civilian LARGE</b> portrait, so the game will draw no picture for them.");
      }
      if (roleAdvisor && !gameAdvisorPortrait) {
        msgs.push("This <b>Advisor</b> has no <b>small</b> portrait (Army small, else Civilian small) — that is the only field the advisor icon reads, so it will be blank in game even if a large portrait is set.");
      }
      if (roleGeneral && !gameGeneralPortrait) {
        msgs.push(isNavyCommander
          ? "This <b>Admiral</b> has no <b>Navy LARGE</b> portrait, so the game falls back to a generic one."
          : "This <b>General</b> has no <b>Army LARGE</b> portrait, so the game falls back to a generic one.");
      }
      if (msgs.length) {
        hintEl.innerHTML = "⚠ " + msgs.join("<br>⚠ ");
        hintEl.style.display = "";
      } else {
        hintEl.style.display = "none";
      }
    }
    
    if (!hasAnyRole) {
      const nameEl = $("previewNoRolesName");
      if (nameEl) nameEl.textContent = stripLocDisplayCodes(name) || "Unnamed Character";
      // No role is ticked, so no field is "the" field yet — showing whatever is set is the honest
      // answer here, unlike the role cards below.
      const portEl = $("previewNoRolesPortrait");
      if (portEl) {
        const url = await resolvePortraitUrl(pCivLargeVal || pArmyLargeVal || pCivSmallVal || pArmySmallVal, PORTRAIT_MISSING);
        if (!isStale()) portEl.src = url;
      }
    }
    
    if (roleLeader) {
      const nameEl = $("previewLeaderName");
      if (nameEl) nameEl.textContent = stripLocDisplayCodes(name);
      const ideologyVal = $("leaderIdeology").value.trim() || "despotism";
      const ideologyEl = $("previewLeaderIdeology");
      // De-underscore like the advisor/general type labels do (marxism_leninism → "marxism leninism";
      // the CSS capitalize alone leaves the underscore).
      if (ideologyEl) ideologyEl.textContent = ideologyVal.replace(/_/g, " ");
      const traitsVal = $("leaderTraits").value.trim();
      const traitsEl = $("previewLeaderTraits");
      if (traitsEl) {
        if (traitsVal) {
          const list = traitsVal.split(/[\s\n]+/).filter(Boolean);
          traitsEl.innerHTML = list.map(t => `<span class="hoi4-trait-badge">${esc(t)}</span>`).join("");
        } else {
          traitsEl.innerHTML = "";
        }
      }
      await paintPortrait($("previewLeaderPortrait"), gameLeaderPortrait, "Civilian LARGE");
    }
    
    if (roleAdvisor) {
      const nameEl = $("previewAdvisorName");
      if (nameEl) nameEl.textContent = stripLocDisplayCodes(name);
      const slotVal = $("advisorSlot").value;
      const typeEl = $("previewAdvisorType");
      if (typeEl) {
        typeEl.textContent = slotVal.replace(/_/g, " ");
      }
      const costVal = numOr($("advisorCost").value, 150); // a free (0 PP) advisor must preview as 0, not 150
      const costEl = $("previewAdvisorCost");
      if (costEl) costEl.textContent = `${costVal} PP`;
      await paintPortrait($("previewAdvisorPortrait"), gameAdvisorPortrait,
        pArmySmallVal ? "Army small" : "Civilian small");
    }
    
    if (roleGeneral) {
      const nameEl = $("previewGeneralName");
      if (nameEl) nameEl.textContent = stripLocDisplayCodes(name);
      const genTypeVal = $("generalType").value;
      const typeEl = $("previewGeneralType");
      if (typeEl) {
        typeEl.textContent = genTypeVal.replace(/_/g, " ");
      }
      const skillVal = numOr($("genSkill").value, 1);
      const skillEl = $("previewGeneralSkill");
      if (skillEl) skillEl.textContent = `Skill ${skillVal}`;
      const attVal = numOr($("genAttack").value, 1); // a real 0 stat must preview as 0, not the default 1
      const defVal = numOr($("genDefense").value, 1);
      const plaVal = numOr($("genPlanning").value, 1);
      const logVal = numOr($("genLogistics").value, 1);
      const attEl = $("previewStatAttack"); if (attEl) attEl.textContent = attVal;
      const defEl = $("previewStatDefense"); if (defEl) defEl.textContent = defVal;
      const plaEl = $("previewStatPlanning"); if (plaEl) plaEl.textContent = plaVal;
      const logEl = $("previewStatLogistics"); if (logEl) logEl.textContent = logVal;
      const traitsVal = $("generalTraits").value.trim();
      const traitsEl = $("previewGeneralTraits");
      if (traitsEl) {
        if (traitsVal) {
          const list = traitsVal.split(/[\s\n]+/).filter(Boolean);
          traitsEl.innerHTML = list.map(t => `<span class="hoi4-trait-badge">${esc(t)}</span>`).join("");
        } else {
          traitsEl.innerHTML = "";
        }
      }
      await paintPortrait($("previewGeneralPortrait"), gameGeneralPortrait,
        isNavyCommander ? "Navy LARGE" : "Army LARGE");
    }
  }

  // Admirals (navy_leader) use Maneuvering/Coordination instead of Planning/Logistics.
  // Relabel the last two stat fields to match the selected commander type (the server writes
  // the correct skill keys based on type).
  function updateGeneralStatLabels() {
    const isNavy = ($("generalType") && $("generalType").value) === "navy_leader";
    const planLbl = $("lblGenPlanning"), logLbl = $("lblGenLogistics");
    if (planLbl) planLbl.textContent = isNavy ? "Maneuvering" : "Planning";
    if (logLbl) logLbl.textContent = isNavy ? "Coordination" : "Logistics";
  }

  // ── Trait picker: browse the REAL leader/advisor + commander traits from the active mod (+deps+vanilla) so
  // a modder clicks valid trait ids instead of typing them (a mistyped trait silently does nothing in-game). ──
  async function loadTraitPool() {
    if (_traitPool) return _traitPool;
    try {
      const d = await fetch("/api/characters/traits?modPath=" + encodeURIComponent(modPath())).then((r) => r.json());
      // ⚠️ KEEP `labels`. This rebuilt the cached object field by field and dropped it, so `data.labels` was
      // always undefined downstream and every leader chip rendered a bare token even once the picker stopped
      // throwing — the display half of #trait-picker-shows-raw-tokens silently did nothing. The commander
      // pool escaped it only because the server also writes `label` onto each unit entry.
      if (d && d.ok) _traitPool = { leader: d.leader || [], unit: d.unit || [], labels: d.labels || {} };
    } catch (_) {}
    return _traitPool || { leader: [], unit: [], labels: {} };
  }
  function appendTrait(targetId, name) {
    const ta = $(targetId); if (!ta) return;
    const cur = (ta.value || "").split(/[\s\n]+/).filter(Boolean);
    if (!cur.includes(name)) { cur.push(name); ta.value = cur.join(" "); ta.dispatchEvent(new Event("input", { bubbles: true })); }
  }
  async function openTraitPicker(targetId, pool) {
    _traitPickerTarget = targetId;
    const modal = $("traitPickerModal"); if (!modal) return;
    const isUnit = pool === "unit";
    $("traitPickerTitle").textContent = isUnit ? "Commander Traits" : "Leader / Advisor Traits";
    $("traitPickerSearch").value = "";
    $("traitPickerGrid").innerHTML = '<div style="color:#8b949e;font-size:13px;padding:12px;">Loading traits…</div>';
    modal.style.display = "block";
    // "Create custom trait" is offered only for commander (unit_leader) traits — the writer targets
    // common/unit_leader. Wire the toggle + Create button once. #unit-leader-traits
    const createBar = $("traitCreateBar");
    if (createBar) createBar.style.display = isUnit ? "" : "none";
    if (createBar && !createBar._ntWired) {
      createBar._ntWired = true;
      const form = $("traitCreateForm"), toggle = $("traitCreateToggle"), btn = $("ntCreateBtn"), st = $("ntStatus");
      if (toggle) toggle.addEventListener("click", () => { form.style.display = form.style.display === "none" ? "" : "none"; if (form.style.display !== "none") { const idf = $("ntId"); if (idf) idf.focus(); } });
      if (btn) btn.addEventListener("click", async () => {
        const id = ($("ntId").value || "").trim();
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(id)) { st.style.color = "#d29922"; st.textContent = "Enter a valid trait id (letters/underscore, no spaces)."; return; }
        const modifier = {};
        document.querySelectorAll("#traitCreateForm .nt-mod-key").forEach((k) => {
          const key = (k.value || "").trim(); const v = k.parentElement.querySelector(".nt-mod-val").value;
          if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && v !== "" && Number.isFinite(Number(v))) modifier[key] = Number(v);
        });
        const body = { modPath: modPath(), id, type: $("ntType").value, trait_type: $("ntTraitType").value, cost: $("ntCost").value, modifier };
        btn.disabled = true; st.style.color = "#8b949e"; st.textContent = "Creating…";
        try {
          const d = await fetch("/api/characters/trait", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
          if (d && d.ok) {
            st.style.color = "#3fb950"; st.textContent = "✓ Created — added to this commander.";
            _traitPool = null; // bust cache so the new trait appears in the list
            $("ntId").value = ""; document.querySelectorAll("#traitCreateForm .nt-mod-key, #traitCreateForm .nt-mod-val").forEach((i) => (i.value = ""));
            appendTrait(_traitPickerTarget, id); // auto-assign the freshly-created trait
            await openTraitPicker(_traitPickerTarget, "unit"); // re-render with the new trait present + ticked
          } else { st.style.color = "#f85149"; st.textContent = (d && d.error) || "Create failed."; }
        } catch (e) { st.style.color = "#f85149"; st.textContent = e.message; }
        finally { btn.disabled = false; }
      });
    }
    // Focus the search box immediately (like the portrait picker does) so you can type to filter on open,
    // rather than after the trait-pool fetch resolves.
    setTimeout(() => { try { $("traitPickerSearch").focus(); } catch (_) {} }, 0);
    const data = await loadTraitPool();
    let items;
    // `name` is the TOKEN (what gets written); the display string comes from the `labels` map the endpoint
    // sends alongside. The token lists keep their original shape — four tests read `data.leader` as an array
    // of strings and they are right to: it IS a list of tokens. #trait-picker-shows-raw-tokens
    //
    // ⚠️ DECLARED OUT HERE, before the branch. It was first written inside `if (isUnit)`, so the else branch
    // referenced a block-scoped const and the leader/advisor picker threw ReferenceError the moment it opened
    // — the commander picker worked, which is what made it look fine. The chip-rendering test never caught it
    // because it drives the chip loop with a supplied item and never runs this loader.
    const labels = (data && data.labels) || {};
    if (isUnit) {
      // Only offer commander traits valid for the selected general/admiral type (type: all/land/<type>/navy).
      const gt = ($("generalType") && $("generalType").value) || "corps_commander";
      const allow = gt === "navy_leader" ? ["all", "navy"] : gt === "field_marshal" ? ["all", "land", "field_marshal"] : ["all", "land", "corps_commander"];
      items = (data.unit || []).filter((u) => allow.includes(u.type))
        .map((u) => ({ name: u.name, label: stripLocDisplayCodes(u.label || labels[u.name] || "") || "", tag: u.type }));
    } else {
      items = (data.leader || []).map((n) => ({ name: n, label: stripLocDisplayCodes(labels[n] || "") || "", tag: "" }));
    }
    const render = () => {
      const q = ($("traitPickerSearch").value || "").toLowerCase().trim();
      // Search BOTH: the token, which is what the file contains, and the label, which is what the user can
      // see and is far likelier to type. Matching tokens only meant "Cold Water" found nothing.
      let list = q ? items.filter((i) => i.name.toLowerCase().includes(q) || String(i.label || "").toLowerCase().includes(q)) : items;
      const total = list.length;
      list = list.slice(0, 300);
      const grid = $("traitPickerGrid"); grid.innerHTML = "";
      if (!total) { grid.innerHTML = '<div style="color:#8b949e;font-size:13px;padding:12px;">No matching traits.</div>'; }
      const cur = new Set(($(_traitPickerTarget).value || "").split(/[\s\n]+/).filter(Boolean));
      list.forEach((i) => {
        const on = cur.has(i.name);
        const chip = document.createElement("button");
        chip.type = "button";
        chip.style.cssText = "display:inline-flex;align-items:center;gap:6px;padding:6px 10px;background:" + (on ? "#1f6f3f" : "#161b22") + ";border:1px solid " + (on ? "#2ea043" : "#30363d") + ";border-radius:6px;color:#c9d1d9;cursor:pointer;font-size:12px;font-family:monospace;";
        // The NAME reads first, the token second and dimmed — the token still has to be visible, because it
        // is what appears in the file and what the author types into script. ⚠️ The click below still passes
        // i.name: the label is for the eye only. #trait-picker-shows-raw-tokens
        chip.innerHTML = (i.label
          ? esc(i.label) + ' <span style="color:#6e7681;font-size:10px;">' + esc(i.name) + "</span>"
          : esc(i.name))
          + (i.tag ? ' <span style="color:#8b949e;font-size:10px;">' + esc(i.tag) + "</span>" : "")
          + (on ? ' <span style="color:#3fb950;">✓</span>' : "");
        chip.addEventListener("click", () => { appendTrait(_traitPickerTarget, i.name); render(); });
        grid.appendChild(chip);
      });
      $("traitPickerCount").textContent = total > 300 ? "Showing 300 of " + total + " traits — type to search." : total + " trait" + (total === 1 ? "" : "s") + " (click to add · ✓ = already added)";
    };
    $("traitPickerSearch").oninput = render;
    render();
  }

  document.addEventListener("DOMContentLoaded", async () => {
    // Image fallback (CSP-safe): inline image error handlers are blocked by the page CSP (script-src 'self'),
    // so a portrait/icon thumbnail whose image is missing would just show the broken-image glyph. Images are
    // marked with data-fallback="…" and swapped here via one capture-phase error listener (error doesn't
    // bubble, so capture is required; guarded so a failing fallback can't loop).
    document.addEventListener("error", (e) => {
      const t = e.target;
      if (t && t.tagName === "IMG" && t.dataset && t.dataset.fallback && t.src.indexOf(t.dataset.fallback) < 0) t.src = t.dataset.fallback;
    }, true);
    // role box toggles
    [["roleLeader", "boxLeader"], ["roleAdvisor", "boxAdvisor"], ["roleGeneral", "boxGeneral"]].forEach(([cb, box]) => {
      $(cb).addEventListener("change", () => {
        $(box).classList.toggle("on", $(cb).checked);
        updateLivePreview();
      });
    });
    const genTypeEl = $("generalType");
    if (genTypeEl) genTypeEl.addEventListener("change", updateGeneralStatLabels);
    updateGeneralStatLabels();
    // trait pickers (leader/advisor + commander)
    document.querySelectorAll(".trait-browse").forEach((b) => b.addEventListener("click", () => openTraitPicker(b.dataset.traitTarget, b.dataset.traitPool)));
    const closeTP = $("closeTraitPicker"); if (closeTP) closeTP.addEventListener("click", () => { $("traitPickerModal").style.display = "none"; });
    const tpModal = $("traitPickerModal"); if (tpModal) tpModal.addEventListener("click", (e) => { if (e.target === tpModal) tpModal.style.display = "none"; });
    // portraits header toggle (no checkbox)
    document.querySelector('[data-box="boxPortraits"]').addEventListener("click", () => $("boxPortraits").classList.toggle("on"));
    // recruit-to-country bridge header toggle
    const recruitHead = document.querySelector('[data-box="boxRecruit"]');
    if (recruitHead) recruitHead.addEventListener("click", () => {
      const box = $("boxRecruit"); box.classList.toggle("on");
      if (box.classList.contains("on") && recruitRefresh) recruitRefresh(); // refresh membership when opened
    });
    $("newCharBtn").addEventListener("click", newChar);
    $("saveCharBtn").addEventListener("click", save);
    $("deleteCharBtn").addEventListener("click", del);
    // Duplicate: editable COPY of the loaded character with a fresh non-colliding token, ready to Save
    // as a new character (original untouched). Speeds up rostering many similar advisors/generals.
    const dupCharBtn = $("duplicateCharBtn");
    if (dupCharBtn) {
      dupCharBtn.addEventListener("click", () => {
        const cur = ($("chToken").value || "").trim();
        if (!cur || cur.startsWith("new_character")) {
          (window.nbAlert || window.alert)("Load or select a character first — Duplicate then makes an editable copy of it.");
          return;
        }
        const ids = new Set();
        (allFiles || []).forEach((f) => (f.characters || []).forEach((c) => { if (c && c.token) ids.add(c.token); }));
        const root = cur.replace(/_copy\d*$/i, "");
        let copyId = root + "_copy", n = 2;
        while (ids.has(copyId)) copyId = root + "_copy" + n++;
        $("chToken").value = copyId;
        // An ADVISOR is registered in game by its idea_token, and the copy was handed the ORIGINAL's. Two
        // advisors under one idea id collide — the mod’s own health check reports it as a duplicate idea, and
        // in game one of them silently replaces the other. The token follows the copy, but only when it was
        // the default (the character’s own token); a deliberately custom idea_token is left alone.
        const ideaTokEl = $("advisorIdeaToken");
        if (ideaTokEl && ideaTokEl.value.trim() === cur) ideaTokEl.value = copyId;
        // A copy is a NEW character, so forget where the form was loaded from. Without this the save sees a
        // changed token, treats it as a rename, and removes the original — which is the exact opposite of what
        // the confirmation below promises. (#character-duplicate: the rename/move cleanup keys on loadedToken,
        // so clearing it is what tells the save "create this, do not move anything".)
        loadedToken = null;
        const nameEl = $("chName");
        if (nameEl) nameEl.value = (nameEl.value || cur).replace(/\s*\(copy\)\s*$/i, "") + " (copy)";
        document.querySelectorAll(".ch-card").forEach((el) => el.classList.remove("active"));
        if ($("deleteCharBtn")) $("deleteCharBtn").classList.add("is-hidden");
        ["chToken", "chName"].forEach((id) => { const el = $(id); if (el) { el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); } });
        if (typeof updateLivePreview === "function") updateLivePreview();
        if (window.nbAlert) window.nbAlert('Copy ready as "' + copyId + '". Tweak it if you like, then Save to create it — the original "' + cur + '" is untouched.', "Duplicated");
      });
    }
    initRecruitBridge();
    initIdeologyPicker();
    
    // Wire up inputs to trigger preview updates on value change/input
    ["chToken", "chName", "pCivLarge", "pCivSmall", "pArmyLarge", "pArmySmall", "leaderIdeology", "leaderExpire", "leaderTraits", "advisorSlot", "advisorCost", "advisorLedger", "advisorIdeaToken", "advisorTraits", "generalType", "genSkill", "genAttack", "genDefense", "genPlanning", "genLogistics", "generalTraits"].forEach(id => {
      const el = $(id);
      if (el) {
        el.addEventListener("input", updateLivePreview);
        el.addEventListener("change", updateLivePreview);
      }
    });

    // Ledger only applies to MILITARY advisors (army/navy/air chief, high command, theorist). Political
    // advisors use no ledger, so hide the field for that slot. "Auto (by slot)" lets the backend pick a
    // sensible default (air_chief→air, navy_chief→navy, army_chief/high_command/theorist→army).
    window.syncAdvisorLedgerVisibility = function syncAdvisorLedgerVisibility() {
      const slot = ($("advisorSlot") && $("advisorSlot").value) || "";
      const fld = $("advisorLedgerField");
      if (fld) fld.style.display = slot === "political_advisor" ? "none" : "";
    };
    if ($("advisorSlot")) $("advisorSlot").addEventListener("change", window.syncAdvisorLedgerVisibility);
    window.syncAdvisorLedgerVisibility();

    // AI Generator integration
    const generateAiCharBtn = $("generateAiCharBtn");
    const aiCharPrompt = $("aiCharPrompt");
    const aiStatus = $("aiStatus");

    if (generateAiCharBtn) {
      generateAiCharBtn.addEventListener("click", async () => {
        const prompt = aiCharPrompt.value.trim();
        if (!prompt) return;

        aiStatus.textContent = "Generating...";
        aiStatus.style.color = "#8fa4b8";
        generateAiCharBtn.disabled = true;

        const storedKey = localStorage.getItem("gemini_api_key") || localStorage.getItem("geminiApiKey");
        const systemPrompt = `You are a Master-Level Hearts of Iron IV (HOI4) Character Scripting AI.
Your purpose is to translate user requests into structured character properties.
You MUST output ONLY a valid JSON object. Do NOT wrap the JSON in markdown code blocks. Do not include any explanation or chatter.
The JSON object must have this exact structure:
{
  "token": "GER_heinrich_becker",
  "name": "Heinrich Becker",
  "portraitCivLarge": "gfx/leaders/GER/portrait_heinrich_becker.dds",
  "roleLeader": true,
  "leaderIdeology": "despotism",
  "leaderExpire": "1948.1.1",
  "leaderTraits": "warmonger nervous_leader",
  "roleAdvisor": true,
  "advisorSlot": "political_advisor",
  "advisorCost": "150",
  "advisorIdeaToken": "GER_heinrich_becker_advisor",
  "advisorTraits": "captain_of_industry",
  "roleGeneral": false,
  "generalType": "corps_commander",
  "genSkill": "3",
  "genAttack": "3",
  "genDefense": "3",
  "genPlanning": "2",
  "genLogistics": "2",
  "generalTraits": "inspirational_leader"
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

          const nextToken = cleanScriptId(parsedData.token, "custom_char_1");
          // #ai-generate-renames-the-open-item — a generated character REPLACES the form, so it is new, not a
          // rename of whoever was open. Leaving loadedToken attached made the next Save read the new token as
          // a rename and remove the character the user was only looking at.
          loadedToken = null;
          loadedRoles = null; // …and its roles are not this character's roles
          $("chToken").value = nextToken;
          $("chName").value = parsedData.name || "";
          $("pCivLarge").value = parsedData.portraitCivLarge || "";
          
          setRole("boxLeader", "roleLeader", !!parsedData.roleLeader);
          $("leaderIdeology").value = parsedData.leaderIdeology || "";
          $("leaderExpire").value = parsedData.leaderExpire || "";
          $("leaderTraits").value = parsedData.leaderTraits || "";

          setRole("boxAdvisor", "roleAdvisor", !!parsedData.roleAdvisor);
          if (parsedData.advisorSlot) $("advisorSlot").value = parsedData.advisorSlot;
          $("advisorCost").value = parsedData.advisorCost || "150";
          $("advisorIdeaToken").value = cleanScriptId(parsedData.advisorIdeaToken, nextToken + "_advisor");
          $("advisorTraits").value = parsedData.advisorTraits || "";

          setRole("boxGeneral", "roleGeneral", !!parsedData.roleGeneral);
          if (parsedData.generalType) $("generalType").value = parsedData.generalType;
          $("genSkill").value = parsedData.genSkill || "3";
          $("genAttack").value = parsedData.genAttack || "3";
          $("genDefense").value = parsedData.genDefense || "3";
          $("genPlanning").value = parsedData.genPlanning || "2";
          $("genLogistics").value = parsedData.genLogistics || "2";
          $("generalTraits").value = parsedData.generalTraits || "";

          if (parsedData.portraitCivLarge) {
            setRole("boxPortraits", null, true);
          }

          // Trigger change events for validation/sync
          const inputsToUpdate = [
            "chToken", "chName", "pCivLarge", "leaderIdeology", "leaderExpire", "leaderTraits",
            "advisorSlot", "advisorCost", "advisorIdeaToken", "advisorTraits",
            "generalType", "genSkill", "genAttack", "genDefense", "genPlanning", "genLogistics", "generalTraits"
          ];
          inputsToUpdate.forEach(id => {
            const el = $(id);
            if (el) {
              el.dispatchEvent(new Event("input", { bubbles: true }));
              el.dispatchEvent(new Event("change", { bubbles: true }));
            }
          });

          updateLivePreview();

          aiStatus.textContent = "AI Character successfully parsed and loaded into the form!";
          aiStatus.style.color = "#2ea043";
        } catch (err) {
          aiStatus.textContent = "Error: " + err.message;
          aiStatus.style.color = "#f85149";
        } finally {
          generateAiCharBtn.disabled = false;
        }
      });
    }

    const aiLogicHelpBtn = $("aiLogicHelpBtn");
    if (aiLogicHelpBtn) {
      aiLogicHelpBtn.addEventListener("click", () => {
        window.showNovaAiHelpModal("aiCharPrompt");
      });
    }

    const searchInput = $("charsListSearch");
    if (searchInput) {
      searchInput.addEventListener("input", loadList);
    }

    // Browse portraits modal logic
    const portraitPickerModal = $("portraitPickerModal");
    const closePortraitPicker = $("closePortraitPicker");
    const portraitPickerSearch = $("portraitPickerSearch");
    const portraitPickerGrid = $("portraitPickerGrid");
    let activePortraitTargetInput = null;


    let currentFilteredSprites = [];
    let renderedCount = 0;
    // Small first batch + fill-until-scrollable (below). Rendering all sprites fired ~120 DDS→PNG conversions
    // at once via /api/buildings/icon-file (native loading="lazy" is viewport-relative, so it doesn't defer).
    const BATCH_SIZE = 24;

    function renderNextBatch() {
      if (!currentFilteredSprites) return;
      const batch = currentFilteredSprites.slice(renderedCount, renderedCount + BATCH_SIZE);
      const fragment = document.createDocumentFragment();

      batch.forEach(sprite => {
        const itemDiv = document.createElement("div");
        itemDiv.className = "icon-picker-item";
        itemDiv.setAttribute("data-key", sprite.key);
        itemDiv.style.cssText = "display: flex; flex-direction: column; align-items: center; justify-content: center; background: #161b22; border: 1px solid #30363d; padding: 12px; border-radius: 8px; cursor: pointer; transition: all 0.2s; text-align: center;";

        itemDiv.innerHTML = `
          <img src="/api/buildings/icon-file?path=${encodeURIComponent(sprite.texturefile)}" alt="Icon" loading="lazy" style="width: 48px; height: 48px; object-fit: contain; margin-bottom: 8px;" data-fallback="/api/vanilla-ui?rel=gfx/interface/ideas/idea_unknown.dds" />
          <span style="font-size: 10px; color: #8b949e; word-break: break-all; font-family: monospace;">${sprite.key.replace(/^GFX_portrait_/, "").replace(/^GFX_/, "")}</span>
        `;

        itemDiv.addEventListener("mouseenter", () => {
          itemDiv.style.background = "#21262d";
          itemDiv.style.borderColor = "#58a6ff";
          itemDiv.style.transform = "translateY(-2px)";
        });
        itemDiv.addEventListener("mouseleave", () => {
          itemDiv.style.background = "#161b22";
          itemDiv.style.borderColor = "#30363d";
          itemDiv.style.transform = "translateY(0)";
        });

        itemDiv.addEventListener("click", () => {
          if (activePortraitTargetInput) {
            $(activePortraitTargetInput).value = sprite.key;
            $(activePortraitTargetInput).dispatchEvent(new Event("change", { bubbles: true }));
            $(activePortraitTargetInput).dispatchEvent(new Event("input", { bubbles: true }));
            updateLivePreview();
          }
          portraitPickerModal.style.display = "none";
        });

        fragment.appendChild(itemDiv);
      });

      portraitPickerGrid.appendChild(fragment);
      renderedCount += batch.length;
      // Fill just enough to make the grid scrollable (so scroll-to-load-more takes over) — never all at once.
      if (renderedCount < currentFilteredSprites.length && renderedCount < 96 && portraitPickerGrid.clientHeight > 0 && portraitPickerGrid.scrollHeight <= portraitPickerGrid.clientHeight + 40) requestAnimationFrame(renderNextBatch);
    }

    function handleSearch() {
      const val = portraitPickerSearch.value.toLowerCase().trim();
      if (!allVanillaSprites) return;

      currentFilteredSprites = allVanillaSprites.filter(sprite =>
        sprite.key.toLowerCase().includes(val)
      );

      portraitPickerGrid.innerHTML = "";
      renderedCount = 0;

      if (currentFilteredSprites.length === 0) {
        portraitPickerGrid.innerHTML = `<div style="grid-column: 1/-1; padding: 24px; color: #8b949e; text-align: center;">No portraits found.</div>`;
      } else {
        renderNextBatch();
      }
    }

    function openPortraitPicker(targetInputId) {
      activePortraitTargetInput = targetInputId;
      portraitPickerModal.style.display = "block";
      portraitPickerSearch.value = "";
      setTimeout(() => { try { portraitPickerSearch.focus(); } catch (_) {} }, 0); // type to search at once

      if (allVanillaSprites !== null) {
        handleSearch();
        portraitPickerGrid.scrollTop = 0;
        return;
      }

      portraitPickerGrid.innerHTML = `<div style="grid-column: 1/-1; padding: 24px; color: #8b949e; text-align: center;">Scanning game files for portraits...</div>`;

      fetch("/api/sprites?type=portrait&modPath=" + encodeURIComponent(modPath()))
        .then(r => r.json())
        .then(data => {
          if (!data.sprites || data.sprites.length === 0) {
            allVanillaSprites = [];
            portraitPickerGrid.innerHTML = `<div style="grid-column: 1/-1; padding: 24px; color: #8b949e; text-align: center;">No portraits found.</div>`;
            return;
          }
          allVanillaSprites = data.sprites;
          handleSearch();
          portraitPickerGrid.scrollTop = 0;
        })
        .catch(err => {
          portraitPickerGrid.innerHTML = `<div style="grid-column: 1/-1; padding: 24px; color: #f85149; text-align: center;">Error: ${err.message}</div>`;
        });
    }

    portraitPickerGrid.addEventListener("scroll", () => {
      if (portraitPickerGrid.scrollTop + portraitPickerGrid.clientHeight >= portraitPickerGrid.scrollHeight - 60) {
        if (renderedCount < currentFilteredSprites.length) {
          renderNextBatch();
        }
      }
    });

    if (closePortraitPicker) {
      closePortraitPicker.addEventListener("click", () => {
        portraitPickerModal.style.display = "none";
      });
      closePortraitPicker.addEventListener("mouseenter", () => {
        closePortraitPicker.style.color = "#f85149";
      });
      closePortraitPicker.addEventListener("mouseleave", () => {
        closePortraitPicker.style.color = "#8b949e";
      });
    }

    window.addEventListener("click", (e) => {
      if (e.target === portraitPickerModal) {
        portraitPickerModal.style.display = "none";
      }
    });

    // One Escape handler for BOTH pickers — the trait picker used to be the odd one out (× / backdrop only),
    // so Escape closed the portrait picker but silently did nothing on the trait picker.
    window.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (portraitPickerModal && portraitPickerModal.style.display === "block") portraitPickerModal.style.display = "none";
      const tp = $("traitPickerModal");
      if (tp && tp.style.display === "block") tp.style.display = "none";
    });

    if (portraitPickerSearch) {
      portraitPickerSearch.addEventListener("input", handleSearch);
    }

    // Upload portrait logic
    const portraitFileInput = $("portraitFileInput");

    function triggerPortraitUpload(targetInputId) {
      activePortraitTargetInput = targetInputId;
      portraitFileInput.value = "";
      portraitFileInput.click();
    }

    portraitFileInput.addEventListener("change", async (e) => {
      if (!e.target.files || e.target.files.length === 0) return;
      const file = e.target.files[0];
      const formData = new FormData();
      formData.append("image", file);
      
      const charToken = $("chToken").value.trim() || "custom_character";
      formData.append("name", charToken + "_" + activePortraitTargetInput);
      formData.append("type", "character");
      formData.append("modPath", modPath());

      const statusEl = $("charStatus");
      statusEl.textContent = "Uploading and converting portrait to DDS...";
      statusEl.style.color = "#e8a849";

      try {
        const response = await fetch("/api/upload-gfx", {
          method: "POST",
          body: formData
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        statusEl.textContent = "✓ Portrait successfully imported to mod and compiled!" + (data.overwrote ? " ⚠ Replaced an existing portrait (original backed up)." : "");
        statusEl.style.color = "#2ea043";

        if (activePortraitTargetInput) {
          $(activePortraitTargetInput).value = data.spriteName;
          $(activePortraitTargetInput).dispatchEvent(new Event("change", { bubbles: true }));
          $(activePortraitTargetInput).dispatchEvent(new Event("input", { bubbles: true }));
          updateLivePreview();
        }
        allVanillaSprites = null; // reset cache
      } catch (err) {
        statusEl.textContent = `Upload failed: ${err.message}`;
        statusEl.style.color = "#f85149";
      }
    });

    // Wire up Browse & Upload buttons for portrait inputs
    ["CivLarge", "CivSmall", "ArmyLarge", "ArmySmall"].forEach(suffix => {
      const browseBtn = $(`browse${suffix}`);
      const uploadBtn = $(`upload${suffix}`);
      const inputId = `p${suffix}`;
      
      if (browseBtn) {
        browseBtn.addEventListener("click", (e) => {
          e.preventDefault();
          openPortraitPicker(inputId);
        });
      }
      if (uploadBtn) {
        uploadBtn.addEventListener("click", (e) => {
          e.preventDefault();
          triggerPortraitUpload(inputId);
        });
      }
    });

    await initModSelector();
    await loadAdvisorSlots();
    await loadList();
    newChar();
  });

  // #advisor-slot-hardcoded — the Slot dropdown was a static list of the BASE GAME's six slots, and nothing
  // in Nova read common/idea_tags at all. A mod that ships its own idea_tags file REPLACES vanilla's (same
  // basename), so on Millennium Dawn the dropdown's own default (political_advisor) and its `theorist` entry
  // are slots the mod does not define — the advisor was written into a slot that does not exist. Fill it from
  // what the active mod actually declares; the server falls back to the base game's set when a mod has no
  // idea_tags file of its own, so this can never render an empty dropdown.
  async function loadAdvisorSlots() {
    const sel = $("advisorSlot");
    if (!sel) return;
    const previous = sel.value;
    try {
      const j = await fetch("/api/game/character-slots?modPath=" + encodeURIComponent(modPath())).then((r) => r.json());
      const slots = (j && Array.isArray(j.slots) && j.slots.length) ? j.slots : null;
      if (!slots) return; // keep the markup's list rather than blanking the control
      sel.innerHTML = slots.map((s) => `<option value="${s}">${s}</option>`).join("");
      // Keep what the user had selected if this mod still has it; otherwise take the mod's first slot.
      sel.value = slots.includes(previous) ? previous : slots[0];
    } catch (_) { /* offline or a bad mod path — the markup's list stays */ }
  }

  // ── Bridge: recruit the current character into a country's history ──────────
  // Mirrors the spirit/event/decision "start active for" bridge, using set-startup with
  // itemType:"character" (server writes recruit_character into the country history file).
  function initRecruitBridge() {
    const sel = $("recruitCountrySelect");
    const addBtn = $("recruitAddBtn");
    const removeBtn = $("recruitRemoveBtn");
    const status = $("recruitStatus");
    if (!sel || !addBtn || !status) return;

    function token() { return ($("chToken").value || "").trim(); }
    function setStatus(msg, color) { status.textContent = msg; status.style.color = color || "#8b949e"; }

    // Populate the picker from the shared country picker (name + Your Mod/Vanilla badge), then show
    // the current character's membership right away (so the box never opens with a silent, unknown state).
    if (window.NovaCountryPicker) {
      window.NovaCountryPicker.populate(sel, { modPath: modPath(), all: true }).then(() => autoDetectMembership()).catch(() => {});
    }

    // Up-front membership: find which of the mod's own countries already recruit THIS character, preselect
    // it, and say so — so the user immediately knows "he's in LUX" vs "not in any country yet", instead of
    // having to probe one country at a time. Falls back to the single-country check if the scan fails.
    let detectGen = 0; // guards against out-of-order responses (the scan can be slow on a big base mod)
    async function autoDetectMembership() {
      const t = token();
      const myGen = ++detectGen;
      if (!t) { setStatus("Save the character first, then this shows which country it belongs to."); removeBtn.style.display = "none"; return; }
      try {
        const r = await fetch(`/api/history/character-countries?itemId=${encodeURIComponent(t)}&modPath=${encodeURIComponent(modPath())}`);
        const d = await r.json();
        if (myGen !== detectGen) return; // a newer character/token superseded this — drop the stale result
        const tags = (d && d.tags) || [];
        if (tags.length) {
          const first = tags[0];
          const has = Array.prototype.some.call(sel.options, (o) => o.value === first);
          if (has) sel.value = first; // jump the picker to the country this character is actually in
          const extra = tags.length > 1 ? ` (also: ${tags.slice(1).join(", ")})` : "";
          setStatus(`✓ This character is already part of ${first}${extra}.`, "#2ea043");
          removeBtn.style.display = has ? "" : "none";
        } else {
          setStatus("Not part of any country yet — pick one below and click “Add to country”.");
          removeBtn.style.display = "none";
        }
      } catch (_e) { refreshStatus(); }
    }

    // Reflect whether the current character is recruited by the SELECTED country (when the user changes
    // the picker). Always says something — "already in X" or "not in X yet" — never a silent blank.
    async function refreshStatus() {
      const tag = sel.value;
      const t = token();
      const myGen = ++detectGen;
      if (!t) { setStatus("Save the character first, then this shows which country it belongs to."); removeBtn.style.display = "none"; return; }
      if (!tag) { setStatus("Pick a country to check or set membership."); removeBtn.style.display = "none"; return; }
      try {
        const r = await fetch(`/api/history/startup-status?tag=${encodeURIComponent(tag)}&itemId=${encodeURIComponent(t)}&itemType=character&modPath=${encodeURIComponent(modPath())}`);
        const d = await r.json();
        if (myGen !== detectGen) return; // superseded by a newer check
        if (d.active) {
          setStatus(`✓ Already part of ${tag}.`, "#2ea043");
          removeBtn.style.display = "";
        } else {
          setStatus(`Not part of ${tag} yet — click “Add to country” to recruit it.`);
          removeBtn.style.display = "none";
        }
      } catch (_e) { setStatus(""); removeBtn.style.display = "none"; }
    }
    recruitRefresh = autoDetectMembership; // let loadChar/newChar/box-open re-detect membership

    async function setRecruit(active) {
      const tag = sel.value;
      const t = token();
      if (!t) { setStatus("⛔ Save the character first (it needs a token).", "#f85149"); return; }
      if (!tag) { setStatus("⛔ Pick a country.", "#f85149"); return; }
      setStatus(active ? `Adding ${t} to ${tag}…` : `Removing ${t} from ${tag}…`);
      try {
        const r = await fetch("/api/history/set-startup", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tag, itemId: t, itemType: "character", active, modPath: modPath() }),
        });
        const d = await r.json();
        if (!r.ok || d.error) throw new Error(d.error || "Failed");
        setStatus(active ? `✓ ${tag} now recruits this character at game start.` : `✓ Removed from ${tag}.`, "#2ea043");
        removeBtn.style.display = active ? "" : "none";
      } catch (e) { setStatus("Failed: " + (e.message || e), "#f85149"); }
    }

    addBtn.addEventListener("click", () => setRecruit(true));
    removeBtn.addEventListener("click", () => setRecruit(false));
    sel.addEventListener("change", refreshStatus);
    // Changing the token means a different character — re-scan which country it belongs to (debounced,
    // since the scan reads the mod's country-history files).
    let tokDebounce = null;
    $("chToken").addEventListener("input", () => { clearTimeout(tokDebounce); tokDebounce = setTimeout(autoDetectMembership, 350); });
  }

  // ── Ideology picker (replaces the AI button): list the active mod's sub-ideologies, grouped by parent,
  // so the user picks a real one instead of guessing what exists. ───────────────────────────────────────
  function initIdeologyPicker() {
    const btn = $("ideologyPickBtn");
    if (!btn) return;
    btn.addEventListener("click", async () => {
      btn.disabled = true; const orig = btn.textContent; btn.textContent = "Loading…";
      let list = [];
      try { list = await (await fetch(`/api/game/leader-ideologies?modPath=${encodeURIComponent(modPath())}`)).json(); }
      catch (_) {}
      btn.disabled = false; btn.textContent = orig;
      if (!Array.isArray(list) || !list.length) { nbAlert("Couldn't load ideologies for this mod."); return; }
      openIdeologyModal(list);
    });
  }
  function openIdeologyModal(list) {
    const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const groups = {};
    list.forEach(({ type, group }) => { (groups[group || "other"] = groups[group || "other"] || []).push(type); });
    const sections = Object.keys(groups).sort().map((g) => `
      <div style="margin-bottom:12px;">
        <div style="font-weight:700;color:#8b949e;font-size:11px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;">${esc(g)}</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${groups[g].sort().map((t) => `<button type="button" class="ideo-pick" data-type="${esc(t)}" style="padding:5px 10px;background:#0d1117;border:1px solid #30363d;border-radius:6px;color:#c9d1d9;font-size:12.5px;cursor:pointer;">${esc(t)}</button>`).join("")}
        </div>
      </div>`).join("");
    const ov = document.createElement("div");
    ov.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10000;display:flex;align-items:center;justify-content:center;";
    ov.innerHTML = `
      <div style="background:#161b22;border:1px solid #30363d;border-radius:10px;width:520px;max-width:92%;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 12px 40px rgba(0,0,0,.6);">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #21262d;">
          <h3 style="margin:0;font-size:15px;color:#e6edf3;">Choose an ideology</h3>
          <button id="ideoClose" title="Close" style="background:transparent;border:none;color:#8b949e;font-size:22px;line-height:1;cursor:pointer;">×</button>
        </div>
        <div style="padding:8px 18px 2px;color:#6e7681;font-size:12px;">The sub-ideologies in your active mod. Click one to use it for this leader.</div>
        <div style="padding:12px 18px;overflow-y:auto;">${sections}</div>
      </div>`;
    document.body.appendChild(ov);
    // Escape closes it, like both pickers. The overlay is built per-open, so tear the listener down on
    // EVERY close path (× / backdrop / chip select) or it would leak a handler onto a removed node.
    const onIdeoKey = (e) => { if (e.key === "Escape") close(); };
    const close = () => { document.removeEventListener("keydown", onIdeoKey); ov.remove(); };
    document.addEventListener("keydown", onIdeoKey);
    ov.querySelector("#ideoClose").addEventListener("click", close);
    ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
    ov.querySelectorAll(".ideo-pick").forEach((b) => b.addEventListener("click", () => {
      const inp = $("leaderIdeology");
      inp.value = b.getAttribute("data-type");
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      close();
    }));
  }
})();
