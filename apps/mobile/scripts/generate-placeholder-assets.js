/**
 * Generate Cova app icon and splash screen assets.
 * Uses sharp for image generation. Install with: npm install sharp
 * Run with: node scripts/generate-placeholder-assets.js
 */

async function main() {
  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    console.log('sharp not found, installing...');
    require('child_process').execSync('npm install sharp --no-save', { stdio: 'inherit' });
    sharp = require('sharp');
  }

  const ICON_SIZE = 1024;
  const BG = { r: 27, g: 58, b: 45 };
  const GOLD = { r: 196, g: 123, b: 60 };

  // Icon: 1024x1024, dark green background with gold arch + "cova" text
  const iconSvg = `<svg width="${ICON_SIZE}" height="${ICON_SIZE}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${ICON_SIZE}" height="${ICON_SIZE}" fill="rgb(${BG.r},${BG.g},${BG.b})"/>
    <!-- Arch mark: U-shape, open bottom -->
    <path d="M 312 520 L 312 320 Q 312 220 512 220 Q 712 220 712 320 L 712 520"
          fill="none" stroke="rgb(${GOLD.r},${GOLD.g},${GOLD.b})" stroke-width="60"
          stroke-linecap="round" stroke-linejoin="round"/>
    <!-- "cova" text -->
    <text x="512" y="700" text-anchor="middle"
          font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
          font-size="120" font-weight="300" letter-spacing="20"
          fill="rgb(${GOLD.r},${GOLD.g},${GOLD.b})">cova</text>
  </svg>`;

  await sharp(Buffer.from(iconSvg))
    .resize(ICON_SIZE, ICON_SIZE)
    .png()
    .toFile('assets/icon.png');
  console.log('✓ assets/icon.png generated (1024x1024)');

  // Splash: 1284x2778, same design centered
  const SPLASH_W = 1284;
  const SPLASH_H = 2778;
  const splashSvg = `<svg width="${SPLASH_W}" height="${SPLASH_H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${SPLASH_W}" height="${SPLASH_H}" fill="rgb(${BG.r},${BG.g},${BG.b})"/>
    <g transform="translate(${SPLASH_W / 2 - 200}, ${SPLASH_H / 2 - 300})">
      <path d="M 0 300 L 0 100 Q 0 0 200 0 Q 400 0 400 100 L 400 300"
            fill="none" stroke="rgb(${GOLD.r},${GOLD.g},${GOLD.b})" stroke-width="60"
            stroke-linecap="round" stroke-linejoin="round"/>
      <text x="200" y="480" text-anchor="middle"
            font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
            font-size="120" font-weight="300" letter-spacing="20"
            fill="rgb(${GOLD.r},${GOLD.g},${GOLD.b})">cova</text>
      <text x="200" y="540" text-anchor="middle"
            font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
            font-size="36" font-style="italic" letter-spacing="6"
            fill="rgb(${GOLD.r},${GOLD.g},${GOLD.b})" opacity="0.85">tinder for your home</text>
    </g>
  </svg>`;

  await sharp(Buffer.from(splashSvg))
    .resize(SPLASH_W, SPLASH_H)
    .png()
    .toFile('assets/splash-icon.png');
  console.log('✓ assets/splash-icon.png generated (1284x2778)');
}

main().catch(console.error);
