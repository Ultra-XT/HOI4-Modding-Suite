// DDS textures, read and PATCHED IN PLACE — the codec under repaintWorldTextures (map-data.js).
//
// ⛔ #the-air-map-still-shows-the-old-world. Five textures in map/terrain paint the world's colours: the colour map
// (with the city lights in its alpha), the three water tints and the fog/water-shine map. Each is a picture of ONE map,
// and a mod that reshapes land and sea but inherits them shows the old map's continents through its own. Nova never
// wrote them, so every world it built carried vanilla's Earth in its colours (69.9% of TEST 28's new land was painted
// with the ocean's slate; South America sat 100% on new land).
//
// The discipline is the one paintProvincesInTerrainBmp and writeWorldNormalFromHeightmap keep: the file that LOADS is
// read, its header is carried BYTE FOR BYTE, and only the texels (uncompressed) or 4×4 blocks (compressed) that changed
// are rewritten. So the output has the format, size, mip count and flags of the file it replaces, and every block
// nobody touched keeps its original bytes — an empty patch is byte-identical, measured over all 34 shipping copies of
// these five files in the installed corpus.
//
// Formats: exactly what that corpus ships for them — uncompressed 32-bit (by channel mask, with or without alpha),
// uncompressed 24-bit, DXT1, DXT3, DXT5. Anything else (a DX10 header, BC7, a cube map, a volume) is REFUSED with a
// reason: an unknown format is not a licence to paint.
//
// Pure functions over Buffers. No file I/O here.
"use strict";

/** Parse a DDS header. Returns { error } for anything this codec will not write. Level 0 is the full size.
 *  `totalBytes` lets a caller that read only the 128-byte header check it against the file's real size. */
function parseDdsHeader(buf, totalBytes = null) {
  const size = totalBytes == null ? (buf ? buf.length : 0) : totalBytes;
  if (!buf || buf.length < 128 || buf.toString("latin1", 0, 4) !== "DDS ") return { error: "not a DDS file" };
  const u = (o) => buf.readUInt32LE(o);
  if (u(4) !== 124) return { error: "unexpected DDS header size " + u(4) };
  const height = u(12), width = u(16), mipsRaw = u(28);
  if (!width || !height) return { error: "a DDS of no size" };
  const caps2 = u(112);
  if (caps2 & 0x200) return { error: "cube maps are not supported" };
  if (caps2 & 0x200000) return { error: "volume textures are not supported" };
  const pfFlags = u(80), fourCC = buf.toString("latin1", 84, 88), bits = u(88);
  const masks = { r: u(92), g: u(96), b: u(100), a: u(104) };
  let format;
  if (pfFlags & 0x4) {
    if (fourCC === "DXT1" || fourCC === "DXT3" || fourCC === "DXT5") format = fourCC;
    else return { error: "unsupported compressed format " + JSON.stringify(fourCC) };
  } else if (pfFlags & 0x40) {
    if (bits === 32) format = "RGB32"; else if (bits === 24) format = "RGB24"; else return { error: "unsupported bit depth " + bits };
    if (!masks.r || !masks.g || !masks.b) return { error: "an uncompressed DDS with no colour masks" };
  } else return { error: "unsupported pixel format flags 0x" + pfFlags.toString(16) };
  const levels = Math.max(1, mipsRaw);
  const compressed = format.startsWith("DXT");
  const blockBytes = format === "DXT1" ? 8 : 16;
  const bpp = format === "RGB32" ? 4 : format === "RGB24" ? 3 : 0;
  const lv = [];
  let off = 128, w = width, h = height;
  for (let i = 0; i < levels; i++) {
    const size = compressed ? Math.max(1, Math.ceil(w / 4)) * Math.max(1, Math.ceil(h / 4)) * blockBytes : w * h * bpp;
    lv.push({ w, h, off, size });
    off += size; w = Math.max(1, w >> 1); h = Math.max(1, h >> 1);
  }
  if (off > size) return { error: `truncated: the header promises ${off} bytes and the file has ${size}` };
  const shift = (m) => { let s = 0; if (!m) return 0; while (!(m & 1)) { m >>>= 1; s++; } return s; };
  return {
    width, height, levels, format, compressed, blockBytes, bpp, masks,
    shifts: { r: shift(masks.r), g: shift(masks.g), b: shift(masks.b), a: shift(masks.a) },
    hasAlpha: compressed || !!(pfFlags & 0x1), lv, trailing: size - off,
  };
}

