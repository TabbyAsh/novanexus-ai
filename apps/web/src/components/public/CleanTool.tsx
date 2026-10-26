"use client";
import { useMemo, useState } from "react";
// @ts-ignore — dependency-free CSV engine shared with the private Deal Desk.
import { cleanCsv, exportCsv, parseCsv } from "@/lib/public/csv.mjs";
const demo =
  'SKU,Product,Price,Quantity\n" SOCK-001 "," Cotton crew socks ",12.50,10\nSOCK-002,Athletic socks,15.00,8\nSOCK-002,Athletic socks,16.00,8\n,Logo mug,9.50,5\nBAG-001,Tote bag,"19,99",4\n';
export default function CleanTool() {
  const [text, setText] = useState(""),
    [sku, setSku] = useState(""),
    [price, setPrice] = useState(""),
    [drop, setDrop] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<any>(null),
    [fileName, setFileName] = useState("");
  const headers = useMemo(() => {
    try {
      return parseCsv(text).headers.map((h: string) => h.trim());
    } catch {
      return [];
    }
  }, [text]);
  function reset(v: string, name = "") {
    setText(v);
    setResult(null);
    setError("");
    setSku("");
    setPrice("");
    setFileName(name);
  }
  function run() {
    setError("");
    setResult(null);
    try {
      if (new TextEncoder().encode(text).length > 1000000)
        throw Error("Use a file under 1 MB.");
      const parsed = parseCsv(text);
      if (parsed.rows.length > 5000)
        throw Error("Use at most 5,000 data rows.");
      if (!parsed.headers.length) throw Error("Add a CSV with a header row.");
      const r = cleanCsv(text, {
        skuColumn: sku,
        priceColumn: price,
        removeEmptyRows: false,
        removeExactDuplicates: drop,
      });
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not parse the file.");
    }
  }
  function download(kind: "cleaned" | "issues" | "changes") {
    if (!result) return;
    let csv;
    if (kind === "cleaned") csv = exportCsv(result.headers, result.cleanedRows);
    else if (kind === "issues")
      csv = exportCsv(
        ["record", "column", "type", "message"],
        result.issues.map((x: any) => [x.row, x.column, x.type, x.message]),
      );
    else
      csv = exportCsv(
        ["record", "column", "action", "before", "after"],
        result.changes.map((x: any) => [
          x.row,
          x.column,
          x.action,
          x.before,
          x.after,
        ]),
      );
    const url = URL.createObjectURL(
        new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = "NovaClean-" + kind + ".csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section className="office-tool office-wrap">
      <div className="office-health">
        <span className="office-label">Local to this browser tab</span>
        <p className="office-small">
          Your file stays here; the tool makes no upload or AI request. Text
          values and ambiguous rows are preserved. Export before leaving.
          Spreadsheet apps can still infer identifier types on import.
        </p>
      </div>
      <div
        className="office-actions"
        style={{ marginBottom: 22, marginTop: 0 }}
      >
        <button
          className="office-outline"
          onClick={() => reset(demo, "Synthetic demonstration")}
        >
          Load a sample
        </button>
        <button className="office-outline" onClick={() => reset("")}>
          Clear the workspace
        </button>
        <span className="office-small">{fileName}</span>
      </div>
      <label className="office-upload">
        Choose a CSV, TSV or text file (up to 1 MB)
        <br />
        <input
          type="file"
          accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            if (f.size > 1000000) {
              setError("Use a file under 1 MB.");
              return;
            }
            reset(await f.text(), f.name);
            e.target.value = "";
          }}
        />
      </label>
      <label className="office-field">
        Or paste the file contents
        <textarea
          value={text}
          onChange={(e) => reset(e.target.value)}
          spellCheck={false}
          placeholder="SKU,Product,Price,Quantity"
        />
      </label>
      <div className="office-form-grid">
        <label className="office-field">
          Unique identifier / SKU column
          <select
            value={sku}
            onChange={(e) => {
              setSku(e.target.value);
              setResult(null);
            }}
          >
            <option value="">Do not check identifiers</option>
            {headers.map((h: string, i: number) => (
              <option key={i} value={h}>
                {h || "(Blank header)"}
              </option>
            ))}
          </select>
        </label>
        <label className="office-field">
          Decimal-price column
          <select
            value={price}
            onChange={(e) => {
              setPrice(e.target.value);
              setResult(null);
            }}
          >
            <option value="">Do not check prices</option>
            {headers.map((h: string, i: number) => (
              <option key={i} value={h}>
                {h || "(Blank header)"}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="office-check">
        <input
          type="checkbox"
          checked={drop}
          onChange={(e) => {
            setDrop(e.target.checked);
            setResult(null);
          }}
        />
        Remove exact duplicate rows after trimming (optional; default preserves
        them)
      </label>
      <p className="office-small">
        Leading and trailing whitespace will be trimmed. Blank rows, SKU letter
        case, missing values and conflicting duplicates remain inspectable.
        Formula-like cells are neutralized in exports.
      </p>
      <div className="office-actions">
        <button className="office-button" disabled={!text.trim()} onClick={run}>
          Review & clean →
        </button>
      </div>
      {error && (
        <p className="office-error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div aria-live="polite">
          <div className="office-stats">
            <div>
              <strong>{result.stats.inputRows}</strong>Input rows
            </div>
            <div>
              <strong>{result.stats.changedCells}</strong>Trimmed cells
            </div>
            <div>
              <strong>{result.stats.issueCount}</strong>Issues to review
            </div>
          </div>
          <div className="office-actions" style={{ marginTop: 0 }}>
            <button
              className="office-button"
              onClick={() => download("cleaned")}
            >
              Download cleaned CSV
            </button>
            <button
              className="office-outline"
              onClick={() => download("issues")}
            >
              Download issues
            </button>
            <button
              className="office-outline"
              onClick={() => download("changes")}
            >
              Download change log
            </button>
          </div>
          <div className="office-table-scroll">
            <table>
              <caption
                className="office-small"
                style={{ textAlign: "left", paddingBottom: 12 }}
              >
                Cleaned preview — first 20 rows. {result.stats.outputRows}{" "}
                output rows total.
              </caption>
              <thead>
                <tr>
                  {result.headers.map((h: string, i: number) => (
                    <th key={i}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.cleanedRows
                  .slice(0, 20)
                  .map((r: string[], i: number) => (
                    <tr key={i}>
                      {r.map((v, j) => (
                        <td key={j}>{v}</td>
                      ))}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <h3>Exceptions</h3>
          {result.issues.length ? (
            <ul className="office-small">
              {result.issues.slice(0, 30).map((i: any, n: number) => (
                <li key={n}>
                  Record {i.row} · {i.column}: {i.message}
                </li>
              ))}
            </ul>
          ) : (
            <p className="office-small">
              No issue found under the selected checks. This does not validate
              product descriptions, accuracy or an import destination.
            </p>
          )}
          <p className="office-small">
            {result.issues.length > 30
              ? "Download the issue report for the complete list."
              : ""}{" "}
            Your original file is unchanged.
          </p>
        </div>
      )}
    </section>
  );
}
