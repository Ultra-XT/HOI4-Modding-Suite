document.addEventListener("DOMContentLoaded", () => {
  // Embedded in Military › Companies: flag the body IMMEDIATELY so the .nova-embed CSS suppresses this page's
  // own chrome from the FIRST paint. applyEmbedChrome() only runs after the mod boot resolves — seconds late on
  // a big mod (so the header/banner visibly flash and the page reads as a second stacked layer), and not at all
  // if that promise rejects. Idempotent with the later add in applyEmbedChrome. #companies-embed
  try {
    if (new URLSearchParams(location.search).get("embed") === "1") {
      document.body.classList.add("nova-embed");
      // NOTE: no wheel forwarding. The embed keeps this page's normal fixed-viewport two-pane layout, so the
      // sidebar and the editor own their own scrolling exactly like the standalone page — a wheel lands on a
      // real scroll container and just works. The old forwarding hack existed only to prop up the reverted
      // content-sized "#companies-onepage" iframe. #companies-embed
    }
  } catch (_) {}

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
    if (!t || t.tagName !== "IMG" || !t.dataset) return;
    if (t.dataset.fallback && t.src.indexOf(t.dataset.fallback) < 0) { t.src = t.dataset.fallback; return; }
    // #inline-handlers-reintroduced — the hide half, which research.js has had since the CSP pass and these
    // listeners never gained. "visibility" keeps the element's box, which is what the inline handlers this
    // replaces were doing in the MIO lists; anything else removes it outright.
    if (t.dataset.hideOnError) {
      if (t.dataset.hideOnError === "visibility") t.style.visibility = "hidden";
      else t.style.display = "none";
    }
  }, true);

  const ideaPictureUpload = document.getElementById("ideaPictureUpload");
  const ideaPictureId = document.getElementById("ideaPictureId");
  const uploadStatus = document.getElementById("uploadStatus");
  const ideaPicturePreview = document.getElementById("ideaPicturePreview");

  // The file this spirit was LOADED from. Changing the target file box moves it, and the save has to be told
  // where it came from or the spirit ends up defined in BOTH files (#spirit-move). Null for a new spirit.
  let loadedDefinitionFile = null;
  // #create-path-drops-unmodelled-idea-sections — WHERE IT CAME FROM, not just which file.
  //
  // The server can seed a copy from the source block, keeping everything this form does not model —
  // allowed, cancel_if, research_bonus, targeted_modifier, on_remove, ai_will_do. That path is gated on
  // `sourceRoot`, and this page never sent it, so saving an INHERITED spirit wrote a stub: measured, 0 of
  // 6 un-modelled blocks survived without it and 6 of 6 with it. The catalogue already carries the root
  // per item and this page already uses it for its READ fetches (edit-payload, entry-block) — the save
  // was the one caller that never picked it up.
  let loadedSourceRoot = null;
  // The id this spirit was LOADED as. Editing the id box renames it, and the save has to be told which
  // block to remove or the old spirit stays defined and keeps being granted (#spirit-rename). Null when the
  // form holds something that is not on disk yet (New, Duplicate, a draft).
  let loadedIdeaId = null;
  const ideaCategory = document.getElementById("ideaCategory");

  // HOI4 idea categories fall into 3 behavioral kinds, each with different valid fields:
  //  - country  : national spirits (allowed, allowed_civil_war, removal_cost, modifier). No cost/traits/available.
  //  - advisor  : hireable ministers/chiefs/theorist (cost, traits, ledger, available, removal_cost).
  //  - designer : manufacturers/industrial_concern (cost, traits, available, research_bonus, removal_cost).
  const DESIGNER_CATS = ["tank_manufacturer", "naval_manufacturer", "aircraft_manufacturer", "materiel_manufacturer", "industrial_concern"];
  function categoryKind(cat) {
    if (cat === "country") return "country";
    if (DESIGNER_CATS.includes(cat)) return "designer";
    return "advisor"; // political_advisor, army_chief, navy_chief, air_chief, military_theorist, high_command
  }
  function showEl(id, on) { const el = document.getElementById(id); if (el) el.style.display = on ? "" : "none"; }
  function updateCategoryFieldVisibility() {
    if (!ideaCategory) return;
    const kind = categoryKind(ideaCategory.value);
    showEl("advisorSettingsGroup", kind !== "country"); // cost + traits (+ ledger inside)
    showEl("grpLedger", kind === "advisor");
    showEl("grpResearchBonus", kind === "designer");
    showEl("grpAvailable", kind !== "country");
    showEl("grpAllowedCivilWar", kind === "country");
    // removal_cost stays visible for all kinds
  }
  // Back-compat alias for any other callers.
  function updateAdvisorSettingsVisibility() { updateCategoryFieldVisibility(); }
  if (ideaCategory) {
    ideaCategory.addEventListener("change", updateCategoryFieldVisibility);
  }

  // ── Mode: National Spirits vs Designers/Companies ────────────────────────────────────────────────
  // Advisors, military chiefs, theorists, and high command are CHARACTERS (made in the Characters menu).
  // This page makes the two idea kinds that are NOT characters: country national spirits, and idea-based
  // designers/companies (designer = yes). The mode switch swaps the category dropdown, the field gating
  // (via updateCategoryFieldVisibility), the list filter, and the labels — reusing one editor for both.
  const DESIGNER_CATS_CLIENT = ["tank_manufacturer", "naval_manufacturer", "aircraft_manufacturer", "materiel_manufacturer", "industrial_concern"];
  // Resolved from the URL HERE, not left until applyIdeaMode() runs during startup init. Both
  // loadIdeasList() calls happen before that, so a mode settled any later leaves their designers guard
  // reading "spirits", and the spirit fetch they then start clears the company list when it lands.
  // #companies-list-cleared-by-spirits
  let ideaMode = (function () {
    try {
      var sp = new URLSearchParams(location.search);
      return (sp.get("mode") === "designers" || sp.get("embed") === "1") ? "designers" : "spirits";
    } catch (_) { return "spirits"; }
  })();
  function itemMatchesMode(it) {
    const cat = (it && it.category) || "country";
    return ideaMode === "designers" ? DESIGNER_CATS_CLIENT.includes(cat) : cat === "country";
  }
  function setNodeText(sel, txt) { const el = typeof sel === "string" ? document.querySelector(sel) : sel; if (el) el.textContent = txt; }
  function applyIdeaMode(mode) {
    ideaMode = mode === "designers" ? "designers" : "spirits";
    const designers = ideaMode === "designers";
    document.querySelectorAll(".idea-mode-btn").forEach((b) => {
      const on = b.dataset.mode === ideaMode;
      b.style.background = on ? "#1f6feb" : "transparent";
      b.style.color = on ? "#fff" : "#8b949e";
    });
    // Category dropdown: spirits → fixed country (field hidden); designers → pick which of the 5 (field shown).
    if (ideaCategory) {
      if (designers) {
        ideaCategory.innerHTML = DESIGNER_CATS_CLIENT
          .map((c) => `<option value="${c}">${c.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase())}</option>`)
          .join("");
        ideaCategory.value = DESIGNER_CATS_CLIENT[0];
      } else {
        ideaCategory.innerHTML = `<option value="country">Country National Spirit (country)</option>`;
        ideaCategory.value = "country";
      }
    }
    showEl("ideaCategoryField", designers);
    // The sidebar search filters the spirit list, and in designers mode that sidebar is the company
    // list, which this page does not own. Hidden rather than left inert: a search box that silently
    // does nothing reads as broken.
    showEl("ideasListSearch", !designers);
    updateCategoryFieldVisibility();
    setNodeText("h1", designers ? "HOI4 Designer / Company Maker" : "HOI4 National Spirit Maker");
    setNodeText("#saveIdeaBtn", designers ? "Save Designer" : "Save National Spirit");
    setNodeText("#newIdeaBtn", designers ? "+ Create New Designer" : "+ Create New Spirit");
    setNodeText("#deleteIdeaBtn", designers ? "Delete Designer" : "Delete Spirit");
    setNodeText("#ideaIdLabel", designers ? "Designer ID" : "National Spirit ID");
    const search = document.getElementById("ideasListSearch");
    if (search) search.placeholder = designers ? "🔍 Search designers..." : "🔍 Search spirits...";
    setNodeText(".ideas-preview-title", designers ? "🏭 In-Game Designer Preview" : "📂 In-Game National Spirit Preview");
    setNodeText("#tooltipIdeaCat", designers ? "Designer / Company" : "National Spirit");
    // Everything else ideas.html bakes in with SPIRIT wording — in the Military › Companies tab the user is
    // editing a COMPANY, so it must not keep calling it a national spirit. #companies-wording
    setNodeText("#ideaIconLabel", designers ? "Company Icon" : "National Spirit Icon");
    setNodeText("#iconPickerTitle", designers ? "Select Company Icon" : "Select National Spirit Icon");
    setNodeText("#advScriptHint", designers
      ? "For special cases. Leave blank and the company works fine. These accept HOI4 conditions/effects — use the ✨AI box if you can't write the script."
      : "For special cases. Leave blank and the spirit works fine. These accept HOI4 conditions/effects — use the ✨AI box if you can't write the script.");
    setNodeText("#hintVisible", designers
      ? "(when the company's icon is shown — hides it until the condition is met)"
      : "(when the spirit's icon is shown — hides it until the condition is met)");
    setNodeText("#hintOnAdd", designers
      ? "(effects that fire once, the moment the company is hired)"
      : "(effects that fire once, the moment the spirit is granted)");
    const cOnRemove = document.getElementById("chipOnRemove");
    if (cOnRemove) cOnRemove.title = designers ? "Effects that run when this company is removed" : "Effects that run when this spirit is removed";
    const cCancel = document.getElementById("chipCancel");
    if (cCancel) cCancel.title = designers ? "Trigger that auto-removes this company when met" : "Trigger that auto-removes this spirit when met";
    // The ID field is the first thing the user sees. Only rewrite it while it still holds the untouched
    // default AND nothing is selected — never clobber typing or retarget a loaded item's Save.
    const idEl = document.getElementById("ideaId");
    if (idEl && !document.querySelector(".decision-item.active") && /^custom_(spirit|company)_1$/.test((idEl.value || "").trim())) {
      idEl.value = designers ? "custom_company_1" : "custom_spirit_1";
    }
    // Companies use research_bonus + equipment_bonus + traits, never a plain modifier — hide that box.
    showEl("grpModifiers", !designers);
    // Make the AI generator company-aware in designers mode (prompt + button + hint relabelled; the
    // actual designer-shaped request is built in the Generate handler below).
    setNodeText("#aiPanelTitle", designers ? "AI Company Logic Generator" : "AI Spirit Logic Generator");
    setNodeText("#generateAiIdeaBtn", designers ? "✨ Generate Company" : "Generate Modifiers");
    const aiHint = document.getElementById("aiPanelHint");
    if (aiHint) aiHint.textContent = designers
      ? "Describe the company (e.g. a German tank manufacturer that boosts armor research by 15%, trait tank_manufacturer)."
      : "Describe what this spirit should do (e.g., boosts factory output by 10%, drains political power by 0.5 per day, allows women in the workforce).";
    const aiPrompt = document.getElementById("aiIdeaPrompt");
    if (aiPrompt) aiPrompt.placeholder = designers
      ? "e.g. A Soviet aircraft designer giving +15% air research with the medium_aircraft_manufacturer trait"
      : "e.g. Gives 10% research speed, 5% factory output, but lowers stability by 5%";
    // In designers mode the whole idea form is replaced by the real COMPANY (MIO) editor — companies must be MIOs to
    // appear in-game under Arms Against Tyranny, so the old idea-designer form produced invisible companies. #companies-mio
    applyCompanyEditorMode(designers);
    if (typeof updateLivePreview === "function") updateLivePreview();
    loadIdeasList();
  }
  // The shared MIO company editor (mio-editor.js), lazily created the first time designers mode opens.
  let mioEditor = null;
  function applyCompanyEditorMode(designers) {
    document.body.classList.toggle("mio-mode", designers);
    const mount = document.getElementById("mioEditorMount");
    if (mount) mount.style.display = designers ? "" : "none";
    // (The idea page's Save/Duplicate/Delete toolbar is hidden in company mode via CSS — see body.mio-mode in ideas.html.
    //  Those buttons carry an !important display rule that an inline style can't override.)
    if (!designers) return;
    if (!mioEditor && window.NovaMioEditor && document.getElementById("mioEditorForm")) {
      mioEditor = window.NovaMioEditor.create({
        host: document.getElementById("mioEditorForm"),
        listHost: document.getElementById("ideasList"), // reuse the sidebar to list existing companies
        getModPath: getModPath,
        // #mio-editor-outside-the-unsaved-contract — the company form lives inside .idea-editor-panel, so
        // THIS page's watcher is the one that sees it, and the one that has to be told a save happened.
        // This callback was empty, so saving a company left the page still claiming unsaved changes about
        // work it had just written. #save-does-not-rebaseline-the-watcher
        onSaved: function () { if (ideaUnsaved) ideaUnsaved.markClean(); },
        // …and the same watcher answers for the two paths that REPLACE the company form.
        confirmReplace: function (what, proceed) {
          if (ideaUnsaved) ideaUnsaved.confirmDiscard(what, proceed); else proceed();
        },
        onFormReplaced: function () { if (ideaUnsaved) ideaUnsaved.markClean(); },
        // …and once more when the company form's async fill lands, which happens after the line above.
        // UnlessTouched, so a re-baseline can never adopt something typed while the fetch was in flight.
        onFormSettled: function () { if (ideaUnsaved) ideaUnsaved.markCleanUnlessTouched(); },
      });
      mioEditor.mount();
    } else if (mioEditor) {
      mioEditor.refreshList();
    }
  }
  // #makers-lose-unsaved-work — this page threw away a written spirit without asking. Clicking another
  // spirit in the list, or changing the mod, replaced the modifiers, the allowed/available triggers and the
  // on_add script with no prompt and no way back.
  //
  // The shared watcher in loading-overlay.js owns the pattern. Scoped to .idea-editor-panel, which keeps the
  // list search and the icon-picker search out of it — and which deliberately INCLUDES #mioEditorMount, so
  // a half-built military industrial organisation is protected the same way a spirit is.
  const ideaUnsaved = (typeof window.novaWatchUnsaved === "function") ? window.novaWatchUnsaved({
    root: ".idea-editor-panel",
    // A function, not a string: this page is the Spirit maker OR the Company maker depending on mode,
    // and the watcher is built once, before the mode is applied. Editing a Millennium Dawn company and
    // being warned about "the Spirit maker" is how that showed up. #maker-names-itself-wrongly
    label: function () { return ideaMode === "designers" ? "the Company maker" : "the Spirit maker"; },
    saveButtonId: "saveIdeaBtn",
    ignoreIds: ["aiIdeaPrompt"],
    // #owner-chips-are-unsaved-work — the "give this spirit to…" chips are spans over a JS Set, invisible to
    // a snapshot of form controls. Sorted so the order chips were added in is not mistaken for a change.
    extra: () => (ideaBridge ? [...ideaBridge.owners()].sort().join(",") : ""),
  }) : null;

  document.querySelectorAll(".idea-mode-btn").forEach((b) => {
    // Spirits ↔ Designers is a discard, not a view toggle: applyIdeaMode rebuilds the category dropdown and
    // the panel below it, so whatever was half-written is gone. Ask first, then re-baseline — without the
    // re-baseline the rebuilt dropdown would differ from the snapshot and the NEXT click would ask about
    // changes the user never made.
    b.addEventListener("click", () => {
      const go = () => { applyIdeaMode(b.dataset.mode); if (ideaUnsaved) ideaUnsaved.markClean(); };
      if (ideaUnsaved) ideaUnsaved.confirmDiscard("Switch mode", go); else go();
    });
  });

  // Designer-trait picker: list valid company traits (scanned from the active mod + dependencies +
  // vanilla via /api/ideas/designer-traits), grouped by slot, so the modder picks a real trait instead
  // of typing it. Only relevant in designers mode (the field lives in the company options group).
  (function wireTraitPicker() {
    const btn = document.getElementById("pickTraitBtn");
    const dd = document.getElementById("traitPickerDropdown");
    const field = document.getElementById("ideaTraits");
    if (!btn || !dd || !field) return;
    const close = () => { dd.style.display = "none"; };
    function render(data) {
      const slot = document.getElementById("ideaCategory")?.value || "";
      const forSlot = (data.byCategory && data.byCategory[slot]) || [];
      const others = (data.all || []).filter((t) => !forSlot.includes(t));
      const section = (title, list) => {
        if (!list.length) return "";
        let s = `<div style="font-size:11px;color:#8b949e;padding:4px 6px;text-transform:uppercase;letter-spacing:.5px;">${title}</div>`;
        list.forEach((t) => {
          s += `<button type="button" class="trait-pick-opt" data-trait="${t}" style="display:block;width:100%;text-align:left;padding:6px 8px;background:transparent;border:none;color:#c9d1d9;cursor:pointer;border-radius:4px;font-size:13px;">${t}</button>`;
        });
        return s;
      };
      const slotLabel = slot ? slot.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "this slot";
      let html = section(`${slotLabel} traits`, forSlot) + section("Other company traits", others);
      if (!html) html = `<div style="padding:8px;color:#8b949e;font-size:12px;">No company traits found — type one manually (e.g. tank_manufacturer).</div>`;
      dd.innerHTML = html;
      dd.querySelectorAll(".trait-pick-opt").forEach((b) => {
        b.addEventListener("mouseenter", () => { b.style.background = "#161b22"; });
        b.addEventListener("mouseleave", () => { b.style.background = "transparent"; });
        b.addEventListener("click", () => {
          field.value = b.dataset.trait;
          field.dispatchEvent(new Event("input", { bubbles: true }));
          field.dispatchEvent(new Event("change", { bubbles: true }));
          close();
        });
      });
    }
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (dd.style.display !== "none") { close(); return; }
      dd.style.display = "block";
      dd.innerHTML = `<div style="padding:8px;color:#8b949e;font-size:12px;">Loading company traits…</div>`;
      try {
        const r = await fetch(`/api/ideas/designer-traits?modPath=${encodeURIComponent(getModPath())}`);
        render(await r.json());
      } catch (err) {
        dd.innerHTML = `<div style="padding:8px;color:#f85149;font-size:12px;">Couldn't load traits: ${err.message}</div>`;
      }
    });
    document.addEventListener("click", (e) => {
      if (dd.style.display === "none") return;
      if (!dd.contains(e.target) && e.target !== btn) close();
    });
  })();

  // Retrieve active mod path from localStorage
  function getModPath() {
    return localStorage.getItem("activeModPath") || "";
  }

  function normalizePath(p) {
    return String(p || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  }

  function cleanScriptId(value, fallback) {
    let cleaned = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "");
    // PDX tokens must start with a letter or underscore — a leading digit is lexed as a number and breaks
    // the ideas file. Prefix an underscore so an AI-suggested or typed digit-leading id stays valid.
    if (/^[0-9]/.test(cleaned)) cleaned = "_" + cleaned;
    return cleaned || fallback;
  }

  function getEffectiveCountryTag() {
    const active = localStorage.getItem("activeCountryTag");
    if (active) return active.toUpperCase();
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

  // Multi-country "grant this spirit at game start to…" bridge (shared owner-chip component).
  let ideaBridge = null;
  function updateStartupCheckbox() {
    if (!ideaBridge) return;
    const ideaId = (document.getElementById("ideaId").value || "").trim();
    if (!ideaId || ideaId.startsWith("new_spirit")) ideaBridge.clear();
    else ideaBridge.load(ideaId);
  }

  // Advanced Settings opt-in: does the server allow writing into the real vanilla HOI4 install? Off on
  // every fresh launch. When vanilla is active and this is false, the write endpoints reject AFTER the
  // round-trip (a raw error toast), so grey out the write controls up-front instead. #vanilla-ro
  let vanillaEditsAllowed = false;
  const IDEA_WRITE_BTN_IDS = ["saveIdeaBtn", "duplicateIdeaBtn", "deleteIdeaBtn", "ideaPictureUploadBtn"];
  function setWriteControlsLocked(locked) {
    const why = "Vanilla is read-only. Select or create a mod (or enable “Allow editing vanilla game files” in Settings) to edit.";
    IDEA_WRITE_BTN_IDS.forEach((id) => {
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
        // #makers-lose-unsaved-work — switching mod reloads the list and abandons the editor. Put the
        // selector back BEFORE asking, so cancelling leaves it naming the mod that is actually loaded.
        if (ideaUnsaved && ideaUnsaved.isDirty()) {
          const previous = localStorage.getItem("activeModPath") || "";
          selector.value = previous;
          ideaUnsaved.confirmDiscard("Switch mod", () => {
            selector.value = selected;
            selector.dispatchEvent(new Event("change"));
          });
          return;
        }
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

  // Self-balancing brace extractor helper
  function extractBraceBlock(text, keyword) {
    const regex = new RegExp(`\\b${keyword}\\s*=\\s*\\{`);
    const match = text.match(regex);
    if (!match) return "";
    const startIndex = match.index + match[0].length;
    let depth = 1;
    let endIndex = -1;
    for (let i = startIndex; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") {
        depth--;
        if (depth === 0) {
          endIndex = i;
          break;
        }
      }
    }
    if (endIndex === -1) return "";
    return dedentBlock(text.slice(startIndex, endIndex));
  }

  // Strip the common leading indentation from a block extracted from a nested file so the
  // lines align flush-left in the textarea. A plain .trim() only dedents the FIRST line
  // (leaving later lines carrying their original tabs), which made sibling modifiers look
  // staggered — e.g. line 1 flush-left and line 2 pushed far right. This drops blank edge
  // lines, finds the smallest indent across the remaining lines, and removes exactly that
  // much from each — preserving any *relative* nesting inside the block.
  function dedentBlock(s) {
    let lines = String(s).replace(/\r\n/g, "\n").split("\n");
    while (lines.length && lines[0].trim() === "") lines.shift();
    while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
    if (!lines.length) return "";
    let min = Infinity;
    for (const l of lines) {
      if (l.trim() === "") continue;
      const indent = (l.match(/^[\t ]*/) || [""])[0].length;
      if (indent < min) min = indent;
    }
    if (!isFinite(min) || min === 0) return lines.join("\n");
    return lines.map((l) => l.slice(min)).join("\n");
  }

  let allSpirits = [];
  // Exposed for tests, the same convention research.js uses for allTechs — a headless check needs to know
  // which entries the sidebar is working from, and which root each one came from. #idea-sourceroot
  try { Object.defineProperty(window, "allSpirits", { get: () => allSpirits, configurable: true }); } catch (_) {}
  let activeDraft = null;

  function pathBasename(pathStr) {
    return pathStr.replace(/\\/g, "/").split("/").pop();
  }

  const expandedFolders = new Set();
  let autoSelectId = null;

  // Render Spirits List Sidebar with collapsibility and deferred child rendering
  function renderIdeasList(items, filterText = "") {
    const ideasList = document.getElementById("ideasList");
    if (!ideasList) return;
    // In designers mode this sidebar belongs to the MIO editor, which lists the mod's companies into
    // it. Clearing it here is how 399 Millennium Dawn companies became an empty list. The guard lives
    // in the function that does the clearing rather than in each caller, because two callers had no
    // guard at all: the sidebar search and the new-draft path. #companies-list-cleared-by-spirits
    if (ideaMode === "designers") return;
    ideasList.innerHTML = "";

    const groups = {};
    items.forEach(item => {
      const file = item.definitionFile || "custom_ideas.txt";
      if (!groups[file]) groups[file] = [];
      groups[file].push(item);
    });

    if (activeDraft) {
      groups["Drafts"] = [{
        ideaId: activeDraft.ideaId,
        isDraft: true,
        definitionFile: "custom_ideas.txt",
        blockText: activeDraft.blockText || ""
      }];
    }

    const fileKeys = Object.keys(groups);
    if (fileKeys.length === 0) {
      const emptyNoun = ideaMode === "designers" ? "Designers" : "National Spirits";
      const emptyBtn = ideaMode === "designers" ? "+ Create New Designer" : "+ Create New Spirit";
      ideasList.innerHTML = `<div style="padding: 12px; color: #8b949e; font-size: 13px;">No ${emptyNoun} found in this mod yet. Click "${emptyBtn}" to start fresh!</div>`;
      return;
    }

    let anyMatched = false;
    fileKeys.forEach(file => {
      const isDraftFolder = file === "Drafts";
      const fileItems = groups[file];

      let matchedItems = fileItems;
      if (filterText) {
        matchedItems = fileItems.filter(item => item.ideaId.toLowerCase().includes(filterText));
        if (matchedItems.length === 0) return;
      }
      anyMatched = true;

      const fileDiv = document.createElement("div");
      fileDiv.className = "category-container";

      const fileTitle = document.createElement("div");
      const folderName = isDraftFolder ? "Drafts" : pathBasename(file);
      const hasAutoSelect = autoSelectId && matchedItems.some(item => item.ideaId === autoSelectId);
      const isExpanded = !!filterText || isDraftFolder || expandedFolders.has(file) || hasAutoSelect;
      fileTitle.className = "category-title" + (isExpanded ? " expanded" : "");
      fileTitle.innerHTML = `
        <svg class="folder-chevron-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
        <svg class="folder-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
        <span class="folder-name-text">${folderName}</span>
        <span class="folder-count-badge">${matchedItems.length}</span>
      `;
      fileDiv.appendChild(fileTitle);

      const itemsContainer = document.createElement("div");
      itemsContainer.className = "category-items";
      itemsContainer.style.display = isExpanded ? "block" : "none";
      fileDiv.appendChild(itemsContainer);

      let rendered = false;
      const doRenderItems = () => {
        if (rendered) return;
        rendered = true;
        itemsContainer.innerHTML = "";

        matchedItems.forEach(item => {
          const itemDiv = document.createElement("div");
          itemDiv.className = "decision-item" + (item.isDraft ? " draft" : "");
          if (item.isDraft) {
            itemDiv.id = "draft-item-spirit";
          }
          itemDiv.textContent = item.ideaId;

          itemDiv.addEventListener("click", async () => {
            // #makers-lose-unsaved-work — ask before this replaces a written spirit. On "discard" the watcher
            // is already clean, so re-clicking runs straight through rather than asking twice.
            if (ideaUnsaved && ideaUnsaved.isDirty()) {
              ideaUnsaved.confirmDiscard("Switch spirit", () => itemDiv.click());
              return;
            }
            document.querySelectorAll(".decision-item.active").forEach(el => {
              el.classList.remove("active");
            });
            itemDiv.classList.add("active");

            // A DRAFT lives in the virtual "Drafts" group, not a real file — give it a valid default
            // target so Save doesn't fail with "Idea file must be a .txt under common/ideas".
            // An INHERITED spirit (dependency/vanilla) lives in the dependency's own file; targeting that
            // basename would make the add-on REPLACE the whole dependency file (wiping its other ideas), so
            // send overrides of inherited spirits to custom_ideas.txt. (Backend also guards this.)
            const inheritedSrc = item.sourceType && item.sourceType !== "active_mod" && item.sourceType !== "custom";
            document.getElementById("ideaTargetFile").value = (item.isDraft || inheritedSrc) ? "custom_ideas.txt" : pathBasename(file);
            document.getElementById("ideaId").value = item.ideaId;

            if (item.isDraft) {
              const block = item.blockText || "";
              document.getElementById("ideaAllowed").value = extractBraceBlock(block, "allowed") || "always = yes";
              { const av = document.getElementById("ideaAvailable"); av.value = extractBraceBlock(block, "available") || ""; av.dispatchEvent(new Event("input")); }
              document.getElementById("ideaModifiers").value = extractBraceBlock(block, "modifier") || "";
              document.getElementById("ideaEquipment").value = extractBraceBlock(block, "equipment_bonus") || "";
              { const acw = document.getElementById("ideaAllowedCivilWar"); if (acw) acw.value = extractBraceBlock(block, "allowed_civil_war") || ""; }
              { const rb = document.getElementById("ideaResearchBonus"); if (rb) rb.value = extractBraceBlock(block, "research_bonus") || ""; }
              { const vis = document.getElementById("ideaVisible"); if (vis) vis.value = extractBraceBlock(block, "visible") || ""; }
              { const oa = document.getElementById("ideaOnAdd"); if (oa) { oa.value = extractBraceBlock(block, "on_add") || ""; oa.dispatchEvent(new Event("input")); } }
              const picMatch = block.match(/^\s*picture\s*=\s*"?([A-Za-z0-9_\.:-]+)"?(?:\s*#.*)?$/m);
              const pic = picMatch ? picMatch[1].trim() : "GFX_idea_generic_morale_bonus";
              document.getElementById("ideaPictureId").value = pic;
              updateIconPreview(pic);
              const draftIsDesigner = ideaMode === "designers";
              document.getElementById("ideaName").value = activeDraft.name || (draftIsDesigner ? "New Company" : "New National Spirit");
              document.getElementById("ideaDescription").value = activeDraft.desc || (draftIsDesigner ? "New Company Description" : "New Spirit Description");
              document.getElementById("aiStatus").textContent = draftIsDesigner ? "Editing Draft Company template!" : "Editing Draft National Spirit template!";
              document.getElementById("aiStatus").style.color = "#e8a849";
              if (ideaBridge) ideaBridge.clear(); // a draft has no saved id yet
              if (document.getElementById("deleteIdeaBtn")) document.getElementById("deleteIdeaBtn").classList.add("is-hidden");

              if (document.getElementById("ideaCategory")) {
                // In designers mode keep the chosen designer slot — the select has no "country" option,
                // so forcing "country" here blanks the value and a save would wrongly default to country.
                if (!draftIsDesigner) document.getElementById("ideaCategory").value = "country";
                updateAdvisorSettingsVisibility();
              }
              if (document.getElementById("ideaTraits")) document.getElementById("ideaTraits").value = "";
              if (document.getElementById("ideaCost")) document.getElementById("ideaCost").value = ""; // #advisor-cost-invented-150
              if (document.getElementById("ideaRemovalCost")) document.getElementById("ideaRemovalCost").value = "";
              if (document.getElementById("ideaLedger")) document.getElementById("ideaLedger").value = "";
            } else {
              // Fill with placeholder immediately so there's no lag
              document.getElementById("ideaName").value = item.ideaId;
              document.getElementById("ideaDescription").value = "";
              document.getElementById("ideaAllowed").value = "";
              { const av = document.getElementById("ideaAvailable"); av.value = ""; av.dispatchEvent(new Event("input")); }
              document.getElementById("ideaModifiers").value = "Loading...";
              document.getElementById("ideaEquipment").value = "";
              const defaultGfxKey = "GFX_idea_" + item.ideaId;
              document.getElementById("ideaPictureId").value = defaultGfxKey;
              updateIconPreview(defaultGfxKey);
              document.getElementById("aiStatus").textContent = `Loading ${item.ideaId}...`;
              document.getElementById("aiStatus").style.color = "#8fa4b8";
              if (document.getElementById("deleteIdeaBtn")) document.getElementById("deleteIdeaBtn").classList.remove("is-hidden");

              try {
                const defFile = item.definitionFile || pathBasename(file);
                loadedDefinitionFile = defFile;
                loadedSourceRoot = item.sourceRoot || "";
                loadedIdeaId = item.ideaId;
                // READ THE ENTRY FROM THE ROOT IT ACTUALLY CAME FROM (#idea-sourceroot). This hardcoded
                // getModPath(), so every entry was read out of the ACTIVE mod regardless of where the
                // catalog said it lived. For an inherited entry that is wrong two different ways: a
                // dependency's idea whose filename the mod also uses silently loads the MOD's file and
                // returns a 200 with the wrong content, and one the mod has no file for 400s with
                // "Could not read idea definition file." The catalog already carries sourceRoot per item
                // (server.js:1138/1169) — use it, and fall back only when the item does not say.
                const itemRoot = item.sourceRoot || getModPath();
                const editRes = await fetch(`/api/ideas/edit-payload?ideaId=${item.ideaId}&definitionFile=${encodeURIComponent(defFile)}&sourceRoot=${encodeURIComponent(itemRoot)}`);
                const editData = await editRes.json();

                // Fetch the full block text from the server to extract sub-blocks
                let fullBlock = "";
                try {
                  const blockRes = await fetch(`/api/ideas/entry-block?ideaId=${item.ideaId}&definitionFile=${encodeURIComponent(defFile)}&sourceRoot=${encodeURIComponent(itemRoot)}`);
                  const blockData = await blockRes.json();
                  fullBlock = blockData.blockText || "";
                } catch (_) {}

                // Use the full block text for sub-block extraction
                if (fullBlock) {
                  document.getElementById("ideaAllowed").value = extractBraceBlock(fullBlock, "allowed") || "always = yes";
                  { const av = document.getElementById("ideaAvailable"); av.value = extractBraceBlock(fullBlock, "available") || ""; av.dispatchEvent(new Event("input")); }
                  document.getElementById("ideaModifiers").value = extractBraceBlock(fullBlock, "modifier") || "";
                  document.getElementById("ideaEquipment").value = extractBraceBlock(fullBlock, "equipment_bonus") || "";
                  const acw = document.getElementById("ideaAllowedCivilWar"); if (acw) acw.value = extractBraceBlock(fullBlock, "allowed_civil_war") || "";
                  const rb = document.getElementById("ideaResearchBonus"); if (rb) rb.value = extractBraceBlock(fullBlock, "research_bonus") || "";
                  { const vis = document.getElementById("ideaVisible"); if (vis) vis.value = extractBraceBlock(fullBlock, "visible") || ""; }
                  { const oa = document.getElementById("ideaOnAdd"); if (oa) { oa.value = extractBraceBlock(fullBlock, "on_add") || ""; oa.dispatchEvent(new Event("input")); } }
                  const picMatch = fullBlock.match(/^\s*picture\s*=\s*"?([A-Za-z0-9_\.:-]+)"?(?:\s*#.*)?$/m);
                  if (picMatch) {
                    document.getElementById("ideaPictureId").value = picMatch[1].trim();
                    updateIconPreview(picMatch[1].trim());
                  } else {
                    const defaultGfxKey = "GFX_idea_" + item.ideaId;
                    document.getElementById("ideaPictureId").value = defaultGfxKey;
                    updateIconPreview(defaultGfxKey);
                  }
                } else {
                  // Fallback: use pictureToken from edit-payload
                  document.getElementById("ideaModifiers").value = "";
                  document.getElementById("ideaAllowed").value = "always = yes";
                  if (editData.pictureToken) {
                    document.getElementById("ideaPictureId").value = editData.pictureToken;
                    updateIconPreview(editData.pictureToken);
                  } else {
                    const defaultGfxKey = "GFX_idea_" + item.ideaId;
                    document.getElementById("ideaPictureId").value = defaultGfxKey;
                    updateIconPreview(defaultGfxKey);
                  }
                }

                document.getElementById("ideaName").value = unescapeLocForEdit(editData.localizedName || item.ideaId);
                document.getElementById("ideaDescription").value = unescapeLocForEdit(editData.localizedDesc || "");
                
                if (document.getElementById("ideaCategory")) {
                  document.getElementById("ideaCategory").value = editData.category || "country";
                  updateAdvisorSettingsVisibility();
                }
                if (document.getElementById("ideaTraits")) document.getElementById("ideaTraits").value = editData.traits || "";
                if (document.getElementById("ideaCost")) document.getElementById("ideaCost").value = editData.cost || ""; // #advisor-cost-invented-150
                if (document.getElementById("ideaRemovalCost")) document.getElementById("ideaRemovalCost").value = editData.removalCost || "";
                if (document.getElementById("ideaLedger")) document.getElementById("ideaLedger").value = editData.ledger || "";
                // #extra-script-leaks-between-spirits — nothing ever cleared this box. It is not loaded from
                // the spirit (the server preserves un-modelled blocks itself), so whatever the user last typed
                // for spirit A stayed in it and Save wrote that block into spirit B, under a success message.
                // Selecting a spirit means "show me THIS spirit", so the box starts empty like every other field.
                const esBox = document.getElementById("ideaExtraScript");
                if (esBox) esBox.value = "";

                document.getElementById("aiStatus").textContent = `Loaded ${item.ideaId} from ${pathBasename(file)}!`;
                document.getElementById("aiStatus").style.color = "#2ea043";

                updateStartupCheckbox(); // show which countries already start with this spirit
              } catch (err) {
                console.error("Failed to load spirit data:", err);
                document.getElementById("ideaModifiers").value = "";
                document.getElementById("aiStatus").textContent = `Error loading ${item.ideaId}: ${err.message}`;
                document.getElementById("aiStatus").style.color = "#f85149";
              }
            }
            updateLivePreview();
            // The await above has already resolved, so the editor is fully populated: THIS is what
            // "unchanged" means from here on. #makers-lose-unsaved-work
            if (ideaUnsaved) ideaUnsaved.markClean();
          });

          if (activeDraft && item.isDraft && activeDraft.autoSelect) {
            activeDraft.autoSelect = false;
            setTimeout(() => itemDiv.click(), 50);
          }

          if (autoSelectId && item.ideaId === autoSelectId) {
            autoSelectId = null;
            setTimeout(() => itemDiv.click(), 50);
          }

          itemsContainer.appendChild(itemDiv);
        });
      };

      if (isExpanded) {
        doRenderItems();
      }

      fileTitle.addEventListener("click", () => {
        if (itemsContainer.style.display === "none") {
          doRenderItems();
          itemsContainer.style.display = "block";
          fileTitle.classList.add("expanded");
          expandedFolders.add(file);
        } else {
          itemsContainer.style.display = "none";
          fileTitle.classList.remove("expanded");
          expandedFolders.delete(file);
        }
      });

      ideasList.appendChild(fileDiv);
    });

    if (filterText && !anyMatched) {
      const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
      ideasList.innerHTML = `<div style="padding: 12px; color: #8b949e; font-size: 12px; text-align: center;">No ${ideaMode === "designers" ? "designers" : "spirits"} match "<span style="color:#c9d1d9;">${esc(filterText)}</span>". Try a different search or clear the box.</div>`;
    }
  }

  // Sidebar Search Filter
  const searchInput = document.getElementById("ideasListSearch");

  // 🏛 Base game toggle (#overlay-blindness). Off by default — see the reasoning at the catalog fetch.
  // Per mod, display-only: it changes which entries are LISTED, never what a save writes (the two write
  // paths, upsert and delete, are single-idea and mod-scoped, and the editor is already isMod-gated).
  let SHOW_BASE_IDEAS = false;
  let baseIdeaCount = 0;
  try { SHOW_BASE_IDEAS = localStorage.getItem(`ideas_show_base_${getModPath()}`) === "1"; } catch (_) { SHOW_BASE_IDEAS = false; }
  function updateShowBaseIdeasButton() {
    const btn = document.getElementById("ideasShowBaseBtn");
    if (!btn) return;
    const n = baseIdeaCount;
    btn.textContent = SHOW_BASE_IDEAS
      ? `🏛 Base game: shown${n ? ` (${n})` : ""}`
      : `🏛 Base game: hidden${n ? ` (${n} more the game loads)` : ""}`;
    btn.style.color = SHOW_BASE_IDEAS ? "#c9d1d9" : "#8b949e";
    btn.title = SHOW_BASE_IDEAS
      ? "The base game's ideas are listed read-only alongside this mod's. Click to hide them."
      : `A mod is an overlay: the game loads the base game's ideas underneath yours, so this list is not the whole database${n ? ` — ${n} more exist` : ""}. Click to browse them (read-only).`;
  }
  {
    const b = document.getElementById("ideasShowBaseBtn");
    if (b) b.addEventListener("click", () => {
      SHOW_BASE_IDEAS = !SHOW_BASE_IDEAS;
      try { localStorage.setItem(`ideas_show_base_${getModPath()}`, SHOW_BASE_IDEAS ? "1" : "0"); } catch (_) {}
      updateShowBaseIdeasButton();
      loadIdeasList();
    });
  }
  updateShowBaseIdeasButton();

  // Load Spirits List Sidebar
  async function loadIdeasList() {
    const ideasList = document.getElementById("ideasList");
    if (!ideasList) return;
    // In designers mode the sidebar lists COMPANIES (MIOs), which the MIO editor owns — don't overwrite it with ideas.
    if (ideaMode === "designers") { if (mioEditor) mioEditor.refreshList(); return; }
    ideasList.innerHTML = `<div style="padding: 12px; color: #8b949e; font-size: 13px;">Loading Spirits...</div>`;

    const modPath = getModPath();
    if (!modPath) {
      ideasList.innerHTML = `<div style="padding: 12px; color: #8b949e; font-size: 13px;">Please select an active mod folder above.</div>`;
      return;
    }

    try {
      // A MOD IS AN OVERLAY (#overlay-blindness). This asked for includeVanilla=0 unconditionally and so
      // showed 110 entries for a mod the game loads 6,108 into — while decisions.js and events.js call the
      // SAME endpoint with includeVanilla=1, so the app disagreed with itself about what exists.
      //
      // Unlike the research tree this defaults to OFF, and the difference is not arbitrary: there, hidden
      // base-game content occupied POSITIONS, so not drawing it produced silent collisions the author could
      // not see. Ideas collide by ID, which is detectable, and 6,000 read-only rows in a sidebar is noise
      // rather than insight. So it is opt-in — but the button always states the count, so the editor never
      // implies this mod is the whole database.
      const response = await fetch(`/api/ideas/catalog?includeVanilla=${SHOW_BASE_IDEAS ? 1 : 0}&includeWorkshop=0&includeActiveMod=1&includeModsRoot=0&sourcePath=${encodeURIComponent(modPath)}&modPath=${encodeURIComponent(modPath)}`);
      const data = await response.json();

      // Show only the items for the active mode: country national spirits (spirits mode) or the five
      // designer/manufacturer categories (designers mode). Advisors & military chiefs aren't ideas at
      // all here — they're characters (Characters menu) — so they never appear in either list.
      if (!data.items || data.items.length === 0) {
        allSpirits = [];
      } else {
        allSpirits = data.items.filter(itemMatchesMode);
      }
      // Count what the GAME will load in this mode, not merely what the sidebar drew, so the button can be
      // honest even while the base-game entries are hidden. Measured once per load and cached.
      if (!SHOW_BASE_IDEAS) {
        try {
          const fullRes = await fetch(`/api/ideas/catalog?includeVanilla=1&includeWorkshop=0&includeActiveMod=1&includeModsRoot=0&sourcePath=${encodeURIComponent(modPath)}&modPath=${encodeURIComponent(modPath)}`);
          const fullData = await fullRes.json();
          baseIdeaCount = Math.max(0, (fullData.items || []).filter(itemMatchesMode).length - allSpirits.length);
        } catch (_) { baseIdeaCount = 0; }
      } else {
        baseIdeaCount = allSpirits.filter((it) => it && it.sourceType && it.sourceType !== "active_mod").length;
      }
      updateShowBaseIdeasButton();
      const searchVal = searchInput ? searchInput.value.toLowerCase().trim() : "";
      renderIdeasList(allSpirits, searchVal);
    } catch (err) {
      ideasList.innerHTML = `<div style="padding: 12px; color: #f85149; font-size: 13px;">Error: ${err.message}</div>`;
    }
  }

  if (searchInput) {
    // Debounce: renderIdeasList rebuilds the WHOLE sidebar and, while filtering, force-expands every
    // matching folder — on a big base mod (MD ~9k spirits) a broad character materialises thousands of
    // DOM nodes per keystroke. Rebuild only once typing pauses.
    let searchDebounce;
    searchInput.addEventListener("input", (e) => {
      const val = e.target.value.toLowerCase().trim();
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => renderIdeasList(allSpirits, val), 120);
    });
  }

  // Draft Live Sync
  const ideaIdInput = document.getElementById("ideaId");
  if (ideaIdInput) {
    ideaIdInput.addEventListener("input", (e) => {
      const val = e.target.value.trim();
      const draftEl = document.getElementById("draft-item-spirit");
      if (draftEl && activeDraft) {
        draftEl.textContent = val || "New National Spirit";
        activeDraft.ideaId = val;
      }
    });
  }

  // Icon Preview Helper
  async function updateIconPreview(gfxKey, directTexturefile) {
    const liveIconEl = document.getElementById("previewIdeaIcon");
    // The live preview icon set its src directly with no fallback, so a spirit with no custom GFX
    // showed a broken image (the adjacent picture preview already falls back). Attach a one-shot
    // onerror: fall back to the generic idea icon, then clear itself so a failing fallback can't loop.
    if (liveIconEl && !liveIconEl.dataset.fallbackWired) {
      liveIconEl.dataset.fallbackWired = "1";
      liveIconEl.addEventListener("error", function () {
        if (this.dataset.usedFallback) return; // already fell back once — don't loop
        this.dataset.usedFallback = "1";
        this.src = "/api/vanilla-ui?rel=gfx/interface/ideas/idea_unknown.dds";
      });
    }
    if (liveIconEl) delete liveIconEl.dataset.usedFallback; // reset per icon change so a real icon can retry
    if (!ideaPicturePreview) return;
    if (!gfxKey) {
      ideaPicturePreview.innerHTML = "Icon";
      if (liveIconEl) liveIconEl.src = "/api/vanilla-ui?rel=gfx/interface/ideas/idea_unknown.dds";
      return;
    }
    // When the caller already knows the exact texture file (the icon picker does — it's the same image
    // the thumbnail rendered), use it directly. This is instant and never falls back to "?", avoiding the
    // slow/fallible resolve-by-key round-trip (which is ~18s cold on a big base mod like Millennium Dawn).
    if (directTexturefile) {
      const directUrl = `/api/buildings/icon-file?path=${encodeURIComponent(directTexturefile)}`;
      ideaPicturePreview.innerHTML = `<img src="${directUrl}" alt="Spirit Icon" data-fallback="/api/vanilla-ui?rel=gfx/interface/ideas/idea_unknown.dds" style="max-width: 100%; max-height: 100%; object-fit: contain;" />`;
      if (liveIconEl) liveIconEl.src = directUrl;
      return;
    }
    ideaPicturePreview.innerHTML = `<span style="font-size: 11px; color: #8b949e;">Loading...</span>`;
    try {
      const modPath = getModPath();
      const res = await fetch(`/api/ideas/sprite-url?key=${encodeURIComponent(gfxKey)}&modPath=${encodeURIComponent(modPath)}`);
      const data = await res.json();
      if (data.url) {
        ideaPicturePreview.innerHTML = `<img src="${data.url}" alt="Spirit Icon" data-fallback="/api/vanilla-ui?rel=gfx/interface/ideas/idea_unknown.dds" style="max-width: 100%; max-height: 100%; object-fit: contain;" />`;
        if (liveIconEl) liveIconEl.src = data.url;
      } else {
        const fallback = "/api/vanilla-ui?rel=gfx/interface/ideas/idea_unknown.dds";
        ideaPicturePreview.innerHTML = `<img src="${fallback}" alt="Spirit Icon" style="max-width: 100%; max-height: 100%; object-fit: contain;" />`;
        if (liveIconEl) liveIconEl.src = fallback;
      }
    } catch (err) {
      ideaPicturePreview.innerHTML = `<span style="font-size: 11px; color: #f85149;">Error</span>`;
      if (liveIconEl) liveIconEl.src = "/api/vanilla-ui?rel=gfx/interface/ideas/idea_unknown.dds";
    }
  }

  function parseModifiersToHtml(rawText) {
    if (!rawText || !rawText.trim()) return '<div style="color: #6e7681;">No effects or modifiers</div>';
    const lines = rawText.split('\n');
    let html = '';
    const nameMap = {
      stability: "Stability",
      stability_factor: "Stability Modifier",
      war_support: "War Support",
      war_support_factor: "War Support Modifier",
      political_power_gain: "Daily Political Power",
      political_power_factor: "Political Power Gain",
      research_speed_factor: "Research Speed",
      consumer_goods_factor: "Consumer Goods Factories",
      industrial_capacity_factory: "Factory Output",
      industry_free_civ_to_mil_factor: "Civ to Mil Conversion Speed",
      production_speed_buildings_factor: "Construction Speed",
      conscription: "Conscription Law",
      conscription_factor: "Weekly Manpower",
      weekly_manpower: "Weekly Manpower Gain",
      mobilization_speed: "Mobilization Speed",
      civilian_factory_use: "Consumer Goods Use",
      command_power_gain: "Daily Command Power",
      army_experience: "Army Experience Gain",
      navy_experience: "Navy Experience Gain",
      air_experience: "Air Experience Gain",
      // — extended coverage —
      production_factory_max_efficiency_factor: "Max Factory Efficiency",
      production_factory_efficiency_gain_factor: "Factory Efficiency Growth",
      production_factory_start_efficiency_factor: "Starting Factory Efficiency",
      industrial_capacity_dockyard: "Dockyard Output",
      line_change_production_efficiency_factor: "Retooling Efficiency",
      local_resources_factor: "Resource Gain",
      min_export: "Export Ratio",
      army_org_factor: "Division Organization",
      army_morale_factor: "Division Recovery Rate",
      army_speed_factor: "Division Speed",
      army_attack_factor: "Army Attack",
      army_defence_factor: "Army Defense",
      army_core_attack_factor: "Core Territory Attack",
      army_core_defence_factor: "Core Territory Defense",
      max_planning: "Max Planning Bonus",
      planning_speed: "Planning Speed",
      training_time_factor: "Training Time",
      experience_gain_army_factor: "Division XP Gain",
      land_reinforce_rate: "Reinforce Rate",
      justify_war_goal_time_factor: "Justify War Goal Time",
      generate_wargoal_tension: "World Tension to Declare War",
      drift_defence_factor: "Ideology Drift Defense",
      supply_consumption_factor: "Supply Consumption",
      fuel_gain_factor: "Fuel Gain",
      research_sharing_per_country_bonus: "Research Sharing Bonus",
      political_advisor_cost_factor: "Political Advisor Cost",
      naval_morale_factor: "Naval Morale",
      surface_navy_org_factor: "Surface Fleet Organization",
      conversion_cost_civ_to_mil_factor: "Civ→Mil Conversion Cost",
      surrender_limit: "Surrender Limit",
      // — data-mined from 4,609 vanilla idea modifier blocks (most common previously-unmapped) —
      production_speed_arms_factory_factor: "Mil Factory Construction Speed",
      production_speed_industrial_complex_factor: "Civ Factory Construction Speed",
      production_speed_dockyard_factor: "Dockyard Construction Speed",
      production_speed_infrastructure_factor: "Infrastructure Construction Speed",
      production_speed_bunker_factor: "Land Fort Construction Speed",
      production_speed_coastal_bunker_factor: "Coastal Fort Construction Speed",
      communism_drift: "Communism Support Drift",
      fascism_drift: "Fascism Support Drift",
      democratic_drift: "Democratic Support Drift",
      neutrality_drift: "Non-Aligned Support Drift",
      stability_weekly: "Weekly Stability",
      justify_war_goal_time: "Justify War Goal Time",
      economy_cost_factor: "Economy Law Cost",
      mobilization_laws_cost_factor: "Mobilization Law Cost",
      trade_laws_cost_factor: "Trade Law Cost",
      resistance_target: "Resistance Target",
      non_core_manpower: "Non-Core Manpower Available",
      repair_speed_factor: "Repair Speed",
      army_org_regain: "Org Regain Rate",
      command_power_gain_mult: "Command Power Gain",
      production_lack_of_resource_penalty_factor: "Resource Shortage Penalty",
      send_volunteers_tension: "World Tension to Send Volunteers",
      lend_lease_tension: "World Tension to Lend-Lease",
      join_faction_tension: "World Tension to Join Faction",
      // flat (count/level) modifiers — added to the non-percent list below so they don't show as %
      send_volunteer_size: "Max Volunteer Divisions",
      send_volunteer_divisions_required: "Divisions Required per Volunteer",
      operative_slot: "Operative Slots",
      max_command_power: "Max Command Power"
    };

    lines.forEach(line => {
      line = line.trim();
      if (!line || line.startsWith('#')) return;
      const match = line.match(/^([a-zA-Z0-9_]+)\s*=\s*(.*)$/);
      if (!match) return;
      const key = match[1];
      let valStr = match[2].trim();
      
      if (valStr.startsWith('{')) {
        html += `<div class="hoi4-modifier-line"><span>${key}:</span> <span class="hoi4-mod-val-neut">${escHtml(valStr)}</span></div>`;
        return;
      }
      
      const valNum = parseFloat(valStr);
      const hasMappedName = nameMap[key];
      const displayName = hasMappedName || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      
      if (!isNaN(valNum)) {
        let isPercent = true;
        if (key === 'political_power_gain' || key === 'weekly_manpower' || key === 'command_power_gain' ||
            key === 'send_volunteer_size' || key === 'send_volunteer_divisions_required' ||
            key === 'operative_slot' || key === 'max_command_power') {
          isPercent = false;
        }
        
        let sign = valNum >= 0 ? '+' : '';
        let formattedVal = isPercent ? (sign + (valNum * 100).toFixed(1) + '%') : (sign + valNum.toString());
        
        // Modifiers where a HIGHER value is bad → show positive in red.
        let isPositiveGood = true;
        if (key.includes('consumer_goods') || key.includes('cost') ||
            key.includes('training_time') || key.includes('justify') ||
            key.includes('supply_consumption') || key.includes('fuel_cost') ||
            key.includes('_tension') || key === 'surrender_limit' ||
            key.includes('autonomy_gain') || key.includes('accidents')) {
          isPositiveGood = false;
        }
        
        const isGood = (valNum >= 0 && isPositiveGood) || (valNum < 0 && !isPositiveGood);
        const valClass = isGood ? 'hoi4-mod-val-pos' : 'hoi4-mod-val-neg';
        
        html += `<div class="hoi4-modifier-line"><span>${displayName}:</span> <span class="${valClass}">${formattedVal}</span></div>`;
      } else {
        html += `<div class="hoi4-modifier-line"><span>${displayName}:</span> <span class="hoi4-mod-val-neut">${escHtml(valStr)}</span></div>`;
      }
    });
    return html || '<div style="color: #6e7681;">No effects or modifiers</div>';
  }

  // HOI4 names/descriptions carry DISPLAY codes: color codes (§7, §H, §Y, §! …), scripted refs like
  // [ISR.GetNameWithFlag], and £text_icon sprite tokens (£political_power, £GFX_…). None can be
  // resolved in a static preview, so strip them ALL for a clean readable PREVIEW that mirrors what a
  // player sees in-game — matching the event card's stripLocDisplayCodes. DISPLAY ONLY: the editable
  // field and the saved .yml keep the raw value untouched, so this never changes what's written.
  // Delegates to the one canonical implementation (#loc-display-strip in loading-overlay.js). Five makers had
  // grown their own near-copy and they disagreed — none stripped $KEY$ references (9.9% of vanilla's values)
  // or the [?var|%fmt] print form, and the leading punctuation a removed token exposed was left behind.
  // DISPLAY ONLY: the editable field and the saved .yml keep the raw value untouched.

  // A name is often not plain text — 8.5% of vanilla's localisation values START with a runtime token, so a
  // real one shows up here as e.g. "[ROOT.GetNameDefCap] Reform Act". The box keeps the RAW value (editing it
  // must be lossless, and that is what gets saved), so show what a player will actually read underneath it.
  function updateIdeaNameRenderedHint() {
    const el = document.getElementById("ideaNameRendered");
    const input = document.getElementById("ideaName");
    if (!el || !input) return;
    const raw = input.value || "";
    const dynamic = window.novaLocHasDynamicCodes ? window.novaLocHasDynamicCodes(raw) : /[§£[]$]/.test(raw);
    if (!dynamic) { el.style.display = "none"; el.textContent = ""; return; }
    const shown = stripGameFormatting(raw);
    el.style.display = "";
    el.textContent = shown
      ? "In game this reads: " + shown + "   (the [..] / $..$ / § parts are filled in by the game — they are kept exactly as typed)"
      : "Every part of this is filled in by the game at runtime, so there is no fixed text to preview.";
  }

  function stripGameFormatting(s) {
    if (typeof window !== "undefined" && window.novaStripLocCodes) return window.novaStripLocCodes(s);
    return String(s == null ? "" : s).replace(/§[A-Za-z0-9!]/g, "").trim();
  }
  // Escape user free-text before it goes into innerHTML (modifier values / trait tokens can contain
  // < or & from a typo or a variable expression). Display-only; the saved value is never escaped.
  function escHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  // Render a research_bonus block ("armor = 0.15" / "CAT_inf_wep = 0.217") as readable company effect
  // lines. Categories are mod-defined tokens, so just humanize them (strip CAT_, underscores → spaces).
  function parseResearchBonusToHtml(rawText) {
    if (!rawText || !rawText.trim()) return "";
    let html = "";
    rawText.split("\n").forEach((line) => {
      line = line.trim();
      if (!line || line.startsWith("#")) return;
      const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*(-?[0-9.]+)/);
      if (!m) return;
      const num = parseFloat(m[2]);
      if (isNaN(num)) return;
      const label = m[1].replace(/^CAT_/i, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      const pct = num * 100;
      const pctStr = (pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(1)) + "%";
      const cls = num >= 0 ? "hoi4-mod-val-pos" : "hoi4-mod-val-neg";
      html += `<div class="hoi4-modifier-line"><span>${label} Research:</span> <span class="${cls}">${num >= 0 ? "+" : ""}${pctStr}</span></div>`;
    });
    return html;
  }

  function updateLivePreview() {
    const idVal = (document.getElementById("ideaId")?.value || "custom_spirit").trim();
    const nameVal = (document.getElementById("ideaName")?.value || "").trim();
    const descVal = (document.getElementById("ideaDescription")?.value || "").trim();
    const catVal = document.getElementById("ideaCategory")?.value || "country";
    const removalCostVal = parseInt(document.getElementById("ideaRemovalCost")?.value, 10);
    const modifiersText = document.getElementById("ideaModifiers")?.value || "";

    const readableId = idVal.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    const finalName = nameVal || readableId || "New Spirit";
    
    const previewNameEl = document.getElementById("previewIdeaName");
    updateIdeaNameRenderedHint();
    if (previewNameEl) previewNameEl.textContent = stripGameFormatting(finalName);
    const tooltipNameEl = document.getElementById("tooltipIdeaName");
    if (tooltipNameEl) tooltipNameEl.textContent = stripGameFormatting(finalName);

    const tooltipDescEl = document.getElementById("tooltipIdeaDesc");
    if (tooltipDescEl) {
      tooltipDescEl.textContent = stripGameFormatting(descVal) || "No description.";
      tooltipDescEl.style.display = descVal ? "" : "none";
    }

    const tooltipCatEl = document.getElementById("tooltipIdeaCat");
    if (tooltipCatEl) {
      const catMap = {
        country: "National Spirit",
        political_advisor: "Political Advisor",
        tank_manufacturer: "Tank Manufacturer",
        naval_manufacturer: "Naval Manufacturer",
        materiel_manufacturer: "Materiel Manufacturer",
        aircraft_manufacturer: "Aircraft Manufacturer",
        industrial_concern: "Industrial Concern",
        army_chief: "Army Chief",
        navy_chief: "Navy Chief",
        air_chief: "Air Chief",
        military_theorist: "Military Theorist",
        high_command: "High Command"
      };
      tooltipCatEl.textContent = catMap[catVal] || "National Spirit";
    }

    const isDesignerPreview = DESIGNER_CATS_CLIENT.includes(catVal);

    // Toggle the company-card look (rectangular portrait + blue accent) vs the round spirit icon.
    const previewCard = document.querySelector(".hoi4-spirit-preview");
    if (previewCard) previewCard.classList.toggle("is-company", isDesignerPreview);

    const tooltipCostEl = document.getElementById("tooltipIdeaCost");
    if (tooltipCostEl) {
      if (isDesignerPreview) {
        const assignCost = parseInt(document.getElementById("ideaCost")?.value, 10);
        tooltipCostEl.style.display = "";
        tooltipCostEl.textContent = isNaN(assignCost)
          ? "Assign to a company slot"
          : `Costs ${assignCost} political power to assign`;
      } else if (catVal === "country" && !isNaN(removalCostVal) && removalCostVal >= 0) {
        tooltipCostEl.style.display = "";
        tooltipCostEl.textContent = `Can be removed for ${removalCostVal} PP`;
      } else {
        tooltipCostEl.style.display = "none";
      }
    }

    const tooltipModsEl = document.getElementById("tooltipIdeaModifiers");
    if (tooltipModsEl) {
      if (isDesignerPreview) {
        // Companies show their research bonus + trait + (presence of) equipment bonus — not modifiers.
        const rb = document.getElementById("ideaResearchBonus")?.value || "";
        const tr = (document.getElementById("ideaTraits")?.value || "").trim();
        const eq = (document.getElementById("ideaEquipment")?.value || "").trim();
        let html = parseResearchBonusToHtml(rb);
        if (tr) {
          const traitLabels = tr.split(/[\s,]+/).filter(Boolean)
            .map((t) => t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())).join(", ");
          html += `<div class="hoi4-modifier-line"><span>Company trait:</span> <span class="hoi4-mod-val-neut">${escHtml(traitLabels)}</span></div>`;
        }
        if (eq) html += `<div class="hoi4-modifier-line"><span>Equipment bonus:</span> <span class="hoi4-mod-val-pos">yes</span></div>`;
        tooltipModsEl.innerHTML = html || '<div style="color: #6e7681;">No research bonus yet — add one below</div>';
      } else {
        tooltipModsEl.innerHTML = parseModifiersToHtml(modifiersText);
      }
    }
  }

  // Handle icon input change manually
  if (ideaPictureId) {
    ideaPictureId.addEventListener("input", (e) => {
      updateIconPreview(e.target.value.trim());
      updateLivePreview();
    });
  }

  // Wire other input elements to update preview
  // Include the designer fields (research bonus / traits / cost / equipment) so the company preview
  // updates live, alongside the spirit fields.
  ["ideaId", "ideaName", "ideaDescription", "ideaCategory", "ideaRemovalCost", "ideaModifiers",
   "ideaResearchBonus", "ideaTraits", "ideaCost", "ideaEquipment"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", updateLivePreview);
      el.addEventListener("change", updateLivePreview);
    }
  });

  // Genesis "plain English" preview for the spirit's script fields (read-only, additive — never
  // changes what is saved). Lets a modder confirm what an effect/condition does without reading raw
  // Paradox script. DOM text nodes only (no markup injection). Mirrors the decision/event makers.
  //   mode = "effect"  -> the On-Add effect ("Political power +50")
  //   mode = "trigger" -> the Available condition ("has completed the focus X")
  function refreshIdeaPreview(textareaId, previewId, mode, labelText) {
    const ta = document.getElementById(textareaId);
    const box = document.getElementById(previewId);
    if (!ta || !box) return;
    const raw = (ta.value || "").trim();
    if (!raw) { box.style.display = "none"; box.textContent = ""; return; }
    const fnName = mode === "trigger" ? "translateTriggers" : "translate";
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
  function refreshIdeaGenesisPreview() {
    refreshIdeaPreview("ideaOnAdd", "ideaOnAddPreview", "effect", "🔮 In plain English");
    refreshIdeaPreview("ideaAvailable", "ideaAvailablePreview", "trigger", "🔮 Available when");
  }
  [
    ["ideaOnAdd", "ideaOnAddPreview", "effect", "🔮 In plain English"],
    ["ideaAvailable", "ideaAvailablePreview", "trigger", "🔮 Available when"]
  ].forEach(([taId, prevId, mode, label]) => {
    const el = document.getElementById(taId);
    if (el) {
      const handler = () => refreshIdeaPreview(taId, prevId, mode, label);
      el.addEventListener("input", handler);
      el.addEventListener("change", handler);
    }
  });
  window.__novaRefreshIdeaGenesis = refreshIdeaGenesisPreview;

  // Handle DDS Image Upload
  ideaPictureUpload.addEventListener("change", async (e) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append("image", file);
    
    const ideaIdValue = document.getElementById("ideaId").value || "custom_idea";
    formData.append("name", ideaIdValue);
    formData.append("type", "idea");

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
      ideaPictureId.value = data.spriteName;
      // Refresh BOTH the icon thumbnail AND the live spirit-icon preview (previewIdeaIcon). Setting the value
      // doesn't fire the input listener, so the live icon never updated after an upload. Pass the DDS path so
      // it loads instantly (no cold-map sprite-url miss).
      updateIconPreview(data.spriteName, data.ddsPath);
    } catch (err) {
      uploadStatus.textContent = `Error: ${err.message}`;
      uploadStatus.style.color = "#f85149";
    }
  });

  const ideaPictureUploadBtn = document.getElementById("ideaPictureUploadBtn");
  if (ideaPictureUploadBtn) {
    ideaPictureUploadBtn.addEventListener("click", () => {
      ideaPictureUpload.click();
    });
  }

  // Browse Icons Modal Logic
  const selectVanillaIconBtn = document.getElementById("selectVanillaIconBtn");
  const iconPickerModal = document.getElementById("iconPickerModal");
  const closeIconPicker = document.getElementById("closeIconPicker");
  const iconPickerSearch = document.getElementById("iconPickerSearch");
  const iconPickerGrid = document.getElementById("iconPickerGrid");

  let allVanillaSprites = null; // cached sprites map/list
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
        <span style="font-size: 10px; color: #8b949e; word-break: break-all; font-family: monospace;">${sprite.key.replace(/^GFX_idea_/, "")}</span>
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
        ideaPictureId.value = sprite.key;
        updateIconPreview(sprite.key, sprite.texturefile); // use the exact image we already loaded
        iconPickerModal.style.display = "none";
      });

      fragment.appendChild(itemDiv);
    });

    iconPickerGrid.appendChild(fragment);
    renderedCount += batch.length;
    // Fill just enough to make the grid scrollable (so scroll-to-load-more takes over) — never all at once.
    if (renderedCount < currentFilteredSprites.length && renderedCount < 96 && iconPickerGrid.clientHeight > 0 && iconPickerGrid.scrollHeight <= iconPickerGrid.clientHeight + 40) requestAnimationFrame(renderNextBatch);
  }

  function handleSearch() {
    const val = iconPickerSearch.value.toLowerCase().trim();
    if (!allVanillaSprites) return;

    currentFilteredSprites = allVanillaSprites.filter(sprite =>
      sprite.key.toLowerCase().includes(val)
    );

    iconPickerGrid.innerHTML = "";
    renderedCount = 0;

    if (currentFilteredSprites.length === 0) {
      iconPickerGrid.innerHTML = `<div style="grid-column: 1/-1; padding: 24px; color: #8b949e; text-align: center;">No icons found.</div>`;
    } else {
      renderNextBatch();
    }
  }

  if (selectVanillaIconBtn && iconPickerModal) {
    selectVanillaIconBtn.addEventListener("click", async () => {
      iconPickerModal.style.display = "block";
      iconPickerSearch.value = "";
      setTimeout(() => { try { iconPickerSearch.focus(); } catch (_) {} }, 0); // type to search at once

      if (allVanillaSprites !== null) {
        handleSearch();
        iconPickerGrid.scrollTop = 0;
        return;
      }

      iconPickerGrid.innerHTML = `<div style="grid-column: 1/-1; padding: 24px; color: #8b949e; text-align: center;">Scanning game files for spirit icons...</div>`;

      try {
        const modPath = getModPath();
        const res = await fetch(`/api/ideas/sprites?modPath=${encodeURIComponent(modPath)}`);
        const data = await res.json();

        if (!data.sprites || data.sprites.length === 0) {
          allVanillaSprites = [];
          iconPickerGrid.innerHTML = `<div style="grid-column: 1/-1; padding: 24px; color: #8b949e; text-align: center;">No icons found.</div>`;
          return;
        }

        allVanillaSprites = data.sprites;
        handleSearch();
        iconPickerGrid.scrollTop = 0;
      } catch (err) {
        iconPickerGrid.innerHTML = `<div style="grid-column: 1/-1; padding: 24px; color: #f85149; text-align: center;">Error: ${err.message}</div>`;
      }
    });

    iconPickerGrid.addEventListener("scroll", () => {
      if (iconPickerGrid.scrollTop + iconPickerGrid.clientHeight >= iconPickerGrid.scrollHeight - 60) {
        if (renderedCount < currentFilteredSprites.length) {
          renderNextBatch();
        }
      }
    });

    if (closeIconPicker) {
      closeIconPicker.addEventListener("click", () => {
        iconPickerModal.style.display = "none";
      });
      closeIconPicker.addEventListener("mouseenter", () => {
        closeIconPicker.style.color = "#f85149";
      });
      closeIconPicker.addEventListener("mouseleave", () => {
        closeIconPicker.style.color = "#8b949e";
      });
    }

    window.addEventListener("click", (e) => {
      if (e.target === iconPickerModal) {
        iconPickerModal.style.display = "none";
      }
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && iconPickerModal.style.display === "block") {
        iconPickerModal.style.display = "none";
      }
    });

    if (iconPickerSearch) {
      iconPickerSearch.addEventListener("input", handleSearch);
    }
  }

  // AI Help Dialog click listener
  const aiLogicHelpBtn = document.getElementById("aiLogicHelpBtn");
  if (aiLogicHelpBtn) {
    aiLogicHelpBtn.addEventListener("click", () => {
      window.showNovaAiHelpModal("aiIdeaPrompt");
    });
  }

  const removalCostHelpBtn = document.getElementById("removalCostHelpBtn");
  if (removalCostHelpBtn) {
    removalCostHelpBtn.addEventListener("click", () => {
      window.showNovaInfoModal("What does Removal Cost mean?",
        '<p style="margin:0 0 10px;">Removal Cost is the Political Power (PP) a player must spend in-game to manually remove this national spirit / idea.</p>' +
        '<ul style="margin:0 0 0 18px; padding:0; line-height:1.7;">' +
          "<li>Set to <b>-1</b> (or left blank) — the spirit is <b>permanent</b> and cannot be removed by the player.</li>" +
          "<li>Set to <b>0</b> or any positive number (e.g. 100) — the player can click the spirit in their country menu to remove it for that cost.</li>" +
        "</ul>",
        "ideaRemovalCost");
    });
  }

  // AI Generator integration
  const generateAiIdeaBtn = document.getElementById("generateAiIdeaBtn");
  const aiIdeaPrompt = document.getElementById("aiIdeaPrompt");
  const aiStatus = document.getElementById("aiStatus");
  
  generateAiIdeaBtn.addEventListener("click", async () => {
    const prompt = aiIdeaPrompt.value.trim();
    if (!prompt) return;
    
    aiStatus.textContent = "Generating...";
    generateAiIdeaBtn.disabled = true;
    
    const storedKey = localStorage.getItem("gemini_api_key") || localStorage.getItem("geminiApiKey");
    // Company-aware: in Designers mode ask for a designer-shaped JSON (research_bonus + trait, NO plain
    // modifiers). The server appends the active mod's valid TECHNOLOGY CATEGORIES so research_bonus uses
    // real categories (armor in vanilla, CAT_* in Millennium Dawn).
    const designerMode = ideaMode === "designers";
    const designerSlot = document.getElementById("ideaCategory").value;
    const systemPrompt = designerMode ? `You are a Master-Level Hearts of Iron IV (HOI4) Modding AI.
Translate the user's request into a DESIGNER / COMPANY idea for the "${designerSlot}" slot.
Output ONLY a valid JSON object (no markdown, no chatter) with this EXACT structure:
{
  "id": "company_id",
  "name": "Company Name",
  "description": "Short flavor line",
  "allowed": "original_tag = GER",
  "researchBonus": "<category> = 0.15",
  "traits": "tank_manufacturer",
  "equipment": "",
  "cost": "150"
}
RULES:
- researchBonus: one or more "<category> = <decimal>" lines. <category> MUST be EXACTLY one token from the TECHNOLOGY CATEGORIES list below — it is a research category, NOT a tech id. A company typically gives 0.10-0.20 to ONE category that matches its slot.
- traits: the standard company trait for this slot (tank_manufacturer -> "tank_manufacturer", naval_manufacturer -> "naval_manufacturer", aircraft_manufacturer -> "light_aircraft_manufacturer" or "medium_aircraft_manufacturer", materiel_manufacturer -> "infantry_equipment_manufacturer" or "artillery_manufacturer", industrial_concern -> "industrial_concern"). If unsure, use "".
- equipment: optional idea-level equipment_bonus in HOI4 nested syntax, e.g. "armor = { reliability = 0.05 }". Use "" if not requested.
- allowed: which country may hire this company (e.g. "original_tag = GER") or "always = yes".
- cost: political power to assign (default "150").` : `You are a Master-Level Hearts of Iron IV (HOI4) Modding AI.
Your purpose is to translate user requests into structured National Spirit properties.
You MUST output ONLY a valid JSON object. Do NOT wrap the JSON in markdown code blocks. Do not include any explanation or chatter.
The JSON object must have this exact structure:
{
  "id": "custom_spirit_1",
  "name": "Spirit Name",
  "description": "Spirit Description",
  "allowed": "always = yes",
  "available": "has_war = no",
  "modifiers": "political_power_gain = 0.10\\nindustrial_capacity_factory = 0.05",
  "equipment": "infantry_weapons = { build_cost_ic = -0.10 }"
}`;

    try {
      const response = await fetch("/api/ai/logic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          systemPrompt,
          modPath: getModPath(),
          apiKey: storedKey || ""
        })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);

      const parsedData = window.NovaAI.parseJsonResponse(data.script);

      // #ai-generate-renames-the-open-item — a generated spirit/company REPLACES the form, so it is new, not a
      // rename of whichever spirit was open. Leaving loadedIdeaId attached made the next Save read the new id
      // as a rename and delete the spirit the user was only looking at. ⧉ Duplicate clears this for the same
      // reason and says so; the AI path never did.
      loadedIdeaId = null;

      if (designerMode) {
        document.getElementById("ideaId").value = cleanScriptId(parsedData.id, "custom_company_1");
        document.getElementById("ideaName").value = parsedData.name || "";
        document.getElementById("ideaDescription").value = parsedData.description || "";
        document.getElementById("ideaAllowed").value = parsedData.allowed || "always = yes";
        { const rb = document.getElementById("ideaResearchBonus"); if (rb) rb.value = parsedData.researchBonus || parsedData.research_bonus || ""; }
        { const tr = document.getElementById("ideaTraits"); if (tr) tr.value = parsedData.traits || ""; }
        document.getElementById("ideaEquipment").value = parsedData.equipment || "";
        // #advisor-cost-invented-150 — an AI-supplied cost is kept, but one that strips to nothing must stay
        // blank rather than fall back to 150, which is only the POLITICAL advisor default.
        { const c = document.getElementById("ideaCost"); if (c && parsedData.cost) c.value = String(parsedData.cost).replace(/[^0-9]/g, "") || ""; }
        ["ideaId", "ideaName", "ideaDescription", "ideaAllowed", "ideaResearchBonus", "ideaTraits", "ideaEquipment", "ideaCost"].forEach(id => {
          const el = document.getElementById(id);
          if (el) { el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }
        });
        aiStatus.textContent = "AI Company parsed and loaded into the form!";
        aiStatus.style.color = "#2ea043";
      } else {
      const nextId = cleanScriptId(parsedData.id, "custom_spirit_1");
      document.getElementById("ideaId").value = nextId;
      document.getElementById("ideaName").value = parsedData.name || "";
      document.getElementById("ideaDescription").value = parsedData.description || "";
      document.getElementById("ideaAllowed").value = parsedData.allowed || "always = yes";
      document.getElementById("ideaAvailable").value = parsedData.available || "";
      document.getElementById("ideaModifiers").value = parsedData.modifiers || "";
      document.getElementById("ideaEquipment").value = parsedData.equipment || "";
      { const vis = document.getElementById("ideaVisible"); if (vis) vis.value = parsedData.visible || ""; }
      { const oa = document.getElementById("ideaOnAdd"); if (oa) { oa.value = parsedData.onAdd || ""; oa.dispatchEvent(new Event("input")); } }

      // Trigger input and change events to sync draft and update live preview
      ["ideaId", "ideaName", "ideaDescription", "ideaAllowed", "ideaAvailable", "ideaModifiers", "ideaEquipment"].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });

      aiStatus.textContent = "AI Spirit successfully parsed and loaded into the form!";
      aiStatus.style.color = "#2ea043";
      }
    } catch (err) {
      aiStatus.textContent = "Error: " + err.message;
      aiStatus.style.color = "#f85149";
    } finally {
      generateAiIdeaBtn.disabled = false;
    }
  });

  // Duplicate: make an editable COPY of the loaded national spirit with a fresh non-colliding id,
  // ready to Save as a new spirit (the original is untouched). Speeds up building spirit families.
  function allSpiritIds() {
    const s = new Set();
    (allSpirits || []).forEach((it) => { if (it && it.ideaId) s.add(it.ideaId); });
    return s;
  }
  function uniqueSpiritId(base) {
    const ids = allSpiritIds();
    const root = String(base || "spirit").replace(/_copy\d*$/i, "");
    let cand = root + "_copy", n = 2;
    while (ids.has(cand)) cand = root + "_copy" + n++;
    return cand;
  }
  const duplicateIdeaBtn = document.getElementById("duplicateIdeaBtn");
  if (duplicateIdeaBtn) {
    duplicateIdeaBtn.addEventListener("click", () => {
      const cur = (document.getElementById("ideaId").value || "").trim();
      if (!cur || cur.startsWith("new_spirit")) {
        (window.nbAlert || window.alert)("Load or select a national spirit first — Duplicate then makes an editable copy of it.");
        return;
      }
      const copyId = uniqueSpiritId(cur);
      // A copy is a NEW spirit. Forget which id the form was loaded as, or the save reads the changed id as a
      // rename and deletes the spirit being copied — the mistake this loop already made on characters.
      loadedIdeaId = null;
      document.getElementById("ideaId").value = copyId;
      const nameEl = document.getElementById("ideaName");
      if (nameEl) nameEl.value = (nameEl.value || cur).replace(/\s*\(copy\)\s*$/i, "") + " (copy)";
      // It's now a NEW, unsaved spirit: drop the active selection + hide Delete until it's saved.
      document.querySelectorAll(".decision-item").forEach((el) => el.classList.remove("active"));
      const delBtn = document.getElementById("deleteIdeaBtn"); if (delBtn) delBtn.classList.add("is-hidden");
      // A fresh copy owns no countries yet — clear the game-start owner chips so Save doesn't silently
      // write the ORIGINAL spirit's startup grants onto the copy (mirrors New + draft-select).
      if (ideaBridge) ideaBridge.clear();
      ["ideaId", "ideaName"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) { el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }
      });
      if (typeof updateLivePreview === "function") updateLivePreview();
      if (window.nbAlert) window.nbAlert('Copy ready as "' + copyId + '". Tweak it if you like, then Save to create it — the original "' + cur + '" is untouched.', "Duplicated");
    });
  }

  // Create New Spirit button click handler
  const newIdeaBtn = document.getElementById("newIdeaBtn");
  if (newIdeaBtn) {
    newIdeaBtn.addEventListener("click", () => {
      // #create-new-discards-the-form — same discard as clicking another spirit in the list, which has asked
      // since #makers-lose-unsaved-work. The designers branch below hands off to the MIO editor's own
      // newCompany, so the guard sits above it and covers both.
      if (ideaUnsaved && ideaUnsaved.isDirty()) {
        ideaUnsaved.confirmDiscard("Start a new one", () => newIdeaBtn.click());
        return;
      }
      loadedIdeaId = null; // a blank form has nothing to rename from
      // Designers mode is the COMPANY (MIO) editor — start a blank company, not an idea draft. #companies-mio
      if (ideaMode === "designers") { if (mioEditor) mioEditor.newCompany(); return; }
      const dz = ideaMode === "designers";
      const generatedId = (dz ? "new_company_" : "new_spirit_") + Math.floor(Math.random() * 1000);
      activeDraft = {
        ideaId: generatedId,
        name: dz ? "New Company" : "New National Spirit",
        desc: dz ? "New Company Description" : "New Spirit Description",
        blockText: dz
          ? "allowed = {\n  always = yes\n}\nresearch_bonus = {\n}"
          : "allowed = {\n  always = yes\n}\nmodifier = {\n  political_power_gain = 0.05\n}",
        autoSelect: true
      };

      document.getElementById("ideaId").value = generatedId;
      document.getElementById("ideaName").value = dz ? "New Company" : "New National Spirit";
      document.getElementById("ideaDescription").value = dz ? "New Company Description" : "New Spirit Description";
      document.getElementById("ideaPictureId").value = "GFX_idea_generic_morale_bonus";
      updateIconPreview("GFX_idea_generic_morale_bonus");
      document.getElementById("ideaPictureUpload").value = "";
      document.getElementById("ideaAllowed").value = "always = yes";
      { const av = document.getElementById("ideaAvailable"); av.value = ""; av.dispatchEvent(new Event("input")); }
      document.getElementById("ideaModifiers").value = dz ? "" : "political_power_gain = 0.05";
      document.getElementById("ideaEquipment").value = "";
      { const vis = document.getElementById("ideaVisible"); if (vis) vis.value = ""; }
      { const oa = document.getElementById("ideaOnAdd"); if (oa) { oa.value = ""; oa.dispatchEvent(new Event("input")); } }
      // …and the Extra script box, which every other field's reset had missed, so a new spirit inherited
      // whatever raw block was typed for the previous one. #extra-script-leaks-between-spirits
      { const es = document.getElementById("ideaExtraScript"); if (es) es.value = ""; }
      document.getElementById("aiIdeaPrompt").value = "";
      document.getElementById("aiStatus").textContent = dz
        ? "Starter Company Template Ready! Pick a slot + research bonus, then click 'Save Designer'."
        : "Starter Spirit Template Ready! Fill in details and click 'Save National Spirit' to save.";
      document.getElementById("aiStatus").style.color = "#58a6ff";
      if (ideaBridge) ideaBridge.clear(); // fresh template — no owner countries yet
      if (document.getElementById("deleteIdeaBtn")) document.getElementById("deleteIdeaBtn").classList.add("is-hidden");

      // Keep the active mode's category: spirits → country; designers → keep the chosen slot (don't
      // snap back to country, which would kick the form out of designers mode).
      if (document.getElementById("ideaCategory")) {
        if (!dz) document.getElementById("ideaCategory").value = "country";
        updateAdvisorSettingsVisibility();
      }
      if (document.getElementById("ideaTraits")) document.getElementById("ideaTraits").value = "";
      if (document.getElementById("ideaCost")) document.getElementById("ideaCost").value = ""; // #advisor-cost-invented-150
      if (document.getElementById("ideaRemovalCost")) document.getElementById("ideaRemovalCost").value = "";
      if (document.getElementById("ideaLedger")) document.getElementById("ideaLedger").value = "";
      if (document.getElementById("ideaAllowedCivilWar")) document.getElementById("ideaAllowedCivilWar").value = "";
      if (document.getElementById("ideaResearchBonus")) document.getElementById("ideaResearchBonus").value = "";

      // Refresh list to show Draft folder at top
      renderIdeasList(allSpirits);
      updateLivePreview();

      // #new-draft-is-not-unsaved-work — the untouched template is the baseline. Without this the blank
      // draft reads as dirty the moment it is made, and the draft auto-selects itself, so the item-switch
      // guard asks whether to discard the empty form the user just asked for. Only real typing counts.
      if (ideaUnsaved) ideaUnsaved.markClean();

      // Focus + select the name so you can type the real name over the "New National Spirit" placeholder.
      const nameInput = document.getElementById("ideaName");
      if (nameInput) setTimeout(() => { try { nameInput.focus(); nameInput.select(); } catch (_) {} }, 0);
    });
  }

  // Extra-script scaffold chips: one click inserts a valid, empty block for a common un-modeled spirit
  // field (on_remove, cancel, targeted_modifier, rule, ai_will_do) at the cursor, so modders discover +
  // author these without memorising the syntax. The whole block round-trips via the verbatim passthrough.
  (function wireExtraScriptChips() {
    const box = document.getElementById("ideaExtraScript");
    const chips = document.getElementById("ideaExtraScriptChips");
    if (!box || !chips) return;
    const SNIPPETS = {
      on_remove: "on_remove = {\n\t\n}",
      cancel: "cancel = {\n\t\n}",
      targeted_modifier: "targeted_modifier = {\n\ttag = FROM\n\tattack_bonus_against = 0.1\n}",
      rule: "rule = {\n\tcan_declare_war = no\n}",
      ai_will_do: "ai_will_do = {\n\tfactor = 1\n}",
    };
    chips.addEventListener("click", (e) => {
      const btn = e.target.closest(".es-chip");
      if (!btn) return;
      e.preventDefault();
      const snip = SNIPPETS[btn.getAttribute("data-snip")];
      if (!snip) return;
      box.focus();
      // Always APPEND each block as a sibling at the end (never at the cursor — otherwise a second chip
      // would nest inside the block a first chip just opened). The existing text keeps a trailing blank
      // line separator; the caret lands on the new block's indented inner line, ready to type.
      const existing = box.value.replace(/\s+$/, "");
      const sep = existing ? existing + "\n" : "";
      box.value = sep + snip + "\n";
      const innerOffset = snip.indexOf("\n\t");
      const caret = innerOffset >= 0 ? (sep + snip.slice(0, innerOffset + 2)).length : box.value.length;
      try { box.selectionStart = box.selectionEnd = caret; } catch (_) {}
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
  })();

  // Save Idea integration
  const saveIdeaBtn = document.getElementById("saveIdeaBtn");
  if (saveIdeaBtn) {
    saveIdeaBtn.addEventListener("click", async () => {
      const ideaId = document.getElementById("ideaId").value.trim();
      const _tf = document.getElementById("ideaTargetFile").value.trim(); const targetRelativeFile = /.txt$/i.test(_tf) ? _tf : "custom_ideas.txt"; // guard: a non-.txt value (e.g. the "Drafts" group) would 400
      const name = document.getElementById("ideaName").value.trim();
      const desc = document.getElementById("ideaDescription").value.trim();
      const pictureToken = document.getElementById("ideaPictureId").value.trim();
      
      const allowed = document.getElementById("ideaAllowed").value.trim();
      const modifiers = document.getElementById("ideaModifiers").value.trim();
      const equipment = document.getElementById("ideaEquipment").value.trim();
      const visible = (document.getElementById("ideaVisible")?.value || "").trim();
      const onAdd = (document.getElementById("ideaOnAdd")?.value || "").trim();
      const extraScript = (document.getElementById("ideaExtraScript")?.value || "").trim();

      if (!ideaId) {
        nbAlert("Spirit ID is required.");
        return;
      }
      // #spirit-save-rejects-a-hyphen-it-can-open — an INTERIOR hyphen is legal in a Paradox token, and
      // the four gates that READ a spirit id already accept one. Vanilla itself ships
      // AST_vickers-ruwolt_organization_idea and AST_curtiss-wright_organization_idea; Millennium Dawn
      // ships NKO_Marxism-Leninism. Refusing here meant the modder never even reached the server.
      if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(ideaId)) {
        nbAlert("Spirit ID must start with a letter or underscore, then letters, numbers, underscores or hyphens. HOI4 rejects an ID that starts with a digit, which would break the ideas file.");
        return;
      }

      let category = document.getElementById("ideaCategory").value;
      // Safety: never save a designer as a country idea. If the slot got blanked (stale draft state),
      // fall back to the first designer slot so the backend still writes `designer = yes` correctly.
      if (ideaMode === "designers" && !DESIGNER_CATS_CLIENT.includes(category)) category = DESIGNER_CATS_CLIENT[0];
      const kind = categoryKind(category);
      // Gate fields by category kind so we never write contradictory keys
      // (e.g. cost/traits/available on a country national spirit).
      const removalCost = document.getElementById("ideaRemovalCost").value.trim();
      const cost = kind === "country" ? "" : document.getElementById("ideaCost").value.trim();
      const traits = kind === "country" ? "" : document.getElementById("ideaTraits").value.trim();
      const ledger = kind === "advisor" ? document.getElementById("ideaLedger").value.trim() : "";
      const available = kind === "country" ? "" : document.getElementById("ideaAvailable").value.trim();
      const allowedCivilWar = kind === "country" ? document.getElementById("ideaAllowedCivilWar").value.trim() : "";
      const researchBonus = kind === "designer" ? document.getElementById("ideaResearchBonus").value.trim() : "";

      // EDIT only when the spirit lives in a WRITABLE root (the active mod / custom source). A spirit that
      // exists ONLY via a dependency (e.g. Millennium Dawn) or vanilla must be a CREATE — writing an override
      // into the add-on — otherwise "edit" 400s with "spirit not found in the selected idea file" and you
      // can't copy/customize an inherited spirit. Catalog sourceType: active_mod/custom = ours (editable);
      // dependency/game/workshop/mods_root = inherited (override via create).
      const WRITABLE_IDEA_SOURCES = new Set(["active_mod", "custom"]);
      const isExisting = allSpirits.some(it => it.ideaId === ideaId && (it.sourceType === undefined || WRITABLE_IDEA_SOURCES.has(it.sourceType)));
      const mode = isExisting ? "edit" : "create";

      saveIdeaBtn.disabled = true;
      saveIdeaBtn.textContent = "Saving...";

      const selectedEffects = [];
      if (allowed) selectedEffects.push(`allowed = {\n${allowed}\n}`);
      if (allowedCivilWar) selectedEffects.push(`allowed_civil_war = {\n${allowedCivilWar}\n}`);
      if (available) selectedEffects.push(`available = {\n${available}\n}`);
      if (researchBonus) selectedEffects.push(`research_bonus = {\n${researchBonus}\n}`);
      // Designers/companies never carry a plain modifier (their box is hidden) — guard against a stale value.
      if (modifiers && kind !== "designer") selectedEffects.push(`modifier = {\n${modifiers}\n}`);
      if (equipment) selectedEffects.push(`equipment_bonus = {\n${equipment}\n}`);
      if (visible) selectedEffects.push(`visible = {\n${visible}\n}`);
      if (onAdd) selectedEffects.push(`on_add = {\n${onAdd}\n}`);
      // Verbatim passthrough for any block the form doesn't model (targeted_modifier, rule, on_remove, …) so
      // copying a base-mod spirit stays faithful. mergePlainStringEffectsIntoIdeaBlock emits it as-is, and on a
      // later edit the backend preserves un-modeled sections byte-for-byte, so it round-trips.
      if (extraScript) selectedEffects.push(extraScript);

      try {
        const response = await fetch("/api/ideas/upsert-definition", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modPath: getModPath(),
            ideaId,
            targetRelativeFile,
            // Where it used to live, so a move removes the old block instead of leaving a second copy.
            ...(loadedDefinitionFile && pathBasename(loadedDefinitionFile) !== pathBasename(targetRelativeFile)
              ? { previousRelativeFile: loadedDefinitionFile } : {}),
            // …and what it used to be CALLED, so a rename removes the old id instead of leaving a copy.
            ...(loadedIdeaId && loadedIdeaId !== ideaId ? { previousIdeaId: loadedIdeaId } : {}),
            // …and WHERE it came from, so a spirit inherited from a dependency is copied whole rather than
            // rebuilt from the handful of fields this form models. Only sent when it is not already ours:
            // the server's move-cleanup used to treat sourceRoot as "the root to delete from", so a save
            // naming someone else's mod could reach into it. That is fixed server-side
            // (#spirit-move-deletes-from-the-base-mod), and this stays narrow anyway.
            ...(loadedSourceRoot && loadedSourceRoot !== getModPath() ? { sourceRoot: loadedSourceRoot } : {}),
            targetLocalizationPath: "localisation/english/custom_ideas_l_english.yml",
            name,
            desc,
            picture: pictureToken,
            selectedEffects,
            // WHICH FORM BOXES THIS KIND ACTUALLY SHOWS. The server clears a section it owns when the payload
            // does not name it, on the reasoning that the user emptied a visible box. That reasoning only
            // holds for boxes the form DREW: `available` is hidden for country spirits and `research_bonus`
            // for country and advisor, so for those kinds an absent section meant "never shown", not
            // "cleared" — and every save silently deleted them from disk. #spirit-save-deletes-hidden-blocks
            //
            // …and `modifier` is the fourth such box, missed when the other three were gated. Company mode
            // HIDES it (ideas.js:163 `showEl("grpModifiers", !designers)`) and the effect builder above
            // refuses to send one for a designer — so naming it here told the server "the user emptied a box
            // they could see", and every company Save deleted the whole `modifier = { … }` block. Measured
            // over the shipped corpora: 510 of vanilla's 1,025 designer/company ideas carry one, 782 of
            // 1,603 in The Road to 56, 357 of 983 in Rise of Nations. #company-save-deletes-the-modifier-block
            formSections: [
              "allowed", "equipment_bonus", "visible", "on_add",
              ...(kind === "designer" ? [] : ["modifier"]),
              ...(kind === "country" ? [] : ["available"]),
              ...(kind === "designer" ? ["research_bonus"] : []),
              ...(kind === "country" ? ["allowed_civil_war"] : []),
            ],
            mode,
            category,
            traits,
            cost,
            removalCost,
            ledger
          })
        });
        
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        // Grant this spirit at game start to each chosen owner country (and unwire removed ones).
        // #owner-sync-result-discarded — sync() does not throw; it RETURNS what it could not write. Throwing
        // the result away meant a refused owner write (no mod selected, a read-only vanilla root, an item type
        // the endpoint will not grant) ended with "Successfully saved". The bridge's own amber status line is
        // wiped moments later by the list reload and auto-select below, so the modal is where this has to go.
        const ownerSync = ideaBridge ? await ideaBridge.sync(ideaId) : null;
        const ownerWarn = (ownerSync && ownerSync.failed.length)
          ? "\n\n⚠️ The spirit was saved, but " + ownerSync.failed.length + " owner setting" +
            (ownerSync.failed.length === 1 ? "" : "s") + " could not be written:\n" +
            ownerSync.failed.map((f) => "• " + f.who + ": " + f.error).join("\n")
          : "";

        activeDraft = null; // Save succeeded, clear draft
        // This is now what it's saved as, and where — so renaming or moving it AGAIN, without reselecting it
        // from the list first, moves it from here rather than from wherever it was originally loaded.
        loadedIdeaId = ideaId;
        loadedDefinitionFile = targetRelativeFile;
        loadedSourceRoot = getModPath(); // it lives here now, so later saves must not name a foreign root
        // The spirit really was saved, so this stays a success line. Anything the save could not do —
        // a rename that could not reach a dependency's grants, a gui file repaired on your behalf — is
        // shown separately by the write-note surface in loading-overlay.js, which does it for every
        // maker page rather than only the ones that remembered to. #write-notes-reach-one-page
        // #idea-duplicate-loc-key-unreported — the save DID work, but if this id's name key is defined in
        // more than one English .yml the game picks whichever it loads last, so the name the author just
        // typed may never appear and nothing would explain why. The server works this out and returns it;
        // app.js's national-spirit maker has shown it for a long time (there, appended to its status line).
        // This page dropped it.
        //
        // Read here rather than drained globally by the write-note surface on purpose: that surface claims
        // a field name across the WHOLE api, and app.js already shows this one — draining it would print
        // the same warning twice on that page, which is exactly the collision `note` caused.
        // #army-save-notes-invisible
        const dupes = Array.isArray(data && data.localizationNameKeyDuplicates) ? data.localizationNameKeyDuplicates : [];
        const dupeLine = dupes.length > 1
          ? `\n\nWarning: ${ideaId}:0 is defined in ${dupes.length} English localisation files (${dupes.join(", ")}). `
            + `HOI4 takes whichever loads last, so the name you just set may not be the one in game. Remove the duplicates.`
          : "";
        nbAlert(`Successfully saved ${ideaId} into ${targetRelativeFile}!${dupeLine}${ownerWarn}`);
        // #save-does-not-rebaseline-the-watcher — the form now IS the file, so this is the new baseline.
        // Without it the save is followed straight away by "You have unsaved changes in the Spirit maker.
        // Switch spirit anyway?", because the auto-select below goes through the item-switch guard and the
        // baseline is still whatever the spirit was LOADED with. markClean, not markCleanUnlessTouched:
        // anything typed after this instant really is unsaved and must still be caught.
        if (ideaUnsaved) ideaUnsaved.markClean();
        expandedFolders.add(targetRelativeFile);
        if (!targetRelativeFile.startsWith("common/ideas/")) {
          expandedFolders.add("common/ideas/" + targetRelativeFile);
        }
        autoSelectId = ideaId;
        loadIdeasList();
      } catch (err) {
        nbAlert(`Save failed: ${err.message}`);
      } finally {
        saveIdeaBtn.disabled = false;
        saveIdeaBtn.textContent = ideaMode === "designers" ? "Save Designer" : "Save National Spirit";
      }
    });
  }

  // Delete Idea integration
  const deleteIdeaBtn = document.getElementById("deleteIdeaBtn");
  if (deleteIdeaBtn) {
    deleteIdeaBtn.addEventListener("click", async () => {
      const ideaId = document.getElementById("ideaId").value.trim();
      const _tf = document.getElementById("ideaTargetFile").value.trim(); const targetRelativeFile = /.txt$/i.test(_tf) ? _tf : "custom_ideas.txt"; // guard: a non-.txt value (e.g. the "Drafts" group) would 400

      if (!ideaId) return;
      const noun = ideaMode === "designers" ? "Designer" : "National Spirit"; // company vs spirit wording

      window.novaConfirm(`Are you sure you want to delete ${noun} "${ideaId}" from ${targetRelativeFile}?`, async () => {

      deleteIdeaBtn.disabled = true;
      deleteIdeaBtn.textContent = "Deleting...";

      try {
        const response = await fetch("/api/ideas/delete-definition", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modPath: getModPath(),
            ideaId,
            targetRelativeFile
          })
        });
        
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        nbAlert(`Deleted ${ideaId}.\n\nA backup of the original file was saved automatically, so this can be recovered if it was a mistake.`);
        activeDraft = null;
        autoSelectId = null;
        document.getElementById("ideaName").value = "";
        document.getElementById("ideaDescription").value = "";
        // #delete-leaves-the-page-dirty — the two fields above are inside ideaUnsaved's watched root, so
        // blanking them made the page read dirty over a spirit that no longer exists. Clicking another
        // spirit then asked whether to discard it, and — far worse — the quit dialog's Save clicks
        // #saveIdeaBtn, which with the id still filled in RE-CREATES the spirit that was just deleted,
        // blank. The identity goes with the rest, as the Decisions and Event makers both do.
        document.getElementById("ideaId").value = "";
        if (ideaUnsaved) ideaUnsaved.markClean();
        document.getElementById("deleteIdeaBtn").classList.add("is-hidden");
        loadIdeasList();
      } catch (err) {
        nbAlert(`Delete failed: ${err.message}`);
      } finally {
        deleteIdeaBtn.disabled = false;
        deleteIdeaBtn.textContent = ideaMode === "designers" ? "Delete Designer" : "Delete Spirit";
      }
      }, { title: "Delete " + noun, yesLabel: "Delete", danger: true });
    });
  }

  // (Owner countries are managed by the shared owner-bridge chips; no single-tag listener needed.)

  function initCountryDatalist() {
    // Attach the shared owner-chip bridge once; on later calls (mod change) just refresh its country list.
    if (!ideaBridge && window.NovaOwnerBridge) {
      ideaBridge = window.NovaOwnerBridge.attach({
        host: "ideaOwnerBridge", itemType: "spirit",
        title: "Grant this spirit at game start to…", applyVerb: "grant",
        getModPath,
      });
    } else if (ideaBridge) {
      ideaBridge.repopulate();
    }
  }

  // Startup Init
  // Background pre-warm of the icon sprite maps so the first picture browse/preview is instant (#2/#3).
  function warmSprites() { try { fetch(`/api/mod/warm-sprites?modPath=${encodeURIComponent(getModPath())}`).catch(() => {}); } catch (_) {} }
  initModSelector(() => {
    loadIdeasList();
    initCountryDatalist();
    warmSprites();
  }).then(() => {
    loadIdeasList();
    initCountryDatalist();
    warmSprites();
    updateLivePreview();
    // Deep-link from the Military › Companies tab: ?mode=designers opens straight into the company/designer
    // editor (companies ARE designer ideas — the Military tab surfaces them, this page edits them).
    // ?embed=1 additionally strips the page chrome so the SAME editor renders natively INSIDE the Military
    // tab via a same-origin iframe (issues 7/10 — one editor, two entry points, no duplicate maker).
    try {
      const sp = new URLSearchParams(location.search);
      const embed = sp.get("embed") === "1";
      if (sp.get("mode") === "designers" || embed) applyIdeaMode("designers");
      if (embed) applyEmbedChrome();
    } catch (_) {}
  });
});

// Strip Nova's page chrome when this page is embedded in the Military tab's Companies iframe: hide the top
// nav + the spirits/designers toggle + the vanilla banner, but KEEP the app-header (Save/Duplicate/Delete +
// mod selector live there). Then refit the layout to the reduced dock height.
function applyEmbedChrome() {
  const hide = (sel) => document.querySelectorAll(sel).forEach((el) => { el.style.display = "none"; });
  hide(".suite-nav");        // redundant nav inside the Military tab
  hide("#ideaModeSwitch");   // lock to designers — the Military tab is company-only
  hide("#vanillaBanner");    // the parent Military page already shows the active-mod context
  // The parent Military header owns mod switching. A second LIVE selector in here would flip the shared
  // localStorage activeModPath under the parent's feet — its saves would silently target another mod.
  hide(".mod-selector-container");
  document.body.classList.add("nova-embed");
  const dock = document.getElementById("topDock");
  const layout = document.querySelector(".ideas-layout");
  if (layout) layout.style.height = "calc(100vh - " + (dock ? dock.offsetHeight : 52) + "px)";
  document.body.style.overflow = "hidden";
}
