const COLUMNS = [
  ['type', 'type'],
  ['receipt_id', 'receipt_id'],
  ['created_at UTC', 'created_at'],
  ['name', 'name'],
  ['company', 'company'],
  ['email', 'email'],
  ['phone', 'phone'],
  ['country', 'country'],
  ['product/service', 'product_or_service'],
  ['quantity+unit', 'quantity_text'],
  ['target_date', 'target_date'],
  ['notes', 'notes'],
  ['source', 'source'],
  ['status', 'status'],
];

function neutralizeSpreadsheetFormula(value) {
  const text = value == null ? '' : String(value);
  if (/^[\t\r\n ]*[=+\-@]/.test(text) || /^[\t\r]/.test(text)) return `'${text}`;
  return text;
}

function csvCell(value) {
  const text = neutralizeSpreadsheetFormula(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toCsv(rows) {
  const header = COLUMNS.map(([label]) => csvCell(label)).join(',');
  const lines = rows.map(row => COLUMNS.map(([, key]) => csvCell(row[key])).join(','));
  return `\uFEFF${[header, ...lines].join('\r\n')}\r\n`;
}

module.exports = {
  COLUMNS,
  neutralizeSpreadsheetFormula,
  csvCell,
  toCsv,
};
