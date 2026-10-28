// Generates the Lens toolbar icons (icons/icon{16,32,48,128}.png) with no dependencies:
// shapes are rasterised with 4×4 supersampling and written as PNG with node:zlib.
// The mark: a paper-coloured lens with a check inside, on a forest rounded square (FinMe tokens).
// Run: node extension/make-icons.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const FOREST = [0x12, 0x50, 0x3a];
const PAPER = [0xfb, 0xfa, 0xf7];
const SIZES = [16, 32, 48, 128];
const SAMPLES = 4;

// Shapes in a 0..1 coordinate space.
const CORNER = 0.22;
let LENS, HANDLE, CHECK;

/** Strokes get heavier at toolbar size (16px) so the mark doesn't turn to mush. */
function setGeometry(size) {
  const heavy = size <= 16;
  LENS = { cx: 0.43, cy: 0.43, outer: heavy ? 0.29 : 0.27, inner: heavy ? 0.175 : 0.185 };
  HANDLE = { from: [0.63, 0.63], to: [0.8, 0.8], width: heavy ? 0.14 : 0.105 };
  CHECK = { points: [[0.335, 0.445], [0.405, 0.515], [0.535, 0.365]], width: heavy ? 0.085 : 0.065 };
}

function insideRoundedSquare(x, y) {
  const dx = Math.max(Math.abs(x - 0.5) - (0.5 - CORNER), 0);
  const dy = Math.max(Math.abs(y - 0.5) - (0.5 - CORNER), 0);
  return dx * dx + dy * dy <= CORNER * CORNER;
}

function distanceToSegment(x, y, [ax, ay], [bx, by]) {
  const vx = bx - ax;
  const vy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(x - (ax + t * vx), y - (ay + t * vy));
}

function insideMark(x, y) {
  const d = Math.hypot(x - LENS.cx, y - LENS.cy);
  if (d >= LENS.inner && d <= LENS.outer) return true;
  if (distanceToSegment(x, y, HANDLE.from, HANDLE.to) <= HANDLE.width / 2) return true;
  const [p0, p1, p2] = CHECK.points;
  return (
    distanceToSegment(x, y, p0, p1) <= CHECK.width / 2 || distanceToSegment(x, y, p1, p2) <= CHECK.width / 2
  );
}

function render(size) {
  setGeometry(size);
  const rgba = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++)
    for (let px = 0; px < size; px++) {
      let bg = 0;
      let mark = 0;
      for (let sy = 0; sy < SAMPLES; sy++)
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = (px + (sx + 0.5) / SAMPLES) / size;
          const y = (py + (sy + 0.5) / SAMPLES) / size;
          if (!insideRoundedSquare(x, y)) continue;
          if (insideMark(x, y)) mark++;
          else bg++;
        }
      const total = SAMPLES * SAMPLES;
      const alpha = (bg + mark) / total;
      const i = (py * size + px) * 4;
      if (alpha === 0) continue;
      const markShare = mark / (bg + mark);
      for (let c = 0; c < 3; c++) rgba[i + c] = Math.round(FOREST[c] * (1 - markShare) + PAPER[c] * markShare);
      rgba[i + 3] = Math.round(alpha * 255);
    }
  return png(size, rgba);
}

// ---- minimal PNG encoder (RGBA, 8-bit, no interlace)
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const outDir = new URL("./icons/", import.meta.url);
mkdirSync(outDir, { recursive: true });
for (const size of SIZES) {
  writeFileSync(new URL(`icon${size}.png`, outDir), render(size));
  console.log(`icons/icon${size}.png`);
}
