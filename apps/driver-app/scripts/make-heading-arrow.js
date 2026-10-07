// Draws assets/images/heading-arrow.png: a blue navigation arrow, pointing up, on a white disc with a
// soft edge. The map draws it as a native layer and turns it with `icon-rotate`, which is smooth, unlike
// a React Native marker (those are drawn once to a picture on Android and flicker if re-made).
//
//   node scripts/make-heading-arrow.js
//
// No dependencies: it writes the PNG itself with node's zlib. Edit the constants and run it again.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const SIZE = 128; // the image; the map draws it at about a third of this
const SUPER = 4; // samples per pixel each way, for smooth edges
const BLUE = [26, 115, 232];
const WHITE = [255, 255, 255];
const EDGE = [11, 18, 32]; // the soft shadow ring

const c = SIZE / 2;
const discR = SIZE * 0.44;
const ringR = SIZE * 0.47;

// A navigation arrow, tip up: tip, right wing, notch, left wing (in a 0..1 box, then scaled).
const arrow = [
  [0.5, 0.18],
  [0.76, 0.8],
  [0.5, 0.65],
  [0.24, 0.8],
].map(([x, y]) => [x * SIZE, y * SIZE]);

function inPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const pixels = Buffer.alloc(SIZE * SIZE * 4);
for (let py = 0; py < SIZE; py++) {
  for (let px = 0; px < SIZE; px++) {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (let sy = 0; sy < SUPER; sy++) {
      for (let sx = 0; sx < SUPER; sx++) {
        const x = px + (sx + 0.5) / SUPER;
        const y = py + (sy + 0.5) / SUPER;
        const d = Math.hypot(x - c, y - c);
        let colour;
        let alpha = 0;
        if (inPolygon(x, y, arrow)) {
          colour = BLUE;
          alpha = 1;
        } else if (d <= discR) {
          colour = WHITE;
          alpha = 1;
        } else if (d <= ringR) {
          colour = EDGE;
          alpha = 0.25;
        }
        if (colour) {
          r += colour[0] * alpha;
          g += colour[1] * alpha;
          b += colour[2] * alpha;
          a += alpha;
        }
      }
    }
    const n = SUPER * SUPER;
    const o = (py * SIZE + px) * 4;
    if (a > 0) {
      pixels[o] = Math.round(r / a);
      pixels[o + 1] = Math.round(g / a);
      pixels[o + 2] = Math.round(b / a);
      pixels[o + 3] = Math.round((a / n) * 255);
    }
  }
}

// PNG: signature, IHDR, one IDAT (each row prefixed with filter byte 0), IEND.
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let v = n;
  for (let k = 0; k < 8; k++) v = v & 1 ? 0xedb88320 ^ (v >>> 1) : v >>> 1;
  return v >>> 0;
});
function crc32(buf) {
  let v = 0xffffffff;
  for (const byte of buf) v = crcTable[(v ^ byte) & 0xff] ^ (v >>> 8);
  return (v ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0;
  pixels.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
const out = path.join(__dirname, '..', 'assets', 'images', 'heading-arrow.png');
fs.writeFileSync(out, png);
console.log('wrote', out, png.length, 'bytes');