// ── decode ────────────────────────────────────────────────────────────────────────────────────────────────────
const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
function expand565(c) { const r = (c >> 11) & 31, g = (c >> 5) & 63, b = c & 31; return [(r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2)]; }
function colourPalette(c0, c1, fourColour) {
  const p0 = expand565(c0), p1 = expand565(c1);
  if (fourColour || c0 > c1) return [p0, p1, [0, 1, 2].map((k) => Math.round((2 * p0[k] + p1[k]) / 3)), [0, 1, 2].map((k) => Math.round((p0[k] + 2 * p1[k]) / 3))];
  return [p0, p1, [0, 1, 2].map((k) => Math.round((p0[k] + p1[k]) / 2)), [0, 0, 0]];
}
function alphaPalette(a0, a1) {
  const p = [a0, a1];
  if (a0 > a1) for (let i = 1; i < 7; i++) p.push(Math.round(((7 - i) * a0 + i * a1) / 7));
  else { for (let i = 1; i < 5; i++) p.push(Math.round(((5 - i) * a0 + i * a1) / 5)); p.push(0, 255); }
  return p;
}
function readAlphaIndex(buf, o, t) {
  const bit = 3 * t, byte = o + 2 + (bit >> 3), sh = bit & 7;
  const v = buf[byte] | ((byte + 1 < o + 8 ? buf[byte + 1] : 0) << 8);
  return (v >> sh) & 7;
}
/** A rectangle of one level's texels, [x0, x1) × [y0, y1), clipped to the level; null is the whole level. */
function levelRect(rect, w, h) {
  if (!rect) return { x0: 0, y0: 0, x1: w, y1: h };
  return { x0: Math.max(0, rect.x0), y0: Math.max(0, rect.y0), x1: Math.min(w, rect.x1), y1: Math.min(h, rect.y1) };
}
/** Whether `r` is made of whole 4×4 blocks of a w×h level (a block cut by the level's own edge counts as whole). */
function blockAligned(r, w, h) {
  return r.x0 % 4 === 0 && r.y0 % 4 === 0 && (r.x1 % 4 === 0 || r.x1 === w) && (r.y1 % 4 === 0 || r.y1 === h);
}
/** Decode one level to RGBA, row 0 = the first row stored (north, on every HOI4 map texture measured).
 *  With `rect`, only the texels in it are decoded — a compressed level, every block that rect touches — into a level-sized
 *  array that holds zeros everywhere else. repaintWorldTextures reads a picture only where an edit can reach it. */
function decodeDdsLevel(buf, hdr, level, rect = null) {
  const { w, h, off } = hdr.lv[level];
  const out = new Uint8Array(w * h * 4);
  const { x0, y0, x1, y1 } = levelRect(rect, w, h);
  if (x1 <= x0 || y1 <= y0) return out;
  if (!hdr.compressed) {
    const { masks: m, shifts: s, bpp } = hdr;
    // a 32-bit level read through one typed view where it is aligned: readUInt32LE per texel was most of a decode
    const u32 = bpp === 4 && LITTLE_ENDIAN && ((buf.byteOffset + off) & 3) === 0 ? new Uint32Array(buf.buffer, buf.byteOffset + off, w * h) : null;
    for (let y = y0; y < y1; y++) for (let i = y * w + x0, e = y * w + x1; i < e; i++) {
      const o = off + i * bpp;
      const v = u32 ? u32[i] : bpp === 4 ? buf.readUInt32LE(o) : (buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16));
      out[i * 4] = (v & m.r) >>> s.r; out[i * 4 + 1] = (v & m.g) >>> s.g; out[i * 4 + 2] = (v & m.b) >>> s.b;
      out[i * 4 + 3] = m.a && hdr.hasAlpha ? (v & m.a) >>> s.a : 255;
    }
    return out;
  }
  const bw = Math.max(1, Math.ceil(w / 4)), bh = Math.max(1, Math.ceil(h / 4));
  const bx0 = x0 >> 2, by0 = y0 >> 2, bx1 = Math.min(bw, (x1 + 3) >> 2), by1 = Math.min(bh, (y1 + 3) >> 2);
  for (let by = by0; by < by1; by++) for (let bx = bx0; bx < bx1; bx++) {
    const o = off + (by * bw + bx) * hdr.blockBytes;
    const co = hdr.format === "DXT1" ? o : o + 8;
    const e0 = buf.readUInt16LE(co), e1 = buf.readUInt16LE(co + 2);
    const pal = colourPalette(e0, e1, hdr.format !== "DXT1");
    const threeColour = hdr.format === "DXT1" && e0 <= e1;
    const idx = buf.readUInt32LE(co + 4);
    const apal = hdr.format === "DXT5" ? alphaPalette(buf[o], buf[o + 1]) : null;
    for (let t = 0; t < 16; t++) {
      const x = bx * 4 + (t & 3), y = by * 4 + (t >> 2);
      if (x >= w || y >= h) continue;
      const q = (y * w + x) * 4, c = pal[(idx >>> (2 * t)) & 3];
      out[q] = c[0]; out[q + 1] = c[1]; out[q + 2] = c[2];
      if (hdr.format === "DXT5") out[q + 3] = apal[readAlphaIndex(buf, o, t)];
      else if (hdr.format === "DXT3") out[q + 3] = ((buf[o + (t >> 1)] >> ((t & 1) * 4)) & 15) * 17;
      // DXT1's three-colour mode (c0 <= c1): index 3 is TRANSPARENT black. Hearts of Minecraft's fog/shine map is
      // nothing else — 180,224 of 180,224 blocks c0 = c1 = 0, every index 3.
      else out[q + 3] = threeColour && ((idx >>> (2 * t)) & 3) === 3 ? 0 : 255;
    }
  }
  return out;
}

