#!/usr/bin/env node
/**
 * 🎨 LITTLE DOODLE CLUB - FACEBOOK PAGE AUTO-PUBLISHER & COMMENTER
 * ---------------------------------------------------------------
 * 1. Reads 'today_doodles.json' containing branded tutorials and captions.
 * 2. Uploads the watermarked photo to Facebook Page 'Little Doodle Club' (1298820806658884).
 * 3. Immediately posts the follow comment with the page link https://www.facebook.com/1298820806658884.
 * 4. Updates 'state.json' with posted file IDs and subjects so nothing is EVER repeated!
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE_DIR = path.resolve(__dirname, '..');
const TODAY_DOODLES_PATH = path.join(BASE_DIR, 'today_doodles.json');
const STATE_PATH = path.join(BASE_DIR, 'state.json');

// Permanent Never-Expiring Page Token (expires_at: 0) for Little Doodle Club
const VERIFIED_PAGE_TOKEN = 'EAAUbRaJrCqMBSsxLPkyloZCf0hX0xIXRXxiR4nX5ZB16Ht27oZAvTB1IcwEZCVLkGjtwab8PZCJ5SP9tNUtqW2ZBdSZBF7BM0wqdz8VhK1GAgRGbh346Y6Apz3iMpt4ZA4YuiGKWsqwGxwUo79i1FomiXruz0gZB3ga9rmi6mHFDGxGXlwMVuCZCJdy2X3KoWsbyuK19HmbZCEZB';
const PAGE_ID = (process.env.FB_PAGE_ID_DOODLE || process.env.FB_PAGE_ID || '1298820806658884').trim();
const PAGE_TOKEN = (process.env.FB_TOKEN_DOODLE || process.env.FB_PAGE_TOKEN || VERIFIED_PAGE_TOKEN).trim();

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
 * Upload single image to Facebook Page via multipart/form-data
 */
function uploadPhotoToPage(pageId, token, caption, imagePath) {
  return new Promise((resolve) => {
    try {
      const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
      const imgBuf = fs.readFileSync(imagePath);
      const filename = path.basename(imagePath);

      let body = '';
      const addField = (name, val) => {
        body += `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${val}\r\n`;
      };

      addField('access_token', token);
      addField('message', caption);
      addField('published', 'true');

      const header = Buffer.from(body + `--${boundary}\r\nContent-Disposition: form-data; name="source"; filename="${filename}"\r\nContent-Type: image/jpeg\r\n\r\n`);
      const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
      const payload = Buffer.concat([header, imgBuf, footer]);

      const req = https.request({
        hostname: 'graph.facebook.com',
        port: 443,
        path: `/v26.0/${pageId}/photos`,
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': payload.length
        }
      }, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch (e) {
            resolve({ status: res.statusCode, body: data });
          }
        });
      });

      req.on('error', err => resolve({ status: 500, error: err.message }));
      req.write(payload);
      req.end();
    } catch (e) {
      resolve({ status: 500, error: e.message });
    }
  });
}

/**
 * Add Pinned Follow Comment on Facebook Post
 */
async function postComment(postId, token, message) {
  return new Promise((resolve) => {
    try {
      const postData = new URLSearchParams({
        access_token: token,
        message: message
      }).toString();

      const req = https.request({
        hostname: 'graph.facebook.com',
        port: 443,
        path: `/v26.0/${postId}/comments`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData)
        }
      }, res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(d) }); } catch(e){ resolve({ status: res.statusCode, body: d }); }
        });
      });

      req.on('error', err => resolve({ status: 500, error: err.message }));
      req.write(postData);
      req.end();
    } catch(e) { resolve({ status: 500, error: e.message }); }
  });
}

