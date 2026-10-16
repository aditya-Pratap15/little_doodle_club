#!/usr/bin/env node
/**
 * 🎨 LITTLE DOODLE CLUB - GOOGLE DRIVE RANDOM INGESTION (Never-Expiring)
 * ---------------------------------------------------------------------
 * 1. Queries the Google Apps Script Web App for all images in Drive folder:
 *    1fIKXiOzUu_hEDjG-CIHY-p_roflZT5n5
 * 2. Cross-references against 'state.json' so NO image or subject is EVER repeated.
 * 3. Shuffles all unposted images randomly to pick a rich mix of different themes every day!
 * 4. Downloads up to targetCount (3) unposted images into 'incoming_doodles/'.
 * 5. Outputs metadata to 'fetched_doodles.json'.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE_DIR = path.resolve(__dirname, '..');
const INCOMING_DIR = path.join(BASE_DIR, 'incoming_doodles');
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
 * Download file from URL (following Google Drive redirects)
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        try { fs.unlinkSync(destPath); } catch(e){}
        return reject(new Error(`Download failed with HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => resolve(destPath));
      });
    }).on('error', (err) => {
      file.close();
      try { fs.unlinkSync(destPath); } catch(e){}
      reject(err);
    });
  });
}

/**
 * Fetch file binary base64 via Apps Script Web App
 */
async function fetchBase64FromAppsScript(webAppUrl, fileId) {
  const url = `${webAppUrl}?fileId=${encodeURIComponent(fileId)}`;
  return new Promise((resolve) => {
    https.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        https.get(res.headers.location, r2 => {
          let d = ''; r2.on('data', c => d += c); r2.on('end', () => {
            try { resolve(JSON.parse(d)); } catch(e){ resolve(null); }
          });
        }).on('error', () => resolve(null));
        return;
      }
      let d = ''; res.on('data', c => d += c); res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch(e){ resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

/**
 * Query Apps Script Web App for file list
 */
async function queryAppsScriptFiles(webAppUrl) {
  return new Promise((resolve) => {
    https.get(webAppUrl, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        https.get(res.headers.location, r2 => {
          let d = ''; r2.on('data', c => d += c); r2.on('end', () => {
            try { resolve(JSON.parse(d)); } catch(e){ resolve({ success: false, error: e.message }); }
          });
        }).on('error', err => resolve({ success: false, error: err.message }));
        return;
      }
      let d = ''; res.on('data', c => d += c); res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch(e){ resolve({ success: false, error: e.message }); }
      });
    }).on('error', err => resolve({ success: false, error: err.message }));
  });
}

async function main() {
  console.log('======================================================');
  console.log('🎲 Little Doodle Club - Random Diverse Theme Ingestion');
  console.log('======================================================\n');

  ensureDir(INCOMING_DIR);

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

  // METHOD 1: Fetch via Google Apps Script Web App
  if (APPS_SCRIPT_URL) {
    console.log('📡 Querying Google Drive library via Apps Script Web App...');
    const result = await queryAppsScriptFiles(APPS_SCRIPT_URL);

    if (result && result.success && Array.isArray(result.files)) {
      console.log(`✅ Found ${result.files.length} total files in Google Drive folder.\n`);

      // Filter out already posted files by ID, filename, and subject
      const unpostedFiles = result.files.filter(f => {
        const subj = extractSubjectFromFilename(f.name);
        return !state.postedFileIds.includes(f.id) &&
               !state.postedFilenames.includes(f.name) &&
               !state.postedSubjects.includes(subj);
      });

      console.log(`🎯 Unposted files available across all themes: ${unpostedFiles.length}`);

      // Shuffle randomly across all unposted files to pick an exciting variety
      shuffleArray(unpostedFiles);

      const candidates = unpostedFiles.slice(0, targetCount);

      for (let i = 0; i < candidates.length; i++) {
        const item = candidates[i];
        const destPath = path.join(INCOMING_DIR, item.name);
        const subject = extractSubjectFromFilename(item.name);

        console.log(`   [${i + 1}/${candidates.length}] Downloading (Random Pick): ${item.name} (${subject})...`);

        // Fetch binary base64 directly from Apps Script
        const base64Res = await fetchBase64FromAppsScript(APPS_SCRIPT_URL, item.id);
        if (base64Res && base64Res.base64) {
          fs.writeFileSync(destPath, Buffer.from(base64Res.base64, 'base64'));
          console.log(`      ✅ Downloaded ${(fs.statSync(destPath).size / 1024).toFixed(1)} KB via Apps Script Blob`);
        } else if (item.downloadUrl) {
          try {
            await downloadFile(item.downloadUrl, destPath);
            console.log(`      ✅ Downloaded via Direct Drive Stream`);
          } catch(dlErr) {
            console.error(`      ❌ Failed to download ${item.name}:`, dlErr.message);
            continue;
          }
        }

        if (fs.existsSync(destPath)) {
          fetchedDoodles.push({
            driveFileId: item.id,
            filename: item.name,
            subject: subject,
            rawImagePath: path.relative(BASE_DIR, destPath).replace(/\\/g, '/'),
            createdTime: item.createdTime
          });
        }
      }
    } else {
      console.warn('⚠️ Could not retrieve files from Apps Script Web App:', result ? result.error : 'No response');
    }
  } else {
    console.log('ℹ️ APPS_SCRIPT_URL not set in environment.');
  }

  // METHOD 2: Fallback to existing files in local storage (shuffled randomly)
  if (fetchedDoodles.length < targetCount) {
    console.log(`\n🔍 Checking local storage for unprocessed tutorials...`);
    const searchDirs = [INCOMING_DIR, path.join(BASE_DIR, 'daily_doodles')];
    let localCandidates = [];

    for (const sDir of searchDirs) {
      if (!fs.existsSync(sDir)) continue;
      const localFiles = fs.readdirSync(sDir).filter(f => f.match(/\.(jpg|jpeg|png)$/i));

      for (const f of localFiles) {
        const subject = extractSubjectFromFilename(f);
        const fullP = path.join(sDir, f);

        const alreadyFetched = fetchedDoodles.some(d => d.filename === f);
        const alreadyPosted = state.postedFileIds.includes(f) ||
                              state.postedFilenames.includes(f) ||
                              state.postedSubjects.includes(subject);

        if (!alreadyFetched && !alreadyPosted) {
          localCandidates.push({ f, subject, fullP });
        }
      }
    }

    shuffleArray(localCandidates);

    for (const cand of localCandidates) {
      if (fetchedDoodles.length >= targetCount) break;
      fetchedDoodles.push({
        driveFileId: cand.f,
        filename: cand.f,
        subject: cand.subject,
        rawImagePath: path.relative(BASE_DIR, cand.fullP).replace(/\\/g, '/'),
        createdTime: fs.statSync(cand.fullP).mtime.toISOString()
      });
      console.log(`   ✅ Found local tutorial: ${cand.f} (${cand.subject})`);
    }
  }

  if (fetchedDoodles.length === 0) {
    console.log('\nℹ️ Zero new unposted tutorials found. Nothing to process.');
    process.exit(0);
  }

  console.log(`\n🎉 Successfully prepared ${fetchedDoodles.length} unposted random tutorials!`);
  saveJson(FETCHED_METADATA_PATH, {
    fetchedAt: new Date().toISOString(),
    doodles: fetchedDoodles
  });

  console.log(`📁 Metadata written to: fetched_doodles.json\n`);
}

main().catch(err => {
  console.error('❌ Fatal Fetch Error:', err);
  process.exit(1);
});
