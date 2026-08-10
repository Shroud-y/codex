/**
 * Generates resources/icons/tray.ico and app.ico.
 *
 * Placeholder art, same as the portrait in the renderer: a dark rounded square
 * with a cyan diamond "eye". Written by hand as raw ICO/BMP so the repo needs
 * no image dependency and no binary assets in source control.
 *
 *   node tools/make-icons.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'resources', 'icons');

/** @returns {{r:number,g:number,b:number,a:number}} */
function pixel(x, y, size) {
  const u = (x + 0.5) / size;
  const v = (y + 0.5) / size;

  // Rounded-square mask.
  const cx = Math.abs(u - 0.5) * 2;
  const cy = Math.abs(v - 0.5) * 2;
  const edge = Math.pow(cx, 5) + Math.pow(cy, 5);
  if (edge > 1) return { r: 0, g: 0, b: 0, a: 0 };

  // Diamond eye.
  const diamond = Math.abs(u - 0.5) + Math.abs(v - 0.5);
  if (diamond < 0.13) return { r: 8, g: 14, b: 20, a: 255 };
  if (diamond < 0.34) {
    const t = (0.34 - diamond) / 0.21;
    return { r: Math.round(90 * t), g: Math.round(200 + 30 * t), b: 255, a: 255 };
  }

  // Body gradient.
  const t = v;
  return {
    r: Math.round(22 - 12 * t),
    g: Math.round(32 - 16 * t),
    b: Math.round(42 - 20 * t),
    a: 255
  };
}

function bmpFor(size) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0); // biSize
  header.writeInt32LE(size, 4); // biWidth
  header.writeInt32LE(size * 2, 8); // biHeight — XOR + AND masks
  header.writeUInt16LE(1, 12); // biPlanes
  header.writeUInt16LE(32, 14); // biBitCount
  header.writeUInt32LE(0, 16); // BI_RGB

  const xor = Buffer.alloc(size * size * 4);
  // BMP rows run bottom-up.
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const { r, g, b, a } = pixel(x, size - 1 - y, size);
      const offset = (y * size + x) * 4;
      xor[offset] = b;
      xor[offset + 1] = g;
      xor[offset + 2] = r;
      xor[offset + 3] = a;
    }
  }

  // AND mask: one bit per pixel, rows padded to 4 bytes. Fully zero, since
  // transparency is carried by the alpha channel.
  const maskRowBytes = Math.ceil(size / 32) * 4;
  const and = Buffer.alloc(maskRowBytes * size);

  return Buffer.concat([header, xor, and]);
}

function ico(sizes) {
  const images = sizes.map((size) => ({ size, data: bmpFor(size) }));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  const entries = [];
  let offset = 6 + images.length * 16;
  for (const image of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(image.size === 256 ? 0 : image.size, 0);
    entry.writeUInt8(image.size === 256 ? 0 : image.size, 1);
    entry.writeUInt8(0, 2); // palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bpp
    entry.writeUInt32LE(image.data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += image.data.length;
    entries.push(entry);
  }

  return Buffer.concat([header, ...entries, ...images.map((image) => image.data)]);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'tray.ico'), ico([16, 24, 32]));
writeFileSync(join(outDir, 'app.ico'), ico([16, 32, 48, 64, 128, 256]));
console.log(`icons written to ${outDir}`);
