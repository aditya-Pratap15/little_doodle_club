# 🎨 Little Doodle Club - Automated Daily Sketching Pipeline

An autonomous, multi-platform publishing engine that generates, archives, and schedules **THREE (3)** daily step-by-step sketching tutorial images formatted in a 4-panel progressive grid on plain paper.

---

## 📅 Daily Themed Rotation
The engine automatically follows the day-of-week theme rotation based on **USA Eastern Time (EDT)**:

| Day | Theme | Focus |
| :--- | :--- | :--- |
| **Monday** | 🐾 Animals & Wildlife | Capybaras, highland calves, red pandas, woodland foxes, otters |
| **Tuesday** | 🌿 Botanicals & Nature | Water lilies, cherry blossoms, succulents, mushrooms, bonsai |
| **Wednesday** | ☕ Cozy Food & Cafe Art | Cinnamon rolls, matcha latte art, strawberry shortcake, ramen |
| **Thursday** | 🔮 Mini-Scenes & Origami | Waves in teacups, campfires in jars, origami cranes & frogs |
| **Friday** | 🌊 Ocean & Marine Life | Sea turtles, dolphins, manta rays, seahorses, clownfish |
| **Saturday** | 🚲 Everyday Objects & Vehicles | Vintage cameras, lanterns, hot air balloons, camper vans, clocks |
| **Sunday** | ✨ Chibi & Fantasy Creatures | Baby dragons, pegasus foals, phoenix chicks, kitsune spirits |

---

## ⏰ USA Timing Schedule (Facebook Page Planner)
Every day at **10:00 AM UTC (06:00 AM EDT / 03:30 PM IST)**, GitHub Actions runs the engine and schedules the 3 daily tutorials into the **Facebook Page Planner** across peak USA engagement hours:

1. 🌅 **Drop 1 (Morning Inspiration)**: **08:30 AM EDT** (6:00 PM IST)
2. 🥪 **Drop 2 (Afternoon Creative Break)**: **01:30 PM EDT** (11:00 PM IST)
3. 🌙 **Drop 3 (Evening Relax & Draw)**: **06:30 PM EDT** (04:00 AM IST +1)

---

## 🎨 Mandatory Generation Constraints
- **Clean Canvas Only**: Strictly **ZERO** human hands, fingers, arms, pencils, pens, or artist tools. Flat 2D drawing sheet view.
- **Zero Text / Labels**: Absolutely **NO** words, numbers, step labels, or instructional text on the image.
- **Strict Perspective Lock**: The camera viewpoint and angle established in Step 1 remains 100% locked across all 4 panels.
- **Silhouette & Accessory Continuity**: Pose, stance, and accessories stay identical from Step 1 through Step 4 without morphing.
- **4-Panel Step Progression**:
  - **Panel 1**: Basic construction shapes & light guidelines.
  - **Panel 2**: Contours & primary anatomy/structure.
  - **Panel 3**: Clean refined line art & fine details.
  - **Panel 4**: Finished drawing cleanly colored with colored pencils.

---

## ☁️ Google Drive Archival
All generated files follow the strict format:
```text
{artname}_YYYY-MM-DD.jpg
```
Saved directly into the **daily arts** Google Drive folder:
- **Folder ID**: `1fIKXiOzUu_hEDjG-CIHY-p_roflZT5n5`
- **Folder Link**: https://drive.google.com/drive/u/0/folders/1fIKXiOzUu_hEDjG-CIHY-p_roflZT5n5

---

## 🔑 Configured Credentials & Secrets
The pipeline is pre-configured with long-lived Meta Graph API tokens valid through **December 15, 2026**:
- **Facebook Page**: Little Doodle Club (`1298820806658884`)
- **Optional GitHub Secrets**:
  - `GEMINI_API_KEY`: For Google Gemini Imagen 3 generation (Pollinations Flux is pre-configured as high-res fallback)
  - `APPS_SCRIPT_URL`: For 1-click Google Drive webhook sync
  - `FB_PAGE_TOKEN_DOODLE`: Override Facebook Page Access Token
