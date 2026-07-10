import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const logo = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${pad ? 0 : 96}" fill="#0d9488"/>
  <text x="256" y="${pad ? 320 : 330}" font-family="Arial, sans-serif"
        font-size="${pad ? 160 : 200}" font-weight="bold"
        fill="#ffffff" text-anchor="middle">Ed</text>
</svg>`;

mkdirSync('public/icons', { recursive: true });
for (const size of [192, 512]) {
  await sharp(Buffer.from(logo(false))).resize(size, size).png()
    .toFile(`public/icons/icon-${size}.png`);
}
await sharp(Buffer.from(logo(true))).resize(512, 512).png()
  .toFile('public/icons/icon-512-maskable.png');
console.log('Icônes générées dans public/icons/');
