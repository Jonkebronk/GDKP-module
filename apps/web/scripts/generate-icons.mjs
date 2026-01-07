import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sourceImage = join(__dirname, '../public/gnome-logo.png');
const publicDir = join(__dirname, '../public');

const sizes = [
  { name: 'favicon-16.png', size: 16 },
  { name: 'favicon-32.png', size: 32 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
];

async function generateIcons() {
  console.log('Generating PWA icons from gnome-logo.png...');

  for (const { name, size } of sizes) {
    await sharp(sourceImage)
      .resize(size, size, {
        fit: 'cover',
        position: 'center'
      })
      .png()
      .toFile(join(publicDir, name));

    console.log(`  Created ${name} (${size}x${size})`);
  }

  console.log('Done!');
}

generateIcons().catch(console.error);
