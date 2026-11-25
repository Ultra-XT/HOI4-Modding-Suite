/*
 * nova-info-modal.js — the shared Nova "?" info modal (the purple/blue gradient card used across the
 * Research Tree and every maker). Pulled out of app.js so any page can get the IDENTICAL design by just
 * loading this file. Defines window.showNovaInfoModal(title, bodyHtml, refocusId) if not already present.
 * Non-blocking (never native confirm/alert), Escape- and backdrop-closeable.
 */
(function () {
  "use strict";
  if (window.showNovaInfoModal) return;
  window.showNovaInfoModal = function showNovaInfoModal(title, bodyHtml, refocusId) {
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
})();
