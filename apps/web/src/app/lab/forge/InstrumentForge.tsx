"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { instrumentEngine as engine } from "@/lib/instrument/runtime";
import { exportStandalone } from "@/lib/instrument/export";
import { instrumentGuide } from "@/lib/instrument/guide";
import capacity from "@/lib/instrument/examples/capacity.json";
import workshop from "@/lib/instrument/examples/workshop.json";
import type { InstrumentDocument } from "@/lib/instrument/types";
import styles from "./forge.module.css";

const storageKey = "nova-instrument-forge-v1";
const initial = engine.document(capacity);
export default function InstrumentForge() {
  const [spec, setSpec] = useState(initial.spec);
  const [values, setValues] = useState<Record<string, unknown>>(initial.values);
  const [json, setJson] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const revision = useRef(0);
  const calculation = useMemo(
    () => engine.calculate(spec, values),
    [spec, values],
  );
  const series = engine.chartValues(spec, calculation);
  const chartMax = Math.max(1, ...series.map((s) => Math.abs(s.value)));
  const signedChart = series.some((s) => s.value < 0);
  useEffect(() => {
    try {
      setSaved(localStorage.getItem(storageKey) !== null);
    } catch {
      /* Storage is optional; memory mode continues. */
    }
  }, []);
  function replace(project: InstrumentDocument, message: string) {
    revision.current++;
    setSpec(project.spec);
    setValues(project.values);
    setError("");
    setNotice(message);
  }
  function loadText(text: string) {
    try {
      replace(
        engine.parse(text),
        "Calculator imported. The controls and results now come from that specification.",
      );
    } catch (e) {
      setError(
        "Import rejected. " +
          (e as Error).message +
          " Your current calculator is unchanged.",
      );
    }
  }
  function download(name: string, content: string, mime = "application/json") {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function current(): InstrumentDocument {
    return {
      documentVersion: "nova-instrument-document/1",
      spec,
      values: calculation.inputs,
    };
  }
  function saveOnDevice() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(current()));
      setSaved(true);
      setNotice("Saved on this device. Loading it later is your choice.");
      setError("");
    } catch {
      setError(
        "Device storage is unavailable or full. Download JSON to keep your calculator.",
      );
    }
  }
  function offline() {
    try {
      download(spec.id + ".html", exportStandalone(current()), "text/html");
      setNotice(
        "Offline calculator downloaded with your current values. Open the HTML file in a browser; it works without Nova.",
      );
      setError("");
    } catch (e) {
      setError("Could not export: " + (e as Error).message);
    }
  }
  return (
    <main className={styles.forge}>
      <header className={styles.header}>
        <nav aria-label="Primary navigation">
          <Link href="/" className={styles.wordmark}>
            NOVA
          </Link>
          <div>
            <Link href="/loop">Nova Loop</Link>
            <Link href="/lab/contrast">Contrast Lab</Link>
            <span aria-current="page">Instrument Forge</span>
          </div>
        </nav>
      </header>
      <div className={styles.shell}>
        <div className={styles.intro}>
          <div>
            <p className={styles.eyebrow}>NOVA INSTRUMENT FORGE</p>
            <p className={styles.tagline}>
              Change the numbers. Keep the calculator.
            </p>
          </div>
          <p className={styles.local}>
            <span aria-hidden="true">●</span> Computes here, in your browser.
            <br />
            No account or AI call needed.
          </p>
        </div>
        <div className={styles.toolbar}>
          <div
            className={styles.examples}
            role="group"
            aria-label="Example calculators"
          >
            <button
              aria-pressed={spec.id === capacity.id}
              onClick={() => loadText(JSON.stringify(capacity))}
            >
              Process capacity
            </button>
            <button
              aria-pressed={spec.id === workshop.id}
              onClick={() => loadText(JSON.stringify(workshop))}
            >
              Workshop budget
            </button>
          </div>
          <button onClick={() => importRef.current?.click()}>
            Import specification
          </button>
          <input
            ref={importRef}
            className={styles.file}
            type="file"
            tabIndex={-1}
            accept=".json,application/json"
            aria-label="Import calculator file"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              if (file.size > engine.limits.bytes) {
                setError(
                  "Import rejected: file exceeds the 200 KB limit. Your current calculator is unchanged.",
                );
                return;
              }
              const before = revision.current;
              try {
                const text = await file.text();
                if (revision.current === before) loadText(text);
                else
                  setNotice(
                    "Import canceled because you changed the calculator while the file was loading.",
                  );
              } catch {
                setError(
                  "Could not read that file. Your current calculator is unchanged.",
                );
              }
            }}
          />
          <span className={styles.spacer} />
          <button
            className={styles.primaryButton}
            disabled={!calculation.ok}
            onClick={offline}
          >
            Download offline calculator <span aria-hidden="true">↗</span>
          </button>
        </div>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <p role="status" className={styles.notice}>
          {notice}
        </p>
        <section aria-labelledby="instrument-title">
          <h1 id="instrument-title">{spec.title}</h1>
          <p className={styles.description}>{spec.description}</p>
          <div className={styles.mobileResult}>
            <span>{spec.outputs[0].label}</span>
            <strong>
              {calculation.ok
                ? engine.format(
                    calculation.values[spec.outputs[0].id],
                    spec.outputs[0].precision,
                  )
                : "Check inputs"}{" "}
              <small>
                {calculation.ok ? engine.units[spec.outputs[0].unit].label : ""}
              </small>
            </strong>
          </div>
          <div className={styles.workspace}>
            <section className={styles.inputs} aria-labelledby="inputs-title">
              <div className={styles.sectionHead}>
                <h2 id="inputs-title">Your inputs</h2>
                <button
                  onClick={() => {
                    revision.current++;
                    setValues(engine.defaults(spec));
                    setNotice("Original specification defaults restored.");
                    setError("");
                  }}
                >
                  Reset defaults
                </button>
              </div>
              {spec.inputs.map((input) => (
                <div className={styles.inputRow} key={input.id}>
                  <div>
                    <label htmlFor={"input-" + input.id}>{input.label}</label>
                    <p id={"help-" + input.id}>{input.help}</p>
                  </div>
                  <div className={styles.numberField}>
                    <input
                      id={"input-" + input.id}
                      type="number"
                      min={input.min}
                      max={input.max}
                      step={input.step}
                      value={String(values[input.id] ?? "")}
                      aria-describedby={"help-" + input.id}
                      onChange={(e) => {
                        revision.current++;
                        setValues((old) => ({
                          ...old,
                          [input.id]: e.target.value,
                        }));
                        setNotice("");
                      }}
                    />
                    <span>{engine.units[input.unit].label || "number"}</span>
                  </div>
                </div>
              ))}
              <p className={styles.hint}>
                Results update as you type. An empty or invalid input clears the
                result.
              </p>
              <details className={styles.assumptions}>
                <summary>What this assumes</summary>
                <ul>
                  {spec.assumptions.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </details>
            </section>
            <section aria-labelledby="result-title" className={styles.results}>
              <div className={styles.resultHeading}>
                <h2 id="result-title">Calculated result</h2>
                <span>
                  {calculation.ok ? "LIVE CALCULATION" : "CHECK INPUTS"}
                </span>
              </div>
              <div
                aria-live="polite"
                aria-atomic="true"
                className={styles.cards}
              >
                {spec.outputs.map((output, index) => (
                  <article
                    key={output.id}
                    className={
                      index === 0 ? styles.primaryResult : styles.result
                    }
                  >
                    <h3>{output.label}</h3>
                    <output data-output={output.id} aria-label={output.label}>
                      {calculation.ok
                        ? engine.format(
                            calculation.values[output.id],
                            output.precision,
                          )
                        : "—"}
                    </output>
                    <p className={styles.unit}>
                      {engine.units[output.unit].label}
                    </p>
                    <p>{output.help}</p>
                  </article>
                ))}
              </div>
              <div aria-live="polite">
                {calculation.errors.map((message, i) => (
                  <p key={i} className={styles.error}>
                    {message}
                  </p>
                ))}
                {calculation.warnings.map((message, i) => (
                  <p key={i} className={styles.warning}>
                    {message}
                  </p>
                ))}
              </div>
              {spec.chart && calculation.ok && (
                <div className={styles.chart}>
                  <h3>{spec.chart.title}</h3>
                  {series.map((s, i) => (
                    <div key={i} className={styles.barRow}>
                      <span>{s.label}</span>
                      <strong>
                        {engine.format(s.value, 2)}{" "}
                        {engine.units[spec.chart!.unit].label}
                      </strong>
                      <div className={styles.track} aria-hidden="true">
                        <div
                          className={
                            s.value < 0 ? styles.negativeBar : styles.bar
                          }
                          style={{
                            width: `${(Math.abs(s.value) / chartMax) * (signedChart ? 50 : 100)}%`,
                            marginLeft: `${signedChart ? (s.value < 0 ? 50 - (Math.abs(s.value) / chartMax) * 50 : 50) : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </section>
        <section className={styles.keep} aria-labelledby="keep-title">
          <div>
            <h2 id="keep-title">Take this calculator with you</h2>
            <p>
              The HTML file contains the controls, formulas and your current
              values. Open it offline and keep changing the numbers.
            </p>
          </div>
          <div>
            <button
              className={styles.primaryButton}
              disabled={!calculation.ok}
              onClick={offline}
            >
              Download HTML
            </button>
            <button
              disabled={!calculation.ok}
              onClick={() =>
                download(
                  spec.id + ".instrument.json",
                  JSON.stringify(current(), null, 2),
                )
              }
            >
              Export JSON
            </button>
          </div>
        </section>
        <details className={styles.details}>
          <summary>Inspect formulas & checks</summary>
          <p>
            These are the actual formulas being evaluated. Display rounding does
            not change the calculations.
          </p>
          {spec.outputs.map((o) => (
            <div className={styles.formula} key={o.id}>
              <strong>{o.label}</strong>
              <code>{engine.describe(o.expression, spec)}</code>
              <span>Output unit: {o.unit}</span>
            </div>
          ))}
          {spec.constraints.map((c) => (
            <div className={styles.formula} key={c.id}>
              <strong>
                {c.severity === "error" ? "Blocks results" : "Warning"}
              </strong>
              <code>
                {engine.describe(c.left, spec)} {c.operator}{" "}
                {engine.describe(c.right, spec)}
              </code>
              <span>{c.message}</span>
            </div>
          ))}
        </details>
        <details className={styles.details}>
          <summary>Bring a different calculator specification</summary>
          <p>
            Ask a model—or write the JSON yourself—to describe inputs, units and
            formulas in the supported format. Importing that specification
            creates the calculator. Arbitrary prose and JavaScript are rejected.
          </p>
          <div className={styles.inlineActions}>
            <button
              onClick={() =>
                download(
                  "instrument-spec-guide.md",
                  instrumentGuide,
                  "text/markdown",
                )
              }
            >
              Download specification guide
            </button>
            <button
              onClick={() =>
                download(spec.id + ".spec.json", JSON.stringify(spec, null, 2))
              }
            >
              Download current specification
            </button>
          </div>
          <label htmlFor="spec-json">Paste specification JSON</label>
          <textarea
            id="spec-json"
            rows={10}
            value={json}
            maxLength={engine.limits.bytes + 1}
            spellCheck={false}
            onChange={(e) => setJson(e.target.value)}
          />
          <button onClick={() => loadText(json)}>Import pasted JSON</button>
          <p className={styles.hint}>
            Version nova-instrument/1. Up to 24 inputs, 24 outputs, 24 checks,
            1,000 expression nodes and 200 KB. Supported arithmetic and unit
            checking are described in the guide. This page does not call an AI
            service.
          </p>
        </details>
        <details className={styles.details}>
          <summary>Optional device save</summary>
          <p>
            Nothing is saved automatically. This browser storage is not
            encrypted and is not an account backup. Saving replaces this tool’s
            one device save; it does not change Nova Loop or Contrast Lab data.
          </p>
          <div className={styles.inlineActions}>
            <button disabled={!calculation.ok} onClick={saveOnDevice}>
              Save on this device
            </button>
            <button
              disabled={!saved}
              onClick={() => {
                try {
                  const value = localStorage.getItem(storageKey);
                  if (value)
                    replace(engine.parse(value), "Device save loaded.");
                  else {
                    setSaved(false);
                    setNotice("No device save found.");
                  }
                } catch (e) {
                  setError(
                    "Could not load device save: " + (e as Error).message,
                  );
                }
              }}
            >
              Load device save
            </button>
            <button
              disabled={!saved}
              onClick={() => {
                try {
                  localStorage.removeItem(storageKey);
                  setSaved(false);
                  setNotice(
                    "Device save deleted. The current calculator remains in memory.",
                  );
                } catch {
                  setError(
                    "Could not delete device save: browser storage is unavailable.",
                  );
                }
              }}
            >
              Delete device save
            </button>
          </div>
        </details>
        <footer className={styles.footer}>
          A calculator for the assumptions you supply. No claim about unmodeled
          conditions. <Link href="/">Return to Nova →</Link>
        </footer>
      </div>
    </main>
  );
}
