/**
 * Google Apps Script Web App for 1-Click Little Doodle Club Drive Sync
 * Paste this in your Apps Script project (https://script.google.com/home/projects/14XxkZqrqAKsyQkoGsfn31c7EJ2oHcDKnJjRsErhJvNxjIU5-vONrE_We/edit)
 * Deploy as: Web App -> Execute as: Me -> Who has access: Anyone
 */

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var folderId = data.folderId || "1fIKXiOzUu_hEDjG-CIHY-p_roflZT5n5";
    var targetFolder = DriveApp.getFolderById(folderId);

    var decoded = Utilities.base64Decode(data.base64);
    var blob = Utilities.newBlob(decoded, data.mimeType || "image/jpeg", data.filename);
    var file = targetFolder.createFile(blob);

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      fileId: file.getId(),
      url: file.getUrl(),
      filename: data.filename
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function autoMoveDailyArt() {
  var folderId = "1fIKXiOzUu_hEDjG-CIHY-p_roflZT5n5";
  var targetFolder = DriveApp.getFolderById(folderId);
  var files = DriveApp.searchFiles("mimeType = 'image/jpeg' and trashed = false and not '" + folderId + "' in parents");

  while (files.hasNext()) {
    var file = files.next();
    var name = file.getName();
    if (name.match(/_\d{4}-\d{2}-\d{2}\.jpg$/i)) {
      file.moveTo(targetFolder);
      Logger.log("Moved to daily arts: " + name);
    }
  }
}
