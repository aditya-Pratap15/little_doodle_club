#!/usr/bin/env node
/**
 * 📘 LITTLE DOODLE CLUB - FACEBOOK PAGE SCHEDULER & PUBLISHER
 * -----------------------------------------------------------
 * Schedules the 3 daily 4-panel tutorial graphics into
 * Facebook Page Planner across peak USA engagement windows:
 * - Drop 1: 08:30 AM EDT (Morning Inspiration)
 * - Drop 2: 01:30 PM EDT (Afternoon Creative Break)
 * - Drop 3: 06:30 PM EDT (Evening Relax & Draw)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE_DIR = path.resolve(__dirname, '..');
const TODAY_DOODLES_PATH = path.join(BASE_DIR, 'today_doodles.json');

// Verified Credentials for Little Doodle Club (ID: 1298820806658884)
const VERIFIED_TOKEN = 'EAAUbRaJrCqMBSsxLPkyloZCf0hX0xIXRXxiR4nX5ZB16Ht27oZAvTB1IcwEZCVLkGjtwab8PZCJ5SP9tNUtqW2ZBdSZBF7BM0wqdz8VhK1GAgRGbh346Y6Apz3iMpt4ZA4YuiGKWsqwGxwUo79i1FomiXruz0gZB3ga9rmi6mHFDGxGXlwMVuCZCJdy2X3KoWsbyuK19HmbZCEZB';
const DEFAULT_PAGE_ID = (process.env.FB_PAGE_ID_DOODLE || process.env.FB_PAGE_ID || '1298820806658884').trim();
const DEFAULT_TOKEN = (process.env.FB_TOKEN_DOODLE || process.env.FB_PAGE_TOKEN || VERIFIED_TOKEN).trim();

function formatUnicodeBold(text) {
  if (!text || typeof text !== 'string') return '';
  return text.replace(/\*\*(.+?)\*\*/g, (_, s) => {
    return Array.from(s).map(c => {
      const code = c.charCodeAt(0);
      if (code >= 65 && code <= 90) return String.fromCodePoint(0x1D5D4 + code - 65);   // A-Z
      if (code >= 97 && code <= 122) return String.fromCodePoint(0x1D5EE + code - 97);  // a-z
      if (code >= 48 && code <= 57) return String.fromCodePoint(0x1D7EC + code - 48);   // 0-9
      return c;
    }).join('');
  });
}

/**
 * Upload single image to Facebook Page via multipart/form-data
 */
function postMultipartPhoto(pageId, token, caption, imagePath, scheduledPublishTime = null) {
  return new Promise((resolve) => {
    try {
      pageId = String(pageId || DEFAULT_PAGE_ID).trim();
      token = String(token || DEFAULT_TOKEN).trim();

      const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
      const imgBuf = fs.readFileSync(imagePath);
      const filename = path.basename(imagePath);

      let body = '';
      const addField = (name, val) => {
        body += `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${val}\r\n`;
      };

      addField('access_token', token);
      addField('message', caption);

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
 * Add Pinned/First Comment on Facebook Post
 */
async function postFacebookComment(postId, token, message) {
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
          try { resolve(JSON.parse(d)); } catch(e){ resolve({}); }
        });
      });

      req.on('error', () => resolve({}));
      req.write(postData);
      req.end();
    } catch(e) { resolve({}); }
  });
}

async function main() {
  console.log('======================================================');
  console.log('📘 Little Doodle Club - Facebook Page Planner Scheduler');
  console.log('======================================================\n');

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

  console.log(`Page: Little Doodle Club (${DEFAULT_PAGE_ID})`);
  console.log(`Total Tutorials to Schedule: ${doodles.length}\n`);

  const nowTs = Math.floor(Date.now() / 1000);

  for (let idx = 0; idx < doodles.length; idx++) {
    const d = doodles[idx];
    const schedTs = d.scheduled_publish_time || null;
    const isScheduled = schedTs && (schedTs > nowTs + 600);

    if (d.fb_post_id) {
      console.log(`ℹ️ [${idx + 1}/3] "${d.subject}" already scheduled on Facebook (ID: ${d.fb_post_id}). Skipping.`);
      continue;
    }

    const imgPath = path.resolve(BASE_DIR, d.image_path);
    if (!fs.existsSync(imgPath)) {
      console.warn(`⚠️ Image file not found at ${imgPath}, skipping.`);
      continue;
    }

    const edTime = new Date(schedTs * 1000).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' });
    const istTime = new Date(schedTs * 1000).toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });

    if (isScheduled) {
      console.log(`[🗓️ SCHEDULE] "${d.subject}" for ${edTime} EDT (${istTime} IST) [${d.slot_name}]...`);
    } else {
      console.log(`[🚀 LIVE PUBLISH] "${d.subject}" live immediately to Facebook...`);
    }

    const res = await postMultipartPhoto(
      DEFAULT_PAGE_ID,
      DEFAULT_TOKEN,
      d.caption,
      imgPath,
      isScheduled ? schedTs : null
    );

    if (res.status === 200 && res.body && (res.body.id || res.body.post_id)) {
      const postId = res.body.post_id || res.body.id;
      d.fb_post_id = postId;
      console.log(`   ✅ SUCCESS! Photo Scheduled/Published! Post ID: ${postId}`);

      // Add friendly comment if published live
      if (!isScheduled) {
        await postFacebookComment(postId, DEFAULT_TOKEN, '🎨 What should we draw next? Drop your favorite doodle requests in the comments! 👇✏️');
      }

      fs.writeFileSync(TODAY_DOODLES_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
    } else {
      console.error(`   ❌ Facebook Upload Error (${res.status}):`, res.body || res.error);
    }

    // Gentle delay between API requests
    await new Promise(r => setTimeout(r, 3000));
  }

  console.log('\n🎉 All Little Doodle Club tutorials processed for Facebook!\n');
}

main().catch(err => {
  console.error('❌ Fatal Facebook Script Error:', err);
  process.exit(1);
});
