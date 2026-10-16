#!/usr/bin/env node
/**
 * 🎨 LITTLE DOODLE CLUB - WATERMARK STUDIO & CAPTION CREATOR
 * ---------------------------------------------------------
 * 1. Takes daily tutorial images (fetched from Drive).
 * 2. Overlays the page logo at the EXACT CENTER of the 4-panel grid ((W-w)/2 : (H-h)/2).
 * 3. Watermark specs: Exactly 43px size with 30% transparency (0.7 alpha) for a subtle watermark.
 * 4. Inspects filename to identify the subject (e.g., 'chubby_capybara_2026-10-17.jpg' -> 'Chubby Capybara').
 * 5. Generates rich captions with Unicode bold, tutorial steps, and tailored hashtags.
 * 6. Prepares the pinned follow comment with page link https://www.facebook.com/1298820806658884.
 * 7. Outputs ready-to-post payload to 'today_doodles.json'.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BASE_DIR = path.resolve(__dirname, '..');
const INCOMING_DIR = path.join(BASE_DIR, 'incoming_doodles');
const BRANDED_DIR = path.join(BASE_DIR, 'branded_doodles');
const FETCHED_JSON_PATH = path.join(BASE_DIR, 'fetched_doodles.json');
const TODAY_DOODLES_PATH = path.join(BASE_DIR, 'today_doodles.json');
const STATE_PATH = path.join(BASE_DIR, 'state.json');

// Preferred logo paths
const LOGO_PATHS = [
  path.join(BASE_DIR, 'assets', 'page_logo.png'),
  path.join(BASE_DIR, 'image_20261015_174031-modified.png')
];

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function loadJson(p, fallback = {}) {
  try {
    if (!fs.existsSync(p)) return fallback;
    const raw = fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '').trim();
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

function saveJson(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/**
 * Format string as Unicode Bold Sans-Serif
 */
function toUnicodeBold(text) {
  if (!text || typeof text !== 'string') return '';
  return Array.from(text).map(c => {
    const code = c.charCodeAt(0);
    if (code >= 65 && code <= 90) return String.fromCodePoint(0x1D5D4 + code - 65);   // A-Z
    if (code >= 97 && code <= 122) return String.fromCodePoint(0x1D5EE + code - 97);  // a-z
    if (code >= 48 && code <= 57) return String.fromCodePoint(0x1D7EC + code - 48);   // 0-9
    return c;
  }).join('');
}

/**
 * Extract clean subject from filename (e.g., 'chubby_capybara_2026-10-17.jpg' -> 'Chubby Capybara')
 */
function extractSubject(filename) {
  const clean = filename
    .replace(/\.[^.]+$/, '')
    .replace(/_\d{4}-\d{2}-\d{2}$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();

  return clean.replace(/\b\w/g, c => c.toUpperCase()) || 'Cute Sketch';
}

/**
 * Watermark image at exact center: (W-w)/2 : (H-h)/2
 * Logo is scaled to 43px with 30% transparency (0.7 opacity)
 */
function applyCenteredWatermark(inputPath, logoPath, outputPath) {
  const filter = '[1:v]scale=43:43,format=rgba,colorchannelmixer=aa=0.5[logo];[0:v][logo]overlay=(W-w)/2:(H-h)/2';
  const cmd = `ffmpeg -y -i "${inputPath}" -i "${logoPath}" -filter_complex "${filter}" -update 1 -frames:v 1 "${outputPath}"`;
  execSync(cmd, { stdio: 'pipe' });
}

/**
 * Generate Caption and Hashtags based on subject
 */
function generateCaption(subject) {
  const subjectBold = toUnicodeBold(subject);
  const tagSubject = subject.replace(/\s+/g, '');

  const caption = `✨ 𝗛𝗼𝘄 𝘁𝗼 𝗗𝗿𝗮𝘄: ${subjectBold} 🎨✏️

Follow these 4 simple steps to bring your ${subject} doodle to life!
1️⃣ Start with basic shapes & proportions
2️⃣ Outline key contours and cute features
3️⃣ Add expressive details and clean line work
4️⃣ Color and shade for the final pop!

💬 Which cute doodle should we draw next? Drop your ideas in the comments below! 👇

🏷️ #LittleDoodleClub #HowToDraw #${tagSubject} #DrawingTutorial #EasyDrawing #StepByStepDrawing #DoodleArt #ArtForBeginners #CuteArt #DrawingGuide #DailyDoodle`;

  return caption;
}

/**
 * Generate Pinned/First Follow Comment
 */
function generateFollowComment() {
  return `❤️ Loving these daily easy drawing guides?
👉 Follow Little Doodle Club for 3 new step-by-step doodle tutorials every single day!
🎨 https://www.facebook.com/1298820806658884`;
}

async function main() {
  console.log('======================================================');
  console.log('🎨 Little Doodle Club - Watermark Studio (43px Emblem)');
  console.log('======================================================\n');

  ensureDir(BRANDED_DIR);

  // Find logo
  const logoPath = LOGO_PATHS.find(p => fs.existsSync(p));
  if (!logoPath) {
    console.error('❌ Logo not found in assets/page_logo.png or workspace!');
    process.exit(1);
  }
  console.log(`✅ Found Page Logo: ${path.basename(logoPath)}`);

  // Load items to watermark from fetched_doodles.json or incoming_doodles
  let items = [];
  const fetched = loadJson(FETCHED_JSON_PATH, null);
  if (fetched && Array.isArray(fetched.doodles) && fetched.doodles.length > 0) {
    items = fetched.doodles;
  } else if (fs.existsSync(INCOMING_DIR)) {
    const files = fs.readdirSync(INCOMING_DIR).filter(f => f.match(/\.(jpg|jpeg|png)$/i));
    items = files.map(f => ({
      driveFileId: f,
      filename: f,
      subject: extractSubject(f),
      rawImagePath: path.relative(BASE_DIR, path.join(INCOMING_DIR, f)).replace(/\\/g, '/')
    }));
  }

  if (items.length === 0) {
    console.log('⚠️ No images found to watermark. Run fetch_from_drive.js first.');
    process.exit(0);
  }

  console.log(`\n🖼️  Processing ${items.length} images for 43px branding (50% opacity)...\n`);

  const readyDoodles = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const rawPath = path.resolve(BASE_DIR, item.rawImagePath);
    if (!fs.existsSync(rawPath)) {
      console.warn(`   ⚠️ Raw image not found: ${rawPath}, skipping.`);
      continue;
    }

    const outFilename = `watermarked_${path.basename(item.filename)}`;
    const outPath = path.join(BRANDED_DIR, outFilename);

    console.log(`   [${i + 1}/${items.length}] Watermarking 43px center badge: ${item.subject}...`);
    applyCenteredWatermark(rawPath, logoPath, outPath);

    const caption = generateCaption(item.subject);
    const comment = generateFollowComment();

    readyDoodles.push({
      driveFileId: item.driveFileId,
      filename: item.filename,
      subject: item.subject,
      branded_image_path: path.relative(BASE_DIR, outPath).replace(/\\/g, '/'),
      caption: caption,
      follow_comment: comment
    });

    console.log(`      ✅ Watermarked (43px, 50% opacity) -> ${outFilename}`);
  }

  saveJson(TODAY_DOODLES_PATH, {
    processedAt: new Date().toISOString(),
    count: readyDoodles.length,
    doodles: readyDoodles
  });

  console.log(`\n🎉 Successfully branded ${readyDoodles.length} tutorials! Saved to today_doodles.json\n`);
}

main().catch(err => {
  console.error('❌ Watermark Studio Error:', err);
  process.exit(1);
});