async function main() {
  console.log('======================================================');
  console.log('🎨 Little Doodle Club - Facebook Auto-Publisher');
  console.log('======================================================\n');

  if (!fs.existsSync(TODAY_DOODLES_PATH)) {
    console.error(`❌ ${TODAY_DOODLES_PATH} not found. Run watermark_studio.js first!`);
    process.exit(1);
  }

  const todayData = loadJson(TODAY_DOODLES_PATH, { doodles: [] });
  const doodles = todayData.doodles || [];

  if (doodles.length === 0) {
    console.log('⚠️ No doodles found in today_doodles.json.');
    process.exit(0);
  }

  const state = loadJson(STATE_PATH, {
    postedFileIds: [],
    postedFilenames: [],
    postedSubjects: [],
    history: []
  });

  if (!state.postedFileIds) state.postedFileIds = [];
  if (!state.postedFilenames) state.postedFilenames = [];
  if (!state.postedSubjects) state.postedSubjects = [];
  if (!state.history) state.history = [];

  console.log(`Page: Little Doodle Club (${PAGE_ID})`);
  console.log(`Total Tutorials to Process: ${doodles.length}\n`);

  for (let idx = 0; idx < doodles.length; idx++) {
    const d = doodles[idx];

    // Check if already posted
    if (d.fb_post_id) {
      console.log(`⏭️  [${idx + 1}/${doodles.length}] "${d.subject}" already posted (Post ID: ${d.fb_post_id}). Skipping.`);
      continue;
    }
    if (d.driveFileId && state.postedFileIds.includes(d.driveFileId)) {
      console.log(`⏭️  [${idx + 1}/${doodles.length}] "${d.subject}" file ID already marked in state.json. Skipping.`);
      continue;
    }

    const imgPath = path.resolve(BASE_DIR, d.branded_image_path);
    if (!fs.existsSync(imgPath)) {
      console.warn(`⚠️ Branded image not found: ${imgPath}, skipping.`);
      continue;
    }

    console.log(`🚀 [${idx + 1}/${doodles.length}] Publishing "${d.subject}" live to Facebook...`);

    const res = await uploadPhotoToPage(PAGE_ID, PAGE_TOKEN, d.caption, imgPath);

    if (res.status === 200 && res.body && (res.body.post_id || res.body.id)) {
      const postId = res.body.post_id || res.body.id;
      d.fb_post_id = postId;
      console.log(`   ✅ Published! Photo/Post ID: ${postId}`);

      // Post follow comment
      const commentMsg = d.follow_comment || `❤️ Loving these daily easy drawing guides?\n👉 Follow Little Doodle Club for 3 new step-by-step doodle tutorials every single day!\n🎨 https://www.facebook.com/1298820806658884`;

      console.log(`   💬 Adding follow comment with page link...`);
      const commentRes = await postComment(postId, PAGE_TOKEN, commentMsg);
      if (commentRes.status === 200) {
        console.log(`   ✅ Follow comment posted successfully!`);
      } else {
        console.warn(`   ⚠️ Comment response: ${JSON.stringify(commentRes.body)}`);
      }

      // Update state to guarantee no repetition
      if (d.driveFileId && !state.postedFileIds.includes(d.driveFileId)) {
        state.postedFileIds.push(d.driveFileId);
      }
      if (d.filename && !state.postedFilenames.includes(d.filename)) {
        state.postedFilenames.push(d.filename);
      }
      if (d.subject && !state.postedSubjects.includes(d.subject)) {
        state.postedSubjects.push(d.subject);
      }

      state.history.push({
        date: new Date().toISOString(),
        subject: d.subject,
        filename: d.filename,
        driveFileId: d.driveFileId,
        fb_post_id: postId
      });

      // Save state and today_doodles after each successful upload
      saveJson(STATE_PATH, state);
      saveJson(TODAY_DOODLES_PATH, todayData);

      console.log(`   💾 State updated to prevent reuse.\n`);
    } else {
      console.error(`   ❌ Facebook Upload Error (${res.status}):`, res.body || res.error);
    }

    // Delay between multiple uploads
    if (idx < doodles.length - 1) {
      await new Promise(r => setTimeout(r, 4000));
    }
  }

  console.log('🎉 Little Doodle Club Facebook automation run complete!\n');
}

main().catch(err => {
  console.error('❌ Fatal Facebook Script Error:', err);
  process.exit(1);
});
