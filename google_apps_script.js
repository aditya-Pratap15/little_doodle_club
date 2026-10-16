/**
 * 🎨 LITTLE DOODLE CLUB - PERMANENT GOOGLE DRIVE BRIDGE (Never-Expiring)
 * ---------------------------------------------------------------------
 * Paste this in your Google Apps Script project:
 * https://script.google.com/home/projects/14XxkZqrqAKsyQkoGsfn31c7EJ2oHcDKnJjRsErhJvNxjIU5-vONrE_We/edit
 *
 * How to Deploy (One-time, Takes 30 seconds):
 * 1. Click "Deploy" (top right) -> "New deployment"
 * 2. Click the gear icon (Select type) -> "Web app"
 * 3. Description: "Little Doodle Club Bridge"
 * 4. Execute as: "Me" (your Google account)
 * 5. Who has access: "Anyone" (crucial so GitHub Actions can fetch the images)
 * 6. Click "Deploy" and copy the Web App URL!
 * 7. Add this URL as 'APPS_SCRIPT_URL' in GitHub Secrets.
 */

var TARGET_FOLDER_ID = "1fIKXiOzUu_hEDjG-CIHY-p_roflZT5n5";

/**
 * 1. GET Request Handler: GitHub Actions calls this to fetch the 3 newest unposted daily tutorial images
 */
function doGet(e) {
  try {
    var folder = DriveApp.getFolderById(TARGET_FOLDER_ID);
    // Search for JPEG images in target folder
    var filesIter = folder.getFiles();
    var fileList = [];

    while (filesIter.hasNext()) {
      var file = filesIter.next();
      var name = file.getName();
      var mime = file.getMimeType();

      // Only include JPG/JPEG files
      if (mime.indexOf("image") !== -1 || name.match(/\.(jpg|jpeg|png)$/i)) {
        fileList.push({
          id: file.getId(),
          name: name,
          createdTime: file.getDateCreated().toISOString(),
          lastUpdated: file.getLastUpdated().toISOString(),
          size: file.getSize(),
          // Direct permanent web download link
          downloadUrl: "https://drive.google.com/uc?export=download&id=" + file.getId()
        });
      }
    }

    // Sort newest first
    fileList.sort(function(a, b) {
      return new Date(b.createdTime) - new Date(a.createdTime);
    });

    // If 'fileId' param is passed, return base64 binary content of that specific file
    if (e && e.parameter && e.parameter.fileId) {
      var targetFile = DriveApp.getFileById(e.parameter.fileId);
      var bytes = targetFile.getBlob().getBytes();
      var base64 = Utilities.base64Encode(bytes);
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        id: targetFile.getId(),
        name: targetFile.getName(),
        mimeType: targetFile.getMimeType(),
        base64: base64
      })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      folderId: TARGET_FOLDER_ID,
      count: fileList.length,
      files: fileList.slice(0, 15) // Return up to 15 newest files
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * 2. Automated Trigger: Moves any newly created art into the 'daily arts' folder
 * Set this on an hourly trigger in Apps Script if Gemini saves directly to Drive root
 */
function autoMoveDailyArt() {
  var targetFolder = DriveApp.getFolderById(TARGET_FOLDER_ID);
  var files = DriveApp.searchFiles("mimeType = 'image/jpeg' and trashed = false and not '" + TARGET_FOLDER_ID + "' in parents");

  while (files.hasNext()) {
    var file = files.next();
    var name = file.getName();

    if (name.match(/_\d{4}-\d{2}-\d{2}\.jpg$/i)) {
      file.moveTo(targetFolder);
      Logger.log("Moved to daily arts: " + name);
    }
  }
}
