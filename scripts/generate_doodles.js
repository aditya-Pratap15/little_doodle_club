#!/usr/bin/env node
/**
 * 🎨 LITTLE DOODLE CLUB - DAILY TUTORIAL GENERATION ENGINE (v1.0)
 * -------------------------------------------------------------
 * Creates THREE (3) daily step-by-step sketching tutorial images
 * in a strict 4-panel progressive grid on a plain paper background.
 *
 * Implements:
 * - Day-of-week rotating theme engine (Mon: Animals, Tue: Botanicals, etc.)
 * - Strict negative constraints (ZERO hands, ZERO text/labels, camera-lock, silhouette continuity)
 * - Anti-repetition memory (3-year longevity tracking in state.json)
 * - Rate-limit artificial delay (10-15s sequential pacing)
 * - Dual Engine: Gemini Imagen 3 API + Pollinations AI High-Res Fallback
 * - USA Timing Planner (Morning, Midday, Evening EDT)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE_DIR = path.resolve(__dirname, '..');
const THEMES_PATH = path.join(BASE_DIR, 'themes.json');
const STATE_PATH = path.join(BASE_DIR, 'state.json');
const OUTPUT_DIR = path.join(BASE_DIR, 'daily_doodles');
const TODAY_DOODLES_PATH = path.join(BASE_DIR, 'today_doodles.json');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Load API Keys from environment
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();

/**
 * Format Unicode Bold text for high-engagement social media captions
 */
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

function loadJson(p, fallback) {
  if (fs.existsSync(p)) {
    try {
      const raw = fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '').trim();
      return JSON.parse(raw);
    } catch (e) {
      console.warn('⚠️ Warning parsing JSON from ' + p + ':', e.message);
    }
  }
  return fallback;
}

