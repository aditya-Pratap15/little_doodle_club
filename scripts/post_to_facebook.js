#!/usr/bin/env node
/**
 * 🎨 LITTLE DOODLE CLUB - HYBRID PUBLISHER & SCHEDULER
 * ----------------------------------------------------
 * Reads 'today_doodles.json' (3 watermarked tutorial sheets).
 * - Post 1 (Morning 08:30 AM EDT): PUBLISHED LIVE IMMEDIATELY + First Comment posted alongside it!
 * - Post 2 (Afternoon 01:30 PM EDT): SCHEDULED into Facebook Page Planner!
 * - Post 3 (Evening 06:30 PM EDT): SCHEDULED into Facebook Page Planner!
 *
 * Saves live post ID & scheduled post IDs to today_doodles.json and state.json.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE_DIR = path.resolve(__dirname, '..');
const TODAY_DOODLES_PATH = path.join(BASE_DIR, 'today_doodles.json');
const STATE_PATH = path.join(BASE_DIR, 'state.json');

const VERIFIED_PAGE_ID = '1298820806658884';
const VERIFIED_PAGE_TOKEN = 'EAAUbRaJrCqMBSsxLPkyloZCf0hX0xIXRXxiR4nX5ZB16Ht27oZAvTB1IcwEZCVLkGjtwab8PZCJ5SP9tNUtqW2ZBdSZBF7BM0wqdz8VhK1GAgRGbh346Y6Apz3iMpt4ZA4YuiGKWsqwGxwUo79i1FomiXruz0gZB3ga9rmi6mHFDGxGXlwMVuCZCJdy2X3KoWsbyuK19HmbZCEZB';

const PAGE_ID = (process.env.FB_PAGE_ID_DOODLE || process.env.FB_PAGE_ID || VERIFIED_PAGE_ID).trim();
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
  return slots.map((s, idx) => {
    let ts = Math.floor(new Date(s.timeStr).getTime() / 1000);
    if (!s.forceLive && ts <= nowSec + 600) {
      // If the target slot has already passed today due to runner delays, space it out today:
      // Slot 2: +2 hours from now, Slot 3: +5 hours from now
      ts = nowSec + (idx === 1 ? 7200 : 18000);
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
      addField('caption', caption);

      const nowTs = Math.floor(Date.now() / 1000);
      if (scheduledPublishTime && scheduledPublishTime > nowTs + 600) {
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
      }, (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(d) });
          } catch(e) {
            resolve({ status: res.statusCode, body: d });
          }
        });
      });

      req.on('error', err => resolve({ status: 500, error: err.message }));
      req.write(payload);
      req.end();
    } catch(e) {
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
    console.error('❌ Error: today_doodles.json not found. Run watermark_studio.js first.');
    process.exit(1);
  }

  const todayData = loadJson(TODAY_DOODLES_PATH, { doodles: [] });
  const doodles = todayData.doodles || [];

  if (doodles.length === 0) {
    console.log('ℹ️ No doodles to publish.');
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

  for (let i = 0; i < doodles.length; i++) {
    const doodle = doodles[i];
    const imagePath = path.resolve(BASE_DIR, doodle.branded_image_path);
    const slot = slots[i] || slots[0];

    if (!fs.existsSync(imagePath)) {
      console.warn(`⚠️ Image file not found: ${imagePath}, skipping.`);
      continue;
    }

    const scheduledTime = slot.forceLive ? null : slot.timestamp;

    if (slot.forceLive) {
      console.log(`🚀 [${i + 1}/${doodles.length}] Publishing "${doodle.subject}" LIVE to Facebook (Morning Slot)...`);
    } else {
      console.log(`📅 [${i + 1}/${doodles.length}] Scheduling "${doodle.subject}" into Facebook Page Planner for: ${slot.edt} EDT (${slot.ist} IST)...`);
    }

    const res = await uploadPhotoToPage(PAGE_ID, PAGE_TOKEN, doodle.caption, imagePath, scheduledTime);

    if (res.status === 200 && res.body && (res.body.id || res.body.post_id)) {
      const postId = res.body.post_id || res.body.id;
      doodle.fb_post_id = postId;
      doodle.photo_id = res.body.id;
      doodle.scheduled_publish_time = scheduledTime;

      if (slot.forceLive) {
        console.log(`   ✅ PUBLISHED LIVE! Post ID: ${postId}`);

        // Post 1: Add first follow comment alongside the post immediately!
        const commentMsg = doodle.follow_comment || `❤️ Loving these daily easy drawing guides?\n👉 Follow Little Doodle Club for 3 new step-by-step doodle tutorials every single day!\n🎨 https://www.facebook.com/1298820806658884`;
        console.log(`   💬 Adding first follow comment with page link...`);
        const cRes = await postComment(postId, PAGE_TOKEN, commentMsg);
        if (cRes.status === 200 && cRes.body && cRes.body.id) {
          console.log(`   ✅ First follow comment posted successfully!`);
          doodle.comment_posted = true;
          doodle.comment_id = cRes.body.id;
        } else {
          console.warn(`   ⚠️ Could not post comment:`, cRes.body || cRes.error);
          doodle.comment_posted = false;
        }
      } else {
        console.log(`   ✅ SCHEDULED in Facebook Planner! Post ID: ${postId}`);
        doodle.comment_posted = false;
      }

      // Record to state to prevent reuse (case-insensitive deduplication)
      if (doodle.driveFileId && !state.postedFileIds.includes(doodle.driveFileId)) {
        state.postedFileIds.push(doodle.driveFileId);
      }
      if (doodle.filename && !state.postedFilenames.some(fn => fn.toLowerCase().trim() === doodle.filename.toLowerCase().trim())) {
        state.postedFilenames.push(doodle.filename);
      }
      if (doodle.subject && !state.postedSubjects.some(s => s.toLowerCase().trim() === doodle.subject.toLowerCase().trim())) {
        state.postedSubjects.push(doodle.subject);
      }

      state.history.push({
        date: new Date().toISOString(),
        subject: doodle.subject,
        filename: doodle.filename,
        driveFileId: doodle.driveFileId,
        fb_post_id: postId,
        scheduled_for: slot.forceLive ? 'LIVE (Morning)' : new Date(scheduledTime * 1000).toLocaleString(),
        comment_posted: doodle.comment_posted
      });

      state.lastUpdated = new Date().toISOString();
      state.lastPipelineDate = new Date().toISOString().slice(0, 10);

      saveJson(TODAY_DOODLES_PATH, todayData);
      saveJson(STATE_PATH, state);
      console.log(`   💾 State updated to prevent reuse.\n`);
    } else {
      console.error(`   ❌ Facebook Upload Failed (${res.status}):`, res.body || res.error);
    }

    await new Promise(r => setTimeout(r, 3000));
  }

  console.log('🎉 All tutorials processed (Post 1 live + Posts 2 & 3 scheduled)!\n');
}

main().catch(err => {
  console.error('❌ Fatal Posting Error:', err);
  process.exit(1);
});
