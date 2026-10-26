/** CSV utilities. Values stay strings; logical CSV record numbers start at 1. */
function detectDelimiter(text) {
  const counts = { ",": 0, "\t": 0, ";": 0 };
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        i++;
        continue;
      }
      quoted = !quoted;
    } else if (!quoted) {
      if (c === "\r" || c === "\n") break;
      if (Object.hasOwn(counts, c)) counts[c]++;
    }
  }
  return Object.keys(counts).reduce(
    (best, c) => (counts[c] > counts[best] ? c : best),
    ",",
  );
}

export function parseCsv(text) {
  if (typeof text !== "string") throw new TypeError("CSV input must be text.");
  text = text.replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(text);
  if (!text.length) return { headers: [], rows: [], delimiter };
  const records = [];
  let row = [],
    field = "",
    quoted = false,
    closedQuote = false;
  const error = (message) =>
    new Error(
      `${message} at CSV record ${records.length + 1}, column ${row.length + 1}.`,
    );
  const endField = () => {
    row.push(field);
    field = "";
    closedQuote = false;
  };
  const endRow = () => {
    endField();
    records.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closedQuote = true;
        }
      } else field += c;
      continue;
    }
    if (c === delimiter) {
      endField();
      continue;
    }
    if (c === "\r" || c === "\n") {
      endRow();
      if (c === "\r" && text[i + 1] === "\n") i++;
      continue;
    }
    if (closedQuote) throw error("Unexpected character after a closing quote");
    if (c === '"') {
      if (field !== "") throw error("Unexpected quote in an unquoted field");
      quoted = true;
    } else field += c;
  }
  if (quoted) throw error("Unterminated quoted field");
  if (field !== "" || row.length || closedQuote || text.endsWith(delimiter))
    endRow();
  return { headers: records.shift() ?? [], rows: records, delimiter };
}

