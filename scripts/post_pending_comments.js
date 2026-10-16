#!/usr/bin/env node
/**
 * 💬 LITTLE DOODLE CLUB - AUTO COMMENT DROPPER
 * --------------------------------------------
 * Wakes up at afternoon (01:35 PM EDT) and evening (06:35 PM EDT)
 * to drop the follow comment under scheduled posts after they go live!
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE_DIR = path.resolve(__dirname, '..');
const TODAY_DOODLES_PATH = path.join(BASE_DIR, 'today_doodles.json');
const STATE_PATH = path.join(BASE_DIR, 'state.json');

const VERIFIED_PAGE_TOKEN = 'EAAUbRaJrCqMBSsxLPkyloZCf0hX0xIXRXxiR4nX5ZB16Ht27oZAvTB1IcwEZCVLkGjtwab8PZCJ5SP9tNUtqW2ZBdSZBF7BM0wqdz8VhK1GAgRGbh346Y6Apz3iMpt4ZA4YuiGKWsqwGxwUo79i1FomiXruz0gZB3ga9rmi6mHFDGxGXlwMVuCZCJdy2X3KoWsbyuK19HmbZCEZB';
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
  console.log('💬 Little Doodle Club - Pending Follow Comments Dropper');
  console.log('======================================================\n');

  if (!fs.existsSync(TODAY_DOODLES_PATH)) {
    console.log('ℹ️ No today_doodles.json found.');
    process.exit(0);
  }

  const todayData = loadJson(TODAY_DOODLES_PATH, { doodles: [] });
  const doodles = todayData.doodles || [];

  if (doodles.length === 0) {
    console.log('ℹ️ No doodles found in today_doodles.json.');
    process.exit(0);
  }

  const state = loadJson(STATE_PATH, { history: [] });
  const nowSec = Math.floor(Date.now() / 1000);
  let commentedCount = 0;

  for (let idx = 0; idx < doodles.length; idx++) {
    const d = doodles[idx];

    // Must have a Facebook post ID
    if (!d.fb_post_id) continue;

    // Skip if already commented
    if (d.comment_posted) {
      console.log(`⏭️  [${idx + 1}/${doodles.length}] "${d.subject}" already has comment posted. Skipping.`);
      continue;
    }

    // Check if the scheduled publish time has arrived (or was immediate)
    if (d.scheduled_publish_time && d.scheduled_publish_time > nowSec + 120) {
      const waitMins = Math.round((d.scheduled_publish_time - nowSec) / 60);
      console.log(`⏳ [${idx + 1}/${doodles.length}] "${d.subject}" not live yet (publishes in ~\n${waitMins} mins). Will comment on next run.`);
      continue;
    }

    console.log(`💬 [${idx + 1}/${doodles.length}] Posting follow comment for live tutorial: "${d.subject}" (Post ID: ${d.fb_post_id})...`);

    const commentMsg = d.follow_comment || '❤️ Loving these daily easy drawing guides?\n👉 Follow Little Doodle Club for 3 new step-by-step doodle tutorials every single day!\n🎨 https://www.facebook.com/1298820806658884';

    const res = await postComment(d.fb_post_id, PAGE_TOKEN, commentMsg);

    if (res.status === 200 && res.body && res.body.id) {
      console.log(`   ✅ Follow comment posted successfully! (Comment ID: ${res.body.id})`);
      d.comment_posted = true;
      d.comment_id = res.body.id;
      commentedCount++;

      // Update in state history too
      if (Array.isArray(state.history)) {
        const histItem = state.history.find(h => h.fb_post_id === d.fb_post_id);
        if (histItem) histItem.comment_posted = true;
      }

      saveJson(TODAY_DOODLES_PATH, todayData);
      saveJson(STATE_PATH, state);
    } else {
      console.error(`   ⚠️ Comment response (${res.status}):`, res.body || res.error);
    }

    await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`\n🎉 Finished checking pending comments. Dropped ${commentedCount} new comments.\n`);
}

main().catch(err => {
  console.error('❌ Fatal Comment Script Error:', err);
  process.exit(1);
});
