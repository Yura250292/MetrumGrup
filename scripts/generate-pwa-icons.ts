/**
 * Generate PWA icons from an SVG template using sharp.
 * Run: npx tsx scripts/generate-pwa-icons.ts
 */
import sharp from "sharp";
import path from "path";
import fs from "fs";

const ICONS_DIR = path.join(__dirname, "..", "public", "icons");
const PUBLIC_DIR = path.join(__dirname, "..", "public");

// Metrum "M" logo on dark background with blue accent
const SVG_ICON = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#0B0F17"/>
  <rect x="32" y="32" width="448" height="448" rx="72" fill="#121826"/>
  <text x="256" y="320" text-anchor="middle"
    font-family="system-ui, -apple-system, sans-serif"
    font-weight="800" font-size="280" fill="#3B5BFF"
    letter-spacing="-10">M</text>
</svg>`;

const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];

async function main() {
  if (!fs.existsSync(ICONS_DIR)) {
    fs.mkdirSync(ICONS_DIR, { recursive: true });
  }

  const svgBuffer = Buffer.from(SVG_ICON);

  // Generate all PNG sizes
  for (const size of SIZES) {
    const outPath = path.join(ICONS_DIR, `icon-${size}x${size}.png`);
    await sharp(svgBuffer).resize(size, size).png().toFile(outPath);
    console.log(`Generated: icon-${size}x${size}.png`);
  }

  // Apple touch icon (180x180)
  const applePath = path.join(ICONS_DIR, "apple-touch-icon.png");
  await sharp(svgBuffer).resize(180, 180).png().toFile(applePath);
  console.log("Generated: apple-touch-icon.png");

  // Favicon (32x32 PNG, saved as favicon.ico — browsers accept PNG favicons)
  const faviconPath = path.join(PUBLIC_DIR, "favicon.ico");
  await sharp(svgBuffer).resize(32, 32).png().toFile(faviconPath);
  console.log("Generated: favicon.ico");

  console.log("\nAll PWA icons generated successfully!");
}

main().catch((err) => {
  console.error("Error generating icons:", err);
  process.exit(1);
});
