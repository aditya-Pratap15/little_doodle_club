#!/usr/bin/env node
/**
 * 🎨 LITTLE DOODLE CLUB - GOOGLE DRIVE INGESTION (daily arts folder)
 * -----------------------------------------------------------------
 * 1. Queries Google Apps Script Web App for files in Google Drive folder:
 *    daily arts (ID: 1fIKXiOzUu_hEDjG-CIHY-p_roflZT5n5)
 * 2. Cross-references against 'state.json' so NO image or subject is EVER repeated.
 * 3. Shuffles unposted images randomly to pick 3 fresh tutorials.
 * 4. Downloads the 3 images into 'incoming_doodles/' with dual-layer fallback (direct stream + Apps Script base64).
 * 5. Outputs metadata to 'fetched_doodles.json'.
 */

const fs = require('fs');
const path = require('path');

const BASE_DIR = path.resolve(__dirname, '..');
const INCOMING_DIR = path.join(BASE_DIR, 'incoming_doodles');
const BRANDED_DIR = path.join(BASE_DIR, 'branded_doodles');
const FETCHED_METADATA_PATH = path.join(BASE_DIR, 'fetched_doodles.json');
const STATE_PATH = path.join(BASE_DIR, 'state.json');

const APPS_SCRIPT_URL = (process.env.APPS_SCRIPT_URL || process.env.GOOGLE_SCRIPT_URL || '').trim();

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function loadJson(p, fallback = {}) {
  if (fs.existsSync(p)) {
    try {
      const raw = fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '').trim();
      return JSON.parse(raw);
    } catch (e) {
      console.warn('⚠️ JSON parse error at ' + p + ':', e.message);
    }
  }
  return fallback;
}

