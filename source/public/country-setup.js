/* country-setup.js — Country Setup view logic */
(function () {
  "use strict";

  // Strip HOI4 loc DISPLAY codes for read-only labels (colour §t…§!, scripted-loc [SOV.GetName] scope
  // tokens, £text_icon sprites) — the sibling makers (app.js/events.js/research.js) all do this; Country
  // Setup was the outlier, so mod idea/spirit names leaked literal §/[]/£ garbage. Display-only; the raw id
  // is always what gets written back, never this. #strip-loc
  function stripLoc(s) {
    if (typeof s !== "string") return s;
    return s.replace(/§[A-Za-z0-9!]/g, "").replace(/\[[^\]]*\]/g, "").replace(/£\S+/g, "").replace(/\s{2,}/g, " ").trim();
  }

  // Whether the server currently allows writing into the real vanilla HOI4 install (advanced Settings
  // opt-in on Home; off on every fresh launch). Fetched once at init. When vanilla is the active "mod"
  // and this is false, every write endpoint here would throw "Cannot write directly to the vanilla…"
  // AFTER the round-trip → a raw error toast. So we grey out the write controls up-front instead. #vanilla-ro
  let vanillaEditsAllowed = false;
  // The buttons that trigger a server WRITE (or open a picker that writes on select). Greyed out in the
  // read-only vanilla case; we only re-enable the ones WE locked (dataset.vanillaLocked) so a button that
  // was disabled for its own reason — e.g. "Set as flag" waiting for an image — keeps its own state.
  const CS_WRITE_BTN_IDS = ["csSaveDetailsBtn", "csAddSpiritBtn", "csBrowseSpiritBtn", "csAddTechBtn", "csBrowseTechBtn", "csFlagChooseBtn", "csFlagUploadBtn", "csCreateCountryBtn"];
  function setWriteControlsLocked(locked) {
    const why = "Vanilla is read-only. Select or create a mod (or enable “Allow editing vanilla game files” in Settings) to edit.";
    CS_WRITE_BTN_IDS.forEach((id) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      if (locked) {
        if (!btn.disabled) { btn.disabled = true; btn.dataset.vanillaLocked = "1"; btn.title = why; }
      } else if (btn.dataset.vanillaLocked === "1") {
        btn.disabled = false; delete btn.dataset.vanillaLocked; btn.title = "";
      }
    });
  }

  // Image fallback (CSP-safe): inline image error handlers are blocked by the page CSP (script-src 'self').
  // Images marked data-fallback="…" swap to that src; data-fallback-html="…" replaces the broken <img> with
  // that markup (e.g. a 🔬 emoji). One capture-phase listener (the error event doesn't bubble; guarded vs loops).
  document.addEventListener("error", (e) => {
    const t = e.target;
    if (!t || t.tagName !== "IMG") return;
    if (t.dataset.fallback && t.src.indexOf(t.dataset.fallback) < 0) { t.src = t.dataset.fallback; return; }
    if (t.dataset.fallbackHtml) t.outerHTML = t.dataset.fallbackHtml;
  }, true);

  // Non-blocking replacement for the native browser alert dialog (which freezes the Electron renderer
  // and can leave inputs locked). Routes through the shared Nova modal (ai-field-assist.js, loaded on
  // this page). Same one-arg shape, so every call site was swapped to nbAlert. Body has no native
  // dialog token so the swap never recurses.
  function nbAlert(message, title) {
    const msg = String(message == null ? "" : message);
    const html = msg.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>");
    const t = title || (/\b(fail|failed|cannot|can.?t|could ?n.?t|could not|error|unable|invalid)\b/i.test(msg) ? "Something went wrong" : "Heads up");
    if (window.showNovaInfoModal) window.showNovaInfoModal(t, html);
    else if (window.console) window.console.warn(msg);
  }

  // Promise-based text prompt. Native window.prompt() returns null in Electron's renderer (it's not
  // implemented), so any feature using it is a silent no-op in the desktop app — this replaces it.
  // Resolves to the trimmed string, or null if cancelled.
  function csPrompt(title, message, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      const ov = document.createElement("div");
      ov.style.cssText = "position:fixed; inset:0; z-index:2147483300; display:flex; align-items:center; justify-content:center; background:rgba(3,7,14,0.66); backdrop-filter:blur(2px); font-family:'Inter',system-ui,sans-serif;";
      const msg = String(message == null ? "" : message).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>");
      ov.innerHTML =
        '<div role="dialog" aria-modal="true" style="width:min(440px,92vw); background:linear-gradient(140deg,#1a3566,#2e1f55); border:1px solid rgba(150,160,255,0.28); border-radius:14px; box-shadow:0 22px 66px rgba(0,0,0,0.6); padding:22px; color:#d7e1f5;">' +
          '<h2 style="margin:0 0 8px; font-size:17px; color:#eaf3ff;">' + String(title || "") + "</h2>" +
          '<div style="font-size:13px; line-height:1.5; margin:0 0 12px; color:#c4cdec;">' + msg + "</div>" +
          '<input type="text" autocomplete="off" spellcheck="false" style="width:100%; box-sizing:border-box; padding:9px 10px; background:#0d1117; border:1px solid #30363d; color:#e6edf3; border-radius:8px; font-size:14px; outline:none;" />' +
          '<div style="display:flex; gap:10px; justify-content:flex-end; margin-top:16px;">' +
            '<button data-act="cancel" style="padding:9px 16px; background:rgba(255,255,255,0.10); border:1px solid rgba(150,160,255,0.3); border-radius:10px; color:#eaf3ff; font-size:13px; font-weight:600; cursor:pointer;">Cancel</button>' +
            '<button data-act="ok" style="padding:9px 16px; background:linear-gradient(135deg,#3072e6,#7a51d8); border:none; border-radius:10px; color:#fff; font-size:13px; font-weight:600; cursor:pointer;">OK</button>' +
          "</div>" +
        "</div>";
      document.body.appendChild(ov);
      const input = ov.querySelector("input");
      if (opts.placeholder) input.placeholder = opts.placeholder;
      setTimeout(() => { input.focus(); input.select(); }, 0);
      const close = (val) => { ov.remove(); document.removeEventListener("keydown", onKey, true); resolve(val); };
      const onKey = (e) => { if (e.key === "Enter") { e.preventDefault(); close(input.value.trim()); } else if (e.key === "Escape") { e.preventDefault(); close(null); } };
      document.addEventListener("keydown", onKey, true);
      ov.querySelector('[data-act="ok"]').addEventListener("click", () => close(input.value.trim()));
      ov.querySelector('[data-act="cancel"]').addEventListener("click", () => close(null));
      ov.addEventListener("mousedown", (e) => { if (e.target === ov) close(null); });
    });
  }

  // ── State ──────────────────────────────────────────────────────────────
  let countries = [];          // { tag, name } from catalog
  let selectedTag = null;

  // #country-setup-loses-work-silently — THIS PAGE COULD THROW AWAY EVERYTHING YOU HAD TYPED, IN SILENCE.
  //
  // Country Setup has no undo stack, which is defensible: it is a form, and "undo" for a form is "reload
  // without saving". What made that indefensible is that it had nothing else either — no dirty flag, no
  // navigation guard, not one confirmation. Changing the mod dropdown ran selectedTag = null; showEmpty()
  // and the half-filled details panel was gone with no way back.
  //
  // The Research Tree, the Focus Tree and Military all guard this. This adopts the Research Tree's shape
  // (public/research.js) rather than inventing a fourth one: put the selector back first so cancelling
  // leaves everything exactly as it was, then ask.
  let csDirty = false;
  const csMarkDirty = () => { csDirty = true; };
  const csMarkClean = () => { csDirty = false; };
  /** Ask before an action that discards the details form. Calls proceed() only if the user agrees. */
  function csConfirmDiscard(what, proceed) {
    if (!csDirty) { proceed(); return; }
    const msg = "You have unsaved country details. " + what + " anyway and lose them?";
    if (window.novaConfirm) {
      window.novaConfirm(msg, () => { csMarkClean(); proceed(); },
        { title: "Unsaved changes", yesLabel: what + " (discard)", cancelLabel: "Keep editing", danger: true });
    } else if (confirm(msg)) { csMarkClean(); proceed(); }
  }
  let currentSpirits = [];     // string[] of spirit IDs currently active
  // #enter-writes-without-save — what the SERVER last told us this country had. Everything the user does to
  // the two lists below is staged in memory, and Save Details works out the difference. A diff rather than a
  // list of pending operations, because a diff is self-correcting: add a spirit, change your mind, remove it
  // again, and there is nothing left to send. An operation log would faithfully replay both.
  let savedSpirits = [];
  let savedTechs = [];
  let allKnownSpirits = [];    // string[] for autocomplete suggestions
  let allKnownSpiritsDetailed = []; // detailed spirits list for picker
  let allKnownTechsDetailed = [];   // detailed technologies list for picker
  let locMap = {};             // spirit_id -> display name
  let picMap = {};             // spirit_id -> picture token (the game draws GFX_idea_<token>)

  // ── DOM refs ───────────────────────────────────────────────────────────
  let headerModSel, countrySearch, countryList, emptyState, panel, panelTitle, panelSub, fileBar, filePath, fileStatus, spiritCountEl, spiritsList, addInput, addBtn, suggestList;
  let csCapital, csResearchSlots, csStability, csWarSupport, csConvoys, csRulingParty, csElectionsAllowed, csLastElection, csElectionFrequency, popDemocratic, popFascism, popCommunism, popNeutrality, saveDetailsBtn;

  document.addEventListener("DOMContentLoaded", () => {
    headerModSel   = document.getElementById("headerModSelector");
    countrySearch  = document.getElementById("csCountrySearch");
    countryList    = document.getElementById("csCountryList");
    emptyState     = document.getElementById("csEmptyState");
    panel          = document.getElementById("csPanel");
    panelTitle     = document.getElementById("csPanelTitle");
    panelSub       = document.getElementById("csPanelSub");
    fileBar        = document.getElementById("csFileBar");
    filePath       = document.getElementById("csFilePath");
    fileStatus     = document.getElementById("csFileStatus");
    spiritCountEl  = document.getElementById("csSpiritCount");
    spiritsList    = document.getElementById("csSpiritsList");
    addInput       = document.getElementById("csAddSpiritInput");
    addBtn         = document.getElementById("csAddSpiritBtn");
    suggestList    = document.getElementById("csSpiritSuggestions");

    // Country details DOM refs
    csCapital      = document.getElementById("csCapital");
    csResearchSlots = document.getElementById("csResearchSlots");
    csStability    = document.getElementById("csStability");
    csWarSupport   = document.getElementById("csWarSupport");
    csConvoys      = document.getElementById("csConvoys");
    csRulingParty  = document.getElementById("csRulingParty");
    csElectionsAllowed = document.getElementById("csElectionsAllowed");
    csLastElection = document.getElementById("csLastElection");
    csElectionFrequency = document.getElementById("csElectionFrequency");
    popDemocratic  = document.getElementById("popDemocratic");
    popFascism     = document.getElementById("popFascism");
    popCommunism   = document.getElementById("popCommunism");
    popNeutrality  = document.getElementById("popNeutrality");
    saveDetailsBtn = document.getElementById("csSaveDetailsBtn");

    // #country-setup-loses-work-silently — one delegated listener on the panel marks the form dirty. It is
    // delegated on purpose: renderIdeologyInputs adds popularity boxes at runtime for a mod's own
    // ideologies, and wiring each field by name would miss exactly those.
    {
      const panel = document.getElementById("csPanel");
      if (panel) {
        panel.addEventListener("input", csMarkDirty, true);
        panel.addEventListener("change", csMarkDirty, true);
      }
      // …and the OTHER way off this page: the 11 suite-nav links in the top bar, plus closing the window.
      //
      // ⚠️ THIS MUST NOT BE A RAW beforeunload, which is what it was on the first pass. Under Electron —
      // the build users actually run — a beforeunload handler that calls preventDefault() raises no prompt
      // at all; it SILENTLY CANCELS the navigation. A dirty Country Setup form would have made the nav bar
      // dead and the window unclosable, which is precisely the Decisions-page bug that put the shared guard
      // in loading-overlay.js in the first place (#suite-nav-discards-unsaved-work). One owner: hand it the
      // dirty-check and it runs the nav-link click path (works under Electron), the browser-only
      // beforeunload, and main.js's quit hook.
      if (typeof window.novaGuardSuiteNav === "function") {
        window.novaGuardSuiteNav(() => csDirty, "Country Setup", {
          // Electron's quit dialog defaults to Save, and a page that answers "yes, unsaved" while offering
          // no saver fails that branch with a spurious "Save Failed" and refuses to close.
          onSave: () => { const b = document.getElementById("csSaveDetailsBtn"); if (b) b.click(); },
        });
      }
    }

    // #new-country-has-no-names — offer the pool to a country that was made before the create path started
    // writing one (or carved out by hand). The seeder is the same one the creators use.
    const seedBtn = document.getElementById("csSeedNameListBtn");
    if (seedBtn) seedBtn.addEventListener("click", seedNameListForSelectedCountry);

    // Live "x / 100" check on the four ideology popularities — HOI4 expects them to sum to 100,
    // and a silent mismatch is an easy mistake to make. Read-only hint; never blocks saving.
    [popDemocratic, popFascism, popCommunism, popNeutrality].forEach((el) => {
      if (el) el.addEventListener("input", updatePopularityTotal);
    });
    updatePopularityTotal();

    // Clamp the percentage fields to 0–100 AS YOU TYPE. HTML min/max only validate on form submit, so without
    // this "150" would silently save as 150% stability. Stability + war support are wired directly; the
    // ideology-popularity boxes (incl. the ones renderIdeologyInputs builds at runtime for a mod's extra
    // ideologies) are caught by delegation on #popularityGrid. Empty / lone "-" are left alone while typing.
    const clampPct = (el) => { if (!el || el.value === "" || el.value === "-") return; const v = parseFloat(el.value); if (!Number.isFinite(v)) return; if (v < 0) el.value = "0"; else if (v > 100) el.value = "100"; };
    [csStability, csWarSupport].forEach((el) => { if (el) el.addEventListener("input", () => { clampPct(el); markUserEdited(el); }); });
    if (csResearchSlots) csResearchSlots.addEventListener("input", () => markUserEdited(csResearchSlots));
    const popGrid = document.getElementById("popularityGrid");
    if (popGrid) popGrid.addEventListener("input", (e) => { if (e.target && e.target.matches && e.target.matches('[data-ideology-input="1"]')) clampPct(e.target); });

    // ── 🏴 Country flag upload — write gfx/flags/<TAG>.tga (+ sizes + ideology variants) from a PNG/JPG ──
    {
      const fileInput = document.getElementById("csFlagFileInput");
      const chooseBtn = document.getElementById("csFlagChooseBtn");
      const uploadBtn = document.getElementById("csFlagUploadBtn");
      const preview = document.getElementById("csFlagPreview");
      const previewHint = document.getElementById("csFlagPreviewHint");
      const statusEl = document.getElementById("csFlagStatus");
      if (fileInput && chooseBtn && uploadBtn) {
        chooseBtn.addEventListener("click", () => fileInput.click());
        fileInput.addEventListener("change", () => {
          const f = fileInput.files && fileInput.files[0];
          if (!f) return;
          if (preview) { preview.src = URL.createObjectURL(f); preview.style.display = ""; }
          if (previewHint) previewHint.style.display = "none";
          uploadBtn.disabled = !selectedTag;
          if (statusEl) { statusEl.textContent = selectedTag ? `Ready — click “Set as flag” to write ${selectedTag}'s flag.` : "Select a country first."; statusEl.style.color = "#8b949e"; }
        });
        uploadBtn.addEventListener("click", async () => {
          const f = fileInput.files && fileInput.files[0];
          if (!f) { if (statusEl) { statusEl.textContent = "Choose an image first."; statusEl.style.color = "#f85149"; } return; }
          if (!selectedTag) { if (statusEl) { statusEl.textContent = "Select a country first."; statusEl.style.color = "#f85149"; } return; }
          const modPath = localStorage.getItem("activeModPath") || "";
          uploadBtn.disabled = true;
          if (statusEl) { statusEl.textContent = "Writing flag files…"; statusEl.style.color = "#8b949e"; }
          try {
            const fd = new FormData();
            fd.append("image", f);
            fd.append("tag", selectedTag);
            fd.append("modPath", modPath);
            const r = await fetch("/api/flags/upload-country-flag", { method: "POST", body: fd });
            const d = await r.json().catch(() => ({}));
            if (!r.ok || !d.ok) throw new Error(d.error || "Upload failed.");
            if (statusEl) { statusEl.textContent = `✓ Flag set for ${d.tag} — wrote ${(d.written || []).length} files. Reload the mod in-game to see it.`; statusEl.style.color = "#2ea043"; }
          } catch (e) {
            if (statusEl) { statusEl.textContent = "Failed: " + (e && e.message ? e.message : e); statusEl.style.color = "#f85149"; }
          } finally {
            uploadBtn.disabled = false;
          }
        });
      }
    }

    // One-click "Balance to 100%": scale the current values proportionally so they sum to exactly
    // 100 (or, if everything is 0, split evenly). Saves the user the fiddly decimal arithmetic that
    // caused the original 99.8 + 0.2 confusion.
    const balanceBtn = document.getElementById("popBalanceBtn");
    if (balanceBtn) {
      balanceBtn.addEventListener("click", () => {
        const inputs = popularityInputs();
        if (!inputs.length) return;
        const vals = inputs.map((el) => { const n = parseFloat(el.value); return Number.isFinite(n) && n > 0 ? n : 0; });
        const sum = vals.reduce((s, n) => s + n, 0);
        let scaled = sum > 0
          ? vals.map((n) => (n / sum) * 100)             // proportional
          : vals.map(() => 100 / inputs.length);          // all-zero → even split
        // Round to 1 decimal, then put any rounding remainder on the largest box so the total is
        // EXACTLY 100 (no 99.9/100.1 surprises).
        scaled = scaled.map((n) => Math.round(n * 10) / 10);
        const rounded = scaled.reduce((s, n) => s + n, 0);
        const diff = Math.round((100 - rounded) * 10) / 10;
        if (diff !== 0) {
          let maxI = 0; for (let i = 1; i < scaled.length; i++) if (scaled[i] > scaled[maxI]) maxI = i;
          scaled[maxI] = Math.round((scaled[maxI] + diff) * 10) / 10;
        }
        // #balance-button-is-invisible-to-the-guard — assigning .value fires nothing, so the delegated
        // input/change listeners on #csPanel that are this page's ENTIRE dirty check never saw a rebalance:
        // every guard reported the page clean and the new numbers were dropped by the next load with no
        // prompt. Announce the fill the way a keystroke would, so anything listening sees it (army.js's
        // eqbSetInput does the same for the equipment browser).
        inputs.forEach((el, i) => {
          const next = String(scaled[i]);
          // Only when the box ACTUALLY changes. Balancing an already-balanced country is a no-op, and
          // announcing it anyway would leave the page claiming unsaved work over a button press that
          // changed nothing.
          if (el.value === next) return;
          el.value = next;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        });
        updatePopularityTotal();
      });
    }

  // ── Helpers ────────────────────────────────────────────────────────────
  // All ideology-popularity inputs currently on the page — one box per ideology the active mod
  // defines (renderIdeologyInputs builds them from /api/ideologies), so e.g. Millennium Dawn's 5th
  // "nationalist" ideology is included in the sum. Falls back to the four static HTML boxes.
  function popularityInputs() {
    const dyn = Array.from(document.querySelectorAll('[data-ideology-input="1"]'));
    if (dyn.length) return dyn;
    return [popDemocratic, popFascism, popCommunism, popNeutrality].filter(Boolean);
  }

  function popInputByIdeology(id) {
    return document.querySelector('[data-ideology-input="1"][data-ideology="' + id + '"]');
  }

  // The four vanilla ideologies keep their stable element ids so existing code/refs still resolve;
  // any extra ideology a mod adds gets an auto-generated id.
  const STANDARD_IDEOLOGY_IDS = { democratic: "popDemocratic", fascism: "popFascism", communism: "popCommunism", neutrality: "popNeutrality" };
  const FALLBACK_IDEOLOGIES = [
    { id: "democratic", name: "Democratic" }, { id: "fascism", name: "Fascism" },
    { id: "communism", name: "Communism" }, { id: "neutrality", name: "Neutrality" },
  ];

  // Rebuild the popularity grid so it has exactly one box per ideology the active mod defines.
  function renderIdeologyInputs(list) {
    const grid = document.getElementById("popularityGrid");
    if (!grid) return;
    const ideologies = (Array.isArray(list) && list.length) ? list : FALLBACK_IDEOLOGIES;
    grid.style.gridTemplateColumns = "repeat(" + Math.min(5, ideologies.length) + ", 1fr)";
    grid.innerHTML = "";
    ideologies.forEach((ideo) => {
      const wrap = document.createElement("div");
      const label = document.createElement("label");
      label.style.cssText = "display:block;font-size:11px;color:#8b949e;margin-bottom:4px;text-align:center;";
      label.textContent = ideo.name || ideo.id;
      const input = document.createElement("input");
      input.type = "number"; input.min = "0"; input.max = "100"; input.placeholder = "e.g. 25";
      input.style.cssText = "width:100%;text-align:center;padding:6px 10px;background:#0d1117;border:1px solid #30363d;border-radius:4px;color:#c9d1d9;font-size:13px;";
      input.dataset.ideology = ideo.id;
      input.dataset.ideologyInput = "1";
      if (STANDARD_IDEOLOGY_IDS[ideo.id]) input.id = STANDARD_IDEOLOGY_IDS[ideo.id];
      input.addEventListener("input", updatePopularityTotal);
      wrap.appendChild(label); wrap.appendChild(input);
      grid.appendChild(wrap);
    });
    // The grid was rebuilt, so re-acquire the four standard refs used elsewhere.
    popDemocratic = document.getElementById("popDemocratic");
    popFascism    = document.getElementById("popFascism");
    popCommunism  = document.getElementById("popCommunism");
    popNeutrality = document.getElementById("popNeutrality");
    updatePopularityTotal();
    // Keep the ruling-party dropdown in sync with the SAME ideology set. Without this the <select>
    // stays on the static vanilla four, so a mod's extra ideology (e.g. Millennium Dawn's
    // "nationalist") can't be picked AND loading a country ruled by it silently blanks the field,
    // corrupting ruling_party on the next save.
    renderRulingPartyOptions(ideologies);
    // If a country was already loaded when the grid rebuilt (e.g. ideologies fetch resolved after a
    // quick selection), re-populate its values so the rebuild doesn't blank them.
    if (selectedTag) loadCountryDetails(selectedTag);
  }

  // Rebuild the ruling-party <select> from the active mod's ideologies so every ideology that can
  // hold popularity can also be the ruling party. Preserves the current pick if still valid.
  function renderRulingPartyOptions(list) {
    if (!csRulingParty) return;
    const ideologies = (Array.isArray(list) && list.length) ? list : FALLBACK_IDEOLOGIES;
    const prev = csRulingParty.value;
    csRulingParty.innerHTML = "";
    ideologies.forEach((ideo) => {
      const opt = document.createElement("option");
      opt.value = ideo.id;
      opt.textContent = ideo.name || ideo.id;
      csRulingParty.appendChild(opt);
    });
    if (prev && ideologies.some((i) => i.id === prev)) csRulingParty.value = prev;
  }

  // Fetch the active mod's ideology set and rebuild the popularity boxes to match.
  async function loadIdeologies() {
    try {
      const mod = getActiveModPath();
      const qs = mod ? ("?modPath=" + encodeURIComponent(mod)) : "";
      const resp = await fetch("/api/ideologies" + qs);
      const data = await resp.json();
      renderIdeologyInputs(data && data.ideologies);
    } catch (e) {
      console.error("Failed to load ideologies:", e);
      renderIdeologyInputs(null); // keep the vanilla four
    }
  }

  function updatePopularityTotal() {
    const ind = document.getElementById("popTotalIndicator");
    if (!ind) return;
    const inputs = popularityInputs();
    if (!inputs.length) return;
    // parseFLOAT, not parseInt — popularities are decimals (99.8, 0.2). parseInt truncated them
    // (99.8 -> 99) so a valid 100% read as 99%. Sum all boxes present (the dynamic set covers a
    // mod's extra ideologies, e.g. MD's "nationalist").
    const v = (el) => { const n = parseFloat(el && el.value); return Number.isFinite(n) ? n : 0; };
    const total = inputs.reduce((s, el) => s + v(el), 0);
    const shown = Math.round(total * 100) / 100; // tidy display (drops float noise like 99.99999)
    if (Math.abs(total - 100) < 0.05) {
      ind.textContent = "✓ Ideologies total 100%.";
      ind.style.color = "#2ea043";
    } else {
      ind.textContent = "⚠ Ideologies total " + shown + "% — they should add up to 100%.";
      ind.style.color = total > 100 ? "#f85149" : "#d29922";
    }
  }

  // #country-setup-pickers-frozen — sessionStorage survives in-window navigation (the app relies on that
  // deliberately in map-dev-warning.js and startup-backup-warning.js), so these picker catalogues were cached
  // for the WHOLE app session with no TTL, no fingerprint and no revalidation — there is no
  // sessionStorage.removeItem anywhere in public/. Leaving Country Setup, creating a spirit on the Ideas page
  // or a technology on the Research page, and coming back re-read the same frozen payload: the thing you had
  // just made was missing from the picker whose entire job is to offer it. Switching the mod dropdown and back
  // did not help either — that handler calls the same loaders, straight back through here.
  //
  // The cache is still worth having (these catalogues are large — thousands of entries), so: serve it for an
  // instant paint, then ALWAYS revalidate in the background and re-render only if the payload actually
  // changed. onRevalidated is the caller's own apply(), so the suggestion lists rebuild from fresh data
  // without duplicating the transform. A failed revalidation leaves the cached value in place.
  // One background revalidation per key per page load. loadKnownSpirits/loadKnownTechs are each called from
  // three places during a single load, and every cache hit would otherwise start its own fetch — the ideas and
  // technology catalogues are ~2 MB and ~1.8 MB, so that was ~11 MB of redundant transfer per page load.
  // Confirmed in the browser: three identical rounds of all three catalogue requests before this guard.
  const _revalidatedKeys = new Set();
  async function fetchCachedJson(url, cacheKey, onRevalidated) {
    let cachedRaw = null, cachedData = null;
    try {
      const raw = sessionStorage.getItem(cacheKey);
      if (raw) { cachedData = JSON.parse(raw); cachedRaw = raw; }
    } catch (_) { cachedRaw = null; cachedData = null; }
    if (cachedRaw !== null) {
      if (typeof onRevalidated === "function" && !_revalidatedKeys.has(cacheKey)) {
        _revalidatedKeys.add(cacheKey);
        (async () => {
          try {
            const fresh = await (await fetch(url)).json();
            const freshRaw = JSON.stringify(fresh);
            if (freshRaw === cachedRaw) return; // nothing changed — don't touch the DOM
            try { sessionStorage.setItem(cacheKey, freshRaw); } catch (_) {}
            onRevalidated(fresh);
          } catch (_) { /* keep showing the cached catalogue */ }
        })();
      }
      return cachedData;
    }
    const resp = await fetch(url);
    const data = await resp.json();
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify(data));
    } catch (_) {}
    return data;
  }

  function normalizePath(p) {
    return String(p || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  }

  function getActiveModPath() {
    return headerModSel.value || "";
  }

  function isSelectedModVanilla() {
    if (!headerModSel) return false;
    const selectedOpt = headerModSel.options[headerModSel.selectedIndex];
    // The flag only — the OR on the option TEXT defeated it for any mod merely named "…Vanilla…".
    return selectedOpt?.dataset?.vanilla === '1';
  }

  function updateVanillaBanner() {
    const banner = document.getElementById("vanillaBanner");
    if (!banner) return;
    const sel = document.getElementById("headerModSelector") || document.getElementById("modSelector");
    if (!sel) return;
    const selectedOpt = sel.options[sel.selectedIndex];
    const isVanilla = selectedOpt?.dataset?.vanilla === '1';
    banner.style.display = isVanilla ? "" : "none";
    setWriteControlsLocked(isVanilla && !vanillaEditsAllowed);
  }

  // ── Mod selector (same pattern as other pages) ─────────────────────────
  async function initModSelector() {
    try {
      // Learn whether vanilla writes are permitted (advanced Settings) so the read-only lock is accurate.
      try {
        const s = await fetch("/api/settings/allow-vanilla-edits").then((r) => r.json());
        vanillaEditsAllowed = Boolean(s && s.allowed);
      } catch (_) { vanillaEditsAllowed = false; }
      const resp = await fetch("/api/mods/list");
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      headerModSel.innerHTML = "";
      const mods = data.mods || [];
      let active = localStorage.getItem("activeModPath") || "";
      if (!active) {
        const lastPath = localStorage.getItem("lastLoadedFocusFilePath") || "";
        const match = lastPath.match(/(.*)[\\/]common[\\/]national_focus/i);
        if (match) active = match[1];
      }

      if (!mods.length) {
        const o = document.createElement("option");
        o.value = "";
        o.textContent = "No mods detected";
        headerModSel.appendChild(o);
        return;
      }

      mods.forEach((mod) => {
        const o = document.createElement("option");
        o.value = mod.path;
        o.textContent = mod.name || mod.path.split(/[\\/]/).pop();
        // #vanilla-by-name — the server publishes a PATH-based `isVanilla`; the name test here is what
        // poisoned the flag at source, so a mod called "Vanilla Plus" was locked read-only downstream.
        if (mod.isVanilla === true
          || (mod.isVanilla === undefined && normalizePath(mod.path).includes('steamapps/common/hearts of iron iv'))) {
          o.dataset.vanilla = '1';
        }
        if (active && normalizePath(mod.path) === normalizePath(active)) {
          o.selected = true;
          active = mod.path;
        }
        headerModSel.appendChild(o);
      });
      // Only default to the first mod (index 0 = the prepended vanilla entry) when NOTHING was stored. A
      // non-empty stored mod that's just missing from THIS list is usually a TRANSIENT enumeration miss
      // (Steam re-validating a workshop item, drive not mounted, a swallowed getWorkshopModDirs error). Keep
      // it — do NOT persist the vanilla fallback over it (that turns every custom sprite into the beige
      // placeholder and STICKS across reloads) — and show a "(not detected)" placeholder so the selector
      // isn't blank. The old code fell back AND unconditionally persisted, clobbering the real selection.
      if (active && mods.some((mod) => normalizePath(mod.path) === normalizePath(active))) {
        localStorage.setItem("activeModPath", active); // matched → persist the canonical path
      } else if (!active) {
        active = mods[0].path;
        localStorage.setItem("activeModPath", active);
      } else {
        const o = document.createElement("option");
        o.value = active;
        o.textContent = (String(active).split(/[\\/]/).filter(Boolean).pop() || active) + " (not detected)";
        headerModSel.insertBefore(o, headerModSel.firstChild);
      }
      headerModSel.value = active;
      updateVanillaBanner();
    } catch (e) {
      console.error("Failed to load mod selector:", e);
    }
  }

  headerModSel.addEventListener("change", () => {
    // #country-setup-loses-work-silently — this discards the details panel. Ask first, and put the selector
    // back until the user actually agrees, so cancelling leaves the page exactly as it was.
    const next = headerModSel.value || "";
    const applyModSwitch = () => {
      localStorage.setItem("activeModPath", next);
      updateVanillaBanner();
      loadIdeologies();
      loadCountries();
      selectedTag = null;
      showEmpty();
      loadKnownSpirits();
      loadKnownTechs();
    };
    if (!csDirty) { applyModSwitch(); return; }
    const previous = localStorage.getItem("activeModPath") || "";
    headerModSel.value = previous;
    csConfirmDiscard("Switch mod", () => { headerModSel.value = next; applyModSwitch(); });
  });

  // #return-from-map-lands-on-nothing — a deep link is an instruction, and it has to survive the
  // stale-while-revalidate catalogue. The first render answers from the session cache, which for anyone
  // arriving from the Map predates the country they just created, so the tag is not there to find yet.
  //
  // URL ONLY, never the localStorage fallback: ?tag= is something the user (or a link Nova gave them)
  // just asked for, whereas activeCountryTag is a soft memory of a previous session and re-imposing it
  // after a background refresh would be a page that changes under the reader.
  let deepLinkHonoured = false;
  function selectFromDeepLink(everyCountry) {
    if (deepLinkHonoured || selectedTag) return false; // never override a live choice
    let want = "";
    try { const sp = new URLSearchParams(window.location.search); want = sp.get("tag") || sp.get("country") || ""; }
    catch (_) { want = ""; }
    if (!want) return false;
    const found = (countries || []).find((c) => c && String(c.tag).toUpperCase() === want.toUpperCase());
    if (!found) {
      // #country-card — a country the game loads that this list leaves out (the mod inherits it: GER from the base game)
      // opens as 🌍 Customize base-game country… opens it, and says so: nothing is written until Save, and Save writes an
      // override into the mod. It used to open nothing, with no word why.
      const inherited = (everyCountry || []).find((c) => c && String(c.tag).toUpperCase() === want.toUpperCase());
      if (!inherited || !getActiveModPath()) return false;
      deepLinkHonoured = true;
      selectCountry(inherited.tag, inherited.name || inherited.displayName || inherited.tag);
      panelSub.textContent = `${inherited.tag} is not one of your mod's own countries — you are looking at the one your mod inherits. Saving writes an override into your mod.`;
      return true;
    }
    deepLinkHonoured = true;
    selectCountry(found.tag, found.name);
    return true;
  }

  // ── Load countries ─────────────────────────────────────────────────────
  async function loadCountries() {
    try {
      const mod = getActiveModPath();
      const url = mod
        ? `/api/countries/catalog?modPath=${encodeURIComponent(mod)}`
        : "/api/countries/catalog";
      const cacheKey = "countries_catalog_" + mod;
      // The catalog returns `displayName`; the rest of this tab reads `c.name`. Normalize here so
      // names actually show in the list (otherwise every row fell back to the bare tag, e.g. "LUX LUX").
      // apply() doubles as the revalidation callback so a country created elsewhere this session shows up —
      // it only rebuilds the LIST, never the selection or the editor pane. #country-setup-pickers-frozen
      const apply = (raw) => {
        const norm = (arr) => (arr || []).map((c) => ({ ...c, name: c.displayName || c.name || c.tag }));
        const isVanilla = isSelectedModVanilla();
        countries = isVanilla ? norm(raw) : norm(raw).filter((c) => c.isMod);
        renderCountryList();
        // …and if a deep link is still waiting to be honoured, this refresh may be the one that can.
        // #return-from-map-lands-on-nothing
        try { selectFromDeepLink(norm(raw)); } catch (_) {}
      };
      apply(await fetchCachedJson(url, cacheKey, apply));

      // Check query parameter or localStorage to auto-select tag.
      //
      // apply() above may ALREADY have honoured a ?tag= — it calls selectFromDeepLink() now — and
      // running this block on top of that loaded the same country twice for one navigation: two
      // selectCountry calls, two rounds of detail fetches. Only do the work it did not do.
      if (deepLinkHonoured) return;
      const sp = new URLSearchParams(window.location.search);
      const urlTag = sp.get("tag") || sp.get("country") || localStorage.getItem("activeCountryTag");
      if (urlTag && countries.some(c => c.tag.toUpperCase() === urlTag.toUpperCase())) {
        const found = countries.find(c => c.tag.toUpperCase() === urlTag.toUpperCase());
        deepLinkHonoured = true; // it has been carried out; the revalidation must not repeat it
        selectCountry(found.tag, found.name);
      } else {
        // Empty for now. If a ?tag= is waiting, the revalidation above gets one more chance at it —
        // which is the whole of #return-from-map-lands-on-nothing, because the cached list this ran
        // against was written before that country existed.
        selectedTag = null;
        showEmpty();
      }
    } catch (e) {
      console.error("Failed to load countries:", e);
      countries = [];
      renderCountryList();
      showEmpty();
    }
  }

  function renderCountryList() {
    const filter = (countrySearch.value || "").trim().toLowerCase();
    countryList.innerHTML = "";
    
    const isVanilla = isSelectedModVanilla();
    if (!isVanilla && countries.length === 0) {
      countryList.innerHTML = `<div style="text-align:center; color:#8b949e; padding:20px 14px; font-size:13px; line-height:1.5;">This mod doesn't have any country setup files yet.<br/>Use <b style="color:#c9d1d9;">➕ Create Country</b> above to add a brand-new nation, or <b style="color:#c9d1d9;">🌍 Customize base-game country</b> to override an existing one (e.g. GER) — it opens that country so Save writes an override into your mod.</div>`;
      return;
    }

    const filtered = countries.filter((c) => {
      if (!filter) return true;
      return (
        c.tag.toLowerCase().includes(filter) ||
        (c.name || "").toLowerCase().includes(filter)
      );
    });

    // Brand-new countries the modder created (not present in vanilla) are what they came here to
    // configure — surface them at the top with a marker so they're never buried among inherited or
    // customized base-game countries (e.g. a leftover vanilla-copy GER history from an earlier
    // standalone generation, which otherwise lands a new tag in the middle of the alphabet).
    filtered.sort((a, b) => {
      const an = a.inVanilla === false ? 0 : 1;
      const bn = b.inVanilla === false ? 0 : 1;
      return an - bn || a.tag.localeCompare(b.tag);
    });

    if (!filtered.length) {
      countryList.innerHTML = `<div style="text-align:center; color:#8b949e; padding:20px; font-size:13px;">No countries found</div>`;
      return;
    }

    filtered.forEach((c) => {
      const isNew = c.inVanilla === false;
      const el = document.createElement("div");
      el.className = "cs-country-item" + (c.tag === selectedTag ? " active" : "");
      el.innerHTML = `
        <span class="cs-tag">${c.tag}</span>
        <span class="cs-name">${c.name || c.tag}</span>
        ${isNew ? '<span class="cs-new-badge" title="A brand-new country created in this mod" style="margin-left:auto; font-size:10px; color:#3fb950; font-weight:700; letter-spacing:0.5px;">✦ NEW</span>' : ''}
      `;
      el.addEventListener("click", () => selectCountry(c.tag, c.name));
      countryList.appendChild(el);
    });
  }

  countrySearch.addEventListener("input", renderCountryList);

  // ── Select a country ───────────────────────────────────────────────────
  async function selectCountry(tag, name) {
    // #country-setup-loses-work-silently — clicking a country replaces the form as completely as switching
    // mod does, so ask first.
    //
    // ⚠️ This used to exempt the country you were already on — "re-entering the SAME country is not a
    // discard". That was wrong, and it became load-bearing once spirits and technologies started living in
    // the form as staged edits: everything below reloads the panel from the server, so clicking the
    // highlighted row in the list threw away staged work with no prompt at all. The exemption also could not
    // do what it claimed, because nothing here re-selects the current country programmatically while dirty —
    // the two internal callers run after a save, when csDirty is already false.
    if (csDirty) {
      csConfirmDiscard("Reload this country", () => { selectCountry(tag, name); });
      return;
    }
    csMarkClean(); // loading a country repopulates the form; nothing is unsaved yet
    selectedTag = tag;
    localStorage.setItem("activeCountryTag", tag);
    renderCountryList(); // update active highlight

    panelTitle.textContent = `${name || tag} (${tag})`;
    panelSub.textContent = "Manage starting details and national spirits this country starts the game with.";

    emptyState.style.display = "none";
    panel.style.display = "";

    // Reset the flag card for the newly-selected country, then show its CURRENT flag (gfx/flags/<TAG>.tga,
    // decoded server-side to PNG); fall back to the "no flag yet" hint if it has none.
    { const fi = document.getElementById("csFlagFileInput"); if (fi) fi.value = "";
      const ub = document.getElementById("csFlagUploadBtn"); if (ub) ub.disabled = true;
      const st = document.getElementById("csFlagStatus"); if (st) st.textContent = "";
      const pv = document.getElementById("csFlagPreview");
      const ph = document.getElementById("csFlagPreviewHint");
      if (pv && ph) {
        pv.style.display = "none"; ph.style.display = ""; ph.textContent = "Loading…";
        const mod = getActiveModPath();
        const qs = new URLSearchParams({ tag }); if (mod) qs.set("modPath", mod);
        pv.onload = () => { pv.style.display = ""; ph.style.display = "none"; };
        pv.onerror = () => { pv.removeAttribute("src"); pv.style.display = "none"; ph.style.display = ""; ph.textContent = "no flag yet"; };
        pv.src = "/api/flags/country-flag?" + qs.toString() + "&_=" + Date.now(); // cache-buster so a fresh upload shows
      } }

    updateMiniMap(tag);

    await loadCountryDetails(tag);
    await loadCountrySpirits(tag);
    await loadCountryTechs(tag);
    loadCountryUnits(tag); // read-only "Starting units" card — fire-and-forget, never blocks the panel
  }

  // ── 🪖 Starting units (read-only OOB viewer) ───────────────────────────────────────────────────
  // Shows the selected country's starting Order of Battle from history/units (division templates, division
  // count, equipment stockpile), aggregated across its DLC-variant files by /api/units. DISPLAY-ONLY — the
  // template/division editor (a write path) is a separate, in-game-verified feature. The card is created
  // and managed entirely here (inserted after the map card) so it touches no existing Country Setup markup.
  // The OOB viewer is collapsed BY DEFAULT (it can be very tall — 140+ divisions) and remembers the choice.
  function unitsCollapsed() { try { return localStorage.getItem("csUnitsCollapsed") !== "0"; } catch (_) { return true; } }
  function wrapUnitsBody(html) { return `<div class="cs-units-body" style="margin-top:10px; display:${unitsCollapsed() ? "none" : "block"};">${html}</div>`; }
  function applyUnitsCollapsed(card) {
    const collapsed = unitsCollapsed();
    const body = card && card.querySelector(".cs-units-body");
    const chev = card && card.querySelector(".cs-units-chev");
    if (body) body.style.display = collapsed ? "none" : "block";
    if (chev) chev.textContent = collapsed ? "▸" : "▾";
  }
  function unitsCardEl() {
    const anchor = document.getElementById("csMapCard");
    if (!anchor || !anchor.parentNode) return null;
    let card = document.getElementById("csUnitsCard");
    if (!card) {
      card = document.createElement("div");
      card.id = "csUnitsCard";
      card.style.cssText = "background:#161b22; border:1px solid #30363d; border-radius:6px; padding:14px; margin-bottom:20px;";
      anchor.parentNode.insertBefore(card, anchor.nextSibling);
      // Toggle collapse when the header is clicked (delegated — the card's innerHTML is rebuilt each render).
      card.addEventListener("click", (e) => {
        if (!e.target.closest(".cs-units-head")) return;
        try { localStorage.setItem("csUnitsCollapsed", unitsCollapsed() ? "0" : "1"); } catch (_) {}
        applyUnitsCollapsed(card);
      });
    }
    return card;
  }
  async function loadCountryUnits(tag) {
    const card = unitsCardEl();
    if (!card) return;
    const head = `<div class="cs-units-head" title="Click to expand / collapse" style="display:flex; align-items:center; justify-content:space-between; cursor:pointer; user-select:none;"><h3 style="margin:0; font-size:14px; color:#e6edf3;"><span class="cs-units-chev" style="display:inline-block; width:15px; color:#8b949e;">${unitsCollapsed() ? "▸" : "▾"}</span>🪖 Starting units <span style="font-size:11px; color:#6e7681; font-weight:400;">(read-only)</span></h3><span style="font-size:11px; color:#6e7681; font-family:monospace;">history/units</span></div>`;
    card.innerHTML = head + wrapUnitsBody(`<div style="color:#8b949e; font-size:12.5px;">Loading…</div>`);
    try {
      const mod = getActiveModPath();
      const qs = new URLSearchParams({ country: tag }); if (mod) qs.set("modPath", mod);
      const data = await fetch("/api/units?" + qs.toString()).then((r) => r.json());
      renderUnits(card, head, tag, data);
    } catch (_) {
      card.innerHTML = head + wrapUnitsBody(`<div style="color:#8b949e; font-size:12.5px;">Couldn't read the starting units.</div>`);
    }
  }
  function renderUnits(card, head, tag, data) {
    const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const ag = (data && data.ok && data.aggregate) ? data.aggregate : null;
    const files = (data && data.files) || [];
    if (!ag || (!ag.templates.length && !ag.divisions.length && !ag.stockpile.length)) {
      card.innerHTML = head + wrapUnitsBody(`<div style="color:#6e7681; font-size:12.5px;">No starting Order of Battle for <b>${esc(tag)}</b> — there's no <span style="font-family:monospace;">history/units/${esc(tag)}_*.txt</span>, so it begins with no pre-placed divisions or stockpile.</div>`);
      return;
    }
    // #stockpile-in-country-history-invisible — a stockpile can live in the COUNTRY HISTORY rather than in
    // an order-of-battle file, which is where Nova's own /api/army/stockpile writes it and where vanilla
    // seeds one for 8 countries. So "0 files" is not the same as "nothing here", and the card has to say
    // which it is rather than counting files and leaving the reader to guess.
    const chs = (data && data.countryHistoryStockpile) || null;
    const chsCount = (chs && chs.entries && chs.entries.length) || 0;
    const filePart = files.length
      ? `${esc(files.length)} file${files.length === 1 ? "" : "s"}`
      : (chsCount ? `no order-of-battle file yet` : `0 files`);
    const sub = `<div style="font-size:12px; color:#8b949e; margin-bottom:10px;">${ag.templates.length} template${ag.templates.length === 1 ? "" : "s"} · ${ag.divisions.length} division${ag.divisions.length === 1 ? "" : "s"} · ${filePart}</div>`;
    const tpl = ag.templates.length ? `<div style="margin-bottom:10px;"><div style="font-size:11px; text-transform:uppercase; letter-spacing:.4px; color:#6e7681; margin-bottom:4px;">Division templates</div>` +
      ag.templates.map((t) => `<div style="font-size:12.5px; color:#e6edf3; padding:2px 0;">• ${esc(t.name)} <span style="color:#8b949e;">— ${t.regiments} regiment${t.regiments === 1 ? "" : "s"}${t.support ? ", " + t.support + " support" : ""}</span></div>`).join("") + `</div>` : "";
    const divs = ag.divisions.length ? `<div style="margin-bottom:10px;"><div style="font-size:11px; text-transform:uppercase; letter-spacing:.4px; color:#6e7681; margin-bottom:4px;">Divisions (${ag.divisions.length})</div>` +
      ag.divisions.slice(0, 6).map((d) => `<div style="font-size:12.5px; color:#c9d1d9; padding:1px 0;">• ${esc(d.name || "(unnamed)")} <span style="color:#6e7681;">→ ${esc(d.template || "?")}${d.location != null ? " @ " + esc(d.location) : ""}</span></div>`).join("") +
      (ag.divisions.length > 6 ? `<div style="font-size:11.5px; color:#6e7681; padding:2px 0;">…and ${ag.divisions.length - 6} more</div>` : "") + `</div>` : "";
    const stockSrc = chsCount
      ? `<div style="font-size:11px; color:#8b949e; margin:-2px 0 4px;">${chsCount} entr${chsCount === 1 ? "y" : "ies"} from <span style="font-family:monospace;">${esc(chs.file || "the country history")}</span></div>`
      : "";
    const stock = ag.stockpile.length ? `<div><div style="font-size:11px; text-transform:uppercase; letter-spacing:.4px; color:#6e7681; margin-bottom:4px;">Equipment stockpile (top ${Math.min(8, ag.stockpile.length)})</div>` + stockSrc +
      ag.stockpile.slice(0, 8).map((s) => `<div style="font-size:12px; color:#c9d1d9; display:flex; justify-content:space-between; gap:8px; padding:1px 0;"><span style="font-family:monospace; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(s.type)}</span><span style="color:#8b949e;">×${esc(s.amount)}</span></div>`).join("") + `</div>` : "";
    card.innerHTML = head + wrapUnitsBody(sub + tpl + divs + stock);
  }

  // ── 🗺 Minimap + "Edit on Map" (geography lives on the Map) ─────────────
  // The minimap is a server-rendered PNG (GET /api/map/country-thumb) of the country's territory, cropped to
  // its bounding box and highlighted in its colour. Lazy: the <img> src is only set when a country is selected.
  // "Edit on Map" opens the FULL map editor focused on this country's territory.
  function updateMiniMap(tag) {
    const img = document.getElementById("csMiniMap");
    const hint = document.getElementById("csMiniMapHint");
    if (!img) return;
    if (!tag) { img.style.display = "none"; img.removeAttribute("src"); if (hint) { hint.textContent = "Select a country to preview its location on the map."; hint.style.display = "flex"; } return; }
    if (hint) { hint.textContent = "Rendering map preview…"; hint.style.display = "flex"; }
    img.style.display = "none";
    const mod = getActiveModPath();
    const qs = new URLSearchParams({ tag }); if (mod) qs.set("modPath", mod);
    img.onload = () => { img.style.display = "block"; if (hint) hint.style.display = "none"; };
    img.onerror = () => { img.style.display = "none"; if (hint) { hint.textContent = "No map preview available for this country (it may own no territory yet — paint some on the Map)."; hint.style.display = "flex"; } };
    img.src = "/api/map/country-thumb?" + qs.toString();
  }
  {
    const editBtn = document.getElementById("csEditOnMapBtn");
    if (editBtn) editBtn.addEventListener("click", () => {
      const q = selectedTag ? "?tag=" + encodeURIComponent(selectedTag) + "&tool=paint" : "?tool=paint";
      window.location.href = "map.html" + q;
    });
    // Jump straight into this country's army (the Military page honours ?tag= and auto-loads it).
    const armyBtn = document.getElementById("csArmyBtn");
    if (armyBtn) armyBtn.addEventListener("click", () => {
      window.location.href = "army.html" + (selectedTag ? "?tag=" + encodeURIComponent(selectedTag) : "");
    });
  }

  function showEmpty() {
    emptyState.style.display = "";
    panel.style.display = "none";
  }

  // ── Load spirits for selected country ──────────────────────────────────
  async function loadCountrySpirits(tag) {
    try {
      const mod = getActiveModPath();
      const qs = new URLSearchParams({ tag });
      if (mod) qs.set("modPath", mod);
      const resp = await fetch(`/api/history/country-spirits?${qs}`);
      const data = await resp.json();

      currentSpirits = data.spirits || [];
      savedSpirits = [...currentSpirits]; // #enter-writes-without-save — the baseline Save Details diffs against

      // File bar
      if (data.filePath) {
        filePath.textContent = data.filePath;
        fileStatus.textContent = data.inMod ? "In Mod" : "Vanilla";
        fileStatus.className = "cs-file-status " + (data.inMod ? "cs-in-mod" : "cs-in-vanilla");
        fileBar.style.display = "";
      } else {
        filePath.textContent = "No history file found";
        fileStatus.textContent = "";
        fileStatus.className = "cs-file-status";
      }

      spiritCountEl.textContent = `${currentSpirits.length} spirit${currentSpirits.length !== 1 ? "s" : ""}`;
      renderSpirits();
    } catch (e) {
      console.error("Failed to load spirits:", e);
      currentSpirits = [];
      savedSpirits = [];
      spiritCountEl.textContent = "0 spirits";
      renderSpirits();
    }
  }

  // A spirit's icon, the way the GAME resolves it. HOI4 draws an idea with the sprite `GFX_idea_<token>`
  // where the token is the idea block's `picture = …` — a BARE name, not a GFX key (vanilla:
  // `picture = AFG_zahir_shah_idea` against `name = "GFX_idea_AFG_zahir_shah_idea"` in interface/ideas.gfx).
  // 94% of vanilla's 5,998 idea blocks declare one, and 95% of Millennium Dawn's 10,518; the rest (doctrine
  // spirits, hidden landmark ideas) genuinely have no art, so the shield stays as the honest fallback rather
  // than a guess. #spirit-icons-missing
  const SPIRIT_SHIELD = `<div class="cs-spirit-icon">\u{1F6E1}️</div>`;
  function spiritIconHtml(pictureToken, cls) {
    const cssClass = cls || "cs-spirit-icon";
    const html = cssClass === "cs-spirit-icon" ? SPIRIT_SHIELD
      : `<div class="${cssClass}" style="font-size:24px; display:flex; align-items:center; justify-content:center;">\u{1F6E1}️</div>`;
    const token = String(pictureToken || "").trim();
    // Reject only what would break the markup or the URL, rather than whitelisting a character class — a
    // whitelist put the shield back on 135 Millennium Dawn spirits (`pro-american`) and on `the_people's_army`,
    // whose sprite genuinely exists. The value is escaped into a double-quoted attribute below and
    // encodeURIComponent'd into the query, so an apostrophe or a hyphen is already safe here.
    if (!token || /[\s<>"&]/.test(token)) return html;
    const mod = getActiveModPath();
    // A token that is ALREADY a sprite key is used as-is. Prefixing it again asked for
    // `GFX_idea_GFX_idea_CHI_air_force`, which is not what the mod means. Measured across vanilla and
    // Millennium Dawn: of 51 distinct `picture` values that already start with GFX_, 35 resolve as the token
    // ITSELF, 15 resolve as nothing (broken in the mod), and exactly 1 wants the double prefix — so
    // prefixing unconditionally is wrong for the large majority. The rare double case still resolves,
    // because /api/icon-image's own fallback list already tries `gfx_idea_<key>` as well as the bare key.
    //
    // An adversarial verifier told me NOT to change this, citing one MD sprite as proof the double prefix
    // was game-faithful; that one sprite is the single exception, not the rule. #spirit-icons-missing
    const spriteKey = /^GFX_/i.test(token) ? token : "GFX_idea_" + token;
    const src = `/api/icon-image?key=${encodeURIComponent(spriteKey)}` +
      (mod ? `&modPath=${encodeURIComponent(mod)}` : "");
    // data-fallback-html, not an inline onerror: the page CSP is script-src 'self'.
    return `<img class="${cssClass}" src="${src}" alt="" loading="lazy" data-fallback-html="${escapeAttr(html)}">`;
  }
  function escapeAttr(s) {
    return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }

  // ── Render spirit rows ─────────────────────────────────────────────────
  function renderSpirits() {
    spiritsList.innerHTML = "";
    if (!currentSpirits.length) {
      spiritsList.innerHTML = `<div style="text-align:center; padding:20px; color:#8b949e; font-size:13px;">No starting national spirits assigned.</div>`;
      return;
    }

    currentSpirits.forEach((id) => {
      const row = document.createElement("div");
      row.className = "cs-spirit-row";

      const displayName = stripLoc(locMap[id]) || id;

      row.innerHTML = `
        ${spiritIconHtml(picMap[id])}
        <div class="cs-spirit-info">
          <div class="cs-spirit-id">${id}</div>
          <div class="cs-spirit-name">${displayName !== id ? displayName : ""}</div>
        </div>
        <button class="cs-spirit-remove" data-id="${id}" title="Remove this spirit from game start">✕ Remove</button>
      `;
      spiritsList.appendChild(row);
    });

    // Attach remove handlers
    spiritsList.querySelectorAll(".cs-spirit-remove").forEach((btn) => {
      btn.addEventListener("click", () => removeSpirit(btn.dataset.id));
    });
  }

  // ── Add spirit ─────────────────────────────────────────────────────────
  //
  // #enter-writes-without-save — THIS USED TO WRITE THE COUNTRY'S HISTORY FILE ON THE ENTER KEY.
  //
  // Typing a spirit id and pressing Enter POSTed /api/history/set-startup, which creates
  // <mod>/history/countries/<TAG>.txt (copying it out of the base mod if the active mod had none) and adds
  // the spirit. No Save was pressed and nothing said a file had been touched. Clicking a row in the Browse
  // list did the same. Measured on Millennium Dawn: one Enter, one write.
  //
  // Now it stages. The list on screen is the truth-in-progress, Save Details sends the difference, and the
  // page's unsaved-changes guard already covers walking away from it.
  function addSpirit(spiritId) {
    if (!spiritId || !selectedTag) return;
    if (!getActiveModPath()) { nbAlert("Please select an active mod first."); return; }
    if (currentSpirits.includes(spiritId)) { nbAlert("That spirit is already active at game start."); return; }
    currentSpirits.push(spiritId);
    addInput.value = "";
    renderSpirits();
    csMarkDirty();
    setSpiritStatus();
  }

  /** Say what is staged, so the list on screen is never mistaken for the file on disk. */
  function setSpiritStatus() {
    if (!spiritCountEl) return;
    const n = currentSpirits.length;
    const changed = spiritsChanged();
    spiritCountEl.textContent = `${n} spirit${n !== 1 ? "s" : ""}${changed ? " — unsaved, click Save Details" : ""}`;
  }
  const spiritsChanged = () =>
    currentSpirits.length !== savedSpirits.length || currentSpirits.some((s) => !savedSpirits.includes(s));

  // ── Remove spirit ──────────────────────────────────────────────────────
  // #enter-writes-without-save — removing is the same story in reverse: it wrote the history file on the
  // click. Staged now, and flushed by Save Details alongside the additions.
  function removeSpirit(spiritId) {
    if (!spiritId || !selectedTag) return;
    currentSpirits = currentSpirits.filter((s) => s !== spiritId);
    renderSpirits();
    csMarkDirty();
    setSpiritStatus();
  }

  addBtn.addEventListener("click", () => {
    addSpirit(addInput.value.trim());
  });
  addInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addSpirit(addInput.value.trim());
  });

  // Dynamic autocomplete filtering for national spirits to prevent Chromium layout/paint freezes on huge datalists
  addInput.addEventListener("input", () => {
    const val = addInput.value.toLowerCase().trim();
    suggestList.innerHTML = "";
    if (val.length < 2) return; // Only trigger suggestions when user types 2+ characters
    const matched = (allKnownSpiritsDetailed || [])
      .filter(item => item.ideaId.toLowerCase().includes(val) || (locMap[item.ideaId] || "").toLowerCase().includes(val))
      .slice(0, 40); // Limit to top 40 results to keep the DOM light
    matched.forEach(item => {
      const opt = document.createElement("option");
      opt.value = item.ideaId;
      const name = stripLoc(locMap[item.ideaId]);
      if (name && name !== item.ideaId) opt.label = name;
      suggestList.appendChild(opt);
    });
  });

  // ── Load known spirits for autocomplete ────────────────────────────────
  async function loadKnownSpirits() {
    // Previously this fetched /api/localization — the FULL loc map, ~50 MB on a big mod like
    // Millennium Dawn — just to show spirit names. That JSON parse blocked the renderer (~1s) and
    // was the bulk of this tab's load. Instead ask the ideas catalog to resolve names server-side
    // (withNames=1) and build locMap from those, so we never pull the giant loc map here.
    locMap = {};
    try {
      const mod = getActiveModPath();
      const qs = new URLSearchParams({
        includeVanilla: "1",
        includeActiveMod: "1",
        withNames: "1"
      });
      if (mod) {
        qs.set("sourcePath", mod);
        // Also pass modPath so the catalog resolves loc names against THIS mod's root — without it the
        // decorator uses the server's ambient active root, so mod-only idea names (RoN taxes/tariffs/press
        // laws) came back blank while vanilla ideas resolved. #idea-name-modpath
        qs.set("modPath", mod);
      }
      const url = `/api/ideas/catalog?${qs}`;
      const ideasCacheKey = "ideas_catalog_named_" + mod;
      // apply() is also handed to fetchCachedJson as the revalidation callback, so a spirit created on another
      // page since this catalogue was cached shows up here without a reload. #country-setup-pickers-frozen
      const apply = (d) => {
        allKnownSpiritsDetailed = (d.items || []).filter((it) => it.ideaId && it.ideaId !== "country" && it.ideaId !== "hidden_ideas");
        allKnownSpirits = allKnownSpiritsDetailed.map(it => it.ideaId);
        // Build the name/description lookup from the catalog's resolved fields (no 50 MB loc fetch).
        locMap = {};
        picMap = {};
        allKnownSpiritsDetailed.forEach((it) => {
          if (it.localizedName) locMap[it.ideaId] = it.localizedName;
          if (it.localizedDesc) locMap[it.ideaId + "_desc"] = it.localizedDesc;
          // The assigned-spirit rows only know ids, so the catalogue is where their art comes from too.
          if (it.pictureToken) picMap[it.ideaId] = it.pictureToken;
        });
        // NOT cosmetic. fetchCachedJson serves the sessionStorage copy first and only calls this again if
        // the fresh response DIFFERS — so right after the schema:v2 bump the first paint still has the old
        // items with blank pictureToken, and this repaint is the one that actually draws the art. Without it
        // the icons would stay missing for the whole session on any browser that had used the page before.
        renderSpirits();
        updateSuggestions();
      };
      apply(await fetchCachedJson(url, ideasCacheKey, apply));
    } catch (e) {
      allKnownSpiritsDetailed = [];
      allKnownSpirits = [];
    }
  }

  function updateSuggestions() {
    suggestList.innerHTML = ""; // Kept empty on load to avoid layout freezes; populated dynamically via search
  }

  // ── Load & Save Country Details ────────────────────────────────────────
  // A stat box (stability / war support / research slots) shows the country's value if it's explicitly set,
  // otherwise the EFFECTIVE game/mod default — so the box is never blank and the user can see the real
  // starting value (e.g. Millennium Dawn's 65% default stability). A default-filled box is muted and tagged
  // data-cs-default="1"; saving it sends null, so the default is never written to disk unless the user
  // actually edits it (typing/AI-fill clears the tag via markUserEdited).
  function markUserEdited(el) {
    if (!el) return;
    el.dataset.csDefault = "";
    el.style.color = "";
    el.removeAttribute("title");
  }
  function setStatField(el, explicitVal, defaultVal, toDisplay) {
    if (!el) return;
    if (explicitVal !== null && explicitVal !== undefined) {
      el.value = toDisplay(explicitVal);
      markUserEdited(el); // an explicit value renders as a normal (non-muted) entry
    } else if (defaultVal !== null && defaultVal !== undefined) {
      el.value = toDisplay(defaultVal);
      el.dataset.csDefault = "1";
      el.style.color = "#768390"; // muted: this is the default, not set for this specific country
      el.title = "Game/mod default — this country doesn't set it explicitly. Edit to override.";
    } else {
      el.value = "";
      markUserEdited(el);
    }
  }

  // #new-country-has-no-names — show the note only when it applies, so a country that already has a pool
  // never sees it. The endpoint decides; the client only renders what it is told.
  function renderNameListNote(data) {
    const box = document.getElementById("csNameListNote");
    const txt = document.getElementById("csNameListText");
    const btn = document.getElementById("csSeedNameListBtn");
    if (!box || !txt) return;
    const note = (data && data.nameListNote) || "";
    if (!note) { box.style.display = "none"; return; }
    txt.textContent = note;
    txt.style.color = "#d29922";
    if (btn) { btn.disabled = false; btn.textContent = "Give it a name pool"; }
    box.style.display = "";
  }

  async function seedNameListForSelectedCountry() {
    const btn = document.getElementById("csSeedNameListBtn");
    const txt = document.getElementById("csNameListText");
    if (!selectedTag) { if (txt) { txt.textContent = "Select a country first."; } return; }
    if (btn) { btn.disabled = true; btn.textContent = "Adding…"; }
    try {
      const r = await fetch("/api/countries/seed-name-list", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modPath: getActiveModPath(), tag: selectedTag }),
      }).then((x) => x.json());
      if (r && r.ok) {
        // Say what was written and where it came from — the file is a starting point the author is meant to edit.
        if (txt) {
          txt.style.color = "#3fb950";
          txt.textContent = `✓ Wrote common/names/${r.nameList.file}, seeded from ${r.nameList.sourceTag} (${r.culture}). ` +
            `Edit it to give ${r.tag} names of its own.`;
        }
        if (btn) btn.style.display = "none";
      } else {
        if (txt) { txt.style.color = "#f85149"; txt.textContent = (r && r.error) || "Couldn't add a name pool."; }
        if (btn) { btn.disabled = false; btn.textContent = "Give it a name pool"; }
      }
    } catch (e) {
      if (txt) { txt.style.color = "#f85149"; txt.textContent = "Couldn't add a name pool: " + (e.message || e); }
      if (btn) { btn.disabled = false; btn.textContent = "Give it a name pool"; }
    }
  }

  async function loadCountryDetails(tag) {
    try {
      const mod = getActiveModPath();
      const qs = new URLSearchParams({ tag });
      if (mod) qs.set("modPath", mod);
      const resp = await fetch(`/api/history/country-details?${qs}`);
      const data = await resp.json();
      const seedBtn = document.getElementById("csSeedNameListBtn");
      if (seedBtn) seedBtn.style.display = ""; // a previous country's "done" state must not carry over
      renderNameListNote(data);

      const defs = (data && data.defaults) || {};
      if (data && data.details) {
        const d = data.details;
        csCapital.value = d.capital !== null ? d.capital : "";
        // Show the explicit value, or fall back to the effective game/mod default so the box reflects the
        // country's real starting stat instead of sitting blank.
        setStatField(csResearchSlots, d.researchSlots, defs.researchSlots, (v) => Math.round(v));
        setStatField(csStability, d.stability, defs.stability, (v) => Math.round(v * 100));
        setStatField(csWarSupport, d.warSupport, defs.warSupport, (v) => Math.round(v * 100));
        csConvoys.value = d.convoys !== null ? d.convoys : "";

        if (d.politics) {
          csRulingParty.value = d.politics.rulingParty || "neutrality";
          csElectionsAllowed.value = d.politics.electionsAllowed || "no";
          csLastElection.value = d.politics.lastElection || "";
          csElectionFrequency.value = d.politics.electionFrequency !== null ? d.politics.electionFrequency : 48;
        }

        if (d.popularities) {
          // Populate every ideology box by its data-ideology key (covers a mod's extra ideologies
          // like MD's "nationalist"); boxes with no stored value default to 0.
          const pops = d.popularities;
          popularityInputs().forEach((el) => {
            const id = el.dataset.ideology;
            el.value = (id && pops[id] !== undefined && pops[id] !== null) ? pops[id] : 0;
          });
        }
        updatePopularityTotal();
      } else {
        // Reset fields — but still surface the effective defaults so the stat boxes aren't blank.
        csCapital.value = "";
        setStatField(csResearchSlots, null, defs.researchSlots, (v) => Math.round(v));
        setStatField(csStability, null, defs.stability, (v) => Math.round(v * 100));
        setStatField(csWarSupport, null, defs.warSupport, (v) => Math.round(v * 100));
        csConvoys.value = "";
        csRulingParty.value = "neutrality";
        csElectionsAllowed.value = "no";
        csLastElection.value = "";
        csElectionFrequency.value = "48";
        popularityInputs().forEach((el) => { el.value = "0"; });
        updatePopularityTotal();
      }
    } catch (e) {
      console.error("Failed to load country details:", e);
    }
  }

  async function saveCountryDetails() {
    if (!selectedTag) return;
    const mod = getActiveModPath();
    if (!mod) {
      nbAlert("Please select an active mod first.");
      return;
    }

    const details = {
      // NOTE: `capital` is deliberately OMITTED — it's geography, now owned exclusively by the Map tab's
      // 🏛 Set-capital tool. The backend (updateCountryDetailsInText) only rewrites `capital` when the key
      // is present, so leaving it out means Save Details never clobbers a capital the Map set.
      // A box still showing an untouched DEFAULT (data-cs-default) sends null, so we never write a value the
      // country didn't have — the backend's setOrReplaceKey leaves the file untouched on null.
      researchSlots: (csResearchSlots.value && csResearchSlots.dataset.csDefault !== "1") ? parseInt(csResearchSlots.value) : null,
      stability: (csStability.value && csStability.dataset.csDefault !== "1") ? parseFloat(csStability.value) / 100 : null,
      warSupport: (csWarSupport.value && csWarSupport.dataset.csDefault !== "1") ? parseFloat(csWarSupport.value) / 100 : null,
      convoys: csConvoys.value ? parseInt(csConvoys.value) : null,
      politics: {
        rulingParty: csRulingParty.value,
        electionsAllowed: csElectionsAllowed.value,
        lastElection: csLastElection.value.trim(),
        electionFrequency: csElectionFrequency.value ? parseInt(csElectionFrequency.value) : 48
      },
      // parseFLOAT so decimals like 99.8 / 0.2 round-trip instead of being truncated to 99 / 0.
      // Iterate every ideology box so a mod's extra ideologies (e.g. MD's "nationalist") are saved.
      popularities: (() => {
        const pops = {};
        popularityInputs().forEach((el) => {
          const id = el.dataset.ideology;
          if (id) pops[id] = el.value ? parseFloat(el.value) : 0;
        });
        return pops;
      })()
    };

    saveDetailsBtn.disabled = true;
    saveDetailsBtn.textContent = "Saving...";

    try {
      const resp = await fetch("/api/history/save-country-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tag: selectedTag,
          modPath: mod,
          details
        })
      });
      const data = await resp.json();
      if (data.error) {
        nbAlert("Error: " + data.error);
        return;
      }
      // #politics-not-saved-but-ui-says-saved — SHOW WHAT THE SERVER SAID IT COULD NOT DO.
      //
      // The server has always returned `notes` explaining a field it deliberately left alone — "Politics was
      // NOT saved: this country sets set_politics inside a dated block…". Nothing read them, so the user got
      // "Country details saved successfully!" for a save that had skipped the field they came to change.
      // #enter-writes-without-save — write the staged spirits and technologies. This is the only place
      // either reaches disk; adding one only ever changes the list on screen. Deliberately after the details
      // save and inside the same try, so a details failure never leaves half the panel written.
      //
      // #staged-techs-lost-on-a-silent-refusal — and BEFORE the success message, which used to be announced
      // five lines earlier. A spirit failure then produced "Country details saved successfully!" followed by
      // "Failed to save country details", in that order.
      const allWritten = await flushStagedStartup();

      // A partial save is not a failure and must not read as one, but it is not a plain success either.
      const notes = Array.isArray(data.notes) ? data.notes.filter(Boolean) : [];
      if (notes.length) {
        nbAlert(
          notes.join("\n\n"),
          notes.length === 1 ? "Saved — but one thing was left alone" : `Saved — but ${notes.length} things were left alone`,
        );
      } else if (allWritten) {
        nbAlert("Country details saved successfully!");
      }
      // Clean ONLY if everything reached disk. When it did not, flushStagedStartup has already said why, and
      // leaving the page dirty keeps the staged list on screen and the unsaved-work guard armed.
      if (allWritten) csMarkClean();
      await loadCountryDetails(selectedTag);
    } catch (e) {
      nbAlert("Failed to save country details: " + e.message);
    } finally {
      saveDetailsBtn.disabled = false;
      saveDetailsBtn.textContent = "Save Details";
    }
  }

  /**
   * Send what the two staged lists changed, and nothing else. #enter-writes-without-save
   *
   * A DIFF against the baseline the server last gave us, not a replay of what the user clicked: add a spirit,
   * think again, remove it, and this correctly sends nothing. Spirits go one at a time because
   * /api/history/set-startup is per-item; technologies go as one list because the server rewrites the whole
   * set_technology block from what it is sent — which is also why an empty, never-loaded list must never be
   * sent (see saveCountryTechs, which refuses while the load is in doubt).
   */
  async function flushStagedStartup() {
    const mod = getActiveModPath();
    if (!mod || !selectedTag) return;

    const addedSpirits = currentSpirits.filter((s) => !savedSpirits.includes(s));
    const removedSpirits = savedSpirits.filter((s) => !currentSpirits.includes(s));
    // #removal-needs-an-override — removals the server declined because the mod does not own this country.
    const notRemoved = [];
    for (const [list, active] of [[addedSpirits, true], [removedSpirits, false]]) {
      for (const itemId of list) {
        const resp = await fetch("/api/history/set-startup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tag: selectedTag, itemId, itemType: "spirit", active, modPath: mod }),
        });
        const data = await resp.json().catch(() => ({}));
        // Stop on the first failure and keep the rest staged, so Save can be pressed again rather than the
        // remaining changes being silently dropped.
        if (!resp.ok || (data && data.error)) {
          throw new Error((data && data.error) || `Could not ${active ? "add" : "remove"} spirit ${itemId}`);
        }
        // #removal-needs-an-override — A NO-OP IS NOT A REMOVAL.
        //
        // Removing a spirit from a country whose history file this mod does not own answers
        // { ok: true, noop: true } and writes nothing. That refusal is right: materialising a full
        // vanilla-copy override just to take one line out would drop ~57 KB of the base game's country into
        // the mod, where it shadows that country forever, frozen at this patch — the damage the comment
        // beside that guard describes. But the client read ok:true as done, advanced its baseline and said
        // "Country details saved successfully!", and the reload underneath put the spirit straight back with
        // no explanation. Collect them and say what actually happened.
        if (!active && data && data.noop) notRemoved.push(itemId);
      }
    }
    if (notRemoved.length) {
      nbAlert(
        "Your mod doesn't have its own history file for " + selectedTag + " yet, so there was nothing to " +
        "remove — " + notRemoved.join(", ") + " comes from the base game.\n\n" +
        "Add a spirit or change one of the details above and save. That gives your mod its own copy of the " +
        "country, and the removal will work from then on.",
        notRemoved.length === 1 ? "Spirit not removed" : "Spirits not removed",
      );
    }
    savedSpirits = [...currentSpirits];

    const techsChanged =
      currentTechs.length !== savedTechs.length || currentTechs.some((t) => !savedTechs.includes(t));
    let allWritten = notRemoved.length === 0; // #removal-needs-an-override
    if (techsChanged) {
      // #staged-techs-lost-on-a-silent-refusal — advance the baseline ONLY on a real write. saveCountryTechs
      // refuses (without throwing) when there is no mod, when the previous read failed, and when the server
      // answers an error; treating any of those as done left the staged list looking saved and dropped it.
      // It has already explained itself in a modal, so this does not alert again — it reports upward, the
      // page stays dirty, and the list stays on screen ready for another Save.
      allWritten = await saveCountryTechs();
      if (allWritten) savedTechs = [...currentTechs];
    }
    setSpiritStatus();
    return allWritten;
  }

  saveDetailsBtn.addEventListener("click", saveCountryDetails);

  // ── Capital is MAP-managed ─────────────────────────────────────────────
  // Geography lives on the Map tab now. The Capital field stays here for REFERENCE (it shows the current
  // capital state id loaded from the country file) but is read-only; clicking it — or its hint link —
  // jumps to the Map with the 🏛 Set-capital tool active and this country pre-selected (deep-link). Save
  // Details omits `capital` (above), so the Map is the single source of truth and nothing here overwrites it.
  if (csCapital) {
    csCapital.readOnly = true;
    // A read-only REFERENCE field — the value can be focused/selected/copied. The field itself no longer
    // navigates: a mousedown-jump looked identical to the editable Stability/War-Support inputs and yanked
    // the user to the Map, silently discarding unsaved Details edits (there's no dirty guard). The explicit
    // "🗺 Set capital on the Map →" link below is the intended, safe jump. #capital-no-nav
    csCapital.style.cursor = "text";
    csCapital.title = "Capital is set on the Map tab (read-only here). Use the “Set capital on the Map” link below.";
    const goToMapCapital = () => {
      const q = selectedTag ? `?tag=${encodeURIComponent(selectedTag)}&tool=capital` : "?tool=capital";
      window.location.href = "map.html" + q;
    };
    const capHint = document.createElement("div");
    capHint.id = "csCapitalMapHint";
    capHint.style.cssText = "margin-top:5px; font-size:11px;";
    capHint.innerHTML = '<a href="#" id="csCapitalMapLink" style="color:#58a6ff; text-decoration:none;">🗺 Set capital on the Map →</a>';
    if (csCapital.parentNode) csCapital.parentNode.appendChild(capHint);
    const lk = document.getElementById("csCapitalMapLink");
    if (lk) lk.addEventListener("click", (e) => { e.preventDefault(); goToMapCapital(); });
  }

  // ── Starting Technologies ──────────────────────────────────────────────
  let currentTechs = [];
  // Set when the starting-tech load failed, so an empty list is never mistaken for "this country has none"
  // and saved back over the country's real set_technology. #tech-load-fail-wipes-starting-techs
  let techLoadFailed = false;
  let allKnownTechs = [];

  const techsList = document.getElementById("csTechsList");
  const addTechInput = document.getElementById("csAddTechInput");
  const addTechBtn = document.getElementById("csAddTechBtn");
  const techSuggestList = document.getElementById("csTechSuggestions");

  async function loadCountryTechs(tag) {
    try {
      const mod = getActiveModPath();
      const qs = new URLSearchParams({ tag });
      if (mod) qs.set("modPath", mod);
      const resp = await fetch(`/api/technologies/country-techs?${qs}`);
      const data = await resp.json();
      // #tech-load-fail-wipes-starting-techs — A FAILED LOAD IS NOT AN EMPTY LIST.
      //
      // This read data.techs and never looked at resp.ok or data.error, so a 400 (or a mod still cold-warming,
      // or a blip) rendered as "No starting technologies assigned." The next ＋ Add then posts techIds:
      // currentTechs — now holding only the tech just typed — and writeCountryTechnologies strips the
      // country's top-level set_technology and re-emits exactly what it was sent. The country's real
      // starting technologies are gone, with a green success.
      //
      // army.js already carries this whole pattern for the starting STOCKPILE, under a comment describing
      // the identical failure: "a transient failure must NOT masquerade as an EMPTY stockpile — otherwise
      // the user adds one entry, Saves, and the server replaces the file's stockpile block, silently wiping
      // this country's REAL starting equipment". Same shape here: flag it, offer a retry, and refuse to save
      // while the flag is set.
      if (!resp.ok || (data && data.error)) throw new Error((data && data.error) || `HTTP ${resp.status}`);
      techLoadFailed = false;
      currentTechs = Array.isArray(data.techs) ? data.techs : [];
      savedTechs = [...currentTechs]; // #enter-writes-without-save — the baseline Save Details diffs against
      renderTechs();
    } catch (e) {
      console.error("Failed to load country techs:", e);
      techLoadFailed = true;
      currentTechs = [];
      savedTechs = [];
      renderTechs();
    }
  }

  function renderTechs() {
    techsList.innerHTML = "";
    // A failed load must say so rather than borrow the empty state's words. "No starting technologies
    // assigned" is a statement about the mod; this is a statement about the request. #tech-load-fail-wipes-starting-techs
    if (techLoadFailed) {
      techsList.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding:12px; color:#d29922; font-size:13px;">Couldn’t load this country’s starting technologies (the mod may still be warming up). <button type="button" id="csTechRetryBtn" style="background:#21262d; border:1px solid #30363d; border-radius:6px; color:#c9d1d9; cursor:pointer; padding:2px 8px; margin-left:6px;">↻ Retry</button></div>`;
      const rb = document.getElementById("csTechRetryBtn");
      if (rb) rb.addEventListener("click", () => loadCountryTechs(selectedTag));
      return;
    }
    if (!currentTechs.length) {
      techsList.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding:12px; color:#8b949e; font-size:13px;">No starting technologies assigned.</div>`;
      return;
    }

    currentTechs.sort().forEach((id) => {
      const row = document.createElement("div");
      row.className = "cs-spirit-row";
      row.style.cssText = "margin-bottom: 0; padding: 6px 12px; display: flex; align-items: center; justify-content: space-between; gap: 8px;";
      
      const ico = window.NovaTechIcon ? window.NovaTechIcon.html(id) : "";
      row.innerHTML = `
        <span style="display:flex; align-items:center; gap:7px; min-width:0;">${ico}<span style="font-family: monospace; font-size: 12px; color: #e6edf3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${id}</span></span>
        <button class="cs-tech-remove" data-id="${id}" style="background: transparent; border: none; color: #f85149; cursor: pointer; font-size: 14px; font-weight: bold; padding: 0 4px; flex:0 0 auto;" title="Remove technology">✕</button>
      `;
      techsList.appendChild(row);
    });

    techsList.querySelectorAll(".cs-tech-remove").forEach((btn) => {
      btn.addEventListener("click", () => removeTech(btn.dataset.id));
    });
    if (window.NovaTechIcon) window.NovaTechIcon.mount(techsList);
  }

  // #enter-writes-without-save — ADDING A STARTING TECH REWROTE THE COUNTRY'S HISTORY FILE ON THE ENTER KEY.
  //
  // The list was already held in memory; the only thing wrong was that each change flushed it. Now it does
  // not, and Save Details sends the list once. That also removes a sharp edge worth naming: the old path
  // rewrote the country's whole set_technology block on every keystroke-completed add, so a half-finished
  // session left a partially-edited file behind with nothing to say so.
  function addTech(techId) {
    if (!techId || !selectedTag) return;
    if (currentTechs.includes(techId)) {
      nbAlert("Technology already assigned.");
      return;
    }
    currentTechs.push(techId);
    if (addTechInput) addTechInput.value = "";
    renderTechs();
    csMarkDirty();
  }

  function removeTech(techId) {
    if (!techId || !selectedTag) return;
    currentTechs = currentTechs.filter(t => t !== techId);
    renderTechs();
    csMarkDirty();
  }

  /**
   * Write the country's starting technologies.
   * @returns {Promise<boolean>} true only if the list actually reached disk.
   *
   * #staged-techs-lost-on-a-silent-refusal — THE RETURN VALUE IS THE POINT. Every early exit below is a
   * refusal, and each one is correct on its own terms. They became dangerous when technologies stopped
   * writing on the keystroke and started being staged for Save: the flush advanced its baseline and marked
   * the page clean no matter what happened here, so a refusal — which had been a loud alert with nothing at
   * stake — turned into "Country details saved successfully!" over a list that was never written.
   */
  async function saveCountryTechs() {
    const mod = getActiveModPath();
    if (!mod) {
      nbAlert("Please select an active mod first.");
      return false;
    }
    // ⚠️ REFUSE WHILE THE LOAD IS UNKNOWN. The server rewrites the country's whole set_technology from what
    // this posts, so saving a list built on top of a failed read replaces real starting technologies with
    // whatever happens to be in the box. Same guard army.js applies before writing a stockpile.
    // #tech-load-fail-wipes-starting-techs
    if (techLoadFailed) {
      nbAlert("Nova couldn’t read this country’s current starting technologies, so it won’t overwrite them. Use ↻ Retry above, then try again.", "Not saved");
      return false;
    }
    try {
      const resp = await fetch("/api/technologies/save-country-techs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tag: selectedTag,
          modPath: mod,
          techIds: currentTechs
        })
      });
      const data = await resp.json();
      if (!resp.ok || data.error) {
        nbAlert("Error: " + (data.error || `HTTP ${resp.status}`));
        return false;
      }
      addTechInput.value = "";
      // #remove-tech-removes-nothing — a tech granted inside a dated / DLC-gated block cannot be changed from
      // here, and the list used to just redraw with the row still in it, as if the ✕ had been ignored. Say so.
      if (data.note) nbAlert(data.note, "Some technologies weren't changed");
      await loadCountryTechs(selectedTag);
      return true;
    } catch (e) {
      nbAlert("Failed to save country technologies: " + e.message);
      return false;
    }
  }

  async function loadKnownTechs() {
    try {
      const mod = getActiveModPath();
      const qs = new URLSearchParams({
        includeVanilla: "1",
        includeActiveMod: "1"
      });
      // This page was the ONE that already sent `modPath`, added alongside `sourcePath` rather than
      // replacing it — so it worked here and nowhere else, and the dead spelling stayed to be copied.
      // #tech-picker-sends-a-param-nobody-reads
      if (mod) qs.set("modPath", mod);
      qs.set("lite", "1"); // the picker only needs id + name; skip the ~45s per-icon resolution
      const url = `/api/technologies/catalog?${qs}`;
      const techsCacheKey = "techs_catalog_lite_" + mod;
      // Also the revalidation callback, so a technology added on the Research page since this catalogue was
      // cached appears here without a reload. #country-setup-pickers-frozen
      const apply = (d) => {
        const own = (d.technologies || d.items || (Array.isArray(d) ? d : [])).filter(t => t && t.id);
        // Merge in the declared base mod's (e.g. Millennium Dawn) techs — they're valid set_technology
        // targets when that mod is active, but weren't in `technologies` (which is vanilla + this mod
        // only). Tagged isBaseMod so the picker can group/filter by origin. Deduped, active mod wins.
        const baseMod = (d.baseModTechs || []).filter(t => t && t.id);
        const byId = new Map();
        own.forEach(t => byId.set(t.id, t));
        baseMod.forEach(t => { if (!byId.has(t.id)) byId.set(t.id, t); });
        allKnownTechsDetailed = Array.from(byId.values());
        allKnownTechs = allKnownTechsDetailed.map(t => t.id);
        updateTechSuggestions();
      };
      apply(await fetchCachedJson(url, techsCacheKey, apply));
    } catch (e) {
      allKnownTechsDetailed = [];
      allKnownTechs = [];
    }
  }

  function updateTechSuggestions() {
    techSuggestList.innerHTML = "";
  }

  addTechBtn.addEventListener("click", () => addTech(addTechInput.value.trim()));
  addTechInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addTech(addTechInput.value.trim());
  });

  // Dynamic autocomplete filtering for starting technologies to prevent Chromium layout/paint freezes
  addTechInput.addEventListener("input", () => {
    const val = addTechInput.value.toLowerCase().trim();
    techSuggestList.innerHTML = "";
    if (val.length < 2) return; // Only trigger suggestions when user types 2+ characters
    const matched = (allKnownTechsDetailed || [])
      .filter(item => item.id.toLowerCase().includes(val) || (item.name || "").toLowerCase().includes(val) || (locMap[item.id] || "").toLowerCase().includes(val))
      .slice(0, 40); // Limit to top 40 results to keep the DOM light
    matched.forEach(item => {
      const opt = document.createElement("option");
      opt.value = item.id;
      const name = item.name || locMap[item.id];
      if (name && name !== item.id) opt.label = name;
      techSuggestList.appendChild(opt);
    });
  });

  // ── Create New Country ─────────────────────────────────────────────────
  const createCountryBtn = document.getElementById("csCreateCountryBtn");
  const createCountryDialog = document.getElementById("csCreateCountryDialog");
  const createCountryForm = document.getElementById("csCreateCountryForm");
  const ccCancelBtn = document.getElementById("ccCancelBtn");

  if (createCountryBtn) {
    createCountryBtn.addEventListener("click", () => {
      const mod = getActiveModPath();
      if (!mod) {
        nbAlert("Please select an active mod first.");
        return;
      }
      createCountryForm.reset();
      createCountryDialog.showModal();
      // Deliberately not awaited: the dialog opens immediately and the list fills a moment later, which
      // is better than making the button feel slow. reset() has already run, so nothing undoes this.
      // #culture-picker-offers-six-of-nine
      fillGraphicalCultures();
    });
  }

  if (ccCancelBtn) {
    ccCancelBtn.addEventListener("click", () => {
      createCountryDialog.close();
    });
  }

  // ✨ "Draw it on the Map" — the recommended, geography-on-the-Map path: open the Map's New-country tool.
  // #capital-state-id-is-a-blind-number — say WHERE the id points and WHO holds it, while it is typed.
  //
  // A bare state number tells the author nothing, and taking an existing country's capital state breaks
  // that country badly enough that HOI4 crashes when it is selected. The create endpoint warns about it
  // AFTERWARDS; knowing before is strictly better. /api/state-province reads one state file across
  // mod → dependencies → vanilla, so this stays cheap enough to run while typing.
  {
    const capIn = document.getElementById("ccCapital");
    const capOut = document.getElementById("ccCapitalInfo");
    if (capIn && capOut) {
      let timer = null, seq = 0;
      const show = (text, color) => { capOut.textContent = text; capOut.style.color = color; };
      const look = async () => {
        const raw = String(capIn.value || "").trim();
        if (!raw) return show("", "#8b949e");
        const id = parseInt(raw, 10);
        if (!Number.isInteger(id) || id <= 0) return show("Enter a state number, e.g. 1074.", "#d29922");
        const mine = ++seq;
        show("Looking up state " + id + "…", "#8b949e");
        try {
          const mod = getActiveModPath();
          const qs = new URLSearchParams({ state: String(id) }); if (mod) qs.set("modPath", mod);
          const d = await fetch("/api/state-province?" + qs.toString()).then((r) => r.json());
          if (mine !== seq) return; // a newer keystroke already won
          if (!d || !d.ok) return show("✗ " + ((d && d.error) || "State " + id + " could not be found."), "#f85149");
          const where = d.name ? d.name : "state " + id;
          // Owning land nobody holds is the easy case; taking it off someone is the one worth flagging.
          if (d.owner) {
            show("✓ " + where + " — currently owned by " + d.owner + ". Creating here TAKES it from them, and if it is their capital that country breaks.", "#d29922");
          } else {
            show("✓ " + where + " — unowned.", "#3fb950");
          }
        } catch (e) { if (mine === seq) show("Could not check that state: " + (e.message || e), "#d29922"); }
      };
      capIn.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(look, 300); });
    }
  }
  const ccDrawOnMap = document.getElementById("ccDrawOnMap");
  // #country-map-seam — CARRY WHAT WAS TYPED. This used to navigate to a bare
  // "map.html?tool=newcountry", discarding the tag, name and colour from this very dialog, so the Map
  // opened an empty form with a randomly suggested tag and the author believed they were making a SECOND
  // country. Hand the identity over; the Map pre-fills its create modal from it and says whose land you
  // are claiming. Only fields actually filled in are sent, so a blank dialog still behaves as before.
  if (ccDrawOnMap) ccDrawOnMap.addEventListener("click", () => {
    const q = new URLSearchParams({ tool: "newcountry" });
    const tag = String((document.getElementById("ccTag") || {}).value || "").trim().toUpperCase();
    const name = String((document.getElementById("ccName") || {}).value || "").trim();
    const color = String((document.getElementById("ccColor") || {}).value || "").trim();
    // #culture-case-mangled — DO NOT LOWERCASE A TOKEN THE GAME MATCHES EXACTLY.
    //
    // A graphical_culture is a bareword the game looks up verbatim, and mods do ship mixed-case ones —
    // Rise of Nations declares `graphical_culture = SWI`. Lowering it here handed the Map "swi", the create
    // endpoint stores what it is given, and the country ended up with a culture token nothing defines, so
    // HOI4 silently falls back to a default look. The tag on the line above is upper-cased because a TAG is
    // defined to be upper-case; a culture has no such rule, so the right transform is none at all.
    const culture = String((document.getElementById("ccGraphicalCulture") || {}).value || "").trim();
    // Exactly three, like every other tag rule in Nova and in HOI4 — carrying a shorter one only pre-fills
    // the Map's tag box with something its own submit will refuse, while suppressing the free-tag
    // suggestion that would have filled it correctly. #country-map-seam
    if (/^[A-Z][A-Z0-9]{2}$/.test(tag)) q.set("newtag", tag);
    if (name) q.set("newname", name);
    if (/^#[0-9a-fA-F]{6}$/.test(color)) q.set("newcolor", color);
    // …and the graphical culture. This dialog is the only place that asks for it — the Map has no picker
    // — so leaving it behind meant a country the author had marked African or Asian was written
    // western_european_gfx, and its name pool seeded to match. #map-create-country-skips-the-name-pool
    if (/^[a-z0-9_]{1,64}$/.test(culture)) q.set("newculture", culture);
    try { createCountryDialog.close(); } catch (_) {}
    window.location.href = "map.html?" + q.toString();
  });

  // Accept either a #rrggbb hex (the colour picker) or legacy "r g b" text → [r,g,b].
  function parseColorToRgb(v) {
    v = String(v == null ? "" : v).trim();
    const hx = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(v);
    if (hx) return [parseInt(hx[1], 16), parseInt(hx[2], 16), parseInt(hx[3], 16)];
    const nums = v.split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n));
    return nums.length >= 3 ? nums.slice(0, 3).map((n) => Math.max(0, Math.min(255, Math.round(n)))) : null;
  }

  // "Customize a base-game country": Create Country only makes BRAND-NEW nations (it rejects an
  // existing tag), and a fresh add-on's country list shows only its own files — so there was no UI
  // path to open an existing base-game/base-mod country (e.g. GER, LUX) and tweak its start. The
  // backend already supports it: selecting a tag loads its effective (vanilla/dependency) history, and
  // Save Details writes an override into the mod via ensureCountryHistoryFileInMod (the base game is
  // never touched). This just exposes that — type a tag and we open it for editing.
  const customizeBaseBtn = document.getElementById("csCustomizeBaseBtn");
  if (customizeBaseBtn) {
    customizeBaseBtn.addEventListener("click", async () => {
      const mod = getActiveModPath();
      if (!mod) { nbAlert("Please select an active mod first."); return; }
      const raw = await csPrompt(
        "Customize a base-game country",
        "Enter the country tag to customize (e.g. GER, LUX, USA). Saving writes an override into your mod — the base game is never changed.",
        { placeholder: "GER" }
      );
      if (raw == null) return;
      const tag = raw.trim().toUpperCase();
      // HOI4 tags are EXACTLY 3 chars starting with a letter. A 4-char tag is worse than invalid: the game
      // keys history files on the first 3 filename chars, so "USAA - Custom.txt" would silently land the
      // user's edits on USA; a 2-char tag writes a file the game ignores entirely.
      if (!/^[A-Z][A-Z0-9]{2}$/.test(tag)) { nbAlert("That doesn't look like a country tag — tags are exactly 3 characters starting with a letter, e.g. GER, USA, LUX."); return; }
      selectCountry(tag, tag);
    });
  }

  // #culture-picker-offers-six-of-nine — fill the graphical-culture list from the countries the game
  // actually loads. The markup ships six of the base game's nine (commonwealth_gfx alone covers 22
  // countries) and could never show one a base mod introduces. The static options stay in the HTML as
  // the fallback, so a failed fetch leaves the dropdown exactly as it was rather than empty.
  async function fillGraphicalCultures() {
    const sel = document.getElementById("ccGraphicalCulture");
    if (!sel) return;
    const mod = getActiveModPath();
    if (!mod) return;
    try {
      const r = await fetch("/api/countries/graphical-cultures?modPath=" + encodeURIComponent(mod));
      const d = await r.json();
      if (!d || !d.ok || !Array.isArray(d.cultures) || !d.cultures.length) return;
      // Keep whatever the author had chosen if it is still on offer.
      const want = sel.value;
      sel.innerHTML = "";
      for (const c of d.cultures) {
        const o = document.createElement("option");
        o.value = c.id;
        // Saying how many countries already use it turns an unfamiliar token into a real choice.
        o.textContent = c.label + (c.count ? " — " + c.count + " countr" + (c.count === 1 ? "y" : "ies") : "");
        sel.appendChild(o);
      }
      if (d.cultures.some((c) => c.id === want)) sel.value = want;
      else if (d.cultures.some((c) => c.id === "western_european_gfx")) sel.value = "western_european_gfx";
    } catch (_) { /* leave the markup's own options in place */ }
  }

  if (createCountryForm) {
    createCountryForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const mod = getActiveModPath();
      const tag = document.getElementById("ccTag").value.trim().toUpperCase();
      const name = document.getElementById("ccName").value.trim();
      const capitalStateId = parseInt(document.getElementById("ccCapital").value);
      const colorRgb = parseColorToRgb(document.getElementById("ccColor").value);
      const color = colorRgb ? colorRgb.join(" ") : "120 40 60"; // the create endpoint takes "r g b" text
      const graphicalCulture = document.getElementById("ccGraphicalCulture").value;

      try {
        const resp = await fetch("/api/countries/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modPath: mod,
            tag,
            name,
            color,
            graphicalCulture,
            capitalStateId
          })
        });
        const data = await resp.json();
        if (data.error) {
          nbAlert("Error: " + data.error);
          return;
        }
        createCountryDialog.close();
        // Mirror the colour into common/countries/colors.txt so the Map's 🎨 picker + map render show it
        // (the create endpoint only writes the older common/countries `color = { }`). Geography → Map.
        if (colorRgb) { try { await fetch("/api/map/set-country-color", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modPath: mod, tag, rgb: colorRgb }) }); } catch (_) {} }
        // Taking the capital state is intended; taking somebody ELSE's capital is worth saying out loud,
        // because the country it was taken from crashes the game when selected (#capital-taken-from-owner).
        nbAlert(`Country ${name} (${tag}) created successfully!` + (data.capitalWarning ? `

⚠ ${data.capitalWarning}` : ""));

        // Reload countries and select it
        await loadCountries();
        await loadKnownSpirits();
        await loadKnownTechs();
        selectCountry(tag, name);
      } catch (err) {
        nbAlert("Failed to create country: " + err.message);
      }
    });
  }

  // Let a .modal picker be dismissed the way everyone tries first: click the dim backdrop (outside
  // .modal-content) or press Escape — not only the ✕. Idempotent per modal.
  function wireModalDismiss(modal) {
    if (!modal || modal.dataset.dismissWired) return;
    modal.dataset.dismissWired = "1";
    modal.addEventListener("mousedown", (e) => { if (e.target === modal) modal.style.display = "none"; });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && getComputedStyle(modal).display !== "none") modal.style.display = "none"; });
  }

  function wireSpiritPicker() {
    const browseBtn = document.getElementById("csBrowseSpiritBtn");
    const modal = document.getElementById("spiritPickerModal");
    const search = document.getElementById("spiritPickerSearch");
    const grid = document.getElementById("spiritPickerGrid");
    const closeBtn = document.getElementById("closeSpiritPicker");

    if (!browseBtn || !modal) return;

    let currentFilteredSpirits = [];
    let renderedSpiritsCount = 0;
    const BATCH_SIZE = 80;

    function renderNextSpiritsBatch() {
      const batch = currentFilteredSpirits.slice(renderedSpiritsCount, renderedSpiritsCount + BATCH_SIZE);
      const fragment = document.createDocumentFragment();

      batch.forEach(item => {
        const itemDiv = document.createElement("div");
        itemDiv.className = "modal-item-spirit";
        
        const displayName = stripLoc(locMap[item.ideaId]) || item.ideaId;
        const displayDesc = stripLoc(locMap[item.ideaId + "_desc"]) || "No description.";
        const category = item.category || "country";

        itemDiv.innerHTML = `
          ${spiritIconHtml(item.pictureToken, "cs-picker-icon")}
          <div style="flex: 1; min-width: 0;">
            <div style="font-family: monospace; font-size: 13px; color: #58a6ff; font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.ideaId}</div>
            <div style="font-size: 12px; color: #c9d1d9; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${displayName !== item.ideaId ? displayName : ""} <span style="font-size: 10px; color: #8b949e; background: #21262d; padding: 1px 4px; border-radius: 4px; margin-left: 6px;">${category}</span></div>
            <div style="font-size: 11px; color: #8b949e; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px;">${displayDesc}</div>
          </div>
        `;

        itemDiv.addEventListener("click", () => {
          if (currentSpirits && currentSpirits.includes(item.ideaId)) {
            nbAlert("This spirit is already assigned to this country.");
            return;
          }
          addSpirit(item.ideaId);
          modal.style.display = "none";
        });

        fragment.appendChild(itemDiv);
      });

      grid.appendChild(fragment);
      renderedSpiritsCount += batch.length;
    }

    function handleSearch() {
      const val = search.value.toLowerCase().trim();
      currentFilteredSpirits = (allKnownSpiritsDetailed || []).filter(item =>
        item.ideaId.toLowerCase().includes(val) ||
        (locMap[item.ideaId] || "").toLowerCase().includes(val) ||
        (locMap[item.ideaId + "_desc"] || "").toLowerCase().includes(val)
      );

      grid.innerHTML = "";
      renderedSpiritsCount = 0;

      if (currentFilteredSpirits.length === 0) {
        grid.innerHTML = `<div style="padding: 24px; color: #8b949e; text-align: center;">No spirits found.</div>`;
      } else {
        renderNextSpiritsBatch();
      }
    }

    browseBtn.addEventListener("click", () => {
      const mod = getActiveModPath();
      if (!mod) {
        nbAlert("Please select an active mod first.");
        return;
      }
      modal.style.display = "block";
      search.value = "";
      handleSearch();
      grid.scrollTop = 0;
      if (search) setTimeout(() => { try { search.focus(); } catch (_) {} }, 0); // type to search immediately
    });

    grid.addEventListener("scroll", () => {
      if (grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 60) {
        if (renderedSpiritsCount < currentFilteredSpirits.length) {
          renderNextSpiritsBatch();
        }
      }
    });

    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        modal.style.display = "none";
      });
    }
    wireModalDismiss(modal);

    if (search) {
      search.addEventListener("input", handleSearch);
    }
  }

  function wireTechPicker() {
    const browseBtn = document.getElementById("csBrowseTechBtn");
    const modal = document.getElementById("techPickerModal");
    const search = document.getElementById("techPickerSearch");
    const grid = document.getElementById("techPickerGrid");
    const closeBtn = document.getElementById("closeTechPicker");
    const showAllChk = document.getElementById("techPickerShowAll");
    const techOrigin = (item) => item.isMod ? "this mod" : (item.isBaseMod ? "base mod" : "vanilla");
    const techOriginColor = (item) => item.isMod ? "#3fb950" : (item.isBaseMod ? "#d29922" : "#6e7681");

    if (!browseBtn || !modal) return;

    let currentFilteredTechs = [];
    let renderedTechsCount = 0;
    const BATCH_SIZE = 120;

    function renderNextTechsBatch() {
      const batch = currentFilteredTechs.slice(renderedTechsCount, renderedTechsCount + BATCH_SIZE);
      const fragment = document.createDocumentFragment();

      batch.forEach(item => {
        const itemDiv = document.createElement("div");
        itemDiv.className = "modal-item-tech";

        // Resolve the tech's REAL icon the same way the assigned-tech list does (NovaTechIcon), rather than
        // item.iconUrl — the picker loads the catalog with lite=1, which omits iconUrl, so every tile used to
        // show the generic 🔬. mount() below fills them in. #tech-picker-icons
        itemDiv.innerHTML = `
          <div style="height: 52px; display: flex; align-items: center; justify-content: center; margin-bottom: 8px;">
            ${window.NovaTechIcon ? window.NovaTechIcon.html(item.id, { size: "lg" }) : '🔬'}
          </div>
          <div style="font-family: monospace; font-size: 11px; color: #58a6ff; font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%;" title="${item.id}">${item.id}</div>
          <div style="font-size: 11px; color: #c9d1d9; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%; margin-top: 4px;" title="${item.name || item.id}">${item.name || item.id}</div>
          <div style="font-size: 9px; color: ${techOriginColor(item)}; margin-top: 3px; text-transform: uppercase; letter-spacing: 0.5px;">${techOrigin(item)}</div>
        `;

        itemDiv.addEventListener("click", () => {
          if (currentTechs && currentTechs.includes(item.id)) {
            nbAlert("This technology is already assigned to this country.");
            return;
          }
          addTech(item.id);
          modal.style.display = "none";
        });

        fragment.appendChild(itemDiv);
      });

      grid.appendChild(fragment);
      if (window.NovaTechIcon) window.NovaTechIcon.mount(grid); // resolve this batch's real tech icons
      renderedTechsCount += batch.length;
    }

    function handleSearch() {
      const val = search.value.toLowerCase().trim();
      const showAll = showAllChk && showAllChk.checked;
      currentFilteredTechs = (allKnownTechsDetailed || []).filter(item => {
        // Default ("available"): this mod + base mod (e.g. Millennium Dawn) only — that's what the
        // user is building with. "Show all" also includes the ~200 vanilla techs. #icon-browser
        const isVanilla = !item.isMod && !item.isBaseMod;
        if (isVanilla && !showAll) return false;
        return item.id.toLowerCase().includes(val) || (item.name || "").toLowerCase().includes(val);
      });

      grid.innerHTML = "";
      renderedTechsCount = 0;

      if (currentFilteredTechs.length === 0) {
        grid.innerHTML = `<div style="padding: 24px; color: #8b949e; text-align: center;">No technologies found.</div>`;
      } else {
        renderNextTechsBatch();
      }
    }

    browseBtn.addEventListener("click", () => {
      const mod = getActiveModPath();
      if (!mod) {
        nbAlert("Please select an active mod first.");
        return;
      }
      // If this mod has NO techs of its own (vanilla active, or a fresh add-on with no base-mod dependency),
      // the default mod-only filter hides everything → "No technologies found". Auto-tick Show-all in that
      // case so the picker isn't empty; a mod with its own techs keeps the mod default. #techpicker-empty
      if (showAllChk && !(allKnownTechsDetailed || []).some((t) => t.isMod || t.isBaseMod)) showAllChk.checked = true;
      modal.style.display = "block";
      search.value = "";
      handleSearch();
      grid.scrollTop = 0;
      if (search) setTimeout(() => { try { search.focus(); } catch (_) {} }, 0); // type to search immediately
    });

    grid.addEventListener("scroll", () => {
      if (grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 60) {
        if (renderedTechsCount < currentFilteredTechs.length) {
          renderNextTechsBatch();
        }
      }
    });

    if (showAllChk) {
      showAllChk.addEventListener("change", () => { handleSearch(); grid.scrollTop = 0; });
    }

    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        modal.style.display = "none";
      });
    }
    wireModalDismiss(modal);

    if (search) {
      search.addEventListener("input", handleSearch);
    }
  }

  // ── Init ───────────────────────────────────────────────────────────────
  async function init() {
    await initModSelector();
    loadIdeologies();
    await loadCountries();
    loadKnownSpirits();
    loadKnownTechs();
    wireSpiritPicker();
    wireTechPicker();

    // AI Generator integration
    const generateAiCountryBtn = document.getElementById("generateAiCountryBtn");
    const aiCountryPrompt = document.getElementById("aiCountryPrompt");
    const aiStatus = document.getElementById("aiStatus");

    if (generateAiCountryBtn) {
      generateAiCountryBtn.addEventListener("click", async () => {
        const prompt = aiCountryPrompt.value.trim();
        if (!prompt) return;

        aiStatus.textContent = "Generating...";
        aiStatus.style.color = "#8fa4b8";
        generateAiCountryBtn.disabled = true;

        const storedKey = localStorage.getItem("gemini_api_key") || localStorage.getItem("geminiApiKey");
        const systemPrompt = `You are a Master-Level Hearts of Iron IV (HOI4) Modding AI.
Your purpose is to translate user requests into structured starting country history properties.
You MUST output ONLY a valid JSON object. Do NOT wrap the JSON in markdown code blocks. Do not include any explanation or chatter.
The JSON object must have this exact structure (use numbers for percentages, e.g. 60 for 60%):
{
  "capital": 123,
  "researchSlots": 4,
  "stability": 60,
  "warSupport": 45,
  "convoys": 100,
  "rulingParty": "neutrality",
  "electionsAllowed": "no",
  "lastElection": "1933.3.5",
  "electionFrequency": 48,
  "popularity": {
    "democratic": 10,
    "fascism": 20,
    "communism": 30,
    "neutrality": 40
  }
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

          if (parsedData.capital !== undefined) csCapital.value = parsedData.capital;
          if (parsedData.researchSlots !== undefined) { csResearchSlots.value = parsedData.researchSlots; markUserEdited(csResearchSlots); }
          if (parsedData.stability !== undefined) { csStability.value = parsedData.stability; markUserEdited(csStability); }
          if (parsedData.warSupport !== undefined) { csWarSupport.value = parsedData.warSupport; markUserEdited(csWarSupport); }
          if (parsedData.convoys !== undefined) csConvoys.value = parsedData.convoys;
          if (parsedData.rulingParty !== undefined) csRulingParty.value = parsedData.rulingParty;
          if (parsedData.electionsAllowed !== undefined) csElectionsAllowed.value = parsedData.electionsAllowed;
          if (parsedData.lastElection !== undefined) csLastElection.value = parsedData.lastElection;
          if (parsedData.electionFrequency !== undefined) csElectionFrequency.value = parsedData.electionFrequency;

          if (parsedData.popularity) {
            // Apply any ideology key the AI returned to its matching box (incl. mod-specific ones).
            Object.entries(parsedData.popularity).forEach(([k, val]) => {
              if (val === undefined || val === null) return;
              const el = popInputByIdeology(k);
              if (el) el.value = val;
            });
            updatePopularityTotal();
          }

          // Trigger change/input events for validation/preview sync
          const elementsToUpdate = [
            csCapital, csResearchSlots, csStability, csWarSupport, csConvoys,
            csRulingParty, csElectionsAllowed, csLastElection, csElectionFrequency,
            ...popularityInputs()
          ];
          elementsToUpdate.forEach(el => {
            if (el) {
              el.dispatchEvent(new Event("input", { bubbles: true }));
              el.dispatchEvent(new Event("change", { bubbles: true }));
            }
          });

          aiStatus.textContent = "AI Country details successfully loaded into the form!";
          aiStatus.style.color = "#2ea043";
        } catch (err) {
          aiStatus.textContent = "Error: " + err.message;
          aiStatus.style.color = "#f85149";
        } finally {
          generateAiCountryBtn.disabled = false;
        }
      });
    }

    const aiLogicHelpBtn = document.getElementById("aiLogicHelpBtn");
    if (aiLogicHelpBtn) {
      aiLogicHelpBtn.addEventListener("click", () => {
        window.showNovaAiHelpModal();
      });
    }
  }
  init();
});
})();
