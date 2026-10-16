#!/usr/bin/env node
/**
 * 📸 LITTLE DOODLE CLUB - INSTAGRAM AUTO PUBLISHER
 * ------------------------------------------------
 * Automatically posts daily 4-panel sketching tutorials to
 * the connected Instagram Business account for Little Doodle Club.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE_DIR = path.resolve(__dirname, '..');
const TODAY_DOODLES_PATH = path.join(BASE_DIR, 'today_doodles.json');

const VERIFIED_TOKEN = 'EAAUbRaJrCqMBSsxLPkyloZCf0hX0xIXRXxiR4nX5ZB16Ht27oZAvTB1IcwEZCVLkGjtwab8PZCJ5SP9tNUtqW2ZBdSZBF7BM0wqdz8VhK1GAgRGbh346Y6Apz3iMpt4ZA4YuiGKWsqwGxwUo79i1FomiXruz0gZB3ga9rmi6mHFDGxGXlwMVuCZCJdy2X3KoWsbyuK19HmbZCEZB';
const DEFAULT_PAGE_ID = (process.env.FB_PAGE_ID_DOODLE || process.env.FB_PAGE_ID || '1298820806658884').trim();
const DEFAULT_TOKEN = (process.env.FB_TOKEN_DOODLE || process.env.FB_PAGE_TOKEN || VERIFIED_TOKEN).trim();
const DEFAULT_IG_ID = (process.env.IG_ACCOUNT_ID_DOODLE || '').trim();

function formatUnicodeBold(text) {
  if (!text || typeof text !== 'string') return '';
  return text.replace(/\*\*(.+?)\*\*/g, (_, s) => {
    return Array.from(s).map(c => {
      const code = c.charCodeAt(0);
      if (code >= 65 && code <= 90) return String.fromCodePoint(0x1D5D4 + code - 65);
      if (code >= 97 && code <= 122) return String.fromCodePoint(0x1D5EE + code - 97);
      if (code >= 48 && code <= 57) return String.fromCodePoint(0x1D7EC + code - 48);
      return c;
    }).join('');
  });
}

/**
 * Get connected Instagram Business Account ID from Facebook Page
 */
async function getConnectedIgAccountId(pageId, token) {
  if (DEFAULT_IG_ID) return DEFAULT_IG_ID;
  return new Promise((resolve) => {
    https.get(`https://graph.facebook.com/v26.0/${pageId}?fields=instagram_business_account{id,username}&access_token=${token}`, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => {
        try {
          const parsed = JSON.parse(d);
          if (parsed.instagram_business_account && parsed.instagram_business_account.id) {
            resolve(parsed.instagram_business_account.id);
          } else { resolve(null); }
        } catch(e) { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

/**
 * Publish Single Photo to Instagram Feed
 */
async function postInstagramPhoto(igUserId, token, caption, imageUrl) {
  const postData = new URLSearchParams({
    access_token: token,
    image_url: imageUrl,
    caption: caption
  }).toString();

  const containerId = await new Promise((resolve) => {
    const req = https.request({
      hostname: 'graph.facebook.com',
      port: 443,
      path: `/v26.0/${igUserId}/media`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => {
        try {
          const parsed = JSON.parse(d);
          resolve(parsed.id || null);
        } catch(e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.write(postData);
    req.end();
  });

  if (!containerId) return { success: false, error: 'Container creation failed' };

  // Poll readiness
  let isReady = false;
  let attempts = 0;
  while (!isReady && attempts < 10) {
    await new Promise(r => setTimeout(r, 2000));
    attempts++;
    const statusRes = await new Promise((resolve) => {
      https.get(`https://graph.facebook.com/v26.0/${containerId}?fields=status_code&access_token=${token}`, res => {
        let d = ''; res.on('data', c => d += c); res.on('end', () => {
          try { resolve(JSON.parse(d)); } catch(e){ resolve({}); }
        });
      }).on('error', () => resolve({}));
    });
    if (statusRes.status_code === 'FINISHED' || !statusRes.status_code) {
      isReady = true; break;
    }
  }

  // Publish
  const pubData = new URLSearchParams({ access_token: token, creation_id: containerId }).toString();
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'graph.facebook.com',
      port: 443,
      path: `/v26.0/${igUserId}/media_publish`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(pubData)
      }
    }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => {
        try {
          const parsed = JSON.parse(d);
          resolve({ success: !!parsed.id, id: parsed.id, error: parsed.error });
        } catch(e) { resolve({ success: false, error: d }); }
      });
    });
    req.on('error', err => resolve({ success: false, error: err.message }));
    req.write(pubData);
    req.end();
  });
}

async function main() {
  console.log('======================================================');
  console.log('📸 Little Doodle Club - Instagram Publisher');
  console.log('======================================================\n');

  if (!fs.existsSync(TODAY_DOODLES_PATH)) {
    console.error(`❌ ${TODAY_DOODLES_PATH} not found.`);
    process.exit(1);
  }

  const raw = fs.readFileSync(TODAY_DOODLES_PATH, 'utf8').replace(/^\uFEFF/, '').trim();
  const data = JSON.parse(raw);
  const doodles = data.doodles || [];

  const igAccountId = await getConnectedIgAccountId(DEFAULT_PAGE_ID, DEFAULT_TOKEN);
  if (!igAccountId) {
    console.log('ℹ️ No connected Instagram Business account found for Little Doodle Club yet.');
    console.log('   (Once an Instagram account is connected to your Facebook Page, posts will automatically sync here!)');
    process.exit(0);
  }

  console.log(`✅ Connected Instagram Account ID: ${igAccountId}\n`);

  for (let idx = 0; idx < doodles.length; idx++) {
    const d = doodles[idx];
    if (d.ig_post_id) {
      console.log(`ℹ️ [${idx + 1}/3] "${d.subject}" already published to Instagram (${d.ig_post_id}). Skipping.`);
      continue;
    }

    const rawGithubUrl = `https://raw.githubusercontent.com/aditya-Pratap15/little_doodle_club/main/${d.image_path.replace(/\\/g, '/')}`;
    console.log(`[📸 IG] Publishing: ${d.subject}...`);

    const res = await postInstagramPhoto(igAccountId, DEFAULT_TOKEN, d.caption, rawGithubUrl);
    if (res.success && res.id) {
      d.ig_post_id = res.id;
      console.log(`   ✅ SUCCESS! Instagram Post Published! ID: ${res.id}`);
      fs.writeFileSync(TODAY_DOODLES_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
    } else {
      console.warn(`   ⚠️ Instagram Post skipped/failed:`, res.error);
    }
  }

  console.log('\n🎉 Instagram processing cycle complete!\n');
}

main().catch(err => {
  console.error('❌ Fatal Instagram Error:', err);
  process.exit(1);
});