// ── encode ────────────────────────────────────────────────────────────────────────────────────────────────────
const to565 = (r, g, b) => ((Math.round(r * 31 / 255) << 11) | (Math.round(g * 63 / 255) << 5) | Math.round(b * 31 / 255)) >>> 0;
/** One colour block: endpoints on the diagonal of the bounding box the colours run along, inset a sixteenth, then one
 *  least-squares refinement from the indices chosen. 4-colour mode (c0 > c1), for an opaque block; a DXT1 block that
 *  carries transparency goes through encodeColourBlockDxt1Alpha instead. */
function encodeColourBlock(px, dst, o) {
  const mn = [255, 255, 255], mx = [0, 0, 0], mu = [0, 0, 0];
  for (let t = 0; t < 16; t++) for (let k = 0; k < 3; k++) { const v = px[t * 4 + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; mu[k] += v / 16; }
  let crg = 0, cbg = 0, cgg = 0;
  for (let t = 0; t < 16; t++) { const r = px[t * 4] - mu[0], g = px[t * 4 + 1] - mu[1], b = px[t * 4 + 2] - mu[2]; crg += r * g; cbg += b * g; cgg += g * g; }
  const ref = cgg > 0 ? 1 : (crg >= 0 ? 1 : -1);
  const e0 = mx.slice(), e1 = mn.slice();
  if (crg * ref < 0) { e0[0] = mn[0]; e1[0] = mx[0]; }
  if (cbg * ref < 0) { e0[2] = mn[2]; e1[2] = mx[2]; }
  for (let k = 0; k < 3; k++) { const inset = (e0[k] - e1[k]) / 16; e0[k] -= inset; e1[k] += inset; }
  const pick = (a, b) => {
    let c0 = to565(...a), c1 = to565(...b), swap = false;
    if (c0 < c1) { const t = c0; c0 = c1; c1 = t; swap = true; }
    const pal = colourPalette(c0, c1, true);
    let idx = 0, err = 0;
    for (let t = 0; t < 16; t++) {
      let best = 0, bd = Infinity;
      for (let k = 0; k < 4; k++) { const d = (px[t * 4] - pal[k][0]) ** 2 + (px[t * 4 + 1] - pal[k][1]) ** 2 + (px[t * 4 + 2] - pal[k][2]) ** 2; if (d < bd) { bd = d; best = k; } }
      if (c0 === c1) best = 0;
      idx |= best << (2 * t); err += bd;
    }
    return { c0, c1, idx: idx >>> 0, err, swap };
  };
  let r = pick(e0, e1);
  const wts = [[1, 0], [0, 1], [2 / 3, 1 / 3], [1 / 3, 2 / 3]];
  let aa = 0, bb = 0, ab = 0; const ax = [0, 0, 0], bx = [0, 0, 0];
  for (let t = 0; t < 16; t++) { const [a, b] = wts[(r.idx >>> (2 * t)) & 3]; aa += a * a; bb += b * b; ab += a * b; for (let k = 0; k < 3; k++) { ax[k] += a * px[t * 4 + k]; bx[k] += b * px[t * 4 + k]; } }
  const det = aa * bb - ab * ab;
  if (Math.abs(det) > 1e-6) {
    const p0 = [0, 1, 2].map((k) => Math.max(0, Math.min(255, (ax[k] * bb - bx[k] * ab) / det)));
    const p1 = [0, 1, 2].map((k) => Math.max(0, Math.min(255, (bx[k] * aa - ax[k] * ab) / det)));
    const cand = pick(r.swap ? p1 : p0, r.swap ? p0 : p1);
    if (cand.err < r.err) r = cand;
  }
  dst.writeUInt16LE(r.c0, o); dst.writeUInt16LE(r.c1, o + 2); dst.writeUInt32LE(r.idx, o + 4);
}
/** A DXT1 block that carries transparency: three-colour mode (c0 <= c1), index 3 for every texel under alpha 128, the
 *  opaque ones fitted to c0, c1 and their midpoint. A block with nothing opaque is c0 = c1 = 0, every index 3 — the
 *  bytes Hearts of Minecraft's own transparent blocks carry, so re-encoding one of them gives it back unchanged. */
function encodeColourBlockDxt1Alpha(px, dst, o) {
  const mn = [255, 255, 255], mx = [0, 0, 0];
  let opaque = 0;
  for (let t = 0; t < 16; t++) {
    if (px[t * 4 + 3] < 128) continue;
    opaque++;
    for (let k = 0; k < 3; k++) { const v = px[t * 4 + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; }
  }
  if (!opaque) { dst.writeUInt16LE(0, o); dst.writeUInt16LE(0, o + 2); dst.writeUInt32LE(0xffffffff, o + 4); return; }
  let c0 = to565(...mn), c1 = to565(...mx);
  if (c0 > c1) { const t = c0; c0 = c1; c1 = t; }
  const pal = colourPalette(c0, c1, false);
  let idx = 0;
  for (let t = 0; t < 16; t++) {
    let best = 3;
    if (px[t * 4 + 3] >= 128) {
      let bd = Infinity;
      for (let k = 0; k < 3; k++) { const d = (px[t * 4] - pal[k][0]) ** 2 + (px[t * 4 + 1] - pal[k][1]) ** 2 + (px[t * 4 + 2] - pal[k][2]) ** 2; if (d < bd) { bd = d; best = k; } }
    }
    idx |= best << (2 * t);
  }
  dst.writeUInt16LE(c0, o); dst.writeUInt16LE(c1, o + 2); dst.writeUInt32LE(idx >>> 0, o + 4);
}
function encodeAlphaBlockDxt5(px, dst, o) {
  let mn = 255, mx = 0;
  for (let t = 0; t < 16; t++) { const a = px[t * 4 + 3]; if (a < mn) mn = a; if (a > mx) mx = a; }
  const a0 = mx, a1 = mn;
  dst[o] = a0; dst[o + 1] = a1;
  const pal = alphaPalette(a0, a1);
  for (let k = 0; k < 6; k++) dst[o + 2 + k] = 0;
  for (let t = 0; t < 16; t++) {
    let best = 0, bd = Infinity;
    if (a0 !== a1) for (let k = 0; k < 8; k++) { const d = Math.abs(px[t * 4 + 3] - pal[k]); if (d < bd) { bd = d; best = k; } }
    const bit = 3 * t, byte = o + 2 + (bit >> 3), sh = bit & 7;
    dst[byte] |= (best << sh) & 255;
    if (sh > 5) dst[byte + 1] |= best >> (8 - sh);
  }
}
function encodeAlphaBlockDxt3(px, dst, o) {
  for (let t = 0; t < 16; t += 2) dst[o + (t >> 1)] = (Math.round(px[t * 4 + 3] / 17) & 15) | ((Math.round(px[(t + 1) * 4 + 3] / 17) & 15) << 4);
}

/**
 * Write `rgba` (a whole level) into `buf`, but ONLY the texels (uncompressed) or 4×4 blocks (compressed) that `dirty`
 * marks, one byte per texel of that level. Returns how many texels or blocks were written. A 32-bit format with no alpha
 * mask keeps whatever its unused byte held.
 *
 * With `rect`, only the texels or blocks inside it are looked at: `dirty` must mark nothing outside it, and `rgba` need
 * only hold the level's values inside it. A compressed level's rect must be whole blocks (blockAligned), because a
 * block is re-encoded from all sixteen of its texels. With `stats`, stats.changed is set when a unit written came out
 * different from the bytes it had — what a whole-file compare would say, without copying the file to compare it.
 */
function patchDdsLevel(buf, hdr, level, rgba, dirty, rect = null, stats = null) {
  const { w, h, off } = hdr.lv[level];
  const r = levelRect(rect, w, h);
  let n = 0;
  if (r.x1 <= r.x0 || r.y1 <= r.y0) return 0;
  if (!hdr.compressed) {
    const { masks: m, shifts: s, bpp } = hdr;
    for (let y = r.y0; y < r.y1; y++) for (let i = y * w + r.x0, e = y * w + r.x1; i < e; i++) {
      if (!dirty[i]) continue;
      const o = off + i * bpp;
      let v = (((rgba[i * 4] << s.r) & m.r) | ((rgba[i * 4 + 1] << s.g) & m.g) | ((rgba[i * 4 + 2] << s.b) & m.b)) >>> 0;
      if (bpp === 4) {
        const was = buf.readUInt32LE(o);
        if (m.a && hdr.hasAlpha) v = (v | ((rgba[i * 4 + 3] << s.a) & m.a)) >>> 0;
        else v = (v | (was & ~(m.r | m.g | m.b))) >>> 0;
        if (stats && was !== v >>> 0) stats.changed = true;
        buf.writeUInt32LE(v >>> 0, o);
      } else {
        if (stats && (buf[o] !== (v & 255) || buf[o + 1] !== ((v >> 8) & 255) || buf[o + 2] !== ((v >> 16) & 255))) stats.changed = true;
        buf[o] = v & 255; buf[o + 1] = (v >> 8) & 255; buf[o + 2] = (v >> 16) & 255;
      }
      n++;
    }
    return n;
  }
  if (rect && !blockAligned(r, w, h)) throw new Error("patchDdsLevel: a window over a compressed level must be whole 4x4 blocks");
  const bw = Math.max(1, Math.ceil(w / 4)), bh = Math.max(1, Math.ceil(h / 4));
  const bx0 = r.x0 >> 2, by0 = r.y0 >> 2, bx1 = Math.min(bw, (r.x1 + 3) >> 2), by1 = Math.min(bh, (r.y1 + 3) >> 2);
  const px = new Uint8Array(64), was = new Uint8Array(16);
  for (let by = by0; by < by1; by++) for (let bx = bx0; bx < bx1; bx++) {
    let any = false;
    for (let t = 0; t < 16 && !any; t++) { const x = bx * 4 + (t & 3), y = by * 4 + (t >> 2); if (x < w && y < h && dirty[y * w + x]) any = true; }
    if (!any) continue;
    for (let t = 0; t < 16; t++) {
      const x = Math.min(w - 1, bx * 4 + (t & 3)), y = Math.min(h - 1, by * 4 + (t >> 2)), q = (y * w + x) * 4;
      px[t * 4] = rgba[q]; px[t * 4 + 1] = rgba[q + 1]; px[t * 4 + 2] = rgba[q + 2]; px[t * 4 + 3] = rgba[q + 3];
    }
    const o = off + (by * bw + bx) * hdr.blockBytes;
    if (stats) for (let k = 0; k < hdr.blockBytes; k++) was[k] = buf[o + k];
    if (hdr.format === "DXT5") { encodeAlphaBlockDxt5(px, buf, o); encodeColourBlock(px, buf, o + 8); }
    else if (hdr.format === "DXT3") { encodeAlphaBlockDxt3(px, buf, o); encodeColourBlock(px, buf, o + 8); }
    else {
      let transparent = false;
      for (let t = 0; t < 16 && !transparent; t++) if (px[t * 4 + 3] < 128) transparent = true;
      if (transparent) encodeColourBlockDxt1Alpha(px, buf, o); else encodeColourBlock(px, buf, o);
    }
    if (stats && !stats.changed) for (let k = 0; k < hdr.blockBytes; k++) if (was[k] !== buf[o + k]) { stats.changed = true; break; }
    n++;
  }
  return n;
}

/** Box-filter level L-1 (`prev`, pw×ph) into `cur` (cw×ch) wherever `prevDirty` touched it; returns the dirty mask of
 *  level L. A child texel covers parent [floor(x·pw/cw), floor((x+1)·pw/cw)), which is exact halves for even sizes and
 *  still total for the odd tail of a mip chain (11 → 5, 5 → 2). With `rect` (level L's texels), only the children
 *  inside it are looked at: every child with a dirty parent must lie in it, and `prev` need only be right under those. */
function downsampleDirty(prev, pw, ph, prevDirty, cur, cw, ch, rect = null) {
  const dirty = new Uint8Array(cw * ch);
  const x0 = (x) => Math.floor(x * pw / cw), y0 = (y) => Math.floor(y * ph / ch);
  const r = levelRect(rect, cw, ch);
  for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) {
    const ax = x0(x), bx = Math.max(ax + 1, x0(x + 1)), ay = y0(y), by = Math.max(ay + 1, y0(y + 1));
    let any = false;
    for (let py = ay; py < by && !any; py++) for (let px = ax; px < bx; px++) if (prevDirty[py * pw + px]) { any = true; break; }
    if (!any) continue;
    dirty[y * cw + x] = 1;
    for (let k = 0; k < 4; k++) {
      let s = 0, c = 0;
      for (let py = ay; py < by; py++) for (let px = ax; px < bx; px++) { s += prev[(py * pw + px) * 4 + k]; c++; }
      cur[(y * cw + x) * 4 + k] = Math.round(s / c);
    }
  }
  return dirty;
}

/**
 * Patch level 0 and carry the change down every mip level the file has. Returns the units rewritten, all levels.
 *
 * With `rect` (level 0's texels, whole blocks), the edit is followed down the chain inside a window that halves with
 * each level and is widened to whole blocks: a level is decoded, box-filtered, re-encoded and compared only there,
 * which is where every texel whose parents changed lies. That is exact while each level is exactly half the one above
 * (a child's two-by-two parents then never straddle a block-aligned window's edge). Where a chain stops halving — the
 * odd tail, 11 → 5 — the rest is done over whole levels, from the level above as it stands: the window's own values,
 * and outside it the bytes nothing wrote, which decode to what they decoded to before.
 */
function patchDdsWithMips(buf, hdr, rgba0, dirty0, rect = null, stats = null) {
  let n = patchDdsLevel(buf, hdr, 0, rgba0, dirty0, rect, stats);
  let prev = rgba0, pd = dirty0, pr = rect ? levelRect(rect, hdr.lv[0].w, hdr.lv[0].h) : null;
  for (let l = 1; l < hdr.levels; l++) {
    const lv = hdr.lv[l], pl = hdr.lv[l - 1];
    let cr = null;
    if (pr) {
      if (pl.w === 2 * lv.w && pl.h === 2 * lv.h && blockAligned(pr, pl.w, pl.h)) {
        cr = { x0: (pr.x0 >> 1) & ~3, y0: (pr.y0 >> 1) & ~3, x1: Math.min(lv.w, (((pr.x1 + 1) >> 1) + 3) & ~3), y1: Math.min(lv.h, (((pr.y1 + 1) >> 1) + 3) & ~3) };
      } else {
        const full = decodeDdsLevel(buf, hdr, l - 1);
        for (let y = pr.y0; y < pr.y1; y++) full.set(prev.subarray((y * pl.w + pr.x0) * 4, (y * pl.w + pr.x1) * 4), (y * pl.w + pr.x0) * 4);
        prev = full;
      }
    }
    const cur = decodeDdsLevel(buf, hdr, l, cr);
    const dl = downsampleDirty(prev, pl.w, pl.h, pd, cur, lv.w, lv.h, cr);
    n += patchDdsLevel(buf, hdr, l, cur, dl, cr, stats);
    prev = cur; pd = dl; pr = cr;
  }
  return n;
}

module.exports = { parseDdsHeader, decodeDdsLevel, patchDdsLevel, downsampleDirty, patchDdsWithMips };
