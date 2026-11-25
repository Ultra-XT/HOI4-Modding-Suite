/**
 * NOVA AI Field Assistant v1.0
 * Automatically injects ✨ AI assistant buttons next to labels of all input fields
 * across all editor pages, allowing natural language parsing into any field value.
 */
(function () {
  "use strict";

  // ---- Shared non-blocking info modal (replaces native alert() for "?" help popups).
  // Native alert() in Electron freezes the renderer and leaves text inputs un-focusable
  // until the window is re-activated. This DOM modal never traps focus.
  window.showNovaInfoModal = window.showNovaInfoModal || function (title, bodyHtml, refocusId) {
    const old = document.getElementById("novaInfoModalOverlay");
    if (old) old.remove();
    const prevFocus = document.activeElement;
    const ov = document.createElement("div");
    ov.id = "novaInfoModalOverlay";
    ov.style.cssText = "position:fixed; inset:0; z-index:2147483000; display:flex; align-items:center; justify-content:center; background:rgba(3,7,14,0.66); backdrop-filter:blur(2px); font-family:'Inter',system-ui,Segoe UI,sans-serif;";
    ov.innerHTML =
      '<div role="dialog" aria-modal="true" style="width:min(480px,92vw); max-height:82vh; overflow:auto;' +
      " background:linear-gradient(140deg,#1a3566 0%,#262a5e 48%,#2e1f55 100%); border:1px solid rgba(150,160,255,0.28);" +
      ' border-radius:14px; box-shadow:0 22px 66px rgba(0,0,0,0.6); padding:22px 22px 18px; color:#d7e1f5;">' +
        '<div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">' +
          '<svg width="22" height="22" viewBox="0 0 512 512" aria-hidden="true"><path d="M256 96 L296 216 L416 256 L296 296 L256 416 L216 296 L96 256 L216 216 Z" fill="#8ec5ff"/><circle cx="256" cy="256" r="20" fill="#eaf3ff"/></svg>' +
          '<h2 style="margin:0; font-size:17px; font-weight:600; color:#eaf3ff;">' + title + "</h2></div>" +
        '<div style="font-size:13px; line-height:1.6;">' + bodyHtml + "</div>" +
        '<button id="novaInfoModalClose" style="margin-top:16px; width:100%; padding:10px; background:linear-gradient(135deg,#3072e6 0%,#7a51d8 100%); border:none; border-radius:10px; color:#fff; font-size:14px; font-weight:600; cursor:pointer;">Got it</button>' +
      "</div>";
    document.body.appendChild(ov);
    function onKey(e) { if (e.key === "Escape") close(); }
    function close() {
      ov.remove();
      document.removeEventListener("keydown", onKey);
      try { (document.getElementById(refocusId) || prevFocus || document.body).focus(); } catch (_) {}
    }
    const btn = document.getElementById("novaInfoModalClose");
    if (btn) { btn.addEventListener("click", close); try { btn.focus(); } catch (_) {} }
    ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
    document.addEventListener("keydown", onKey);
  };

  // Shared non-blocking replacement for the native browser alert dialog. The native one freezes the
  // Electron renderer and can leave inputs un-focusable until the window is restarted. Routes through
  // showNovaInfoModal. Same one-arg shape — call sites just swap their alert( for nbAlert(.
  window.nbAlert = window.nbAlert || function (message, title) {
    const msg = String(message == null ? "" : message);
    const html = msg.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>");
    const t = title || (/\b(fail|failed|cannot|can.?t|could ?n.?t|could not|error|unable|invalid)\b/i.test(msg) ? "Something went wrong" : "Heads up");
    if (window.showNovaInfoModal) window.showNovaInfoModal(t, html);
    else if (window.console) window.console.warn(msg);
  };

  // Shared promise-based text prompt. CRITICAL: native window.prompt() returns null in Electron's
  // renderer (it's not implemented), so any feature that used it was a SILENT NO-OP in the desktop
  // app. Use this instead. Resolves to the trimmed string, or null if cancelled.
  // novaPrompt(title, message, opts?) → Promise<string|null>. opts: { placeholder, defaultValue }.
  window.novaPrompt = window.novaPrompt || function (title, message, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      const ov = document.createElement("div");
      ov.style.cssText = "position:fixed; inset:0; z-index:2147483300; display:flex; align-items:center; justify-content:center; background:rgba(3,7,14,0.66); backdrop-filter:blur(2px); font-family:'Inter',system-ui,sans-serif;";
      const msg = String(message == null ? "" : message).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>");
      ov.innerHTML =
        '<div role="dialog" aria-modal="true" style="width:min(440px,92vw); background:linear-gradient(140deg,#1a3566,#2e1f55); border:1px solid rgba(150,160,255,0.28); border-radius:14px; box-shadow:0 22px 66px rgba(0,0,0,0.6); padding:22px; color:#d7e1f5;">' +
          '<h2 style="margin:0 0 8px; font-size:17px; color:#eaf3ff;">' + String(title || "") + "</h2>" +
          (msg ? '<div style="font-size:13px; line-height:1.5; margin:0 0 12px; color:#c4cdec;">' + msg + "</div>" : "") +
          '<input type="text" autocomplete="off" spellcheck="false" style="width:100%; box-sizing:border-box; padding:9px 10px; background:#0d1117; border:1px solid #30363d; color:#e6edf3; border-radius:8px; font-size:14px; outline:none;" />' +
          '<div style="display:flex; gap:10px; justify-content:flex-end; margin-top:16px;">' +
            '<button data-act="cancel" style="padding:9px 16px; background:rgba(255,255,255,0.10); border:1px solid rgba(150,160,255,0.3); border-radius:10px; color:#eaf3ff; font-size:13px; font-weight:600; cursor:pointer;">Cancel</button>' +
            '<button data-act="ok" style="padding:9px 16px; background:linear-gradient(135deg,#3072e6 0%,#7a51d8 100%); border:none; border-radius:10px; color:#fff; font-size:13px; font-weight:600; cursor:pointer;">OK</button>' +
          "</div>" +
        "</div>";
      document.body.appendChild(ov);
      const input = ov.querySelector("input");
      if (opts.defaultValue) input.value = opts.defaultValue;
      if (opts.placeholder) input.placeholder = opts.placeholder;
      setTimeout(() => { try { input.focus(); input.select(); } catch (_) {} }, 0);
      const close = (val) => { ov.remove(); document.removeEventListener("keydown", onKey, true); resolve(val); };
      const onKey = (e) => { if (e.key === "Enter") { e.preventDefault(); close(input.value.trim()); } else if (e.key === "Escape") { e.preventDefault(); close(null); } };
      document.addEventListener("keydown", onKey, true);
      ov.querySelector('[data-act="ok"]').addEventListener("click", () => close(input.value.trim()));
      ov.querySelector('[data-act="cancel"]').addEventListener("click", () => close(null));
      ov.addEventListener("mousedown", (e) => { if (e.target === ov) close(null); });
    });
  };

  // Shared non-blocking confirm. Native confirm() works in Electron but BLOCKS the renderer; this
  // can't return synchronously, so it takes an onYes callback. opts: { title, yesLabel, cancelLabel,
  // danger }. Esc / Cancel / click-outside = no-op. Replace `if (!confirm(m)) return; <rest>` with
  // `window.novaConfirm(m, () => { <rest> }, opts);`.
  window.novaConfirm = window.novaConfirm || function (message, onYes, opts) {
    opts = opts || {};
    const existing = document.getElementById("novaConfirmModalOverlay");
    if (existing) existing.remove();
    const prevFocus = document.activeElement;
    const ov = document.createElement("div");
    ov.id = "novaConfirmModalOverlay";
    ov.style.cssText = "position:fixed; inset:0; z-index:2147483300; display:flex; align-items:center; justify-content:center; background:rgba(3,7,14,0.66); backdrop-filter:blur(2px); font-family:'Inter',system-ui,sans-serif;";
    const msg = String(message == null ? "" : message).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>");
    const title = opts.title || "Please confirm";
    const yesLabel = opts.yesLabel || "Yes";
    const cancelLabel = opts.cancelLabel || "Cancel";
    const yesBg = opts.danger ? "linear-gradient(135deg,#d94c2c,#a3321b)" : "linear-gradient(135deg,#3072e6 0%,#7a51d8 100%)";
    ov.innerHTML =
      '<div role="dialog" aria-modal="true" style="width:min(440px,92vw); background:linear-gradient(140deg,#1a3566,#2e1f55); border:1px solid rgba(150,160,255,0.28); border-radius:14px; box-shadow:0 22px 66px rgba(0,0,0,0.6); padding:22px; color:#d7e1f5;">' +
        '<h2 style="margin:0 0 8px; font-size:17px; color:#eaf3ff;">' + title + "</h2>" +
        '<div style="font-size:13px; line-height:1.55; margin:0 0 18px; color:#c4cdec;">' + msg + "</div>" +
        '<div style="display:flex; gap:10px; justify-content:flex-end;">' +
          '<button data-act="cancel" style="padding:9px 16px; background:rgba(255,255,255,0.10); border:1px solid rgba(150,160,255,0.3); border-radius:10px; color:#eaf3ff; font-size:13px; font-weight:600; cursor:pointer;">' + cancelLabel + "</button>" +
          '<button data-act="ok" style="padding:9px 16px; background:' + yesBg + '; border:none; border-radius:10px; color:#fff; font-size:13px; font-weight:600; cursor:pointer;">' + yesLabel + "</button>" +
        "</div>" +
      "</div>";
    document.body.appendChild(ov);
    const close = () => { ov.remove(); document.removeEventListener("keydown", onKey, true); try { (prevFocus || document.body).focus(); } catch (_) {} };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey, true);
    ov.addEventListener("mousedown", (e) => { if (e.target === ov) close(); });
    ov.querySelector('[data-act="ok"]').addEventListener("click", () => { close(); try { onYes && onYes(); } catch (err) { if (window.console) window.console.error(err); } });
    // `opts.onCancel` runs when the CANCEL BUTTON is pressed — for a dialog whose two buttons are two real
    // choices rather than do-it / don't. Escape and a backdrop click deliberately do NOT run it: those mean
    // "dismiss", and a dismissal must never perform an action the user did not press a button for.
    ov.querySelector('[data-act="cancel"]').addEventListener("click", () => {
      close();
      try { opts.onCancel && opts.onCancel(); } catch (err) { if (window.console) window.console.error(err); }
    });
    setTimeout(() => { const y = ov.querySelector('[data-act="ok"]'); if (y) y.focus(); }, 0);
  };

  // Standard "How does the AI work?" help body, shared by every maker's "?" button.
  window.showNovaAiHelpModal = window.showNovaAiHelpModal || function (refocusId) {
    window.showNovaInfoModal("How does the AI work?",
      '<p style="margin:0 0 10px;">The AI features turn your plain-English descriptions into valid Hearts of Iron IV script, auto-filled into the editor. They run on Google’s Gemini.</p>' +
      '<p style="margin:0 0 6px; color:#9fb6ff; font-weight:600;">Get a free Gemini API key:</p>' +
      '<ol style="margin:0 0 0 18px; padding:0; line-height:1.7;">' +
        '<li>Open <a href="https://aistudio.google.com/" target="_blank" rel="noopener" style="color:#8ec5ff;">Google AI Studio</a> and sign in with any Google account.</li>' +
        "<li>Click <b>Get API key</b> → <b>Create API key</b> (free) and copy it.</li>" +
        "<li>On the Home page, paste it into the Gemini API Key box and click <b>Verify &amp; Save</b>.</li>" +
      "</ol>" +
      '<p style="margin:10px 0 0; color:#a6acd0; font-size:12px;">Once saved, the AI works on every tool.</p>',
      refocusId);
  };

  function showCustomPrompt(title, placeholder = "") {
    return new Promise((resolve) => {
      // Singleton: never stack multiple prompts (clicking ✨AI repeatedly used to spawn a new one each
      // time). Replace any existing prompt instead of layering.
      const existing = document.getElementById("novaCustomPromptOverlay");
      if (existing) existing.remove();
      // Create overlay
      const overlay = document.createElement("div");
      overlay.id = "novaCustomPromptOverlay";
      // Top-most: above the CF editor (2147483200) and the token picker (2147483300) so the prompt is
      // never trapped behind the dialog that opened it.
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(6, 9, 13, 0.82);
        backdrop-filter: blur(8px) saturate(180%);
        -webkit-backdrop-filter: blur(8px) saturate(180%);
        z-index: 2147483600;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.2s ease;
      `;

      // Create modal content box
      const modalBox = document.createElement("div");
      modalBox.style.cssText = `
        background-color: #0b0f17;
        background-image: radial-gradient(at 0% 0%, rgba(30, 41, 59, 0.15) 0px, transparent 50%), radial-gradient(at 100% 0%, rgba(56, 189, 248, 0.05) 0px, transparent 50%);
        padding: 24px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 14px;
        width: 90%;
        max-width: 480px;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.05) inset;
        transform: translateY(20px);
        transition: transform 0.2s ease;
      `;

      // Header
      const header = document.createElement("div");
      header.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        padding-bottom: 10px;
      `;

      const titleEl = document.createElement("h2");
      titleEl.style.cssText = `
        margin: 0;
        font-size: 16px;
        font-weight: 700;
        color: #f1f5f9;
        letter-spacing: 0.01em;
      `;
      titleEl.textContent = title;

      const closeBtn = document.createElement("span");
      closeBtn.style.cssText = `
        color: #94a3b8;
        font-size: 20px;
        font-weight: 400;
        cursor: pointer;
        line-height: 1;
        transition: all 0.2s ease;
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.03);
      `;
      closeBtn.innerHTML = "&times;";
      closeBtn.addEventListener("mouseenter", () => {
        closeBtn.style.color = "#f1f5f9";
        closeBtn.style.background = "rgba(255, 255, 255, 0.08)";
      });
      closeBtn.addEventListener("mouseleave", () => {
        closeBtn.style.color = "#94a3b8";
        closeBtn.style.background = "rgba(255, 255, 255, 0.03)";
      });

      header.appendChild(titleEl);
      header.appendChild(closeBtn);

      // Textarea input
      const textarea = document.createElement("textarea");
      textarea.style.cssText = `
        width: 100%;
        box-sizing: border-box;
        padding: 12px;
        font-size: 13px;
        background: #111827;
        border: 1px solid rgba(255, 255, 255, 0.08);
        color: #f1f5f9;
        border-radius: 8px;
        margin-bottom: 16px;
        outline: none;
        transition: all 0.25s ease;
        min-height: 80px;
        resize: vertical;
        font-family: inherit;
      `;
      textarea.placeholder = placeholder;
      textarea.addEventListener("focus", () => {
        textarea.style.borderColor = "#8c60ce";
        textarea.style.boxShadow = "0 0 0 2px rgba(140, 96, 206, 0.2)";
      });
      textarea.addEventListener("blur", () => {
        textarea.style.borderColor = "rgba(255, 255, 255, 0.08)";
        textarea.style.boxShadow = "none";
      });

      // Actions footer
      const footer = document.createElement("div");
      footer.style.cssText = `
        display: flex;
        justify-content: flex-end;
        gap: 10px;
      `;

      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.style.cssText = `
        padding: 8px 16px;
        background: #1f2937;
        border: 1px solid #374151;
        color: #f1f5f9;
        cursor: pointer;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 600;
        transition: background 0.15s;
      `;
      cancelBtn.textContent = "Cancel";
      cancelBtn.addEventListener("mouseenter", () => cancelBtn.style.background = "#374151");
      cancelBtn.addEventListener("mouseleave", () => cancelBtn.style.background = "#1f2937");

      const submitBtn = document.createElement("button");
      submitBtn.type = "button";
      submitBtn.style.cssText = `
        padding: 8px 16px;
        background: #5d3b8e;
        border: 1px solid #8c60ce;
        color: #fff;
        cursor: pointer;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 600;
        transition: background 0.15s;
      `;
      submitBtn.textContent = "Confirm";
      submitBtn.addEventListener("mouseenter", () => submitBtn.style.background = "#6b45a3");
      submitBtn.addEventListener("mouseleave", () => submitBtn.style.background = "#5d3b8e");

      footer.appendChild(cancelBtn);
      footer.appendChild(submitBtn);

      modalBox.appendChild(header);
      modalBox.appendChild(textarea);
      modalBox.appendChild(footer);
      overlay.appendChild(modalBox);
      document.body.appendChild(overlay);

      // Trigger animations
      setTimeout(() => {
        overlay.style.opacity = "1";
        modalBox.style.transform = "translateY(0)";
        textarea.focus();
      }, 20);

      // Cleanup helper
      function cleanup() {
        overlay.style.opacity = "0";
        overlay.style.pointerEvents = "none"; // never trap clicks while fading out
        modalBox.style.transform = "translateY(20px)";
        setTimeout(() => {
          if (overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
          }
        }, 200);
      }

      // Close handlers
      const handleCancel = () => {
        cleanup();
        resolve(null);
      };

      const handleSubmit = () => {
        const value = textarea.value;
        cleanup();
        resolve(value);
      };

      closeBtn.addEventListener("click", handleCancel);
      cancelBtn.addEventListener("click", handleCancel);
      submitBtn.addEventListener("click", handleSubmit);

      textarea.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          handleSubmit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          handleCancel();
        }
      });

      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) {
          handleCancel();
        }
      });
    });
  }

  window.showCustomPrompt = showCustomPrompt;

  // Whether a field's AI request needs the heavy Paradox-script guidance (effects/modifiers) or is
  // pure text (name/description/id/value/percentage/traits/equipment). Text requests pass
  // needsScript:false so the server skips ~45KB of command vocab + cheat sheet they never use.
  window.novaFieldNeedsScript = function (type) { return type === "effects" || type === "modifiers" || type === "triggers"; };

  // ---- Command picker: browse the authoritative HOI4 token list (CWTools-derived) ----------
  // Fetches /api/reference/hoi4-spec once and lets the user search + click a real effect /
  // trigger / modifier name instead of memorizing it. Inserts "<name> = " at the field cursor.
  let _hoi4SpecCache = null;
  async function fetchHoi4Spec() {
    if (_hoi4SpecCache) return _hoi4SpecCache;
    try {
      const r = await fetch("/api/reference/hoi4-spec");
      const j = await r.json();
      _hoi4SpecCache = { effects: j.effects || [], triggers: j.triggers || [], modifiers: j.modifiers || [] };
    } catch (_) {
      _hoi4SpecCache = { effects: [], triggers: [], modifiers: [] };
    }
    return _hoi4SpecCache;
  }

  function insertTokenAtCursor(el, name, isBlock) {
    if (!el) return;
    try { el.focus(); } catch (_) {}
    const start = typeof el.selectionStart === "number" ? el.selectionStart : el.value.length;
    const end = typeof el.selectionEnd === "number" ? el.selectionEnd : el.value.length;
    const before = el.value.slice(0, start);
    const after = el.value.slice(end);
    const nl = before && !/\n$/.test(before) ? "\n" : ""; // start on its own line
    let ins, caret;
    if (isBlock) {
      // A block-shaped command (set_capital, country_event, if, …): scaffold the braces and drop the
      // cursor on the indented line inside, ready for the arguments.
      ins = nl + name + " = {\n\t\n}";
      caret = (before + nl + name + " = {\n\t").length;
    } else {
      ins = nl + name + " = ";
      caret = (before + ins).length;
    }
    el.value = before + ins + after;
    try { el.selectionStart = el.selectionEnd = caret; } catch (_) {}
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  const _TAB_LABELS = { effects: "Effects", triggers: "Triggers &amp; Conditions", modifiers: "Modifiers" };

  // showNovaTokenPicker({ defaultTab, allowTabs, onPick }) — opens the modal; calls onPick(name).
  window.showNovaTokenPicker = async function (opts) {
    opts = opts || {};
    const allow = (opts.allowTabs && opts.allowTabs.length ? opts.allowTabs : ["effects", "triggers", "modifiers"]).filter(
      (t) => _TAB_LABELS[t]
    );
    let activeTab = opts.defaultTab && allow.includes(opts.defaultTab) ? opts.defaultTab : allow[0];
    const spec = await fetchHoi4Spec();
    const prevFocus = document.activeElement;

    const ov = document.createElement("div");
    ov.id = "novaTokenPickerOverlay";
    ov.style.cssText =
      "position:fixed; inset:0; z-index:2147483300; display:flex; align-items:center; justify-content:center; background:rgba(3,7,14,0.66); backdrop-filter:blur(2px); font-family:'Inter',system-ui,Segoe UI,sans-serif;";
    const tabsHtml = allow
      .map(
        (t) =>
          '<button type="button" data-tab="' +
          t +
          '" style="padding:6px 12px; border-radius:8px; border:1px solid rgba(150,160,255,0.3); background:rgba(255,255,255,0.06); color:#cfd9f5; font-size:12px; font-weight:600; cursor:pointer;">' +
          _TAB_LABELS[t] +
          "</button>"
      )
      .join("");
    ov.innerHTML =
      '<div role="dialog" aria-modal="true" style="width:min(660px,94vw); max-height:84vh; display:flex; flex-direction:column;' +
      " background:linear-gradient(140deg,#1a3566 0%,#262a5e 48%,#2e1f55 100%); border:1px solid rgba(150,160,255,0.28);" +
      ' border-radius:14px; box-shadow:0 22px 66px rgba(0,0,0,0.6); padding:18px; color:#d7e1f5;">' +
      '<div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">' +
      '<h2 style="margin:0; font-size:16px; font-weight:600; color:#eaf3ff;">Insert a HOI4 command</h2>' +
      '<span style="font-size:11px; color:#9fb6ff;">official names — click one to insert</span>' +
      '<span style="flex:1"></span>' +
      '<button data-act="close" aria-label="Close" style="background:none; border:none; color:#aab6e0; font-size:20px; line-height:1; cursor:pointer;">&times;</button>' +
      "</div>" +
      '<div data-tabs style="display:flex; gap:8px; margin-bottom:10px; flex-wrap:wrap;">' + tabsHtml + "</div>" +
      '<input data-search type="text" autocomplete="off" spellcheck="false" placeholder="Search…" ' +
      'style="width:100%; box-sizing:border-box; padding:9px 10px; background:#0d1117; border:1px solid #30363d; color:#e6edf3; border-radius:8px; font-size:13px; outline:none; margin-bottom:8px;" />' +
      '<div data-count style="font-size:11px; color:#9aa6cf; margin-bottom:6px;"></div>' +
      '<div data-list style="overflow:auto; flex:1; border:1px solid rgba(150,160,255,0.16); border-radius:10px; background:rgba(0,0,0,0.18);"></div>' +
      "</div>";
    document.body.appendChild(ov);

    const dlg = ov.firstChild;
    const searchEl = ov.querySelector("[data-search]");
    const listEl = ov.querySelector("[data-list]");
    const countEl = ov.querySelector("[data-count]");
    const tabBtns = Array.from(ov.querySelectorAll("[data-tab]"));

    function close() {
      ov.remove();
      document.removeEventListener("keydown", onKey, true);
      try { (prevFocus || document.body).focus(); } catch (_) {}
    }
    function onKey(e) { if (e.key === "Escape") { e.preventDefault(); close(); } }
    document.addEventListener("keydown", onKey, true);
    ov.addEventListener("mousedown", (e) => { if (e.target === ov) close(); });
    ov.querySelector('[data-act="close"]').addEventListener("click", close);

    function paintTabs() {
      tabBtns.forEach((b) => {
        const on = b.dataset.tab === activeTab;
        b.style.background = on ? "linear-gradient(135deg,#3072e6,#7a51d8)" : "rgba(255,255,255,0.06)";
        b.style.color = on ? "#fff" : "#cfd9f5";
        b.style.borderColor = on ? "transparent" : "rgba(150,160,255,0.3)";
      });
    }
    const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    // Recently-used commands (per type) so a giant mod's repeated effects/triggers are one click away.
    const RECENT_MAX = 8;
    const recentKey = (tab) => "nova_picker_recent_" + tab;
    function getRecent(tab) { try { const a = JSON.parse(localStorage.getItem(recentKey(tab)) || "[]"); return Array.isArray(a) ? a : []; } catch (_) { return []; } }
    function addRecent(tab, name) { try { let a = getRecent(tab).filter((n) => n !== name); a.unshift(name); localStorage.setItem(recentKey(tab), JSON.stringify(a.slice(0, RECENT_MAX))); } catch (_) {} }
    const rowHtml = (x) =>
      '<div data-name="' + esc(x.name) + '" data-block="' + (x.block ? "1" : "0") + '" role="button" tabindex="0" style="padding:8px 11px; border-bottom:1px solid rgba(150,160,255,0.08); cursor:pointer;">' +
      '<div style="display:flex; align-items:baseline; gap:8px;">' +
      '<code style="color:#9fe0ff; font-size:13px; font-weight:600;">' + esc(x.name) + "</code>" +
      (x.block ? '<span title="takes a block" style="font-size:10px; color:#9fe0ff; opacity:0.65; font-family:monospace;">{ }</span>' : "") +
      (x.scope ? '<span style="font-size:10px; color:#c0a6ff; background:rgba(150,120,255,0.14); border-radius:6px; padding:1px 6px;">' + esc(x.scope) + "</span>" : "") +
      "</div>" +
      (x.desc ? '<div style="font-size:11.5px; color:#aab6e0; margin-top:2px; line-height:1.4;">' + esc(x.desc) + "</div>" : "") +
      "</div>";
    const groupHeader = (label) =>
      '<div style="padding:5px 11px; font-size:10px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:#8aa0d8; background:rgba(255,255,255,0.03);">' + label + "</div>";
    function render() {
      const q = searchEl.value.trim().toLowerCase();
      const all = spec[activeTab] || [];
      const matches = q ? all.filter((x) => x.name.toLowerCase().includes(q) || (x.desc || "").toLowerCase().includes(q)) : all;
      const CAP = Infinity; // show ALL — measured cheap for text rows
      const shown = matches.slice(0, CAP);
      countEl.textContent =
        matches.length + " " + activeTab + (matches.length === 1 ? "" : "") + (matches.length > CAP ? "  (showing first " + CAP + " — refine search)" : "");
      if (!shown.length) {
        listEl.innerHTML = '<div style="padding:18px; text-align:center; color:#9aa6cf; font-size:13px;">No matching ' + activeTab + ".</div>";
        return;
      }
      listEl.innerHTML = shown
        .map(
          (x) =>
            '<div data-name="' + esc(x.name) + '" data-block="' + (x.block ? "1" : "0") + '" role="button" tabindex="0" style="padding:8px 11px; border-bottom:1px solid rgba(150,160,255,0.08); cursor:pointer;">' +
            '<div style="display:flex; align-items:baseline; gap:8px;">' +
            '<code style="color:#9fe0ff; font-size:13px; font-weight:600;">' + esc(x.name) + "</code>" +
            (x.block ? '<span title="takes a { } block" style="font-size:10px; color:#9fe0ff; opacity:0.65; font-family:monospace;">{ }</span>' : "") +
            (x.scope ? '<span style="font-size:10px; color:#c0a6ff; background:rgba(150,120,255,0.14); border-radius:6px; padding:1px 6px;">' + esc(x.scope) + "</span>" : "") +
            "</div>" +
            (x.desc ? '<div style="font-size:11.5px; color:#aab6e0; margin-top:2px; line-height:1.4;">' + esc(x.desc) + "</div>" : "") +
            "</div>"
        )
        .join("");
      // When not searching, prepend a "Recently used" shortcut group (re-renders over the full list).
      if (!q) {
        const byName = new Map(all.map((x) => [x.name, x]));
        const recent = getRecent(activeTab).map((n) => byName.get(n)).filter(Boolean);
        if (recent.length) {
          const recentSet = new Set(recent.map((r) => r.name));
          listEl.innerHTML =
            groupHeader("Recently used") + recent.map(rowHtml).join("") +
            groupHeader("All " + activeTab) + shown.filter((x) => !recentSet.has(x.name)).map(rowHtml).join("");
        }
      }
    }
    function pick(name, block) {
      addRecent(activeTab, name);
      try { opts.onPick && opts.onPick(name, block); } catch (e) { if (window.console) window.console.error(e); }
      close();
    }
    listEl.addEventListener("click", (e) => {
      const row = e.target.closest("[data-name]");
      if (row) pick(row.getAttribute("data-name"), row.getAttribute("data-block") === "1");
    });
    listEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const row = e.target.closest("[data-name]");
        if (row) { e.preventDefault(); pick(row.getAttribute("data-name"), row.getAttribute("data-block") === "1"); }
      }
    });
    // Keyboard navigation: a highlighted row, ArrowUp/Down to move, Enter to insert it.
    let hi = 0;
    const rowEls = () => [...listEl.querySelectorAll("[data-name]")];
    function applyHi() {
      const els = rowEls();
      if (!els.length) { hi = 0; return; }
      hi = Math.max(0, Math.min(hi, els.length - 1));
      els.forEach((el, i) => { el.style.background = i === hi ? "rgba(120,140,255,0.20)" : ""; });
      try { els[hi].scrollIntoView({ block: "nearest" }); } catch (_) {}
    }
    function rerender() { render(); hi = 0; applyHi(); }
    listEl.addEventListener("mousemove", (e) => {
      const row = e.target.closest("[data-name]");
      if (!row) return;
      const i = rowEls().indexOf(row);
      if (i >= 0 && i !== hi) { hi = i; applyHi(); }
    });
    searchEl.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); hi++; applyHi(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); hi--; applyHi(); }
      else if (e.key === "Enter") {
        e.preventDefault();
        const el = rowEls()[hi];
        if (el) pick(el.getAttribute("data-name"), el.getAttribute("data-block") === "1");
      }
    });
    tabBtns.forEach((b) =>
      b.addEventListener("click", () => { activeTab = b.dataset.tab; paintTabs(); rerender(); searchEl.focus(); })
    );
    searchEl.addEventListener("input", rerender);
    paintTabs();
    rerender();
    setTimeout(() => { try { searchEl.focus(); } catch (_) {} }, 0);
  };

  const AI_TARGETS = [
    // Focus Editor
    { selector: "#sb-focus-name", type: "name", labelText: "Name" },
    { selector: "#sb-focus-desc", type: "description", labelText: "Description" },
    { selector: "#sb-focus-selecteffect", type: "effects", labelText: "Select Effect" },
    
    // National Spirit Maker
    { selector: "#ideaId", type: "id", labelText: "Spirit ID" },
    { selector: "#ideaName", type: "name", labelText: "Name" },
    { selector: "#ideaDescription", type: "description", labelText: "Description" },
    { selector: "#ideaModifiers", type: "modifiers", labelText: "Modifiers" },
    { selector: "#ideaEquipment", type: "equipment", labelText: "Equipment Modifiers" },
    // National Spirit Maker — ADVANCED script fields (the on-add effect + condition triggers).
    // These were missing, so the Spirits "advanced" section had no AI while the equivalent
    // Decision/Event script fields did. Bridges them into the same shared AI assist as every
    // other maker's script fields (and they already have the Genesis "plain English" preview).
    { selector: "#ideaOnAdd", type: "effects", labelText: "On-Add Effect" },
    { selector: "#ideaAvailable", type: "effects", labelText: "Available Trigger" },
    { selector: "#ideaAllowed", type: "effects", labelText: "Allowed Trigger" },
    { selector: "#ideaVisible", type: "effects", labelText: "Visible Trigger" },
    { selector: "#ideaAllowedCivilWar", type: "effects", labelText: "Allowed in Civil War" },
    { selector: "#ideaResearchBonus", type: "modifiers", labelText: "Research Bonus" },

    // Research / Tech Maker (advanced script fields — exactly what the AI is for)
    { selector: "#techModifiers", type: "modifiers", labelText: "Tech Modifiers" },
    { selector: "#techExtraScript", type: "effects", labelText: "Extra Script" },
    { selector: "#techAiWillDo", type: "effects", labelText: "AI Will Do" },

    // Event Maker
    { selector: "#eventId", type: "id", labelText: "Event ID" },
    { selector: "#eventTitle", type: "name", labelText: "Title" },
    { selector: "#eventDescription", type: "description", labelText: "Description" },
    { selector: "#eventOptionName", type: "name", labelText: "Option Title" },
    { selector: ".opt-name", type: "id", labelText: "Option ID" },
    { selector: ".opt-title", type: "name", labelText: "Option Title" },
    { selector: ".opt-script", type: "effects", labelText: "Option Effect" },
    { selector: ".opt-trigger", type: "effects", labelText: "Option Trigger" },

    // Event Maker Advanced
    { selector: "#eventTrigger", type: "effects", labelText: "Trigger Condition" },
    { selector: "#eventImmediate", type: "effects", labelText: "Immediate Effect" },
    { selector: "#eventAfter", type: "effects", labelText: "After Effect" },
    
    // Decision Maker
    { selector: "#decisionId", type: "id", labelText: "Decision ID" },
    { selector: "#decisionName", type: "name", labelText: "Decision Name" },
    { selector: "#decisionAvailable", type: "effects", labelText: "Available Trigger" },
    { selector: "#decisionAllowed", type: "effects", labelText: "Allowed Trigger" },
    { selector: "#decisionModifier", type: "modifiers", labelText: "Modifier" },
    { selector: "#decisionEffect", type: "effects", labelText: "Effect" },
    { selector: "#decisionTargetTrigger", type: "effects", labelText: "Target Trigger" },
    { selector: "#decisionRemoveEffect", type: "effects", labelText: "Remove Effect" },
    { selector: "#decisionActivation", type: "effects", labelText: "Activation Trigger" },
    { selector: "#decisionCancelTrigger", type: "effects", labelText: "Cancel Trigger" },

    // Character Maker
    { selector: "#chToken", type: "id", labelText: "Token" },
    { selector: "#chName", type: "name", labelText: "Name" },
    // (#leaderIdeology uses a "Choose…" picker of the mod's real sub-ideologies instead of an AI button.)
    { selector: "#leaderTraits", type: "traits", labelText: "Traits" },
    { selector: "#advisorTraits", type: "traits", labelText: "Traits" },
    { selector: "#generalTraits", type: "traits", labelText: "Traits" },
  ];

  function getSystemPrompt(type, labelText, context) {
    const contextString = context ? `\n\nContext details of other form fields on this page:\n${context}` : "";
    
    switch (type) {
      case "id":
        return `You are a Master-Level Hearts of Iron IV (HOI4) Modding AI.
Your ONLY purpose is to translate user requests into a valid script ID or token key for a ${labelText}.
CRITICAL: Use only lowercase alphanumeric characters and underscores. Keep it short and concise (e.g., ger_military_focus, land_doctrine_bonus).
CRITICAL: Output ONLY the raw ID string. No quotes, no markdown, no explanations, no chat.${contextString}`;
      
      case "name":
        return `You are a Master-Level Hearts of Iron IV (HOI4) Modding AI.
Your ONLY purpose is to translate user requests into a short, immersive, thematic in-game name or title for a ${labelText}.
CRITICAL: Keep it short (usually 2 to 5 words). Do not wrap in quotes or use markdown formatting.
CRITICAL: Output ONLY the raw name string. No explanations, no chatter.${contextString}`;
      
      case "description":
        return `You are a Master-Level Hearts of Iron IV (HOI4) Modding AI.
Your ONLY purpose is to write historically immersive, thematic, or descriptive flavor text for a ${labelText}.
CRITICAL: Keep it to 1 to 3 engaging sentences. Do not wrap in quotes or markdown.
CRITICAL: Output ONLY the raw text block.${contextString}`;

      case "modifiers":
        return `You are a Master-Level Hearts of Iron IV (HOI4) Modding AI.
Your ONLY purpose is to translate the user's request into valid, machine-readable Hearts of Iron IV Paradox script modifiers (e.g., stability = 0.05, political_power_gain = 0.1).
CRITICAL: Output ONLY raw lines of script. DO NOT wrap in brackets or braces. No explanations, no markdown codeblocks.${contextString}`;

      case "effects":
        return `You are a Master-Level Hearts of Iron IV (HOI4) Modding AI.
Your ONLY purpose is to translate the user's request into valid, machine-readable Hearts of Iron IV Paradox script effects (e.g., add_political_power = 100, add_stability = 0.05).
CRITICAL: Output ONLY raw lines of script. DO NOT wrap in brackets or braces. No explanations, no markdown.${contextString}`;

      case "triggers":
        return `You are a Master-Level Hearts of Iron IV (HOI4) Modding AI.
Your ONLY purpose is to translate the user's request into valid, machine-readable Hearts of Iron IV Paradox script TRIGGERS / conditions (e.g., has_war = yes, num_of_factories > 20, is_subject = yes, has_completed_focus = some_focus).
CRITICAL: Output ONLY raw lines of trigger script. DO NOT wrap in brackets or braces. No explanations, no markdown codeblocks.${contextString}`;

      case "equipment":
        return `You are a Master-Level Hearts of Iron IV (HOI4) Modding AI.
Your ONLY purpose is to translate the user's request into valid HOI4 equipment-bonus blocks for a national spirit's "equipment_bonus". Each entry is an equipment archetype with a braced block of stat changes.
CRITICAL FORMAT: one block per archetype, e.g.:
infantry_weapons = { build_cost_ic = -0.10 reliability = 0.05 }
artillery = { soft_attack = 0.10 }
CRITICAL: Output ONLY the raw archetype blocks (no outer "equipment_bonus = { }" wrapper, no markdown, no commentary). Use real archetype ids (infantry_weapons, artillery, infantry_equipment, support_weapons, etc.).${contextString}`;

      case "traits":
        return `You are a Master-Level Hearts of Iron IV (HOI4) Modding AI.
Your ONLY purpose is to translate the user's description into a space-separated list of valid Hearts of Iron IV character trait IDs (e.g., warmonger nervous_leader smooth_talking_charmer).
CRITICAL: Output ONLY the space-separated list of traits. No quotes, no markdown, no explanations.${contextString}`;

      case "value":
        return `You are a Master-Level Hearts of Iron IV (HOI4) Modding AI.
Your ONLY purpose is to output a single numerical value based on the user's description (e.g., 150 for political power cost).
CRITICAL: Output ONLY the raw number. No explanation, no unit characters.${contextString}`;

      case "percentage":
        return `You are a Master-Level Hearts of Iron IV (HOI4) Modding AI.
Your ONLY purpose is to output a single decimal percentage value (e.g., 0.50 for 50%, or 0.05 for 5%) based on the user's description.
CRITICAL: Output ONLY the raw decimal number. No text or percentage signs.${contextString}`;

      default:
        return `You are a Master-Level Hearts of Iron IV (HOI4) Modding AI. Translate the user's request into raw script or text values.${contextString}`;
    }
  }

  function getPromptExample(type, labelText) {
    switch (type) {
      case "id": return "e.g., 'war cabinet' or 'industry boost'";
      case "name": return "e.g., 'A focus to mobilize factories' or 'A spirit for army speed'";
      case "description": return "e.g., 'Describe the rise of industrial automation' or 'Flavor text for military reform'";
      case "modifiers": return "e.g., 'Gives 10% factory output and 5% stability'";
      case "effects": return "e.g., 'Gives 50 PP, annexes Austria, and adds 5% war support'";
      case "triggers": return "e.g., 'Only if at war and has more than 20 factories'";
      case "equipment": return "e.g., 'Makes infantry weapons 10% cheaper and artillery hit harder'";
      case "traits": return "e.g., 'An inspirational leader who is politically corrupt'";
      case "value": return "e.g., 'Standard focus completion cost' or 'cheap political advisor cost'";
      case "percentage": return "e.g., 'High stability' or 'five percent war support'";
      default: return "";
    }
  }

  function collectPageContext(targetEl) {
    // Gather values of all other inputs and textareas on the page to build context
    const fields = [];
    document.querySelectorAll("input[id], textarea[id], select[id]").forEach(el => {
      if (el === targetEl) return;
      const val = el.value ? el.value.trim() : "";
      if (val && val.length < 500) {
        fields.push(`- ${el.id}: ${val}`);
      }
    });
    return fields.join("\n");
  }

  // ---- Reusable per-field assist (✨ AI + 📋 Pick) -------------------------------------------
  // The same controls the focus/maker fields get, but attachable to ANY element — so dynamically
  // built editors (e.g. the Continuous Focuses popup) match the rest of the app instead of having a
  // weaker, bespoke picker. Shared by injectButtons (below) and window.novaAttachFieldAssist.
  function buildAiAssistButton(el, type, labelText) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ai-field-assist-btn";
    btn.innerHTML = "✨ AI";
    btn.style.cssText = "background:none; border:none; color:#58a6ff; font-size:11px; cursor:pointer; font-weight:600; padding:0; margin-left:8px; transition:color 0.15s;";
    btn.addEventListener("mouseenter", () => (btn.style.color = "#a6d2ff"));
    btn.addEventListener("mouseleave", () => (btn.style.color = "#58a6ff"));
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const example = getPromptExample(type, labelText);
      const desc = await showCustomPrompt(`Ask the AI to write the ${labelText}`, example);
      if (!desc || !desc.trim()) return;
      btn.innerHTML = "⌛...";
      btn.disabled = true;
      try {
        const apiKey = localStorage.getItem("gemini_api_key") || localStorage.getItem("geminiApiKey") || "";
        const context = collectPageContext(el);
        const systemPrompt = getSystemPrompt(type, labelText, context);
        const needsScript = window.novaFieldNeedsScript(type);
        const response = await fetch("/api/ai/logic", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: desc, apiKey, systemPrompt, needsScript, modPath: localStorage.getItem("activeModPath") || "" }),
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        if (data.script !== undefined && data.script !== null) {
          el.value = data.script.trim();
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
      } catch (err) {
        (window.nbAlert || alert)("AI Assistant Failed: " + (err.message || err));
      } finally {
        btn.innerHTML = "✨ AI";
        btn.disabled = false;
      }
    });
    return btn;
  }

  function buildPickButton(el, type, labelText) {
    const isTriggerish = type === "triggers" || /trigger|available|visible|allowed|condition|enable/i.test(labelText || "");
    const defaultTab = type === "modifiers" ? "modifiers" : isTriggerish ? "triggers" : "effects";
    const pick = document.createElement("button");
    pick.type = "button";
    pick.className = "ai-field-pick-btn";
    pick.innerHTML = "📋 Pick";
    pick.title = "Browse valid HOI4 commands and insert one";
    pick.style.cssText = "background:none; border:none; color:#9fe0ff; font-size:11px; cursor:pointer; font-weight:600; padding:0; margin-left:8px; transition:color 0.15s;";
    pick.addEventListener("mouseenter", () => (pick.style.color = "#d6f3ff"));
    pick.addEventListener("mouseleave", () => (pick.style.color = "#9fe0ff"));
    pick.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (window.showNovaTokenPicker) window.showNovaTokenPicker({ defaultTab, onPick: (name, block) => insertTokenAtCursor(el, name, block) });
    });
    return pick;
  }

  // Public: attach ✨ AI (+ 📋 Pick for script fields) to a field, mounting the buttons in `opts.mount`
  // (defaults to the field's parent). type: effects | modifiers | triggers | name | description | id | …
  window.novaAttachFieldAssist = function (el, opts) {
    opts = opts || {};
    if (!el || el.dataset.aiAssisted === "true") return;
    const type = opts.type || "effects";
    const labelText = opts.labelText || "field";
    const mount = opts.mount || el.parentElement;
    if (!mount) return;
    mount.appendChild(buildAiAssistButton(el, type, labelText));
    if (type === "effects" || type === "modifiers" || type === "triggers") mount.appendChild(buildPickButton(el, type, labelText));
    el.dataset.aiAssisted = "true";
  };

  function injectButtons() {
    AI_TARGETS.forEach(target => {
      document.querySelectorAll(target.selector).forEach(el => {
        if (el.dataset.aiAssisted === "true") return;

        // Try to find the associated label
        let label = null;
        const id = el.getAttribute("id");
        if (id) {
          label = document.querySelector(`label[for="${id}"]`);
        }
        if (!label) {
          // Look for preceding sibling labels or wrapper containers containing a label
          let prev = el.previousElementSibling;
          while (prev) {
            if (prev.tagName === "LABEL") {
              label = prev;
              break;
            }
            const innerLabel = prev.querySelector("label");
            if (innerLabel) {
              label = innerLabel;
              break;
            }
            prev = prev.previousElementSibling;
          }
        }
        if (!label) {
          const parent = el.closest(".field-group") || el.closest(".ch-field") || el.parentElement;
          if (parent) label = parent.querySelector("label");
        }

        if (label) {
          // Wrap label content in flex header if not already styled
          if (!label.dataset.flexed) {
            // Let the AI + Pick buttons flow INLINE right after the label text (each button has its
            // own margin-left) so a long label reads as one wrapping sentence with the buttons
            // following the last word, instead of a flex row that dropped Pick onto its own line.
            label.style.display = "block";
            label.dataset.flexed = "true";
          }

          // AI + (for script fields) Pick buttons — shared builders, mounted on the field's label.
          label.appendChild(buildAiAssistButton(el, target.type, target.labelText));
          if (target.type === "effects" || target.type === "modifiers") {
            label.appendChild(buildPickButton(el, target.type, target.labelText));
          }
          el.dataset.aiAssisted = "true";
        }
      });
    });
  }

  // The focus editor's advanced trigger fields (available / allow_branch / bypass) have their own
  // ✨ AI button (class ai-trigger-gen-btn) but no command picker. Add a 📋 Pick next to each so you
  // can browse + insert real triggers, matching the maker script fields. (ai_will_do is weighting, not
  // a trigger list, so it's skipped.)
  function injectFocusTriggerPickers() {
    document.querySelectorAll(".ai-trigger-gen-btn").forEach((aiBtn) => {
      if (aiBtn.dataset.pickAdded === "true") return;
      const targetId = aiBtn.getAttribute("data-target");
      const dtype = aiBtn.getAttribute("data-type");
      if (!targetId || dtype === "ai_will_do") return;
      const el = document.getElementById(targetId);
      if (!el) return;
      aiBtn.dataset.pickAdded = "true";
      const pick = document.createElement("button");
      pick.type = "button";
      pick.className = "ai-field-pick-btn";
      pick.innerHTML = "📋 Pick";
      pick.title = "Browse valid HOI4 triggers/conditions and insert one";
      pick.style.cssText = "background:none; border:none; color:#9fe0ff; font-size:11px; cursor:pointer; font-weight:600; padding:0; margin-left:8px; transition:color 0.15s;";
      pick.addEventListener("mouseenter", () => (pick.style.color = "#d6f3ff"));
      pick.addEventListener("mouseleave", () => (pick.style.color = "#9fe0ff"));
      pick.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (window.showNovaTokenPicker) window.showNovaTokenPicker({ defaultTab: "triggers", onPick: (name, block) => insertTokenAtCursor(el, name, block) });
      });
      aiBtn.insertAdjacentElement("afterend", pick);
    });
  }

  // Initial injection
  injectButtons();
  injectFocusTriggerPickers();

  // Watch for DOM changes to handle dynamically added forms (e.g. event options or detail lists)
  const observer = new MutationObserver(() => {
    injectButtons();
    injectFocusTriggerPickers();
  });
  observer.observe(document.body, { childList: true, subtree: true });

})();
