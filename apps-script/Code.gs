const ANALYTICS_SHEET_ID = '1j165dsa1a-DDapOCgyBLrJQ_UBa4LzCWdWez4_obLD0';
const ANALYTICS_TAB_NAME = 'Analytics';

function getEventTypes() {
  const ss     = SpreadsheetApp.openById(ANALYTICS_SHEET_ID);
  const sheet  = ss.getSheetByName(ANALYTICS_TAB_NAME);
  if (!sheet)  { Logger.log('Sheet not found'); return; }
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(String);
  const col    = headers.indexOf('Event Type');
  if (col === -1) { Logger.log('Event Type column not found'); return; }
  const types  = [...new Set(values.slice(1).map(r => r[col]).filter(Boolean))];
  Logger.log(JSON.stringify(types));
}

function getHeaders() {
  const ss      = SpreadsheetApp.openById(ANALYTICS_SHEET_ID);
  const sheet   = ss.getSheetByName(ANALYTICS_TAB_NAME);
  if (!sheet) { Logger.log('Sheet not found: ' + ANALYTICS_TAB_NAME); return; }
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  Logger.log(JSON.stringify(headers));
}

function doGet() {
  try {
    const data = getAnalyticsData_();
    return ContentService
      .createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (e) {
    return ContentService
      .createTextOutput(JSON.stringify({ rows: [], error: e.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

const EXCLUDED_EVENTS = ['logout', 'row_expanded', 'login', 'export_excel'];

function getAnalyticsData_() {
  try {
    const ss    = SpreadsheetApp.openById(ANALYTICS_SHEET_ID);
    const sheet = ss.getSheetByName(ANALYTICS_TAB_NAME);
    if (!sheet || sheet.getLastRow() < 2) return { rows: [], error: null };

    const values  = sheet.getDataRange().getValues();
    const headers = values[0].map(String);
    const rows    = [];

    for (let i = 1; i < values.length; i++) {
      const row = {};
      headers.forEach((h, j) => {
        const v = values[i][j];
        row[h]  = (v instanceof Date) ? v.toISOString() : (v !== null && v !== undefined ? String(v) : '');
      });
      if (row['Event Type'] && row['Timestamp'] && !EXCLUDED_EVENTS.includes(row['Event Type'])) rows.push(row);
    }

    return { rows, error: null };
  } catch (e) {
    return { rows: [], error: e.message };
  }
}

// ── Run once to add "Web App" column with randomised fake data ─────────────────
const FAKE_APPS = [
  'Actuals Variance',
  'Capitalization Variance',
  'Orphans Reporting',
  'Resource Utilization',
  'Headcount Tracker',
  'Initiative Spend',
];

function addWebAppColumn() {
  const ss    = SpreadsheetApp.openById(ANALYTICS_SHEET_ID);
  const sheet = ss.getSheetByName(ANALYTICS_TAB_NAME);
  if (!sheet) { Logger.log('Sheet not found'); return; }

  const lastCol  = sheet.getLastColumn();
  const lastRow  = sheet.getLastRow();
  const headers  = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);

  // Abort if column already exists
  if (headers.includes('Web App')) { Logger.log('Web App column already exists'); return; }

  const newCol = lastCol + 1;
  sheet.getRange(1, newCol).setValue('Web App');

  // Assign weighted random app to each data row
  const weights = [0.30, 0.25, 0.20, 0.12, 0.08, 0.05]; // skew toward first few
  const vals = [];
  for (let i = 2; i <= lastRow; i++) {
    const r = Math.random();
    let cum = 0, pick = FAKE_APPS[0];
    for (let j = 0; j < FAKE_APPS.length; j++) {
      cum += weights[j];
      if (r < cum) { pick = FAKE_APPS[j]; break; }
    }
    vals.push([pick]);
  }

  sheet.getRange(2, newCol, vals.length, 1).setValues(vals);
  Logger.log('Added Web App column with ' + vals.length + ' values.');
}

// ── Run once to reduce weekend rows to ~3 per day (makes usage look realistic) ──
const MAX_WEEKEND_ROWS_PER_DAY = 3;

function trimWeekendData() {
  const ss    = SpreadsheetApp.openById(ANALYTICS_SHEET_ID);
  const sheet = ss.getSheetByName(ANALYTICS_TAB_NAME);
  if (!sheet) { Logger.log('Sheet not found'); return; }

  const values  = sheet.getDataRange().getValues();
  const headers = values[0].map(String);
  const tsCol   = headers.indexOf('Timestamp');
  if (tsCol === -1) { Logger.log('Timestamp column not found'); return; }

  // Bucket weekend rows by date string (YYYY-MM-DD), keep only first MAX_WEEKEND_ROWS_PER_DAY
  const weekendDayCounts = {}; // date → count of kept rows
  const rowsToDelete = [];     // 0-based data row indices to delete

  for (let i = 1; i < values.length; i++) {
    const v = values[i][tsCol];
    if (!v) continue;
    const d = (v instanceof Date) ? v : new Date(v);
    if (isNaN(d)) continue;
    const dow = d.getDay(); // 0=Sun, 6=Sat
    if (dow !== 0 && dow !== 6) continue; // skip weekdays

    const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    weekendDayCounts[key] = (weekendDayCounts[key] || 0) + 1;
    if (weekendDayCounts[key] > MAX_WEEKEND_ROWS_PER_DAY) rowsToDelete.push(i);
  }

  // Delete bottom-up to preserve indices
  for (let i = rowsToDelete.length - 1; i >= 0; i--) {
    sheet.deleteRow(rowsToDelete[i] + 1); // +1 for 1-based sheet rows
  }
  Logger.log(`Deleted ${rowsToDelete.length} excess weekend rows (kept up to ${MAX_WEEKEND_ROWS_PER_DAY} per day).`);
}

// Run this once from the Apps Script editor to permanently remove excluded rows from the sheet
function cleanupExcludedEvents() {
  const ss    = SpreadsheetApp.openById(ANALYTICS_SHEET_ID);
  const sheet = ss.getSheetByName(ANALYTICS_TAB_NAME);
  if (!sheet) { Logger.log('Sheet not found'); return; }

  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(String);
  const col = headers.indexOf('Event Type');
  if (col === -1) { Logger.log('Event Type column not found'); return; }

  // Delete from bottom up to preserve row indices
  let deleted = 0;
  for (let i = values.length - 1; i >= 1; i--) {
    if (EXCLUDED_EVENTS.includes(String(values[i][col]))) {
      sheet.deleteRow(i + 1);
      deleted++;
    }
  }
  Logger.log(`Deleted ${deleted} rows.`);
}
