// #bg-scale-is-canvas-percent — THE BACKGROUND WAS DRAWN AT THE CANVAS'S SIZE, NOT THE IMAGE'S.
//
// Reported by the user: "the background pictures size of research tree, in game they are different."
//
// 🈯 GROUND TRUTH, read out of the game's own files:
//   • Every tech-tree backdrop is a plain `iconType { spriteType = "GFX_*_techtree_bg" position = { x=0 y=0 } }`
//     inside the folder's container, over a plain `spriteType` that declares nothing but a textureFile — no
//     size, no frames. HOI4 therefore draws the .dds at its NATIVE PIXEL SIZE.
//   • Those files are much SMALLER than the trees they sit behind: infantry 959x715 against a 1400x1275
//     content pane. In game the art covers part of the tab; it never fills it.
//   • Across vanilla and all five installed base mods — 76 backdrop icons — none declares a `scale`, and
//     exactly two declare a non-zero position (Old World Blues 410,60 and Millennium Dawn 0,-75).
//
// WHAT WAS WRONG. The Background panel reads that transform correctly and then mapped the vanilla shape
// ({0,0}, scale 1) to a CSS `background-size: 100% 100%` — a percentage of #researchBg, which spans the
// entire scroll canvas (at least 5200x2400). So the shape essentially every folder in every mod has blew a
// 959x715 image up about 5.4x across and 3.4x down. The same value was the resting CSS, so it applied before
// any script ran. MANUAL mode had the same unit error from the other end: `scale*100%` made scale 1 mean
// "stretch to the canvas" rather than "draw 1:1".
//
// A correct default already existed and was unreachable in practice: opening the Background panel calls
// pushPreview(), which sets _bg, and the stretch came back.
//
// This test RUNS the shipped function against a stubbed DOM. A static check would not have caught the bug —
// the old code looked entirely reasonable; what was wrong was the UNIT.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const PUB = path.join(__dirname, "public");
const VANILLA = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";

// ── lift the shipped preview code out of research.js ────────────────────────────────────────────────────
const src = fs.readFileSync(path.join(PUB, "research.js"), "utf8");
const START = "  const _bgNatural = new Map();";
const END = "  function computeNodeState(tech) {";
const i = src.indexOf(START), j = src.indexOf(END, i);
rec("the background preview is in the shipped file", i !== -1 && j > i, { start: i, end: j });
if (i === -1 || j <= i) {
  console.log(`\n=== research bg natural size: ${checks} checks, ${fails.length} failed ===`);
  process.exitCode = 1;
  return;
}
const code = src.slice(i, j);

// A stub DOM just wide enough for the function: one element with a style bag, and an Image that reports
// whatever natural size the case wants.
function makeHarness({ natural, cfg, pane, gb0, origin }) {
  const styles = { backgroundSize: "", backgroundPosition: "" };
  const el = { style: styles, _novaBgUrl: "url(/api/icon-image?key=GFX_infantry_techtree_bg)" };
  const ctx = {
    document: { getElementById: (id) => (id === "researchBg" ? el : null) },
    currentVisibleFolders: ["infantry_folder"],
    guiLayout: { infantry_folder: { _bg: cfg, canvas: pane, gridboxes: gb0 ? [gb0] : [] } },
    effectiveOriginX: origin.x,
    effectiveOriginY: origin.y,
    // Resolves synchronously on assignment, so one call settles it — the real one is async and re-applies.
    Image: function () {
      const self = this;
      Object.defineProperty(self, "src", {
        set() {
          self.naturalWidth = natural.w; self.naturalHeight = natural.h;
          if (natural.w) { if (self.onload) self.onload(); } else if (self.onerror) self.onerror();
        },
      });
    },
    Math, String, Number, Map, console,
  };
  vm.createContext(ctx);
  vm.runInContext(code + "\nglobalThis.__apply = applyResearchBgPreview;", ctx);
  return { run: () => ctx.__apply(), style: styles };
}

const PANE = { x: 40, y: 10 };
const GB0 = { x: 30, y: 6 };
const ORIGIN = { x: 300, y: 20 };
// The backdrop is anchored at the folder's content PANE, mapped through the same frame as everything
// else, PLUS its own authored position: effectiveOrigin + (pane - gb0) + authored.
//   = 300 + (40-30) + 0, 20 + (10-6) + 0 = 310, 24
// The pane term belongs there because the icon is NESTED INSIDE the pane in the gui, so its authored
// position is pane-relative. I removed it once, on a live reading from a page with no techs loaded, and
// the gui is what put it back: MD's artillery pane is authored at x=-210, and the two forms differ by
// exactly that. They agree wherever the pane sits at 0,0, which is most folders — so a fixture with a
// pane at 0,0 could not tell them apart. This one deliberately uses a pane at 40,10.