export function cleanCsv(text, options = {}) {
  const opts = {
    trim: true,
    removeEmptyRows: true,
    removeExactDuplicates: false,
    skuColumn: "",
    priceColumn: "",
    requiredColumns: [],
    ...options,
  };
  const parsed = parseCsv(text);
  const originalRows = parsed.rows.map((row) => [...row]);
  const changes = [],
    issues = [];
  let changedCells = 0,
    removedEmpty = 0,
    removedDuplicates = 0;
  const trimValue = (value, row, column) => {
    const after = opts.trim ? value.trim() : value;
    if (after !== value) {
      changes.push({ row, column, action: "trim", before: value, after });
      changedCells++;
    }
    return after;
  };
  const headers = parsed.headers.map((value, index) =>
    trimValue(value, 1, value || `Column ${index + 1}`),
  );
  const addIssue = (row, column, type, message) =>
    issues.push({ row, column, type, message });
  if (!headers.length)
    addIssue(1, "", "empty_file", "The file has no header record.");
  const seenHeaders = new Set();
  headers.forEach((name, index) => {
    if (!name.trim())
      addIssue(
        1,
        `Column ${index + 1}`,
        "empty_header",
        "This column has no header.",
      );
    else if (seenHeaders.has(name))
      addIssue(
        1,
        name,
        "duplicate_header",
        "Header occurs more than once; choose distinct names before mapping.",
      );
    seenHeaders.add(name);
  });
  const records = [],
    seenRows = new Set();
  originalRows.forEach((original, index) => {
    const rowNumber = index + 2;
    const values = original.map((value, col) =>
      trimValue(value, rowNumber, headers[col] || `Column ${col + 1}`),
    );
    if (opts.removeEmptyRows && values.every((value) => value.trim() === "")) {
      removedEmpty++;
      changes.push({
        row: rowNumber,
        column: "",
        action: "remove_empty_row",
        before: JSON.stringify(original),
        after: "",
      });
      return;
    }
    const key = JSON.stringify(values);
    if (opts.removeExactDuplicates && seenRows.has(key)) {
      removedDuplicates++;
      changes.push({
        row: rowNumber,
        column: "",
        action: "remove_exact_duplicate",
        before: JSON.stringify(original),
        after: "",
      });
      return;
    }
    seenRows.add(key);
    records.push({ row: rowNumber, values });
    if (values.length !== headers.length)
      addIssue(
        rowNumber,
        "",
        "column_count",
        `Found ${values.length} fields; the header has ${headers.length}. All fields were preserved.`,
      );
  });
  const mappedIndex = (name, role) => {
    if (!name) return -1;
    const index = headers.indexOf(name);
    if (index < 0)
      addIssue(
        1,
        name,
        "missing_column",
        `Selected ${role} column is not present.`,
      );
    else if (headers.lastIndexOf(name) !== index) {
      addIssue(
        1,
        name,
        "ambiguous_column",
        `Selected ${role} header is duplicated. Rename headers before validating this field.`,
      );
      return -1;
    }
    return index;
  };
  const required = [
    ...new Set(Array.isArray(opts.requiredColumns) ? opts.requiredColumns : []),
  ]
    .map((name) => ({ name, index: mappedIndex(name, "required") }))
    .filter((x) => x.index >= 0);
  const skuIndex = mappedIndex(opts.skuColumn, "SKU");
  const priceIndex = mappedIndex(opts.priceColumn, "price");
  const skuGroups = new Map();
  for (const record of records) {
    for (const { name, index } of required) {
      if (!(record.values[index] ?? "").trim())
        addIssue(
          record.row,
          name,
          "missing_required",
          "Required value is blank.",
        );
    }
    if (skuIndex >= 0) {
      const sku = record.values[skuIndex] ?? "";
      if (!sku.trim())
        addIssue(record.row, opts.skuColumn, "missing_sku", "SKU is blank.");
      else {
        if (!skuGroups.has(sku)) skuGroups.set(sku, []);
        skuGroups.get(sku).push(record);
      }
    }
    if (priceIndex >= 0) {
      const price = (record.values[priceIndex] ?? "").trim();
      if (!price)
        addIssue(
          record.row,
          opts.priceColumn,
          "missing_price",
          "Price is blank; it has not been changed to zero.",
        );
      else if (
        !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(price) ||
        !Number.isFinite(Number(price))
      ) {
        addIssue(
          record.row,
          opts.priceColumn,
          "invalid_price",
          "Expected a nonnegative decimal price without a currency symbol or grouping separator. Original text preserved.",
        );
      }
    }
  }
  for (const [sku, group] of skuGroups) {
    if (group.length < 2) continue;
    const conflict =
      new Set(group.map((record) => JSON.stringify(record.values))).size > 1;
    for (const record of group)
      addIssue(
        record.row,
        opts.skuColumn,
        conflict ? "duplicate_sku_conflict" : "duplicate_sku",
        `SKU ${sku} occurs in records ${group.map((item) => item.row).join(", ")}${conflict ? " with different row values" : ""}. Review before merging.`,
      );
  }
  const cleanedRows = records.map((record) => record.values);
  return {
    headers,
    originalRows,
    cleanedRows,
    changes,
    issues,
    delimiter: parsed.delimiter,
    stats: {
      inputRows: originalRows.length,
      outputRows: cleanedRows.length,
      removedEmpty,
      removedDuplicates,
      issueCount: issues.length,
      changedCells,
    },
  };
}

/** CSV preserves text bytes; spreadsheet importers may still infer identifier types. */
export function exportCsv(headers, rows, { spreadsheetSafe = true } = {}) {
  const quote = (value) => {
    let text = value === null || value === undefined ? "" : String(value);
    if (spreadsheetSafe && /^[\s\u0000-\u001f]*[=+\-@]/.test(text))
      text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return (
    [headers, ...rows].map((row) => row.map(quote).join(",")).join("\r\n") +
    "\r\n"
  );
}
