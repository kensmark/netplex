import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const directory = fileURLToPath(new URL('../assets', import.meta.url));
await mkdir(directory, { recursive: true });
const size = 256, data = Buffer.alloc((size * 4 + 1) * size);
for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
  const rounded = Math.hypot(Math.max(0, 40 - x, x - 215), Math.max(0, 40 - y, y - 215)) <= 40;
  const n = (x >= 56 && x <= 82 && y >= 57 && y <= 196) || (x >= 169 && x <= 195 && y >= 57 && y <= 196) || (y >= 57 && y <= 196 && Math.abs(x - (69 + (y - 57) * 113 / 139)) < 16);
  const dot = Math.hypot(x - 221, y - 195) <= 10;
  const color = n ? [244, 241, 251, 255] : dot ? [198, 185, 255, 255] : [13, 13, 17, rounded ? 255 : 0];
  const offset = y * (size * 4 + 1) + 1 + x * 4; color.forEach((value, index) => data[offset + index] = value);
}
const crcTable = Array.from({ length: 256 }, (_, i) => { for (let j = 0; j < 8; j++) i = (i >>> 1) ^ (i & 1 ? 0xedb88320 : 0); return i >>> 0; });
function chunk(name, value) { const type = Buffer.from(name), result = Buffer.alloc(value.length + 12); result.writeUInt32BE(value.length); type.copy(result, 4); value.copy(result, 8); let crc = 0xffffffff; for (const byte of Buffer.concat([type, value])) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255]; result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4); return result; }
const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(data)), chunk('IEND', Buffer.alloc(0))]);
const ico = Buffer.alloc(22); ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4); ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12); ico.writeUInt32LE(png.length, 14); ico.writeUInt32LE(22, 18);
await writeFile(join(directory, 'icon.ico'), Buffer.concat([ico, png]));