(async () => {
  try {
    console.log("\n[the vanilla shape] position 0,0 scale 1 means the image's OWN size");
    {
      // This is what essentially every folder in every mod declares, and what used to stretch.
      const h = makeHarness({ natural: { w: 959, h: 715 }, cfg: { mode: "fit", x: 0, y: 0, scale: 1 }, pane: PANE, gb0: GB0, origin: ORIGIN });
      h.run(); h.run(); // second pass: natural size is known
      rec("drawn at the texture's native pixels", h.style.backgroundSize === "959px 715px", h.style);
      rec("…not stretched to the canvas", !/%/.test(h.style.backgroundSize), h.style);
      rec("…anchored at the pane, mapped through the same frame as everything else",
        h.style.backgroundPosition === "310px 24px", h.style);
    }

    console.log("\n[⚠️ the mode must not change the size] fit and manual author the SAME transform");
    {
      // The engine has one model. `fit` and `manual` are two ways of writing it, and the bug was that one of
      // them meant "stretch" — a thing HOI4 never does for these sprites.
      const f = makeHarness({ natural: { w: 959, h: 715 }, cfg: { mode: "fit", x: 0, y: 0, scale: 1 }, pane: PANE, gb0: GB0, origin: ORIGIN });
      const m = makeHarness({ natural: { w: 959, h: 715 }, cfg: { mode: "manual", x: 0, y: 0, scale: 1 }, pane: PANE, gb0: GB0, origin: ORIGIN });
      f.run(); f.run(); m.run(); m.run();
      rec("the same transform renders the same either way",
        f.style.backgroundSize === m.style.backgroundSize && f.style.backgroundPosition === m.style.backgroundPosition,
        { fit: f.style, manual: m.style });
      rec("…and neither of them is a percentage",
        !/%/.test(f.style.backgroundSize) && !/%/.test(m.style.backgroundSize), { fit: f.style, manual: m.style });
    }

    console.log("\n[an authored scale] multiplies the IMAGE, not the canvas");
    {
      const h = makeHarness({ natural: { w: 959, h: 715 }, cfg: { mode: "manual", x: 0, y: 0, scale: 0.5 }, pane: PANE, gb0: GB0, origin: ORIGIN });
      h.run(); h.run();
      // Half of 959x715. Under the old model scale 0.5 meant half the CANVAS — 2600x1200, nearly 3x too big.
      rec("scale 0.5 halves the texture", h.style.backgroundSize === "480px 358px", h.style);
    }

    console.log("\n[an authored position] is applied inside the container, as the engine does");
    {
      // Old World Blues authors 410,60 on one backdrop and Millennium Dawn -75 on the y of another. Ignoring
      // the offset put both in the wrong place; only two of 76 backdrops use it, and both were wrong.
      const h = makeHarness({ natural: { w: 959, h: 715 }, cfg: { mode: "manual", x: 410, y: 60, scale: 1 }, pane: PANE, gb0: GB0, origin: ORIGIN });
      h.run(); h.run();
      rec("the offset moves the art", h.style.backgroundPosition === "720px 84px", h.style);
      rec("…without changing its size", h.style.backgroundSize === "959px 715px", h.style);
    }

    console.log("\n[CONTROL — no transform authored at all] still the image's own size");
    {
      const h = makeHarness({ natural: { w: 1230, h: 593 }, cfg: null, pane: PANE, gb0: GB0, origin: ORIGIN });
      h.run(); h.run();
      rec("a folder with no _bg renders naturally", h.style.backgroundSize === "1230px 593px", h.style);
      rec("…at the same mapped origin", h.style.backgroundPosition === "310px 24px", h.style);
    }

    console.log("\n[CONTROL — the texture has not loaded yet] must not guess a size");
    {
      const h = makeHarness({ natural: { w: 0, h: 0 }, cfg: { mode: "fit", x: 0, y: 0, scale: 1 }, pane: PANE, gb0: GB0, origin: ORIGIN });
      h.run();
      // `auto` IS the natural size, so the interim frame is already right for scale 1 — what it must never
      // be is a percentage of the canvas.
      rec("it falls back to auto, never to a canvas percentage",
        h.style.backgroundSize === "auto", h.style);
    }

    console.log("\n[ground truth] the art really is smaller than the tree, which is why stretching is wrong");
    {
      const DDS = path.join(VANILLA, "gfx", "interface", "techtree");
      if (!fs.existsSync(DDS)) console.log("     (no HOI4 install — corpus check skipped)");
      else {
        const dim = (f) => {
          const b = fs.readFileSync(path.join(DDS, f)).subarray(0, 20);
          if (b.toString("ascii", 0, 4) !== "DDS ") return null;
          return { w: b.readUInt32LE(16), h: b.readUInt32LE(12) };
        };
        const inf = dim("infantry_techtree_bg.dds"), nav = dim("naval_techtree_bg.dds");
        console.log(`     infantry_techtree_bg ${inf.w}x${inf.h}   naval_techtree_bg ${nav.w}x${nav.h}`);
        rec("the infantry backdrop is 959x715, as shipped", inf && inf.w === 959 && inf.h === 715, inf);
        // Its container is authored 1400x1275 in countrytechtreeview.gui, and the scroll canvas is larger
        // still — so "fill the element" was never the same thing as "what the game draws".
        rec("…and it is SMALLER than the 1400x1275 pane it sits in", inf && inf.w < 1400 && inf.h < 1275, inf);
        const gui = path.join(VANILLA, "interface", "countrytechtreeview.gui");
        if (fs.existsSync(gui)) {
          const t = fs.readFileSync(gui, "latin1");
          const m = /iconType\s*=\s*\{[^}]*?spriteType\s*=\s*"GFX_infantry_techtree_bg"[^}]*?\}/.exec(t);
          rec("…and the game declares it with no size and no scale — so it draws native",
            !!m && !/\bscale\s*=/.test(m[0]) && !/\bsize\s*=/.test(m[0]), m && m[0].slice(0, 200));
        }
      }
    }

    console.log("\n[the resting CSS] must not stretch before any script runs");
    {
      const html = fs.readFileSync(path.join(PUB, "research.html"), "utf8");
      const block = /\.research-bg\s*\{[\s\S]*?\}/.exec(html);
      rec("the .research-bg rule exists", !!block, "rule not found");
      rec("…and does not declare a 100% 100% background-size",
        block && !/background-size:\s*100%\s+100%/.test(block[0]), block && block[0].slice(0, 300));
    }

    console.log(`\n=== research bg natural size: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  }
})();
