#!/usr/bin/env node
/**
 * 💬 LITTLE DOODLE CLUB - AUTO COMMENT DROPPER
 * --------------------------------------------
 * Wakes up at afternoon (01:35 PM EDT) and evening (06:35 PM EDT)
 * to drop dynamic, personalized follow comments under scheduled posts after they go live!
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
 * Dynamic subject-specific fallback comment generator
 */
function generateFollowComment(subject) {
  const cleanSubj = subject || 'cute sketch';
  const templates = [
    `Loved sketching this ${cleanSubj}? 🎨 Save this guide and follow Little Doodle Club for 3 new step-by-step drawing tutorials every day!\n👉 https://www.facebook.com/1298820806658884`,
    `Who's trying to draw this ${cleanSubj} today? ✏️ Grab your pencils and follow our page for daily easy doodle inspiration!\n❤️ https://www.facebook.com/1298820806658884`,
    `Want more simple doodles like this ${cleanSubj}? 🌟 Follow Little Doodle Club so you never miss our next tutorial drop!\n👇 https://www.facebook.com/1298820806658884`,
    `Tag a friend who would love drawing this ${cleanSubj}! 👫 And be sure to follow our page for 3 fresh step-by-step guides every single day!\n🎨 https://www.facebook.com/1298820806658884`,
    `Hope you enjoyed learning how to draw this ${cleanSubj}! 💖 Follow Little Doodle Club for easy creative breaks all week long!\n👉 https://www.facebook.com/1298820806658884`,
    `Which step of this ${cleanSubj} was your favorite? Let us know below and follow our page for 3 new daily drawing ideas!\n✨ https://www.facebook.com/1298820806658884`,
    `Drawing is so relaxing! 🌿 Follow Little Doodle Club for daily 4-step sketching guides just like this ${cleanSubj}!\n👇 https://www.facebook.com/1298820806658884`,
    `Save this ${cleanSubj} tutorial for your next sketchbook session! 📖 Tap follow to see 3 new creative doodle guides every day!\n🎨 https://www.facebook.com/1298820806658884`
  ];
  const hash = Array.from(cleanSubj).reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const idx = Math.abs(hash) % templates.length;
  return templates[idx];
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
  console.log('💬 Little Doodle Club - Dynamic Follow Comments Dropper');
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

    if (!d.fb_post_id) continue;

    if (d.comment_posted) {
      console.log(`⏭️  [${idx + 1}/${doodles.length}] "${d.subject}" already has comment posted. Skipping.`);
      continue;
    }

    if (d.scheduled_publish_time && d.scheduled_publish_time > nowSec + 120) {
      const waitMins = Math.round((d.scheduled_publish_time - nowSec) / 60);
      console.log(`⏳ [${idx + 1}/${doodles.length}] "${d.subject}" not live yet (publishes in ~\n${waitMins} mins). Will comment on next run.`);
      continue;
    }

    const commentMsg = d.follow_comment || generateFollowComment(d.subject);
    console.log(`💬 [${idx + 1}/${doodles.length}] Posting dynamic follow comment for live tutorial: "${d.subject}"...`);
    console.log(`   Content: "${commentMsg.split('\n')[0]}"`);

    const res = await postComment(d.fb_post_id, PAGE_TOKEN, commentMsg);

    if (res.status === 200 && res.body && res.body.id) {
      console.log(`   ✅ Dynamic comment posted! (ID: ${res.body.id})`);
      d.comment_posted = true;
      d.comment_id = res.body.id;
      commentedCount++;

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
