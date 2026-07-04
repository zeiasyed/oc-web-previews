import sharp from 'sharp';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const svg = readFileSync(join(root, 'public/icons/app-icon.svg'));

for (const size of [192, 512]) {
  const out = join(root, `public/icons/icon-${size}.png`);
  await sharp(svg, { density: 300 })
    .resize(size, size)
    .png()
    .toFile(out);
  console.log(`Wrote ${out}`);
}
