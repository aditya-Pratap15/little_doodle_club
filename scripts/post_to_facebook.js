#!/usr/bin/env node
/**
 * 🎨 LITTLE DOODLE CLUB - HYBRID PUBLISHER & PLANNER SCHEDULER
 * -----------------------------------------------------------
 * Architecture:
 * - Post 1 (Morning Inspiration - 08:30 AM EDT):
 *     Published LIVE immediately + First Follow Comment dropped immediately!
 * - Post 2 (Afternoon Break - 01:30 PM EDT):
 *     Scheduled into Facebook Page Planner. (Comment dropped by afternoon wake run)
 * - Post 3 (Evening Relax & Draw - 06:30 PM EDT):
 *     Scheduled into Facebook Page Planner. (Comment dropped by evening wake run)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE_DIR = path.resolve(__dirname, '..');
const TODAY_DOODLES_PATH = path.join(BASE_DIR, 'today_doodles.json');
const STATE_PATH = path.join(BASE_DIR, 'state.json');

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
 * Calculate the 3 peak USA EDT engagement timestamps
 */
function getPeakUsaSlots() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(now);
  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
  const edtDateStr = `${year}-${month}-${day}`;

  const slots = [
    { name: 'Slot 1: Morning (08:30 AM EDT)', timeStr: `${edtDateStr}T08:30:00-04:00`, forceLive: true },
    { name: 'Slot 2: Afternoon (01:30 PM EDT)', timeStr: `${edtDateStr}T13:30:00-04:00`, forceLive: false },
    { name: 'Slot 3: Evening (06:30 PM EDT)', timeStr: `${edtDateStr}T18:30:00-04:00`, forceLive: false }
  ];

  const nowSec = Math.floor(Date.now() / 1000);
  return slots.map(s => {
    let ts = Math.floor(new Date(s.timeStr).getTime() / 1000);
    if (!s.forceLive && ts <= nowSec + 600) {
      ts += 86400; // +24 hours
    }
    return {
      name: s.name,
      timestamp: ts,
      forceLive: s.forceLive,
      edt: new Date(ts * 1000).toLocaleString('en-US', { timeZone: 'America/New_York' }),
      ist: new Date(ts * 1000).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })
    };
  });
}

/**
 * Upload single image to Facebook Page (Scheduled or Live)
 */
function uploadPhotoToPage(pageId, token, caption, imagePath, scheduledPublishTime = null) {
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

      const nowSec = Math.floor(Date.now() / 1000);
      if (scheduledPublishTime && scheduledPublishTime > nowSec + 600) {
        addField('published', 'false');
        addField('scheduled_publish_time', String(scheduledPublishTime));
      } else {
        addField('published', 'true');
      }

      const header = Buffer.from(body + `--${boundary}\r\nContent-Disposition: form-data; name="source"; filename="${filename}"\r\nContent-Type: image/jpeg\r\n\r\n`);
      const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
      const payload = Buffer.concat([header, imgBuf, footer]);

      const req = https.request({
        hostname: 'graph.facebook.com',
        port: 443,
        path: `/v19.0/${pageId}/photos`,
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
function postComment(postId, token, message) {
  return new Promise((resolve) => {
    try {
      const postData = new URLSearchParams({
        access_token: token,
        message: message
      }).toString();

      const req = https.request({
        hostname: 'graph.facebook.com',
        port: 443,
        path: `/v19.0/${postId}/comments`,
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
  console.log('🎨 Little Doodle Club - Hybrid Publisher & Scheduler');
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

  const slots = getPeakUsaSlots();
  console.log(`Page: Little Doodle Club (${PAGE_ID})`);
  console.log(`Total Tutorials to Process: ${doodles.length}\n`);

  const nowSec = Math.floor(Date.now() / 1000);

  for (let idx = 0; idx < doodles.length; idx++) {
    const d = doodles[idx];
    const slot = slots[idx % slots.length];
    // Slot 1 publishes LIVE immediately with comment! Slot 2 and 3 are scheduled into Facebook Planner
    const isLiveImmediate = idx === 0 || slot.forceLive;
    const schedTs = isLiveImmediate ? null : slot.timestamp;

    if (d.fb_post_id) {
      console.log(`⏭️  [${idx + 1}/${doodles.length}] "${d.subject}" already scheduled/posted (ID: ${d.fb_post_id}). Skipping.`);
      continue;
    }
    if (d.driveFileId && state.postedFileIds.includes(d.driveFileId)) {
      console.log(`⏭️  [${idx + 1}/${doodles.length}] "${d.subject}" already marked in state.json. Skipping.`);
      continue;
    }

    const imgPath = path.resolve(BASE_DIR, d.branded_image_path);
    if (!fs.existsSync(imgPath)) {
      console.warn(`⚠️ Branded image not found: ${imgPath}, skipping.`);
      continue;
    }

    if (isLiveImmediate) {
      console.log(`🚀 [${idx + 1}/${doodles.length}] Publishing "${d.subject}" LIVE to Facebook (Morning Slot)...`);
    } else {
      console.log(`🕒 [${idx + 1}/${doodles.length}] Scheduling "${d.subject}" into Facebook Page Planner for: ${slot.edt} EDT (${slot.ist} IST)...`);
    }

    const res = await uploadPhotoToPage(PAGE_ID, PAGE_TOKEN, d.caption, imgPath, schedTs);

    if (res.status === 200 && res.body && (res.body.post_id || res.body.id)) {
      const postId = res.body.post_id || res.body.id;
      d.fb_post_id = postId;
      d.scheduled_publish_time = schedTs;

      if (isLiveImmediate) {
        console.log(`   ✅ PUBLISHED LIVE! Post ID: ${postId}`);
        console.log(`   💬 Adding first follow comment with page link...`);
        const commentMsg = d.follow_comment || '❤️ Loving these daily easy drawing guides?\n👉 Follow Little Doodle Club for 3 new step-by-step doodle tutorials every single day!\n🎨 https://www.facebook.com/1298820806658884';
        const commentRes = await postComment(postId, PAGE_TOKEN, commentMsg);
        if (commentRes.status === 200) {
          console.log(`   ✅ First follow comment posted successfully!`);
          d.comment_posted = true;
        } else {
          d.comment_posted = false;
        }
      } else {
        console.log(`   ✅ SCHEDULED in Facebook Planner! Post ID: ${postId}`);
        d.comment_posted = false;
      }

      // Update state
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
        fb_post_id: postId,
        scheduled_for: isLiveImmediate ? 'LIVE (Morning)' : slot.edt,
        comment_posted: d.comment_posted
      });

      saveJson(STATE_PATH, state);
      saveJson(TODAY_DOODLES_PATH, todayData);
      console.log(`   💾 State updated to prevent reuse.\n`);
    } else {
      console.error(`   ❌ Facebook Upload Error (${res.status}):`, res.body || res.error);
    }

    if (idx < doodles.length - 1) {
      await new Promise(r => setTimeout(r, 4000));
    }
  }

  console.log('🎉 All tutorials processed (Post 1 live + Posts 2 & 3 scheduled)!\n');
}

main().catch(err => {
  console.error('❌ Fatal Facebook Script Error:', err);
  process.exit(1);
});
