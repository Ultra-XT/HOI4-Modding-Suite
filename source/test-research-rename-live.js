// RENAMING A TECH MUST QUEUE THE TECHS THAT REFERENCE IT (#rename-marks-referrers).
//
// Save deliberately writes ONLY the techs in dirtyTechIds and leaves every other one byte-for-byte on
// disk — that is what stops it corrupting untouched content. renameTechIdInClient rewrites the renamed
// id inside every OTHER tech's prerequisites / mutuallyExclusive / dependencies / subTechnologies, but
// never marked those techs. So a rename wrote the new id while its referrers kept pointing at the OLD
// one: dangling prerequisites, and a tree the game cannot resolve. The DELETE path already handled this
// (it marks every refEdit owner); rename simply never did.
//
// Reproduced on Millennium Dawn: renaming infantry_weapons rewrote infantry_weapons1's prerequisite in
// memory while dirtyTechIds held only the renamed tech. Every non-GET is stubbed, so this cannot write.
//
// PREREQUISITES: a Nova server and a mod on disk — environment, not code, so this SKIPS (exit 0) when
// either is missing, keeping the aggregate runner green on a machine with no game.
"use strict";
const fsx = require("fs");
const net = require("net");
const path = require("path");
let chromium;
try { ({ chromium } = require("playwright")); } catch (_) { console.log("test-research-rename-live: SKIPPED (playwright unavailable)"); process.exit(0); }
const MOD = process.env.NOVA_SNAP_MOD || ["D:", "SteamLibrary", "steamapps", "workshop", "content", "394360", "2777392649"].join(path.sep);
// #a-bare-test-run-writes-into-the-real-app-data — the runner names its sandboxed server here. Run bare there is none,
// and this fell back to the app's own port: the owner's open Nova. Now it starts a server of its own, in its sandbox.
const { ownLiveServer, openResearchPage } = require("./testlib-live-server.js");
let PORT = +(process.env.NOVA_PORT || 0);
let fails = 0;
const ok = (c, m, x) => { console.log((c ? "  PASS " : "  FAIL ") + m + (c ? "" : "   << " + JSON.stringify(x))); if (!c) fails++; };
const serverUp = () => new Promise((res) => {
  const s = net.connect({ port: PORT, host: "127.0.0.1" }, () => { s.destroy(); res(true); });
  s.on("error", () => res(false));
  s.setTimeout(1500, () => { s.destroy(); res(false); });
});

(async () => {
  if (!PORT) PORT = await ownLiveServer("test-research-rename-live");
  if (!(await serverUp())) { console.log(`test-research-rename-live: SKIPPED (no server on ${PORT})`); process.exit(0); }
  if (!fsx.existsSync(MOD)) { console.log("test-research-rename-live: SKIPPED (mod not installed)"); process.exit(0); }

  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1700, height: 1000 } });
  const escaped = [];
  p.on("request", (r) => { if (r.method() !== "GET") escaped.push(r.method() + " " + r.url()); });
  p.on("pageerror", (e) => { console.log("  [pageerror]", e.message); fails++; });

  // #a-live-test-waits-for-the-page-not-for-the-clock — one boot, on the mod, waited for until the page can be driven
  await openResearchPage(p, `http://localhost:${PORT}`, MOD);
  // belt and braces: nothing may leave this page
  await p.evaluate(() => {
    const real = window.fetch.bind(window);
    window.fetch = async (i, init) => {
      const m = ((init && init.method) || "GET").toUpperCase();
      if (m !== "GET") return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      return real(i, init);
    };
  });

  // a MOD tech that is ON SCREEN and referenced by at least one other tech
  const target = await p.evaluate(() => {
    const onScreen = new Set([...document.querySelectorAll("#nodesLayer .tech-node")].map((n) => n.getAttribute("data-id")));
    const refs = (id) => window.allTechs.filter((t) => t.id !== id && (
      (t.prerequisites || []).some((q) => q.tech === id || (Array.isArray(q.techs) && q.techs.includes(id))) ||
      (t.mutuallyExclusive || []).includes(id) || (t.dependencies || []).includes(id) ||
      (t.subTechnologies || []).includes(id)));
    for (const t of window.allTechs) {
      if (!t.isMod || t.isSubTech || !onScreen.has(t.id)) continue;
      const r = refs(t.id);
      if (r.length >= 1) {
        const n = document.querySelector(`#nodesLayer .tech-node[data-id="${t.id}"]`);
        n.scrollIntoView({ block: "center", inline: "center" });
        const b2 = n.getBoundingClientRect();
        return { id: t.id, referrers: r.map((x) => x.id), cx: Math.round(b2.x + b2.width / 2), cy: Math.round(b2.y + b2.height / 2) };
      }
    }
    return null;
  });
  ok(!!target, "found an on-screen mod tech that other techs reference", target);
  if (!target) { await b.close(); process.exit(fails ? 1 : 0); }
  console.log(`  (renaming ${target.id}, referenced by ${target.referrers.length})`);

  await p.mouse.click(target.cx, target.cy);
  await p.waitForTimeout(800);
  ok((await p.evaluate(() => document.getElementById("techId").value)) === target.id, "the tech is selected in the sidebar");

  const newId = target.id + "_renamed";
  await p.evaluate((v) => {
    const el = document.getElementById("techId");
    el.focus(); el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.blur();
  }, newId);
  await p.waitForTimeout(1200);

  const out = await p.evaluate((o) => {
    const dirty = window.__researchDirtyIds();
    const rewritten = o.referrers.filter((rid) => {
      const t = window.allTechs.find((x) => x.id === rid);
      if (!t) return false;
      return (t.prerequisites || []).some((q) => q.tech === o.newId || (Array.isArray(q.techs) && q.techs.includes(o.newId))) ||
        (t.mutuallyExclusive || []).includes(o.newId) || (t.dependencies || []).includes(o.newId) ||
        (t.subTechnologies || []).includes(o.newId);
    });
    return {
      renamed: window.allTechs.some((t) => t.id === o.newId),
      oldGone: !window.allTechs.some((t) => t.id === o.oldId),
      rewritten, dirty,
      unqueued: rewritten.filter((r) => !dirty.includes(r)),
      undo: window.researchHistoryDepth().undo,
    };
  }, { newId, oldId: target.id, referrers: target.referrers });

  ok(out.renamed && out.oldGone, "the tech was renamed", out);
  ok(out.rewritten.length > 0, "its referrers were rewritten in memory", out);
  ok(out.unqueued.length === 0, "EVERY rewritten referrer is queued for save (no dangling ids on disk)", out);
  ok(out.dirty.includes(newId), "the renamed tech itself is queued", out);
  ok(out.undo >= 1, "the rename is undoable", out);
  ok(escaped.length === 0, "no request escaped to the server", escaped);

  await b.close();
  console.log(fails ? `\nRENAME LIVE TEST: ${fails} FAILED` : "\nRENAME LIVE TEST: all passed");
  process.exit(fails ? 1 : 0);
})();
