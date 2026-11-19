// Bind to the private payout spreadsheet. See docs/next-update-audit.md.
function syncPriorityPayouts() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const config = PropertiesService.getScriptProperties();
    const origin = config.getProperty("BADEHAUS_API_ORIGIN");
    const token = config.getProperty("PRIORITY_SHEETS_SYNC_TOKEN");
    if (!/^https:\/\/[a-z0-9.-]+$/i.test(origin || "") || !token || token.length < 32) {
      throw new Error("Configure the payout feed origin and token in Script Properties.");
    }
    const response = UrlFetchApp.fetch(origin + "/integrations/priority-sheets", {
      headers: { Authorization: "Bearer " + token },
      followRedirects: false,
      muteHttpExceptions: true
    });
    if (response.getResponseCode() !== 200) throw new Error("Payout feed returned " + response.getResponseCode());
    const snapshot = JSON.parse(response.getContentText());
    if (!Array.isArray(snapshot.rows)) throw new Error("Invalid payout feed.");
    const workbook = SpreadsheetApp.openById(config.getProperty("PRIORITY_SHEET_ID"));
    const sheet = workbook.getSheetByName("Priority payouts") || workbook.insertSheet("Priority payouts");
    const safeText = value => "'" + String(value ?? "");
    const values = [["Member ID", "Name", "EMT Contact", "Referral Code", "Referrals", "Total Earned (CAD)",
      "Total Paid Out (CAD)", "Referrals This Month", "Unpaid (CAD)"]];
    for (const row of snapshot.rows) {
      values.push([safeText(row.memberId), safeText(row.displayName), safeText(row.contact), safeText(row.referralCode),
        row.referrals, row.earnedCents / 100, row.paidCents / 100, row.monthlyReferrals, row.unpaidCents / 100]);
    }
    while (values.length < sheet.getLastRow()) values.push(Array(values[0].length).fill(""));
    if (values.length > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), values.length - sheet.getMaxRows());
    sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
  } finally {
    lock.releaseLock();
  }
}
