// A tiny dependency-free PNG writer and pixel grid for the site's hand-made art (see make-art.js).
import { deflateSync } from 'node:zlib';

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = buf => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
};
const rgbOf = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

/* A w×h grid of colours ('#rrggbb' or null for transparent), drawn at whole-pixel positions only. */
export class Grid {
  constructor(w, h, fill = null) { this.w = w; this.h = h; this.p = new Array(w * h).fill(fill); }
  get(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? null : this.p[y * this.w + x]; }
  set(x, y, c) { x = Math.floor(x); y = Math.floor(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.p[y * this.w + x] = c; }
  rect(x, y, w, h, c) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c); }
  // fill every pixel whose centre passes the test (x, y are pixel indices; the test sees centres)
  each(test, c, x0 = 0, y0 = 0, x1 = this.w, y1 = this.h) {
    for (let y = Math.max(0, y0 | 0); y < Math.min(this.h, Math.ceil(y1)); y++)
      for (let x = Math.max(0, x0 | 0); x < Math.min(this.w, Math.ceil(x1)); x++) {
        const v = test(x + .5, y + .5, x, y);
        if (v) this.set(x, y, typeof v === 'string' ? v : c);
      }
  }
  disc(cx, cy, r, c) { this.each((x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r, c, cx - r - 1, cy - r - 1, cx + r + 1, cy + r + 1); }
  // a stroke of radius r between two points (round ends)
  capsule(ax, ay, bx, by, r, c) {
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1;
    this.each((x, y) => {
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L));
      return (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2 <= r * r;
    }, c, Math.min(ax, bx) - r - 1, Math.min(ay, by) - r - 1, Math.max(ax, bx) + r + 1, Math.max(ay, by) + r + 1);
  }
  poly(pts, c) {
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    this.each((x, y) => {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    }, c, Math.min(...xs) - 1, Math.min(...ys) - 1, Math.max(...xs) + 1, Math.max(...ys) + 1);
  }
  // rows of characters, each mapped to a colour through `map` (unmapped characters are skipped)
  sprite(rows, map, x0 = 0, y0 = 0) {
    rows.forEach((row, j) => [...row].forEach((ch, i) => { if (map[ch] !== undefined) this.set(x0 + i, y0 + j, map[ch]); }));
  }
  // paint c into every empty pixel that touches a filled one (4-neighbours, or 8 with diag)
  outline(c, diag = false) {
    const add = [];
    const nb = diag ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++)
      if (this.get(x, y) === null && nb.some(([a, b]) => this.get(x + a, y + b) !== null)) add.push([x, y]);
    for (const [x, y] of add) this.set(x, y, c);
    return this;
  }
  // replace colours inside this grid, pixel by pixel: fn(colour, x, y) returns a new colour or the same one
  map(fn) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) { const c = this.get(x, y); if (c !== null) this.p[y * this.w + x] = fn(c, x, y); } return this; }
  draw(g, dx = 0, dy = 0) { for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) { const c = g.get(x, y); if (c !== null) this.set(dx + x, dy + y, c); } return this; }
  colours() { return new Set(this.p.filter(c => c !== null)); }
}

/* Encode a grid as a PNG, each grid pixel a scale×scale block. Transparent pixels become `bg` if given;
   otherwise the PNG keeps an alpha channel. */
export function png(grid, scale = 1, bg = null) {
  const alpha = !bg && grid.p.includes(null), bpp = alpha ? 4 : 3;
  const W = grid.w * scale, H = grid.h * scale, row = 1 + W * bpp, raw = Buffer.alloc(row * H);
  for (let y = 0; y < H; y++) {
    raw[y * row] = 0;
    for (let x = 0; x < W; x++) {
      const c = grid.get(Math.floor(x / scale), Math.floor(y / scale)) ?? bg, o = y * row + 1 + x * bpp;
      if (c) { const [r, g, b] = rgbOf(c); raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; if (alpha) raw[o + 3] = 255; }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = alpha ? 6 : 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/* An SVG of the grid as one rect per horizontal run of a colour, with crisp edges. */
export function svg(grid) {
  let rects = '';
  for (let y = 0; y < grid.h; y++) for (let x = 0; x < grid.w;) {
    const c = grid.get(x, y);
    let n = 1;
    while (c !== null && grid.get(x + n, y) === c) n++;
    if (c !== null) rects += `<rect x="${x}" y="${y}" width="${n}" height="1" fill="${c}"/>`;
    x += n;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${grid.w} ${grid.h}" shape-rendering="crispEdges">${rects}</svg>\n`;
}
