// Startup "back up your files" notice. Shows ONCE per app launch: sessionStorage persists across in-window
// tab navigation (so switching tabs never re-pops it) but clears when the window closes, so it returns on
// the next launch. Lives on home.html — the page the app opens to. Include before </body>.
(function () {
  try { if (sessionStorage.getItem("novaBackupWarnShown")) return; } catch (_) {}

  function show() {
    if (document.getElementById("novaBackupOverlay")) return;
    try { sessionStorage.setItem("novaBackupWarnShown", "1"); } catch (_) {}

    const ov = document.createElement("div");
    ov.id = "novaBackupOverlay";
    ov.style.cssText =
      "position:fixed; inset:0; z-index:2147483000; display:flex; align-items:center; justify-content:center;" +
      " background:rgba(3,7,14,0.68); backdrop-filter:blur(2px); font-family:'Inter',system-ui,Segoe UI,sans-serif;";
    ov.innerHTML =
      '<div role="dialog" aria-modal="true" aria-labelledby="novaBackupTitle" style="' +
        "width:min(450px,92vw); background:linear-gradient(140deg,#1a3566 0%,#262a5e 48%,#2e1f55 100%);" +
        " border:1px solid rgba(150,160,255,0.28); border-radius:14px; box-shadow:0 22px 66px rgba(0,0,0,0.6), 0 0 0 1px rgba(170,180,255,0.07) inset;" +
        ' padding:24px 24px 20px; color:#d7e1f5;">' +
        '<div style="display:flex; align-items:center; gap:11px; margin-bottom:12px;">' +
          '<svg width="26" height="26" viewBox="0 0 512 512" aria-hidden="true">' +
            '<path d="M256 96 L296 216 L416 256 L296 296 L256 416 L216 296 L96 256 L216 216 Z" fill="#8ec5ff"/>' +
            '<circle cx="256" cy="256" r="20" fill="#eaf3ff"/></svg>' +
          '<h2 id="novaBackupTitle" style="margin:0; font-size:18px; font-weight:600; color:#eaf3ff;">Back up your files first</h2>' +
        "</div>" +
        '<p style="margin:0 0 12px; font-size:13.5px; line-height:1.6;">Nova Modding Suite is still in active development and hasn’t been fully tested yet. Before you make changes, please <b style="color:#9fb6ff;">back up your mod folder</b> (and your save games) — just in case.</p>' +
        '<p style="margin:0 0 18px; font-size:12.5px; line-height:1.55; color:#a6acd0;">Your edits are written only to your active mod, never to the base game — but a quick copy of the folder is the safest insurance.</p>' +
        '<button id="novaBackupOk" style="width:100%; padding:11px 12px; background:linear-gradient(135deg,#3072e6 0%,#7a51d8 100%); border:none; border-radius:10px; color:#fff; font-size:14px; font-weight:600; cursor:pointer; box-shadow:0 6px 18px rgba(86,66,190,0.4);">Got it — let’s mod ✦</button>' +
      "</div>";
    // (border color fixed below — keep the inline string readable)
    document.body.appendChild(ov);

    const close = () => { try { ov.remove(); } catch (_) {} document.removeEventListener("keydown", onKey); };
    function onKey(e) { if (e.key === "Escape") close(); }
    const btn = document.getElementById("novaBackupOk");
    if (btn) { btn.addEventListener("click", close); try { btn.focus(); } catch (_) {} }
    ov.addEventListener("click", (e) => { if (e.target === ov) close(); }); // click outside the card to dismiss
    document.addEventListener("keydown", onKey);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", show);
  else show();
})();
