const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const screenshotsDir = path.join(__dirname, '..', 'screenshots');
const DEBUG = process.argv.includes('--debug');
const BLUR_SIGMA = 30;
const DOWNSCALE_FACTOR = 8; // Shrink to 1/8th size to destroy text detail

async function redactRegions(filename, regions) {
  const filePath = path.join(screenshotsDir, filename);
  if (!fs.existsSync(filePath)) {
    console.log(`  SKIP: ${filename} not found`);
    return;
  }
  console.log(`Processing ${filename}...`);

  let imageBuffer = fs.readFileSync(filePath);
  const metadata = await sharp(imageBuffer).metadata();

  for (const region of regions) {
    let { left, top, width, height } = region;
    // Clamp to image bounds
    left = Math.max(0, Math.min(left, metadata.width - 1));
    top = Math.max(0, Math.min(top, metadata.height - 1));
    width = Math.min(width, metadata.width - left);
    height = Math.min(height, metadata.height - top);
    if (width <= 0 || height <= 0) continue;

    if (DEBUG) {
      // Debug mode: draw red semi-transparent overlay to verify positions
      const overlay = await sharp({
        create: { width, height, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 128 } }
      }).png().toBuffer();
      imageBuffer = await sharp(imageBuffer)
        .composite([{ input: overlay, left, top }])
        .toBuffer();
    } else {
      // Extract region, downscale to destroy text, upscale back, then blur edges
      const extracted = await sharp(imageBuffer)
        .extract({ left, top, width, height })
        .toBuffer();
      const smallW = Math.max(2, Math.round(width / DOWNSCALE_FACTOR));
      const smallH = Math.max(2, Math.round(height / DOWNSCALE_FACTOR));
      // Step 1: shrink to tiny size (destroys all text detail)
      const tiny = await sharp(extracted)
        .resize(smallW, smallH, { kernel: 'cubic' })
        .toBuffer();
      // Step 2: scale back up and blur to smooth edges (separate pipeline!)
      const blurred = await sharp(tiny)
        .resize(width, height, { kernel: 'cubic' })
        .blur(BLUR_SIGMA)
        .toBuffer();
      imageBuffer = await sharp(imageBuffer)
        .composite([{ input: blurred, left, top }])
        .toBuffer();
    }
  }

  const outPath = DEBUG
    ? filePath.replace('.png', '.debug.png')
    : filePath;

  await sharp(imageBuffer).toFile(outPath + '.tmp.png');
  fs.renameSync(outPath + '.tmp.png', outPath);
  console.log(`  Done: ${DEBUG ? 'marked' : 'blurred'} ${regions.length} regions`);
}

async function main() {
  // 01-dashboard-overview.png (1918x1197)
  // Card titles at y:113-122, sensitive names start at y:168, data at y:199
  await redactRegions('01-dashboard-overview.png', [
    // Card 1: Costliest Scrap Parts (part names + amounts)
    { left: 270, top: 160, width: 240, height: 265 },
    // Card 2: Cost in Top Incidents (subtitle + detail text lines)
    { left: 430, top: 160, width: 340, height: 175 },
    // Cards 4+5: Highest Scrap Machine + Cell (data spans x:951-1705)
    { left: 920, top: 160, width: 795, height: 145 },
    // Chart legend (part names)
    { left: 295, top: 1130, width: 225, height: 50 },
  ]);

  // 02-scrap-analytics.png (1917x1196)
  await redactRegions('02-scrap-analytics.png', [
    // Cell name headers
    { left: 40, top: 120, width: 105, height: 26 },
    { left: 505, top: 120, width: 118, height: 26 },
    // Machine leaderboard card
    { left: 30, top: 330, width: 320, height: 210 },
    // Cell leaderboard card
    { left: 480, top: 330, width: 310, height: 210 },
    // Char leaderboard card - data starts y:336
    { left: 930, top: 330, width: 650, height: 210 },
    // Part number card
    { left: 30, top: 618, width: 270, height: 200 },
    // Machine groups (cover all including Turbine Outputs)
    { left: 43, top: 860, width: 300, height: 230 },
  ]);

  // 03-machines-table.png (1917x1130)
  // Cover Machine name + ID + Cell columns; headers at y:198-207, data starts y:264
  await redactRegions('03-machines-table.png', [
    { left: 310, top: 260, width: 600, height: 865 },
  ]);

  // 04-cells-configuration.png (1918x1135)
  await redactRegions('04-cells-configuration.png', [
    // Sidebar cell list
    { left: 305, top: 50, width: 290, height: 460 },
    // Config panel (cell name + number + description)
    { left: 620, top: 55, width: 420, height: 200 },
    // Operations section (machine names at x:843-1073)
    { left: 630, top: 565, width: 475, height: 570 },
  ]);

  // 05-scrap-incident-creation.png (1917x1198)
  await redactRegions('05-scrap-incident-creation.png', [
    // Machine ID column
    { left: 298, top: 540, width: 75, height: 225 },
    // Part Number column
    { left: 388, top: 540, width: 88, height: 225 },
    // Characteristic column (wide for long descriptions)
    { left: 490, top: 540, width: 280, height: 225 },
    // Note text column (same y range as other columns)
    { left: 700, top: 540, width: 360, height: 225 },
  ]);

  // 06-parts-master.png (1918x1132)
  // Headers above y:260, data starts at y:263
  await redactRegions('06-parts-master.png', [
    // Part Number column
    { left: 295, top: 260, width: 70, height: 416 },
    // Name column
    { left: 345, top: 260, width: 200, height: 416 },
    // Material/Spec column (very wide for long specs)
    { left: 475, top: 260, width: 620, height: 416 },
  ]);

  // 07-characteristics-master.png (1918x1137)
  // Headers above y:259, data starts at y:262
  await redactRegions('07-characteristics-master.png', [
    { left: 290, top: 259, width: 500, height: 171 },
  ]);

  console.log(`\nAll screenshots ${DEBUG ? 'debug-marked' : 'redacted'}!`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
