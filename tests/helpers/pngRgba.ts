/**
 * Minimal PNG reader for Playwright screenshots (8-bit RGB/RGBA, non-interlaced).
 * Test/evidence only. Not used in production rating math.
 */
import { inflateSync } from 'node:zlib';

export type Rgba = { r: number; g: number; b: number; a: number };

const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

export function readPngRgba(png: Buffer): { width: number; height: number; pixels: Buffer; channels: number } {
  if (png.length < 8 || !png.subarray(0, 8).equals(PNG_SIG)) {
    throw new Error('not a PNG');
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idats: Buffer[] = [];
  while (offset + 12 <= png.length) {
    const len = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString('ascii');
    const data = png.subarray(offset + 8, offset + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idats.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + len;
  }
  if (!width || !height) throw new Error('missing IHDR');
  if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`);
  if (colorType !== 2 && colorType !== 6) throw new Error(`unsupported color type ${colorType}`);
  const channels = colorType === 6 ? 4 : 3;
  const inflated = inflateSync(Buffer.concat(idats));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  let src = 0;
  for (let y = 0; y < height; y++) {
    const filter = inflated[src++];
    const row = inflated.subarray(src, src + stride);
    src += stride;
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    const prev = y === 0 ? null : pixels.subarray((y - 1) * stride, y * stride);
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? out[i - channels] : 0;
      const up = prev ? prev[i] : 0;
      const upLeft = prev && i >= channels ? prev[i - channels] : 0;
      let val = row[i];
      if (filter === 1) val = (val + left) & 255;
      else if (filter === 2) val = (val + up) & 255;
      else if (filter === 3) val = (val + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) val = (val + paeth(left, up, upLeft)) & 255;
      else if (filter !== 0) throw new Error(`unsupported PNG filter ${filter}`);
      out[i] = val;
    }
  }
  return { width, height, pixels, channels };
}

export function samplePngPixel(png: Buffer, x: number, y: number): Rgba {
  const { width, height, pixels, channels } = readPngRgba(png);
  const px = Math.min(width - 1, Math.max(0, Math.round(x)));
  const py = Math.min(height - 1, Math.max(0, Math.round(y)));
  const i = (py * width + px) * channels;
  return {
    r: pixels[i],
    g: pixels[i + 1],
    b: pixels[i + 2],
    a: channels === 4 ? pixels[i + 3] : 255,
  };
}

export function samplePngCenter(png: Buffer): Rgba {
  const { width, height } = readPngRgba(png);
  return samplePngPixel(png, Math.floor(width / 2), Math.floor(height / 2));
}

export function colorDistance(a: Rgba, b: Pick<Rgba, 'r' | 'g' | 'b'>): number {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

export function rgbaEqual(a: Rgba, b: Rgba): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
}