function saveJson(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/**
 * Fisher-Yates array shuffle for true random distribution
 */
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Extract subject name from filename (e.g. 'chubby_capybara_2026-10-17.jpg' -> 'Chubby Capybara')
 */
function extractSubjectFromFilename(filename) {
  const cleanName = filename
    .replace(/\.[^.]+$/, '')
    .replace(/_\d{4}-\d{2}-\d{2}$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();

  return cleanName.replace(/\b\w/g, c => c.toUpperCase()) || 'Cute Sketch';
}

/**
 * Fetch JSON with retry for Google Apps Script cold-starts & redirects
 */
async function fetchJsonFromAppsScript(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      const text = await res.text();
      const trimmed = text.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        return JSON.parse(trimmed);
      }
      if (attempt < retries) await new Promise(r => setTimeout(r, 1500));
    } catch(e) {
      if (attempt === retries) throw e;
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  return null;
}

async function main() {
  console.log('======================================================');
  console.log('🎨 Little Doodle Club - Google Drive Ingestion (daily arts)');
  console.log('======================================================\n');

  ensureDir(INCOMING_DIR);
  // Clear any temporary files from previous runs
  fs.readdirSync(INCOMING_DIR).forEach(f => {
    if (f !== '.gitkeep') fs.unlinkSync(path.join(INCOMING_DIR, f));
  });

  ensureDir(BRANDED_DIR);
  fs.readdirSync(BRANDED_DIR).forEach(f => {
    if (f !== '.gitkeep') fs.unlinkSync(path.join(BRANDED_DIR, f));
  });

  const state = loadJson(STATE_PATH, {
    postedFileIds: [],
    postedFilenames: [],
    postedSubjects: [],
    history: []
  });

  if (!state.postedFileIds) state.postedFileIds = [];
  if (!state.postedFilenames) state.postedFilenames = [];
  if (!state.postedSubjects) state.postedSubjects = [];

  const targetCount = parseInt(process.env.POST_COUNT || '3', 10);
  const fetchedDoodles = [];

  if (!APPS_SCRIPT_URL) {
    console.error('❌ APPS_SCRIPT_URL environment variable is missing.');
    console.error('   Please ensure APPS_SCRIPT_URL is configured in GitHub repository secrets.');
    process.exit(1);
  }

  console.log('📡 Querying Google Drive folder (daily arts) via Apps Script Web App...');
  const result = await fetchJsonFromAppsScript(APPS_SCRIPT_URL);

  if (!result || !result.success || !Array.isArray(result.files)) {
    console.error('❌ Failed to retrieve files from Google Apps Script Web App:', result ? result.error : 'No response');
    process.exit(1);
  }

  console.log(`✅ Found ${result.files.length} total files in Google Drive folder "daily arts".\n`);

  // Filter out already posted files by ID, filename, and subject
  const unpostedFiles = result.files.filter(f => {
    const subj = extractSubjectFromFilename(f.name);
    return !state.postedFileIds.includes(f.id) &&
           !state.postedFilenames.includes(f.name) &&
           !state.postedSubjects.includes(subj);
  });

  console.log(`🎲 Unposted tutorials available in Google Drive: ${unpostedFiles.length}`);

  if (unpostedFiles.length === 0) {
    console.log('ℹ️ Zero unposted tutorials remaining in Google Drive folder.');
    process.exit(0);
  }

  // Shuffle randomly across all unposted files to pick 3 random tutorials
  shuffleArray(unpostedFiles);

  const candidates = unpostedFiles.slice(0, targetCount);

  for (let i = 0; i < candidates.length; i++) {
    const item = candidates[i];
    const destPath = path.join(INCOMING_DIR, item.name);
    const subject = extractSubjectFromFilename(item.name);

    console.log(`   [${i + 1}/${candidates.length}] Downloading (Random Pick from Drive): ${item.name} (${subject})...`);

    let downloaded = false;
    const dlUrl = item.downloadUrl || `https://drive.google.com/uc?export=download&id=${item.id}`;

    // Attempt 1: Direct stream download
    try {
      const dlRes = await fetch(dlUrl, { redirect: 'follow' });
      if (dlRes.status === 200) {
        const buf = Buffer.from(await dlRes.arrayBuffer());
        if (buf.length > 1000) {
          fs.writeFileSync(destPath, buf);
          console.log(`      ✅ Downloaded (${(buf.length / 1024).toFixed(1)} KB) from Drive stream`);
          downloaded = true;
        }
      }
    } catch(dlErr) {
      console.warn(`      ⚠️ Direct download notice: ${dlErr.message}`);
    }

    // Attempt 2: Rock-solid fallback via Apps Script base64 binary endpoint
    if (!downloaded) {
      console.log(`      🔄 Falling back to Apps Script base64 stream for: ${item.name}...`);
      try {
        const sep = APPS_SCRIPT_URL.includes('?') ? '&' : '?';
        const b64Data = await fetchJsonFromAppsScript(`${APPS_SCRIPT_URL}${sep}fileId=${item.id}`);
        if (b64Data && b64Data.success && b64Data.base64) {
          const buf = Buffer.from(b64Data.base64, 'base64');
          fs.writeFileSync(destPath, buf);
          console.log(`      ✅ Base64 download succeeded (${(buf.length / 1024).toFixed(1)} KB)`);
          downloaded = true;
        } else {
          console.error(`      ❌ Base64 fetch failed:`, b64Data ? b64Data.error : 'No data');
        }
      } catch(b64Err) {
        console.error(`      ❌ Base64 error:`, b64Err.message);
      }
    }

    if (downloaded && fs.existsSync(destPath)) {
      fetchedDoodles.push({
        driveFileId: item.id,
        filename: item.name,
        subject: subject,
        rawImagePath: path.relative(BASE_DIR, destPath).replace(/\\/g, '/'),
        createdTime: item.createdTime
      });
    }
  }

  if (fetchedDoodles.length === 0) {
    console.error('❌ Failed to download any tutorials from Google Drive.');
    process.exit(1);
  }

  console.log(`\n🎉 Successfully fetched ${fetchedDoodles.length} random tutorials from Google Drive!`);
  saveJson(FETCHED_METADATA_PATH, {
    fetchedAt: new Date().toISOString(),
    doodles: fetchedDoodles
  });

  console.log(`💾 Metadata written to: fetched_doodles.json\n`);
}

main().catch(err => {
  console.error('❌ Fatal Fetch Error:', err);
  process.exit(1);
});
