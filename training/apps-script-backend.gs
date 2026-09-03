function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'Submitted At', 'Candidate Name', 'Part 1 Score (/30)', 'Part 1 Mastery %',
      'Activity 1 Link (Reel)', 'Activity 2 Link (Mockup)', 'Part 2 Notes',
      'Q1: Interest in Digital Marketing', 'Q2: What Makes Content Effective',
      'Q3: Getting People Interested in a Brand'
    ]);
  }

  var data = JSON.parse(e.postData.contents);
  sheet.appendRow([
    new Date(),
    data.candidateName || '',
    data.hooksScore || 0,
    data.masteryPct || 0,
    data.part2Link1 || '',
    data.part2Link2 || '',
    data.part2Notes || '',
    data.part3Q1 || '',
    data.part3Q2 || '',
    data.part3Q3 || ''
  ]);

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
