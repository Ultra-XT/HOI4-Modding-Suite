(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  function normalizePath(p) {
    return String(p || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  }

  function getActiveModPath() {
    return localStorage.getItem("activeModPath") || "";
  }

  async function initModSelector() {
    const sel = $("homeModSelector");
    const badge = $("modStatusBadge");
    const pathText = $("modPathText");
    if (!sel) return;

    try {
      const resp = await fetch("/api/mods/list");
      const data = await resp.json();
      if (data.error) throw new Error(data.error);

      sel.innerHTML = "";
      const mods = data.mods || [];
      
      if (!mods.length) {
        sel.innerHTML = "<option value=''>-- No mods detected --</option>";
        pathText.textContent = "Active path: none";
        badge.textContent = "Offline";
        badge.className = "mod-status-badge vanilla";
        return;
      }

      // The vanilla game-files entry — identified by the SERVER's authoritative isVanilla flag, not a
      // "vanilla" substring in the name (which false-positives on real mods like "Vanilla Plus").
      const vanillaPath = (mods.find((m) => m.isVanilla) || {}).path || "";
      mods.forEach((m) => {
        const o = document.createElement("option");
        o.value = m.path;
        o.textContent = m.name || m.path.split(/[\\/]/).pop();
        if (m.isVanilla) o.dataset.vanilla = "1";
        if (normalizePath(m.path) === normalizePath(getActiveModPath())) {
          o.selected = true;
        }
        sel.appendChild(o);
      });

      // A stored mod missing from THIS list is usually a TRANSIENT enumeration miss (Steam re-validating a
      // workshop item, drive not mounted). Without this, nothing gets .selected → the native select falls to
      // mods[0] (the prepended vanilla), and updateStatus() below would PERSIST that over the real selection
      // (sticking across reloads → every mod sprite goes to the beige placeholder). Keep the stored path via a
      // "(not detected)" placeholder so updateStatus persists it unchanged; it self-heals when the mod returns.
      const activeStored = getActiveModPath();
      if (activeStored && !mods.some((m) => normalizePath(m.path) === normalizePath(activeStored))) {
        const o = document.createElement("option");
        o.value = activeStored;
        o.textContent = (activeStored.split(/[\\/]/).filter(Boolean).pop() || activeStored) + " (not detected)";
        sel.insertBefore(o, sel.firstChild);
        sel.value = activeStored;
      }

      // Default fallback if no active mod is remembered
      if (!getActiveModPath() && mods.length > 0) {
        const nonVanilla = mods.find((m) => !m.isVanilla);
        const fallback = nonVanilla || mods[0];
        localStorage.setItem("activeModPath", fallback.path);
        sel.value = fallback.path;
      }

      function updateStatus() {
        const activePath = sel.value;
        localStorage.setItem("activeModPath", activePath);
        pathText.textContent = `Active path: ${activePath}`;

        const selectedOption = sel.options[sel.selectedIndex];
        // Vanilla/read-only = the active path IS the game root (from the server's flagged entry), or the
        // selected option is the flagged vanilla one. NEVER a "vanilla" substring in the name — that
        // mislabels real mods like "Vanilla Plus" as read-only and re-lights the first-run hero.
        const isVanilla = (!!vanillaPath && normalizePath(activePath) === normalizePath(vanillaPath))
          || (selectedOption && selectedOption.dataset.vanilla === "1");

        if (isVanilla) {
          badge.textContent = "Vanilla (Read-Only)";
          badge.className = "mod-status-badge vanilla";
        } else {
          badge.textContent = "Modded Workspace";
          badge.className = "mod-status-badge";
        }
      }

      sel.addEventListener("change", updateStatus);
      updateStatus();

    } catch (err) {
      console.error("Failed to load mod catalog:", err);
      sel.innerHTML = "<option value=''>-- Error loading mods --</option>";
    }
  }

  // --- Per-mod progress strip (Pass 4): "what's in this country so far" ---
  // Maps the journey steps to the entity counts from GET /api/mod/index.
  const PROGRESS_STEPS = [
    { key: "country", icon: "🏳️", one: "Country", many: "Countries", href: "country-setup.html" },
    { key: "character", icon: "👤", one: "Character", many: "Characters", href: "characters.html" },
    // #home-spirits-double-counts-characters — `counts.idea` is national spirits PLUS characters, because
    // characters are indexed as idea entities so the orphan/dependency logic can treat them uniformly. The
    // index therefore also publishes `counts.spirit` (= idea − character) precisely so this chip is not
    // inflated, and Mod Health already uses it. Home read `idea`, so every character was counted twice —
    // once under 👤 Characters and again inside 🛡️ Spirits (12,987 vs 10,518 on Millennium Dawn) — and a mod
    // with characters but no spirits never showed the "Add a Spirit" zero-state this strip exists to prompt.
    { key: "spirit", fallbackKey: "idea", icon: "🛡️", one: "Spirit", many: "Spirits", href: "ideas.html" },
    { key: "tech", icon: "🔬", one: "Tech", many: "Techs", href: "research.html" },
    { key: "focus", icon: "🎯", one: "Focus", many: "Focuses", href: "index.html" },
    { key: "event", icon: "📜", one: "Event", many: "Events", href: "events.html" },
    { key: "decision", icon: "⚖️", one: "Decision", many: "Decisions", href: "decisions.html" },
    // #military-missing-from-the-workflow — the Military maker was absent from both the workflow stages and
    // this strip, so the one tab with its own equipment, templates, manufacturers and orders of battle was
    // the only maker Home never mentioned. `equipment` is what the index counts for it (591 on Millennium
    // Dawn) and is the closest thing to "how much army content does this mod have".
    { key: "equipment", icon: "⚔️", one: "Equipment", many: "Equipment", href: "army.html" },
  ];
  function escAttr(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }
  let progressReqSeq = 0;
  async function loadModProgress(modPath, staleRetries = 6) {
    const wrap = $("modProgress"), row = $("modProgressRow"), health = $("modProgressHealth");
    if (!wrap || !row || !health) return;
    if (!modPath) { wrap.hidden = true; return; }
    const myseq = ++progressReqSeq;
    try {
      const data = await fetch("/api/mod/index?modPath=" + encodeURIComponent(modPath)).then((r) => r.json());
      if (myseq !== progressReqSeq) return; // a newer selection superseded this request
      if (!data || data.error) { wrap.hidden = true; return; }
      const c = data.counts || {};
      row.innerHTML = PROGRESS_STEPS.map((s) => {
        // Same fallback Mod Health uses: an older cached index payload may predate `counts.spirit`, and
        // falling back to `idea` is better than showing 0. #home-spirits-double-counts-characters
        const n = (c[s.key] != null) ? c[s.key] : (s.fallbackKey ? (c[s.fallbackKey] || 0) : 0);
        const label = n === 1 ? s.one : s.many;
        const verb = n ? "Open " + s.many : "Add " + (s.one || "").toLowerCase();
        // Each chip is a link to its maker. Zero-count chips read "Add a …" so the strip
        // doubles as the next-step prompt; non-zero read "Open …".
        return `<a class="mp-stat ${n ? "" : "is-zero"}" href="${escAttr(s.href)}" title="${escAttr(verb)} in this mod"><span class="mp-num">${n}</span> ${s.icon} ${label}</a>`;
      }).join("");
      if (data.isVanilla) {
        health.className = "mod-progress-health mp-health-muted";
        health.textContent = "Viewing vanilla game files (read-only) — switch to your mod to track progress.";
      } else {
        const errs = c.errors || 0, warns = c.warnings || 0;
        // The "open Mod Health" phrase is a real link to the fixer (counts are numbers → safe innerHTML).
        const mhLink = (verb) => ` — <a href="modhealth.html" style="color:inherit;text-decoration:underline;font-weight:600;" title="Open Mod Health to ${verb} these issues">open Mod Health to ${verb} →</a>`;
        if (errs) {
          health.className = "mod-progress-health mp-health-err";
          health.innerHTML = `⛔ ${errs} error${errs > 1 ? "s" : ""}` + (warns ? `, ${warns} warning${warns > 1 ? "s" : ""}` : "") + mhLink("fix");
        } else if (warns) {
          health.className = "mod-progress-health mp-health-warn";
          health.innerHTML = `⚠️ ${warns} warning${warns > 1 ? "s" : ""}` + mhLink("review");
        } else {
          health.className = "mod-progress-health mp-health-ok";
          health.textContent = "✓ No problems detected";
        }
      }
      wrap.hidden = false;
      // The server served last-known counts instantly and is rebuilding fresh ones in the background
      // (so Home never blocks after an edit). Re-fetch shortly to let the numbers catch up, bounded so
      // a slow rebuild can't loop forever — the strip just shows near-current counts until next visit.
      if (data.stale && staleRetries > 0) {
        setTimeout(() => { if (myseq === progressReqSeq) loadModProgress(modPath, staleRetries - 1); }, 1800);
      }
    } catch (e) {
      if (myseq === progressReqSeq) wrap.hidden = true;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    initModSelector();

    // Refresh the progress strip when the active mod changes, and once on load. We must
    // wait until initModSelector (async) has populated REAL <option>s and settled on a
    // value — reading too early races against it and queries the wrong mod, which showed
    // up as an all-zeros strip for a mod that actually has content.
    const modSel = $("homeModSelector");
    if (modSel) {
      modSel.addEventListener("change", () => { loadModProgress(modSel.value); reflectFirstRun(); });
      let tries = 0;
      let lastSeen = null;
      (function waitForMod() {
        // A populated selector has a real option whose value is a path (not the
        // "Loading mods..." / placeholder option, which has an empty value).
        const ready = modSel.options.length > 0 && modSel.value && modSel.value.trim();
        if (ready) {
          // Debounce one extra tick in case initModSelector's own updateStatus() flips
          // the selection right after populating; only fire once the value is stable.
          if (modSel.value === lastSeen) { loadModProgress(modSel.value); reflectFirstRun(); return; }
          lastSeen = modSel.value;
        }
        if (tries++ < 25) setTimeout(waitForMod, 120);
      })();
    }

    initNewMod();

    const editCountryBtn = $("editCountryBtn");
    if (editCountryBtn) {
      editCountryBtn.addEventListener("click", async () => {
        if (window.focusEditor && window.focusEditor.pickFocusTreeFile) {
          try {
            const filePath = await window.focusEditor.pickFocusTreeFile();
            if (filePath) {
              localStorage.setItem("lastLoadedFocusFilePath", filePath);
              sessionStorage.setItem("sessionLoadedFocusFilePath", filePath);
              window.location.href = "index.html";
            }
          } catch (err) {
            console.error("Failed to pick focus tree file:", err);
          }
        } else {
          // Fallback when the desktop focus-file picker isn't available: go straight to Country Setup,
          // which has its own searchable country list. (A window.prompt() here returns null in the
          // Electron app, so the button would silently do nothing.)
          window.location.href = "country-setup.html";
        }
      });
    }

    initLanguagePicker();
    initBugReport();
    initAiSettings();
    initVanillaEditToggle();
    initSettingsModal();
    initGameFolder();
  });

  // ── ⛔ #nova-does-not-find-the-game — the Game folder: which one Nova reads the base game from, where it found it, and the
  // modder's own choice when it found none or the wrong copy. Nova has no folder dialog, so the address is pasted; the server
  // refuses a folder without hoi4.exe and says why. GET /api/settings/game-folder, POST { path } ("" = find it by itself).
  function gameFolderFoundLine(d) {
    if (d.source === "choice") return "You chose this folder.";
    if (d.source === "env") return "Set by HOI4_ROOT.";
    return d.where ? `Found in ${d.where}.` : "Found by Nova.";
  }
  function initGameFolder() {
    const text = $("gameFolderText"), from = $("gameFolderFrom"), missing = $("gameFolderMissing");
    const edit = $("gameFolderEdit"), input = $("gameFolderInput"), status = $("gameFolderStatus");
    const changeBtn = $("gameFolderChangeBtn"), saveBtn = $("gameFolderSaveBtn"), clearBtn = $("gameFolderClearBtn"), cancelBtn = $("gameFolderCancelBtn");
    if (!text || !edit || !input || !saveBtn) return;
    let current = null;
    const say = (msg, colour) => { if (status) { status.textContent = msg || ""; status.style.color = colour || "#8b949e"; } };
    const openEdit = () => {
      edit.hidden = false;
      input.value = (current && (current.choice || current.path)) || "";
      if (clearBtn) clearBtn.hidden = !(current && current.choice);
      say("");
      setTimeout(() => { try { input.focus(); input.select(); } catch (_) {} }, 20);
    };
    function show(d) {
      current = d || null;
      if (!d) { text.textContent = "Game folder: Nova could not ask where the game is."; return; }
      if (d.found) {
        text.textContent = `Game folder: ${d.path}${d.version ? `  (${d.version})` : ""}`;
        if (from) { from.hidden = false; from.textContent = gameFolderFoundLine(d) + (d.choiceProblem ? ` ${d.choiceProblem}` : ""); }
        if (missing) { missing.hidden = true; missing.innerHTML = ""; }
        if (changeBtn) changeBtn.textContent = "Change";
        return;
      }
      text.textContent = "Game folder: not found";
      if (from) { from.hidden = true; from.textContent = ""; }
      if (changeBtn) changeBtn.textContent = "Set it";
      if (!missing) return;
      const looked = (d.looked || []).map((c) => `<li><code>${escAttr(c.path)}</code> — ${escAttr(c.where)}: ${escAttr(c.reason)}</li>`).join("");
      missing.innerHTML =
        `<b>⚠ Nova could not find Hearts of Iron IV on this PC.</b>`
        + (d.choiceProblem ? ` ${escAttr(d.choiceProblem)}` : "")
        + ` It asked Steam's list of game libraries, Windows' list of installed programs and the usual folders on every drive, and none of them holds hoi4.exe.`
        + `<br><br><b>What this means:</b> the base game's content is missing from every maker — its technologies, focus trees, states, map, equipment and names — and Nova cannot check your mod against it, so a mod can look complete or broken here when it is not in the game.`
        + `<br><br><b>To fix it:</b> tell Nova where the game is. <button id="gameFolderSetBtn" class="game-folder-btn primary" type="button">Set the game folder</button>`
        + (looked ? `<details class="game-folder-looked"><summary>Where Nova looked</summary><ul>${looked}</ul></details>` : "");
      missing.hidden = false;
      const setBtn = $("gameFolderSetBtn");
      if (setBtn) setBtn.addEventListener("click", openEdit);
    }
    async function load() {
      try { show(await fetch("/api/settings/game-folder").then((r) => r.json())); }
      catch (e) { show(null); }
    }
    async function send(value) {
      saveBtn.disabled = true; if (clearBtn) clearBtn.disabled = true;
      say(value ? "Checking that folder…" : "Looking for the game…");
      const before = current && current.path;
      try {
        const r = await fetch("/api/settings/game-folder", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: value }),
        });
        const d = await r.json();
        if (!r.ok || !d.ok) { say("✗ " + ((d && d.error) || "Nova could not use that folder."), "#f85149"); return; }
        show(d);
        // A workspace that was the old game folder (Vanilla) follows the game to its new folder.
        if (before && d.path && normalizePath(getActiveModPath()) === normalizePath(before)) localStorage.setItem("activeModPath", d.path);
        try { await initModSelector(); } catch (_) {}
        if (d.found) {
          say(`✓ Nova now reads the base game from ${d.path}.` + (d.saved === false ? ` It could not remember this for next time: ${d.saveError}` : ""), d.saved === false ? "#d29922" : "#3fb950");
          edit.hidden = true;
        } else {
          say("Nova still cannot find the game by itself. Paste the folder's address above.", "#d29922");
        }
      } catch (e) {
        say("✗ " + ((e && e.message) || e), "#f85149");
      } finally {
        saveBtn.disabled = false; if (clearBtn) clearBtn.disabled = false;
      }
    }
    if (changeBtn) changeBtn.addEventListener("click", () => { if (edit.hidden) openEdit(); else edit.hidden = true; });
    if (cancelBtn) cancelBtn.addEventListener("click", () => { edit.hidden = true; say(""); });
    saveBtn.addEventListener("click", () => {
      const v = input.value.trim();
      if (!v) { say("Paste the address of the folder that holds hoi4.exe first.", "#d29922"); input.focus(); return; }
      send(v);
    });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); saveBtn.click(); } });
    if (clearBtn) clearBtn.addEventListener("click", () => send(""));
    load();
  }

  // ── 🐞 Report a bug ─────────────────────────────────────────────────────────────────────────────
  // Roadmap item 4, in the form that needs no infrastructure. Nova assembles the text; the user reads it;
  // the user sends it. Nothing leaves this machine on Nova's initiative, which is the point — see the note
  // at the top of nova-bug-report.js. #bug-report
  function initBugReport() {
    const btn = document.getElementById("bugPreviewBtn");
    const copy = document.getElementById("bugCopyBtn");
    const link = document.getElementById("bugIssueLink");
    const out = document.getElementById("bugReport");
    const what = document.getElementById("bugWhat");
    const st = document.getElementById("bugStatus");
    if (!btn || !out || !window.novaBugReport) return;

    const say = (msg, colour) => { if (st) { st.style.color = colour || "#8b949e"; st.textContent = msg; } };

    btn.addEventListener("click", async () => {
      btn.disabled = true;
      say("Building…");
      let text = "";
      try { text = await window.novaBugReport.build(what ? what.value : ""); }
      catch (e) { say("Couldn't build the report: " + (e.message || e), "#f85149"); btn.disabled = false; return; }
      out.value = text;
      out.hidden = false;
      if (copy) copy.hidden = false;
      if (link) {
        // The first line of what they typed makes a far better issue title than "Bug report".
        const firstLine = ((what && what.value) || "").split("\n")[0].trim().slice(0, 90);
        link.href = window.novaBugReport.issueUrl(text, firstLine);
        link.hidden = false;
      }
      // Read it before you send it — that instruction is the whole privacy model, so it is the status text.
      say("Ready. Read it through, then copy it or open an issue.", "#3fb950");
      btn.disabled = false;
    });

    if (copy) {
      copy.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(out.value);
          say("Copied — paste it into the Discord or a GitHub issue.", "#3fb950");
        } catch (_) {
          // Clipboard permission can be refused; selecting the text is always available.
          out.focus(); out.select();
          say("Couldn't reach the clipboard — the report is selected, press Ctrl+C.", "#d29922");
        }
      });
    }
  }

  // ── Interface language ──────────────────────────────────────────────────────────────────────────
  // Roadmap item 3. The picker is built from nova-i18n.js's own language list rather than from options
  // typed into the HTML, so adding a dictionary is one file plus one line in that list — never a hunt
  // through eleven pages. Each language is labelled in ITSELF ("Русский", not "Russian"), because someone
  // looking for their own language is looking for their own word for it.
  function initLanguagePicker() {
    const sel = document.getElementById("novaLangSelect");
    if (!sel || !window.novaI18n) return;
    sel.innerHTML = "";
    for (const l of window.novaI18n.languages) {
      const o = document.createElement("option");
      o.value = l.code;
      o.textContent = l.code === "en" ? l.label : `${l.label} · ${l.english}`;
      if (l.code === window.novaI18n.get()) o.selected = true;
      sel.appendChild(o);
    }
    // No reload: the runtime re-applies over the live DOM, and every element remembers its English, so
    // switching back and forth is lossless.
    sel.addEventListener("change", () => { window.novaI18n.set(sel.value); });
    const note = document.getElementById("novaLangNote");
    const syncNote = () => { if (note) note.hidden = window.novaI18n.get() === "en"; };
    syncNote();
    document.addEventListener("nova-i18n-applied", syncNote);
  }

  // #the-report-says-whether-its-copy-was-saved — what Collect diagnostics says of the copy it keeps in the HOI4 folder. The
  // server's savedPath is "" when that copy could not be written, and this said "Saved a copy to your HOI4 folder" anyway.
  function diagnosticsCopyLine(d) {
    if (d && d.savedPath) return `Saved a copy to ${d.savedPath}.`;
    const where = d && d.userDir ? ` (${d.userDir})` : "";
    return `Could not save a copy in your HOI4 folder${where}${d && d.saveError ? ": " + d.saveError : ""} — the box below is the only copy.`;
  }
  // #the-report-says-what-it-could-not-read, #nothing-to-report-keeps-the-last-report — the words and the colour of Collect's line. It said
  // a green "✓ Collected … Saved a copy" with nothing collected, and a log it could not read read as no log at all.
  function diagnosticsStatus(d) {
    const unread = (d && d.unread) || [];
    const couldNot = unread.length ? ` Could not read ${unread.slice(0, 3).join("; ")}${unread.length > 3 ? ` and ${unread.length - 3} more` : ""}.` : "";
    if (d && d.nothingToReport) {
      return { color: "#f0883e", text: `Nothing to report: Nova found no crash dump and no log it could read in ${d.userDir}.${couldNot}`
        + `${d.earlierReport ? ` Your earlier report is still in ${d.earlierReport}.` : ""} Launch Hearts of Iron IV, let it load or crash, then collect again.` };
    }
    return { color: d.crashCount || !d.savedPath || unread.length ? "#f0883e" : "#3fb950",
      text: `✓ Collected. ${d.crashCount} crash dump(s)${d.latestCrash ? " (latest: " + d.latestCrash + ")" : ""}. ${diagnosticsCopyLine(d)}${couldNot} Paste the box below to me.` };
  }

  // ── Settings popup (replaces the old scroll-to-section behaviour) ──
  function initSettingsModal() {
    const openBtn = $("openSettingsBtn");
    const modal = $("settingsModal");
    const closeBtn = $("settingsModalClose");
    if (!openBtn || !modal) return;
    const open = () => { modal.style.display = "flex"; };
    const close = () => { modal.style.display = "none"; };
    openBtn.addEventListener("click", (e) => { e.preventDefault(); open(); });
    if (closeBtn) closeBtn.addEventListener("click", close);
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); }); // backdrop click
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && modal.style.display === "flex") close(); });

    // Clear display cache — forces Nova to re-read icons/sprites/localisation from disk.
    const clearBtn = $("clearCacheBtn");
    const clearStatus = $("clearCacheStatus");
    if (clearBtn) {
      clearBtn.addEventListener("click", async () => {
        const orig = clearBtn.textContent;
        clearBtn.disabled = true; clearBtn.textContent = "Clearing…";
        if (clearStatus) clearStatus.textContent = "";
        try {
          const r = await fetch("/api/cache/clear", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
          const d = await r.json();
          if (!r.ok || !d.ok) throw new Error((d && d.error) || "Failed");
          if (clearStatus) { clearStatus.style.color = "#3fb950"; clearStatus.textContent = `✓ Cache cleared (${d.removed} file${d.removed === 1 ? "" : "s"}). Reopen any editor tab to see fresh icons/names.`; }
        } catch (err) {
          if (clearStatus) { clearStatus.style.color = "#f85149"; clearStatus.textContent = "Couldn't clear cache: " + ((err && err.message) || err); }
        } finally {
          clearBtn.disabled = false; clearBtn.textContent = orig;
        }
      });
    }

    // Collect HOI4 logs + crash dump into one report (the diagnostic tool).
    const diagBtn = $("collectDiagBtn");
    const diagCopy = $("copyDiagBtn");
    const diagOut = $("diagOutput");
    const diagStatus = $("collectDiagStatus");
    if (diagBtn) {
      diagBtn.addEventListener("click", async () => {
        const orig = diagBtn.textContent;
        diagBtn.disabled = true; diagBtn.textContent = "Collecting…";
        if (diagStatus) diagStatus.textContent = "";
        try {
          const r = await fetch("/api/diag/hoi4");
          const d = await r.json();
          if (!r.ok || !d.ok) throw new Error((d && d.error) || "Failed");
          if (diagOut) { diagOut.value = d.report || ""; diagOut.style.display = "block"; }
          if (diagCopy) diagCopy.style.display = "inline-block";
          if (diagStatus) {
            const said = diagnosticsStatus(d);
            diagStatus.style.color = said.color;
            diagStatus.textContent = said.text;
          }
        } catch (err) {
          if (diagStatus) { diagStatus.style.color = "#f85149"; diagStatus.textContent = "Couldn't collect: " + ((err && err.message) || err); }
        } finally {
          diagBtn.disabled = false; diagBtn.textContent = orig;
        }
      });
    }
    if (diagCopy && diagOut) {
      diagCopy.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(diagOut.value); diagCopy.textContent = "✓ Copied"; setTimeout(() => { diagCopy.textContent = "📋 Copy"; }, 1500); }
        catch (_) { diagOut.select(); document.execCommand("copy"); diagCopy.textContent = "✓ Copied"; setTimeout(() => { diagCopy.textContent = "📋 Copy"; }, 1500); }
      });
    }
  }

  // ── Advanced: allow editing the real vanilla game files (off by default) ──
  function initVanillaEditToggle() {
    const toggle = $("allowVanillaEditsToggle");
    const status = $("vanillaEditStatus");
    if (!toggle || !status) return;

    function setStatus(msg, kind) {
      status.textContent = msg;
      if (kind === "warn") { status.style.color = "#d29922"; status.style.background = "rgba(210,153,34,0.1)"; status.style.border = "1px solid rgba(210,153,34,0.4)"; }
      else { status.style.color = "#8b949e"; status.style.background = "rgba(13,17,23,0.6)"; status.style.border = "1px solid #21262d"; }
      status.style.display = msg ? "block" : "none";
    }

    // Sync the toggle to the server's current (per-session) state on load. Always show a status
    // line so the message reflects the setting: a calm grey "off" note, or the yellow warning when on.
    fetch("/api/settings/allow-vanilla-edits")
      .then((r) => r.json())
      .then((d) => {
        toggle.checked = Boolean(d && d.allowed);
        if (toggle.checked) setStatus("⚠ Vanilla editing is ON — Nova can write into your real game files. It resets to OFF next launch.", "warn");
        else setStatus("Vanilla editing is off — Nova only writes into mods (recommended).", "info");
      })
      .catch(() => {});

    toggle.addEventListener("change", async () => {
      const allowed = toggle.checked;
      if (allowed) {
        const okConfirm = window.confirm(
          "Allow editing the real Hearts of Iron IV game files?\n\n" +
          "Nova will be able to write directly into your installed game (not just mods). " +
          "Changes to vanilla files can affect every save and are undone by Steam's 'Verify integrity of game files'.\n\n" +
          "Only do this if you know what you're doing. Turn it on?"
        );
        if (!okConfirm) { toggle.checked = false; return; }
      }
      try {
        const r = await fetch("/api/settings/allow-vanilla-edits", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ allowed }),
        });
        const d = await r.json();
        if (d.error) throw new Error(d.error);
        toggle.checked = Boolean(d.allowed);
        if (d.allowed) setStatus("⚠ Vanilla editing is ON — Nova can now write into your real game files. It resets to OFF next launch.", "warn");
        else setStatus("Vanilla editing is off. Nova will only write into mods.", "info");
      } catch (e) {
        toggle.checked = false;
        setStatus("Couldn't update setting: " + (e.message || e), "warn");
      }
    });
  }

  // ── App-wide AI settings (Gemini key) ──────────────────────────────────
  // Shared with the Focus Editor's settings via the same localStorage keys, so a key set
  // here works in every maker and vice-versa.
  function initAiSettings() {
    const input = $("homeGeminiKey");
    const btn = $("homeVerifyKeyBtn");
    const status = $("homeGeminiStatus");
    if (!input || !btn || !status) return;

    function setStatus(msg, color) {
      status.textContent = msg;
      status.style.color = color;
      status.style.display = "block";
    }

    // Prefill from whichever key name is already stored.
    try { input.value = localStorage.getItem("geminiApiKey") || localStorage.getItem("gemini_api_key") || ""; } catch (e) {}
    input.addEventListener("input", () => { status.style.display = "none"; });

    btn.addEventListener("click", async () => {
      const apiKey = input.value.trim();
      if (!apiKey) { setStatus("Please paste an API key first.", "#ff7b72"); return; }
      // Save under BOTH key names the app reads, so it's picked up everywhere.
      try {
        localStorage.setItem("geminiApiKey", apiKey);
        localStorage.setItem("gemini_api_key", apiKey);
      } catch (e) {}
      btn.disabled = true;
      const original = btn.textContent;
      btn.textContent = "Verifying…";
      status.style.display = "none";
      try {
        const r = await fetch("/api/ai/verify-key", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKey }),
        });
        const data = await r.json();
        // Same reasoning as the Settings box: a model Google has retired is NOT a bad key, and reporting
        // it in red sends the user off to regenerate a key that was never the problem.
        // #verify-key-uses-stale-models
        if (data.modelFault) { setStatus("⚠ " + data.error, "#d29922"); return; }
        if (data.error) throw new Error(data.error);
        setStatus("✓ Key saved and verified — AI is ready in every tab."
          + (data.model ? " (answered by " + data.model + ")" : ""), "#3fb950");
      } catch (err) {
        setStatus("✗ " + (err.message || String(err)), "#ff7b72");
      } finally {
        btn.disabled = false;
        btn.textContent = original;
      }
    });
  }

  // ── First-run nudge ────────────────────────────────────────────────────
  // If the active workspace is Vanilla (read-only), the user has no mod of their own yet, so we
  // highlight the "Create a New Mod" hero. The badge is the single source of truth for vanilla-ness
  // (set by initModSelector's updateStatus), so we just read it rather than re-deriving.
  function reflectFirstRun() {
    const hero = $("newModHero");
    const badge = $("modStatusBadge");
    if (!hero || !badge) return;
    const onVanilla = /vanilla|offline/i.test(badge.className) || /vanilla/i.test(badge.textContent || "");
    hero.classList.toggle("is-firstrun", onVanilla);
  }

  // ── Create a New Mod ───────────────────────────────────────────────────
  // The front door for newcomers: makes a fresh, empty mod workspace (POST /api/mod/create), switches
  // the whole app to it, and points the user at the workflow stages. Mirrors the server's slugify so the
  // folder-name preview matches exactly.
  // #nonlatin-mod-name-slug — must stay byte-identical to server.js slugifyModName, or the folder shown in
  // the modal is not the folder created. A name written entirely in a non-Latin script strips to nothing, and
  // every such name used to collapse to the literal "new_mod" — so the first mod landed in a folder that
  // wasn't what the user typed and the second was refused outright. Folder names stay ASCII (HOI4's launcher
  // and descriptor `path=` are not reliably unicode-safe); descriptor.mod still carries the real name.
  function modNameHashSuffix(s) {
    let h = 0x811c9dc5; // FNV-1a, 32-bit — deterministic and identical in Node and the browser
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(36);
  }
  function slugPreview(name) {
    const raw = String(name || "");
    const ascii = raw.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48);
    if (ascii) return ascii;
    const trimmed = raw.trim();
    if (!trimmed) return "new_mod";
    return "mod_" + modNameHashSuffix(trimmed);
  }

  function initNewMod() {
    const modal = $("newModModal");
    const nameInput = $("newModName");
    const slugHint = $("newModSlugHint");
    const addonToggle = $("newModAddonToggle");
    const addonFields = $("newModAddonFields");
    const addonSelect = $("newModAddonSelect");
    const errBox = $("newModError");
    const createBtn = $("newModCreate");
    const cancelBtn = $("newModCancel");
    const closeBtn = $("newModClose");
    const formView = $("newModFormView");
    const successView = $("newModSuccessView");
    const successName = $("newModSuccessName");
    const goCountryBtn = $("newModGoCountry");
    const doneBtn = $("newModDone");
    const openers = [$("homeNewModBtn"), $("createNewModBtn")];
    if (!modal || !nameInput || !createBtn) return;

    function showErr(msg) {
      if (!errBox) return;
      if (!msg) { errBox.style.display = "none"; errBox.textContent = ""; return; }
      errBox.textContent = msg; errBox.style.display = "block";
    }

    // Two "screens" in one modal: the form, and the post-create confirmation. Showing the confirmation
    // in-place (instead of closing + a banner the user scrolls away from) keeps it where the eye already is.
    function showForm() { if (formView) formView.style.display = "block"; if (successView) successView.style.display = "none"; }
    function showSuccess(name) {
      if (successName) successName.textContent = `"${name}" is ready`;
      if (formView) formView.style.display = "none";
      if (successView) successView.style.display = "block";
    }

    async function populateAddons() {
      if (!addonSelect) return;
      try {
        const data = await fetch("/api/mods/list").then((r) => r.json());
        const mods = (data && data.mods) || [];
        // Exclude the vanilla pseudo-entry (you can't declare a dependency on the base game) — and any folder
        // with no descriptor.mod (#dep-without-descriptor). The <option> value is the descriptor NAME, which
        // is what HOI4 and Nova's own resolver match on; for a descriptor-less folder that "name" is just the
        // folder name, so depending on it wrote a descriptor pointing at nothing and failed silently. One
        // real Workshop folder on this machine is in that state. `!== false` so an older server that does not
        // send the flag keeps its current behaviour rather than showing an empty list.
        const opts = mods.filter((m) => !m.isVanilla && m.hasDescriptor !== false);
        addonSelect.innerHTML = "<option value=''>— choose a mod —</option>" +
          opts.map((m) => `<option value="${escAttr(m.name || "")}">${escAttr(m.name || m.path.split(/[\\/]/).pop())}</option>`).join("");
      } catch (_) {
        addonSelect.innerHTML = "<option value=''>— (couldn't load mods) —</option>";
      }
    }

    function open() {
      showErr("");
      showForm();
      nameInput.value = "";
      if (slugHint) slugHint.innerHTML = "";
      if (addonToggle) addonToggle.checked = false;
      if (addonFields) addonFields.classList.remove("show");
      if (addonSelect) addonSelect.value = "";
      populateAddons();
      modal.style.display = "flex";
      setTimeout(() => nameInput.focus(), 30);
    }
    function close() { modal.style.display = "none"; }

    openers.forEach((b) => b && b.addEventListener("click", (e) => { e.preventDefault(); open(); }));
    if (cancelBtn) cancelBtn.addEventListener("click", close);
    if (closeBtn) closeBtn.addEventListener("click", close);
    if (doneBtn) doneBtn.addEventListener("click", close);
    // The user chose "set up a country" as the next step → the active mod is the one we just made, and
    // Country Setup's ➕ Create Country adds a nation to it.
    if (goCountryBtn) goCountryBtn.addEventListener("click", () => { window.location.href = "country-setup.html"; });
    // …or a whole new world for it, as the second choice: most new mods add to the base game's world. map.html?world=1 opens the
    // 🌍 Generate a world confirm once the map has loaded, which says what it will do and asks — it never starts a run by itself.
    const goWorldBtn = $("newModGoWorld");
    if (goWorldBtn) goWorldBtn.addEventListener("click", () => { window.location.href = "map.html?world=1"; });
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); }); // backdrop click
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && modal.style.display === "flex") close(); });

    nameInput.addEventListener("input", () => {
      showErr("");
      const v = nameInput.value.trim();
      if (slugHint) slugHint.innerHTML = v ? `Creates the folder <code>${escAttr(slugPreview(v))}</code> in your mods directory.` : "";
    });
    nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); createBtn.click(); } });

    if (addonToggle && addonFields) {
      addonToggle.addEventListener("change", () => addonFields.classList.toggle("show", addonToggle.checked));
    }

    createBtn.addEventListener("click", async () => {
      const modName = nameInput.value.trim();
      if (!modName) { showErr("Please enter a name for your mod."); nameInput.focus(); return; }
      const wantsAddon = !!(addonToggle && addonToggle.checked);
      const dependencies = (wantsAddon && addonSelect && addonSelect.value) ? [addonSelect.value] : [];
      if (wantsAddon && !dependencies.length) { showErr("Pick which mod to build on top of, or turn off the add-on option."); return; }

      const orig = createBtn.textContent;
      createBtn.disabled = true; createBtn.textContent = "Creating…";
      showErr("");
      try {
        const r = await fetch("/api/mod/create", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modName, dependencies }),
        });
        const d = await r.json();
        if (!r.ok || d.error) throw new Error(d.error || "Couldn't create the mod.");
        // The server already switched its active root; mirror it in the browser so every tab follows.
        if (d.modRoot) localStorage.setItem("activeModPath", d.modRoot);
        // Flip the SAME modal to its confirmation screen (no close + scroll), then refresh Home behind it.
        showSuccess(modName);
        await onModCreated(modName, d.modRoot);
      } catch (err) {
        showErr((err && err.message) || String(err));
      } finally {
        createBtn.disabled = false; createBtn.textContent = orig;
      }
    });
  }

  async function onModCreated(modName, modRoot) {
    // Re-read the mod catalog so the new mod appears and is selected, refresh the progress strip, and
    // drop the first-run highlight. initModSelector re-selects from localStorage (already = modRoot).
    try { await initModSelector(); } catch (_) {}
    const sel = $("homeModSelector");
    if (sel && modRoot) { sel.value = modRoot; }
    reflectFirstRun();
    loadModProgress(modRoot || getActiveModPath());

    // A persistent on-page confirmation for AFTER the modal closes. We deliberately do NOT scroll —
    // the modal's own success view is the primary confirmation, and auto-scrolling used to carry the
    // user away from this banner before they could read it.
    const banner = $("newModSuccess");
    if (banner) {
      banner.innerHTML = `✅ <b>${escAttr(modName)}</b> is now your active workspace — everything you build saves into it.`;
      banner.style.display = "flex";
    }
  }
})();
