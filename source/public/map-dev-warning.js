// Map editor "before you edit the map" notice: back up the mod first, and start from a map that already works, because
// Auto-fix may not be able to fix a map that is already broken (the owner's three points, 2026-11-25; until then it said
// "still in development"). Its own backups are no safety net: safeModWrite's copies sit in Nova's backups folder, only the
// newest MAX_BACKUP_FILES are kept, and nothing in the app restores them, so the notice says so rather than offering them as
// one. "Auto-fix all" names the Map Errors button: the toolbar's "Auto-fix: ON" toggle only decides what happens to a state
// a Move or Erase empties. Shows ONCE per app launch, the first time the Map editor page is
// opened: sessionStorage persists across in-window tab navigation (so returning to the Map tab in the same
// session never re-pops it) but clears when the window closes, so it returns on the next launch. Lives on
// map.html — include before </body>. Same proven mechanism as startup-backup-warning.js.
(function () {
  // Suppress under automation (Playwright/Selenium set navigator.webdriver): the overlay intercepts
  // every toolbar click, which silently failed ALL 48 e2e-map-*.js tests. Real users still see it.
  try { if (typeof navigator !== "undefined" && navigator.webdriver) return; } catch (_) {}
  try { if (sessionStorage.getItem("novaMapDevWarnShown")) return; } catch (_) {}

  function show() {
    if (document.getElementById("novaMapDevOverlay")) return;
    try { sessionStorage.setItem("novaMapDevWarnShown", "1"); } catch (_) {}

    const ov = document.createElement("div");
    ov.id = "novaMapDevOverlay";
    ov.style.cssText =
      "position:fixed; inset:0; z-index:2147483000; display:flex; align-items:center; justify-content:center;" +
      " background:rgba(14,8,3,0.70); backdrop-filter:blur(2px); font-family:'Inter',system-ui,Segoe UI,sans-serif;";
    ov.innerHTML =
      '<div role="dialog" aria-modal="true" aria-labelledby="novaMapDevTitle" style="' +
        "width:min(470px,92vw); background:linear-gradient(140deg,#3a2a0e 0%,#3d240f 50%,#3a1c12 100%);" +
        " border:1px solid rgba(240,180,90,0.30); border-radius:14px; box-shadow:0 22px 66px rgba(0,0,0,0.62), 0 0 0 1px rgba(240,190,110,0.07) inset;" +
        ' padding:24px 24px 20px; color:#f3e4cf;">' +
        '<div style="display:flex; align-items:center; gap:11px; margin-bottom:12px;">' +
          '<svg width="27" height="27" viewBox="0 0 24 24" aria-hidden="true">' +
            '<path d="M12 2.6 L22.2 20.4 A1.4 1.4 0 0 1 21 22.5 L3 22.5 A1.4 1.4 0 0 1 1.8 20.4 Z" fill="#f4b23c"/>' +
            '<rect x="10.9" y="8.4" width="2.2" height="6.6" rx="1.1" fill="#2b1a06"/>' +
            '<circle cx="12" cy="18" r="1.35" fill="#2b1a06"/></svg>' +
          '<h2 id="novaMapDevTitle" style="margin:0; font-size:18px; font-weight:600; color:#ffe9c4;">Before you edit the map</h2>' +
        "</div>" +
        '<p style="margin:0 0 12px; font-size:13.5px; line-height:1.6;"><b style="color:#ffce86;">Back up your mod first.</b> Save a copy of your mod folder and its .mod file before you use the Map editor. Nova also backs up the files a map edit changes, but it keeps only the newest backups, so they are no substitute for your own copy.</p>' +
        '<p style="margin:0 0 18px; font-size:13.5px; line-height:1.6;"><b style="color:#ffce86;">Start from a map that works.</b> 🔧 Auto-fix all, in Map Errors, repairs many problems, but it may not be able to fix a map that is already broken. It’s best to build on a map that already loads in the game: the base game’s, or one from a mod that works.</p>' +
        '<button id="novaMapDevOk" style="width:100%; padding:11px 12px; background:linear-gradient(135deg,#e2922f 0%,#d8642f 100%); border:none; border-radius:10px; color:#fff; font-size:14px; font-weight:600; cursor:pointer; box-shadow:0 6px 18px rgba(190,96,40,0.4);">I understand</button>' +
      "</div>";
    document.body.appendChild(ov);

    const close = () => { try { ov.remove(); } catch (_) {} document.removeEventListener("keydown", onKey); };
    function onKey(e) { if (e.key === "Escape") close(); }
    const btn = document.getElementById("novaMapDevOk");
    if (btn) { btn.addEventListener("click", close); try { btn.focus(); } catch (_) {} }
    ov.addEventListener("click", (e) => { if (e.target === ov) close(); }); // click outside the card to dismiss
    document.addEventListener("keydown", onKey);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", show);
  else show();
})();