function saveJson(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/**
 * Get Seasonal Context based on current month (for anti-repetition longevity)
 */
function getSeasonalContext(dateObj) {
  const month = dateObj.getMonth(); // 0-11
  if (month >= 8 && month <= 10) {
    return { season: 'Autumn', accents: 'golden autumn oak leaves, tiny acorns, and cozy warm pumpkin hues' };
  } else if (month === 11 || month <= 1) {
    return { season: 'Winter', accents: 'delicate frost crystals, tiny pine sprigs, and cozy winter warmth' };
  } else if (month >= 2 && month <= 4) {
    return { season: 'Spring', accents: 'soft pastel cherry blossom petals, fresh green spring sprouts, and morning dew' };
  } else {
    return { season: 'Summer', accents: 'warm sunlit amber tones, soft ocean pebbles, and lush summer greenery' };
  }
}

/**
 * Download binary image from URL to local file
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const parsedUrl = new URL(url);

    const options = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://pollinations.ai/',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      }
    };

    https.get(options, (res) => {
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
 * Generate 4-panel sketching tutorial prompt with all strict constraints
 */
function constructTutorialPrompt(subject, themeName, seasonInfo) {
  const cleanSubject = subject.name;
  const propDetails = subject.props;
  const descDetails = subject.desc;

  return [
    `A master-level 4-panel step-by-step 2D drawing tutorial sheet showing how to sketch a cute ${cleanSubject} ${propDetails}.`,
    `The drawing sheet is organized into a clean 2x2 grid of four equal panels on plain off-white textured sketchbook paper.`,
    `STRICT 4-PANEL PROGRESSION:`,
    `- Panel 1 (Top-Left): STEP 1 - Light, delicate pencil construction guidelines, simple geometric basic shapes, and circle gesture scaffolding showing initial placement.`,
    `- Panel 2 (Top-Right): STEP 2 - Confident contour line drawings defining primary anatomy, silhouette, shape, and ${propDetails}.`,
    `- Panel 3 (Bottom-Left): STEP 3 - Clean refined line art with fine ink details, textures, hatching, and subtle shading accents.`,
    `- Panel 4 (Bottom-Right): STEP 4 - Completely finished, vibrant artwork cleanly colored with soft colored pencils in warm harmonious tones with ${seasonInfo.accents}.`,
    `MANDATORY UNIVERSAL CONSTRAINTS:`,
    `1. ZERO HANDS & ZERO ARTIST TOOLS: Absolutely NO human hands, NO fingers, NO arms, NO pencils, NO pens, NO erasers, and NO desks. Flat 2D drawing paper view only.`,
    `2. ZERO TEXT & LABELS: Absolutely NO words, NO titles, NO letters, NO step numbers, NO arrows, and NO written labels anywhere on the canvas.`,
    `3. PERSPECTIVE & POSE LOCK: The camera angle, perspective view, and exact physical pose established in Panel 1 must stay 100% identical in Panels 2, 3, and 4.`,
    `4. SILHOUETTE CONTINUITY: Zero morphing, tilting, or changing direction between panels. Every accessory and prop introduced must stay consistent across all panels.`,
    `Artistic Style: Professional Japanese studio illustration, clean lineart, cozy aesthetic, high aesthetic quality, pristine studio presentation.`
  ].join(' ');
}

/**
 * Engine 1: Generate using Google Gemini Imagen 3 API
 */
async function generateWithGeminiImagen(prompt, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`;
  const body = JSON.stringify({
    instances: [{ prompt }],
    parameters: {
      sampleCount: 1,
      aspectRatio: '1:1',
      outputMimeType: 'image/jpeg'
    }
  });

  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.predictions && parsed.predictions[0] && parsed.predictions[0].bytesBase64Encoded) {
            resolve(Buffer.from(parsed.predictions[0].bytesBase64Encoded, 'base64'));
          } else {
            reject(new Error(parsed.error ? parsed.error.message : 'Invalid Imagen response'));
          }
        } catch(e) { reject(new Error('JSON parse error: ' + data.slice(0, 100))); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Engine 2: High-Resolution Pollinations Flux Drawing Generator (Free, High Precision)
 */
async function generateWithPollinations(prompt, destPath, retries = 2) {
  const encodedPrompt = encodeURIComponent(prompt);
  const seed = Math.floor(Math.random() * 9999999);
  const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&seed=${seed}&nologo=true`;

  try {
    return await downloadFile(pollinationsUrl, destPath);
  } catch (err) {
    if (err.message && err.message.includes('402') && retries > 0) {
      console.log('   ⏳ Free rate limit reached (1 img / 45s). Waiting 48 seconds before automatic retry...');
      await sleep(48000);
      return await generateWithPollinations(prompt, destPath, retries - 1);
    }
    throw err;
  }
}

/**
 * Sleep helper for rate-limit pacing
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('======================================================');
  console.log('🎨 LITTLE DOODLE CLUB - DAILY TUTORIAL GENERATOR');
  console.log('======================================================\n');

  const themesData = loadJson(THEMES_PATH, {});
  const state = loadJson(STATE_PATH, { history: [] });

  // Use USA Eastern Time (New York) for calendar date and Day-of-Week
  const now = new Date();
  const dateStrUs = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now);
  const dayOfWeekUs = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' })).getDay();

  const themeConfig = themesData[String(dayOfWeekUs)] || themesData["1"];
  const seasonInfo = getSeasonalContext(now);

  console.log(`📅 Target USA Date: ${dateStrUs} (${themeConfig.day})`);
  console.log(`🎨 Daily Theme: ${themeConfig.theme}`);
  console.log(`🍂 Seasonal Accents: ${seasonInfo.accents}\n`);

  // Anti-Repetition Selection: Filter out subjects used in the last 14 days
  const recentHistory = (state.history || []).slice(-45);
  const availableSubjects = themeConfig.subjects.filter(s => !recentHistory.includes(s.name));
  const pool = availableSubjects.length >= 3 ? availableSubjects : themeConfig.subjects;

  // Shuffle pool to pick 3 unique subjects
  const shuffled = [...pool].sort(() => 0.5 - Math.random());
  const selectedSubjects = shuffled.slice(0, 3);

  console.log('✨ Selected 3 Tutorial Subjects for Today:');
  selectedSubjects.forEach((s, idx) => console.log(`   [${idx + 1}] ${s.name} (${s.props})`));
  console.log('');

  // Define USA Schedule Windows (Morning, Midday, Evening EDT)
  const baseMidnightUs = new Date(dateStrUs + 'T00:00:00-04:00').getTime(); // EDT base
  const scheduleSlots = [
    {
      slotName: 'Morning Inspiration',
      timeLabel: '08:30 AM EDT',
      unixTs: Math.floor(baseMidnightUs / 1000) + (8 * 3600) + (30 * 60) // 8:30 AM
    },
    {
      slotName: 'Afternoon Creative Break',
      timeLabel: '01:30 PM EDT',
      unixTs: Math.floor(baseMidnightUs / 1000) + (13 * 3600) + (30 * 60) // 1:30 PM
    },
    {
      slotName: 'Evening Relax & Draw',
      timeLabel: '06:30 PM EDT',
      unixTs: Math.floor(baseMidnightUs / 1000) + (18 * 3600) + (30 * 60) // 6:30 PM
    }
  ];

  const generatedDoodles = [];

  for (let i = 0; i < selectedSubjects.length; i++) {
    const subject = selectedSubjects[i];
    const slot = scheduleSlots[i];
    const cleanArtName = subject.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const filename = `${cleanArtName}_${dateStrUs}.jpg`;
    const destPath = path.join(OUTPUT_DIR, filename);

    console.log(`------------------------------------------------------`);
    console.log(`🖌️ [${i + 1}/3] Generating Tutorial: ${subject.name}`);
    console.log(`   File: ${filename}`);
    console.log(`   Scheduled Slot: ${slot.timeLabel} (${slot.slotName})`);

    const prompt = constructTutorialPrompt(subject, themeConfig.theme, seasonInfo);

    let success = false;

    // 1. Try Gemini Imagen 3 if API key available
    if (GEMINI_API_KEY) {
      try {
        console.log('   🤖 Requesting image from Google Gemini Imagen 3 API...');
        const imgBuffer = await generateWithGeminiImagen(prompt, GEMINI_API_KEY);
        fs.writeFileSync(destPath, imgBuffer);
        console.log('   ✅ Saved via Gemini Imagen 3!');
        success = true;
      } catch (err) {
        console.warn('   ⚠️ Gemini Imagen failed, falling back to Pollinations:', err.message);
      }
    }

    // 2. Fallback to Pollinations AI
    if (!success) {
      try {
        console.log('   🌸 Generating high-res sketch via Pollinations Flux Engine...');
        await generateWithPollinations(prompt, destPath);
        console.log('   ✅ Saved via Pollinations Flux Engine!');
        success = true;
      } catch (err) {
        console.error('   ❌ Pollinations failed too:', err.message);
      }
    }

    if (success && fs.existsSync(destPath)) {
      const stats = fs.statSync(destPath);
      console.log(`   📦 File size: ${(stats.size / 1024).toFixed(1)} KB`);

      // Social Media Caption Generation
      const caption = [
        `✨ **How To Draw: ${subject.name}** (${themeConfig.theme}) ✨\n`,
        `Here is an easy 4-step sketching guide for your sketchbook today! ✏️🎨\n`,
        `🔹 **Step 1:** Start with light, loose construction shapes and proportions.`,
        `🔹 **Step 2:** Refine the gentle contours and shape ${subject.props}.`,
        `🔹 **Step 3:** Add crisp clean line art, texture details, and depth.`,
        `🔹 **Step 4:** Finish with soft colored pencils for cozy warmth!\n`,
        `💬 **Which step was your favorite? Grab your sketchbook and give it a try today!** 👇\n`,
        `#LittleDoodleClub #HowToDraw #SketchingTutorial #DrawingGuide #EasyDrawing #StepByStepArt #ArtForBeginners #DoodleArt #SketchbookDaily #${cleanArtName.replace(/_/g, '')}`
      ].join('\n');

      generatedDoodles.push({
        id: `doodle_${cleanArtName}_${dateStrUs}`,
        subject: subject.name,
        theme: themeConfig.theme,
        day_of_week: themeConfig.day,
        date: dateStrUs,
        filename: filename,
        image_path: path.relative(BASE_DIR, destPath).replace(/\\/g, '/'),
        scheduled_publish_time: slot.unixTs,
        scheduled_time_label: slot.timeLabel,
        slot_name: slot.slotName,
        caption: formatUnicodeBold(caption),
        prompt: prompt
      });

      // Anti-repetition tracking
      state.history.push(subject.name);
      state.totalDoodlesGenerated = (state.totalDoodlesGenerated || 0) + 1;
    }

    // RATE-LIMIT PACING: 10-15s delay between generations
    if (i < selectedSubjects.length - 1) {
      const delaySec = GEMINI_API_KEY ? 10 : 48;
      console.log(`   ⏳ Pacing delay: Waiting ${delaySec} seconds before next tutorial generation (respecting API limits)...\n`);
      await sleep(delaySec * 1000);
    }
  }

  // Update State & Today Doodles payload
  state.lastGeneratedDate = dateStrUs;
  saveJson(STATE_PATH, state);

  const payload = {
    date: dateStrUs,
    theme: themeConfig.theme,
    day_of_week: themeConfig.day,
    generated_at: new Date().toISOString(),
    doodles: generatedDoodles
  };

  saveJson(TODAY_DOODLES_PATH, payload);
  console.log(`\n======================================================`);
  console.log(`🎉 Successfully generated ${generatedDoodles.length} sketching tutorials!`);
  console.log(`📁 Metadata written to: today_doodles.json`);
  console.log(`======================================================\n`);
}

main().catch(err => {
  console.error('❌ Fatal Generation Error:', err);
  process.exit(1);
});
