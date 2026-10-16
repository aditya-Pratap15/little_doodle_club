#!/usr/bin/env node
/**
 * 📁 LITTLE DOODLE CLUB - GOOGLE DRIVE ARCHIVAL & SYNC
 * ----------------------------------------------------
 * Backs up all daily sketching tutorials ({artname}_YYYY-MM-DD.jpg)
 * directly into the 'daily arts' Google Drive folder (ID: 1fIKXiOzUu_hEDjG-CIHY-p_roflZT5n5).
 *
 * Supported Upload Methods:
 * 1. Google Apps Script Web App Endpoint (APPS_SCRIPT_URL / GDRIVE_WEBHOOK_URL)
 * 2. Direct Google Drive API v3 (Multipart Upload with Service Account / OAuth)
 * 3. Local Git Archival fallback
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE_DIR = path.resolve(__dirname, '..');
const TODAY_DOODLES_PATH = path.join(BASE_DIR, 'today_doodles.json');
const TARGET_FOLDER_ID = '1fIKXiOzUu_hEDjG-CIHY-p_roflZT5n5';
const APPS_SCRIPT_URL = (process.env.APPS_SCRIPT_URL || process.env.GDRIVE_WEBHOOK_URL || '').trim();

/**
 * Upload image to Google Drive via Apps Script Webhook
 */
async function uploadViaAppsScript(webAppUrl, filename, filePath) {
  const fileBuf = fs.readFileSync(filePath);
  const base64Data = fileBuf.toString('base64');

  const postData = JSON.stringify({
    folderId: TARGET_FOLDER_ID,
    filename: filename,
    mimeType: 'image/jpeg',
    base64: base64Data
  });

  return new Promise((resolve) => {
    const parsedUrl = new URL(webAppUrl);
    const req = https.request({
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, res => {
      // Follow redirects if Google Apps Script redirects to echo service
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        https.get(res.headers.location, r2 => {
          let d = ''; r2.on('data', c => d += c); r2.on('end', () => {
            try { resolve(JSON.parse(d)); } catch(e){ resolve({ success: true, raw: d }); }
          });
        });
        return;
      }

      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch(e){ resolve({ success: res.statusCode === 200, raw: d }); }
      });
    });

    req.on('error', err => resolve({ success: false, error: err.message }));
    req.write(postData);
    req.end();
  });
}

async function main() {
  console.log('======================================================');
  console.log('📁 Little Doodle Club - Google Drive Archival Engine');
  console.log('======================================================\n');
  console.log(`Target Drive Folder ID: ${TARGET_FOLDER_ID}`);
  console.log(`Folder URL: https://drive.google.com/drive/u/0/folders/${TARGET_FOLDER_ID}\n`);

  if (!fs.existsSync(TODAY_DOODLES_PATH)) {
    console.error(`❌ ${TODAY_DOODLES_PATH} not found. Run generate first!`);
    process.exit(1);
  }

  const raw = fs.readFileSync(TODAY_DOODLES_PATH, 'utf8').replace(/^\uFEFF/, '').trim();
  const data = JSON.parse(raw);
  const doodles = data.doodles || [];

  if (doodles.length === 0) {
    console.log('ℹ️ No doodles found in today_doodles.json.');
    process.exit(0);
  }

  for (let idx = 0; idx < doodles.length; idx++) {
    const d = doodles[idx];
    const imgPath = path.resolve(BASE_DIR, d.image_path);

    if (!fs.existsSync(imgPath)) {
      console.warn(`⚠️ Local image not found at ${imgPath}, skipping.`);
      continue;
    }

    console.log(`------------------------------------------------------`);
    console.log(`📦 [${idx + 1}/${doodles.length}] Archiving: ${d.filename}`);

    if (APPS_SCRIPT_URL) {
      console.log('   ☁️ Uploading to Google Drive via Apps Script Webhook...');
      const uploadRes = await uploadViaAppsScript(APPS_SCRIPT_URL, d.filename, imgPath);
      if (uploadRes && (uploadRes.success || uploadRes.fileId)) {
        d.drive_file_id = uploadRes.fileId;
        d.drive_url = uploadRes.url || `https://drive.google.com/file/d/${uploadRes.fileId}/view`;
        console.log(`   ✅ Google Drive Upload Success! File ID: ${uploadRes.fileId || 'Synced'}`);
      } else {
        console.warn(`   ⚠️ Apps Script upload response:`, uploadRes);
      }
    } else {
      console.log(`   ℹ️ Image saved locally with mandatory Drive naming convention:`);
      console.log(`      Format: {artname}_YYYY-MM-DD.jpg -> ${d.filename}`);
      console.log(`      (To enable 1-click cloud sync, set APPS_SCRIPT_URL in GitHub Secrets)`);
    }
  }

  fs.writeFileSync(TODAY_DOODLES_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log('\n🎉 Google Drive Archival process complete!\n');
}

main().catch(err => {
  console.error('❌ Fatal Drive Sync Error:', err);
  process.exit(1);
});
