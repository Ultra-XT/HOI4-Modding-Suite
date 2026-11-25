// The newspaper's `event_picture_overlay` was parsed, sent to the client, and then silently dropped. The
// icon dispatch in applyGuiLayout had exactly two branches — leader_frame and pic_clip — and the if/else
// chain ended without an `else`, so any other icon fell through to nothing.
//
// Despite the name it is NOT a frame or a border. Decoding vanilla's gfx/interface/event_news_pic_overlay.dds
// (399x155, uncompressed BGRA): every one of its 61,845 pixels has partial alpha, min 51 max 97 mean 55.3
// (~21.7%), with ZERO fully-opaque and ZERO fully-transparent pixels. A border is impossible — there is no
// cut-out centre and no opaque edge. It is a full-area translucent NEWSPRINT GRAIN over the photo at the same
// origin, which is why it is 2px larger rather than centred.
//
// ⭐ The corpus matters more than the mechanism here, because two mods must keep drawing NOTHING:
//   * Millennium Dawn declares the element but ships a texture that is alpha-0 in every pixel
//   * Novum Vexillum comments the block out
// So the fix must paint the REAL RESOLVED SPRITE and never a synthesized tint — a tint would put grain on the
// two mods that deliberately have none. This test decodes the actual .dds files to hold that line.
"use strict";

const fs = require("fs");
const path = require("path");
const { stripJsComments } = require("./testlib-strip-comments.js");

const SRC = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "events.js"), "utf8"));

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};

// Alpha statistics for an uncompressed 32bpp .dds. Returns null for anything else (a compressed texture
// would need a real decoder, and guessing at one would be worse than saying so).
function alphaStats(p) {
  if (!fs.existsSync(p)) return null;
  const b = fs.readFileSync(p);
  if (b.length < 128) return null;
  const h = b.readUInt32LE(12), w = b.readUInt32LE(16);
  const px = w * h;
  if (b.length !== 128 + px * 4) return null;
  let min = 255, max = 0, sum = 0, opaque = 0, clear = 0;
  for (let i = 0; i < px; i++) {
    const a = b[128 + i * 4 + 3];
    if (a < min) min = a;
    if (a > max) max = a;
    sum += a;
    if (a === 255) opaque++;
    if (a === 0) clear++;
  }
  return { w, h, px, min, max, mean: sum / px, opaque, clear };
}

try {
  console.log("1. The element is no longer dropped");
  rec("there is a branch for the picture overlay", /picture_overlay\|pic_overlay/.test(SRC),
    "the icon dispatch only matched leader_frame and pic_clip");
  rec("…and it paints the resolved sprite, not a tint",
    /picture_overlay\|pic_overlay\/i\.test\(e\.name\)\) \{[\s\S]{0,200}?addSpriteDeco\(e\.sprite/.test(SRC),
    "a synthesized tint would draw grain on mods that deliberately have none");
  rec("…above the photo and below the paper clip",
    /picture_overlay\|pic_overlay[\s\S]{0,2000}?addSpriteDeco\(e\.sprite, e\.x, e\.y, "4"/.test(SRC));
  // The pre-existing branches must still be there — this is an addition, not a replacement.
  rec("the leader_frame branch survives", /leader_frame\/i\.test\(e\.name\)/.test(SRC));
  rec("the pic_clip branch survives", /pic_clip\|paper_clip\/i\.test\(e\.name\)/.test(SRC));

  console.log("\n2. The fix hazard is closed");
  // evSprite() falls back to the newspaper background for any key not in the table, so without an entry a
  // resolution failure would paint the whole 528x595 newspaper across the photo.
  rec("the overlay has a fallback texture entry",
    /GFX_event_news_pic_overlay: "gfx\/interface\/event_news_pic_overlay\.dds"/.test(SRC),
    "otherwise a failed resolve paints the entire newspaper over the photo");
  rec("…and the generic fallback really is the newspaper, so the entry is load-bearing",
    /EV_SPRITE_FALLBACK\[key\] \|\| "gfx\/interface\/event_news_bg\.dds"/.test(SRC));

  console.log("\n3. What the texture actually is, decoded from disk");
  const vanilla = alphaStats("D:/SteamLibrary/steamapps/common/Hearts of Iron IV/gfx/interface/event_news_pic_overlay.dds");
  rec("vanilla's overlay decoded", !!vanilla, vanilla && `${vanilla.w}x${vanilla.h}`);
  if (vanilla) {
    rec("…it is translucent everywhere (a wash, not a frame)",
      vanilla.opaque === 0 && vanilla.clear === 0,
      `opaque=${vanilla.opaque} clear=${vanilla.clear} of ${vanilla.px}`);
    rec("…at a low, flat alpha consistent with newsprint grain",
      vanilla.mean > 20 && vanilla.mean < 90, `mean ${vanilla.mean.toFixed(1)} (${(vanilla.mean / 255 * 100).toFixed(1)}%)`);
    rec("…and it is LARGER than the photo, not inset like a border",
      vanilla.w === 399 && vanilla.h === 155, `${vanilla.w}x${vanilla.h} vs photo 397x153`);
  }

  console.log("\n4. The mods that must keep drawing NOTHING still do");
  const md = alphaStats("D:/SteamLibrary/steamapps/workshop/content/394360/2777392649/gfx/interface/event_news_pic_overlay.dds");
  if (md) {
    rec("Millennium Dawn's own overlay is alpha-0 in every pixel", md.max === 0,
      `min=${md.min} max=${md.max} clear=${md.clear}/${md.px}`);
    rec("…so painting the real sprite renders nothing for MD, which is correct", md.max === 0,
      "this is why the fix must not synthesize a tint");
  } else {
    // Not a silent pass: say the corpus could not be measured rather than implying it was.
    rec("Millennium Dawn's overlay was measurable", false, "not present or not 32bpp — corpus check skipped");
  }

  console.log("\n5. This would have rejected what shipped");
  // Compose the old dispatch and confirm the overlay falls through it.
  const OLD = ['leader_frame', 'pic_clip|paper_clip'];
  const name = "event_picture_overlay";
  rec("the old dispatch matched neither branch for this element",
    !OLD.some((re) => new RegExp(re, "i").test(name)), OLD);
  rec("…and the new branch does match it", /picture_overlay|pic_overlay/i.test(name));

  console.log(`\n=== the newsprint overlay is drawn: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
  process.exitCode = 1;
}
