# 🎨 Little Doodle Club - Automated Daily Sketching Pipeline (Never-Expiring)

An autonomous publishing engine that fetches daily 4-panel sketching tutorial images from Google Drive, overlays the official page logo at the center, crafts tailored captions & hashtags from the filename, publishes them directly to Facebook Page **Little Doodle Club**, and drops a follow comment with the page link.

---

## ⚡ How the Pipeline Works

1. **Daily Gemini Image Creation**:
   - An external scheduler creates 3 step-by-step drawing tutorial images daily (`{artname}_YYYY-MM-DD.jpg`) and stores them in Google Drive folder:
   - **Drive Folder ID**: `1fIKXiOzUu_hEDjG-CIHY-p_roflZT5n5`
2. **Drive Ingestion (`scripts/fetch_from_drive.js`)**:
   - Connects to Google Drive via the permanent Google Apps Script Web App (`APPS_SCRIPT_URL`).
   - Cross-checks with `state.json` to guarantee **no image or subject is EVER repeated**.
   - Downloads the 3 newest unposted images into `incoming_doodles/`.
3. **Centered Watermark Studio (`scripts/watermark_studio.js`)**:
   - Uses `ffmpeg` to overlay `assets/page_logo.png` right at the **center intersection** of the 4 panels: `(W-w)/2 : (H-h)/2`.
   - Inspects the filename to identify the subject (e.g., `chubby_capybara_2026-10-17.jpg` -> `Chubby Capybara`).
   - Formats a tutorial caption with Unicode bold, drawing steps, and relevant hashtags.
   - Prepares the follow comment with page link `https://www.facebook.com/1298820806658884`.
   - Saves output to `branded_doodles/` and `today_doodles.json`.
4. **Facebook Auto-Publisher & Commenter (`scripts/post_to_facebook.js`)**:
   - Uploads each branded image to Facebook Page **Little Doodle Club** (`1298820806658884`).
   - Immediately adds the follow comment under each post:
     ```
     ❤️ Loving these daily easy drawing guides?
     👉 Follow Little Doodle Club for 3 new step-by-step doodle tutorials every single day!
     🎨 https://www.facebook.com/1298820806658884
     ```
   - Records file IDs, filenames, and subjects into `state.json` and commits back to GitHub.

---

## 🔒 Never-Expiring Architecture (Zero Maintenance)

| Component | Expiration | Why It Never Expires |
| :--- | :--- | :--- |
| **Facebook Page Access Token** | **Never (`expires_at: 0`)** | Derived as a Page Token from a long-lived User Token. Meta Page Tokens do NOT expire unless permissions are explicitly revoked. |
| **Google Apps Script Web App** | **Never** | Deployed with `Execute as: Me` and `Who has access: Anyone`. No OAuth refresh tokens, no 7-day or 60-day token revocations. Acts as a permanent micro-API. |
| **GitHub Actions Pipeline** | **Perpetual** | Triggered via cron and workflow dispatch, reading encrypted GitHub repository secrets. |

---

## 🔑 GitHub Repository Secrets

Configure these in **GitHub Repo -> Settings -> Secrets and variables -> Actions**:

| Secret Name | Required | Value / Description |
| :--- | :---: | :--- |
| `APPS_SCRIPT_URL` | **Yes** | Your deployed Google Apps Script Web App URL (e.g., `https://script.google.com/macros/s/.../exec`) |
| `FB_PAGE_ID_DOODLE` | Optional | `1298820806658884` (Default is hardcoded) |
| `FB_TOKEN_DOODLE` | Optional | Your Never-Expiring Page Token (Verified token is hardcoded as default fallback) |

---

## 🚀 One-Time Setup Steps

### 1. Google Apps Script Setup (30 Seconds)
1. Open your project: [Google Apps Script Project](https://script.google.com/home/projects/14XxkZqrqAKsyQkoGsfn31c7EJ2oHcDKnJjRsErhJvNxjIU5-vONrE_We/edit)
2. Copy the code from `google_apps_script.js` and paste it into the editor.
3. Click **Deploy** (top right) ➔ **New deployment**.
4. Click the gear icon (Select type) ➔ choose **Web app**.
5. Set:
   - **Description**: `Little Doodle Club Bridge`
   - **Execute as**: `Me (your email)`
   - **Who has access**: `Anyone` *(Crucial for GitHub Actions to query files)*
6. Click **Deploy**, grant permissions once, and copy the **Web app URL**.
7. In GitHub repository settings, add the secret `APPS_SCRIPT_URL` with this URL.

### 2. Run / Test Workflow
- Go to GitHub ➔ **Actions** ➔ **Little Doodle Club - Daily Tutorial Automation** ➔ Click **Run workflow**.
