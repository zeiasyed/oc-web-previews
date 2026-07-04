import sharp from 'sharp';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

for (const size of [192, 512]) {
  const file = join(root, `public/icons/icon-${size}.png`);
  const tmp = `${file}.tmp`;

  await sharp(file)
    .modulate({ brightness: 1.22, saturation: 1.3 })
    .toFile(tmp);

  await sharp(tmp).toFile(file);
  console.log(`Brightened ${file}`);
}
