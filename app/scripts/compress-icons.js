/**
 * Compress PWA icons to appropriate sizes
 */
import sharp from 'sharp';
import { readFileSync, writeFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

const icons = [
  { name: 'favicon.png', size: 64 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
];

async function compress() {
  let totalBefore = 0, totalAfter = 0;

  for (const icon of icons) {
    const filePath = join(publicDir, icon.name);
    const originalSize = statSync(filePath).size;
    totalBefore += originalSize;

    try {
      const result = await sharp(filePath)
        .resize(icon.size, icon.size, { fit: 'cover' })
        .png({ compressionLevel: 9, palette: true, colours: 256, quality: 80 })
        .toFile(filePath + '.tmp');

      writeFileSync(filePath, readFileSync(filePath + '.tmp'));
      const newSize = statSync(filePath).size;
      totalAfter += newSize;
      const pct = ((1 - newSize / originalSize) * 100).toFixed(1);
      console.log(`${icon.name} (${icon.size}x${icon.size}): ${(originalSize/1024).toFixed(1)}KB → ${(newSize/1024).toFixed(1)}KB (${pct}%)`);
    } catch (e) {
      console.error(`Failed: ${icon.name}`, e.message);
      totalAfter += originalSize;
    }
    // Cleanup tmp
    try { require('fs').unlinkSync(filePath + '.tmp'); } catch {}
  }

  console.log(`\n总计: ${(totalBefore/1024).toFixed(1)}KB → ${(totalAfter/1024).toFixed(1)}KB (节省 ${((1-totalAfter/totalBefore)*100).toFixed(1)}%)`);
}

compress().catch(e => { console.error(e); process.exit(1); });
