"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Analysis, decode, Normalized } from "@/lib/contrast/compiler";
import {
  Project,
  Observation,
  Value,
  LIMITS,
  importProject,
  exportProject,
} from "@/lib/contrast/schema";
import { ADAPTER_OPERATIONS, observeCandidate } from "@/lib/contrast/adapters";
import {
  blankProject,
  channelProject,
  contradictionProject,
  sequenceProject,
  serializerProject,
} from "@/lib/contrast/examples";
import {
  generateJest,
  makeBundle,
  makeTestSpec,
  readableReport,
} from "@/lib/contrast/bundle";
import styles from "./contrast.module.css";

const STORAGE_KEY = "nova-contrast-project-v1";
const display = (value: Value | undefined) =>
  value == null
    ? "?"
    : typeof value === "boolean"
      ? value
        ? "1"
        : "0"
      : String(value);
const nextId = (prefix: string, ids: string[]) => {
  let n = 1;
  while (ids.includes(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
};
const statusLabel: Record<string, string> = {
  disabled: "Disabled",
  "not-on-channel": "Other channel",
  "violates-equivalence": "Rejected · reveals a difference",
  "unverified-equivalence": "Unverified · missing evidence",
  admissible: "Admissible",
};
function download(name: string, content: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ContrastLab() {
  const [project, setProject] = useState<Project>(sequenceProject);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analyzedInput, setAnalyzedInput] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [json, setJson] = useState(""),
    [deviceSaved, setDeviceSaved] = useState(false);
  const [decoderInput, setDecoderInput] = useState<Record<string, string>>({});
  const worker = useRef<Worker | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    runId = useRef(0);
  const snapshot = JSON.stringify(project),
    stale = !!analysis && snapshot !== analyzedInput;
  const fileInput = useRef<HTMLInputElement>(null);
  const cancel = () => {
    worker.current?.terminate();
    worker.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setBusy(false);
    runId.current++;
  };
  useEffect(() => {
    try {
      setDeviceSaved(localStorage.getItem(STORAGE_KEY) !== null);
    } catch {
      /* Storage may be disabled. */
    }
    return () => {
      worker.current?.terminate();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  function edit(next: Project) {
    cancel();
    setProject(next);
    setError("");
    setNotice("");
  }
  function load(next: Project) {
    edit(next);
    setAnalysis(null);
    setAnalyzedInput("");
    setDecoderInput({});
    setNotice("Project loaded. Review or edit it, then run analysis.");
  }
  function patchObservation(id: string, changes: Partial<Observation>) {
    edit({
      ...project,
      observations: project.observations.map((o) =>
        o.id === id ? { ...o, ...changes } : o,
      ),
    });
  }
  function run() {
    cancel();
    setError("");
    setNotice("");
    let valid: Project;
    try {
      valid = importProject(JSON.stringify(project));
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    const id = ++runId.current;
    setBusy(true);
    try {
      const w = new Worker(
        new URL("../../../lib/contrast/contrast.worker.ts", import.meta.url),
      );
      worker.current = w;
      timer.current = setTimeout(() => {
        if (runId.current === id) {
          cancel();
          setError(
            "Computation limit reached (10 seconds). Reduce the cases, observations, or requirements and rerun.",
          );
        }
      }, 10000);
      w.onmessage = (
        event: MessageEvent<{ id: number; result?: Analysis; error?: string }>,
      ) => {
        if (event.data.id !== runId.current) return;
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
        w.terminate();
        worker.current = null;
        setBusy(false);
        if (event.data.error) setError(event.data.error);
        else {
          setAnalysis(event.data.result!);
          setAnalyzedInput(snapshot);
          setNotice(
            "Analysis complete. Exported tests have not been run by this page.",
          );
        }
      };
      w.onerror = () => {
        cancel();
        setError(
          "The analysis worker could not run. Retry or export your project for local analysis.",
        );
      };
      w.postMessage({ id, project: valid });
    } catch {
      cancel();
      setError(
        "This browser could not start local computation. No project data was sent.",
      );
    }
  }
  function importText(text: string) {
    try {
      load(importProject(text));
      setJson("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function importFile(file?: File) {
    if (!file) return;
    if (file.size > LIMITS.bytes) {
      setError(`Import exceeds ${LIMITS.bytes} bytes.`);
      return;
    }
    try {
      importText(await file.text());
    } catch {
      setError("Could not read this file.");
    }
  }
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, exportProject(project));
      setDeviceSaved(true);
      setNotice("Saved on this device. This storage is not encrypted.");
    } catch (e) {
      setError(`Could not save: ${(e as Error).message}`);
    }
  }
  function exportCurrent() {
    try {
      download("nova-contrast-project.json", exportProject(project));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function sourceChange(o: Observation, value: string) {
    if (value === "manual" || value === "simulated")
      patchObservation(o.id, {
        source: value,
        adapter: undefined,
        operation: undefined,
      });
    else {
      const adapter = value as "sequence-witness" | "nova-structured-data";
      patchObservation(o.id, {
        source: "adapter",
        adapter,
        operation: ADAPTER_OPERATIONS[adapter][0],
        kind: "categorical",
      });
    }
  }
  function cellValue(o: Observation, caseId: string): Value {
    if (o.source !== "adapter") return o.values[caseId] ?? null;
    try {
      return observeCandidate(
        o,
        project.cases.find((c) => c.id === caseId)?.input ?? "",
      );
    } catch {
      return null;
    }
  }
  function cellEdit(o: Observation, id: string, value: string) {
    let parsed: Value = value === "" || value === "?" ? null : value;
    if (value && value !== "?" && o.kind === "numeric-bins")
      parsed = Number.isFinite(Number(value)) ? Number(value) : value;
    else if (value === "true") parsed = true;
    else if (value === "false") parsed = false;
    patchObservation(o.id, { values: { ...o.values, [id]: parsed } });
  }

  return (
    <main className={styles.lab}>
      <header className={styles.header}>
        <nav aria-label="Lab navigation">
          <Link href="/" className={styles.wordmark}>
            NOVA
          </Link>
          <div>
            <Link href="/loop">Nova Loop</Link>
            <Link href="/lab/contrast" aria-current="page">
              Contrast Lab
            </Link>
            <Link href="/login">Sign in</Link>
          </div>
        </nav>
      </header>
      <div className={styles.shell}>
        <section className={styles.hero} aria-labelledby="lab-title">
          <div>
            <p className={styles.eyebrow}>NOVA CONTRAST LAB / RELEASE 01</p>
            <h1 id="lab-title">
              Test the differences
              <br />
              that matter.
            </h1>
            <p className={styles.lead}>
              Tell us which cases should look the same and which you need to
              tell apart. Find out whether your observations can do that.
            </p>
          </div>
          <aside>
            <span className={styles.localDot} /> Runs in this browser
            <p>
              No account. No model call. No project upload.
              <br />
              Your work stays in memory until you choose to save or export.
            </p>
          </aside>
        </section>
        <div className={styles.toolbar}>
          <button onClick={() => load(sequenceProject())}>
            Sequence Witness
          </button>
          <button onClick={() => load(contradictionProject())}>
            Contradiction example
          </button>
          <button onClick={() => load(channelProject())}>
            Channel example
          </button>
          <button onClick={() => load(serializerProject())}>
            Nova serializer
          </button>
          <span />
          <button onClick={() => load(blankProject())}>New project</button>
          <button onClick={() => fileInput.current?.click()}>
            Import project
          </button>
          <button onClick={exportCurrent}>Export project</button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            aria-label="Import project file"
            className={styles.fileInput}
            onChange={(e) => {
              void importFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
        <div className={styles.runBar}>
          <div>
            <strong>
              {stale
                ? "Inputs changed · previous results are stale"
                : busy
                  ? "Computing in an isolated local worker…"
                  : "Ready to test your model?"}
            </strong>
            <p>
              Exact categories. Explicit bins. Finite cases. No inferred facts.
            </p>
          </div>
          <div className={styles.row}>
            {busy && <button onClick={cancel}>Cancel</button>}
            <button className={styles.primary} onClick={run} disabled={busy}>
              {busy ? "Running…" : "Run analysis →"}
            </button>
          </div>
        </div>
        {error && (
          <div role="alert" className={styles.error}>
            {error}
          </div>
        )}
        {notice && (
          <p role="status" className={styles.notice}>
            {notice}
          </p>
        )}
        <section className={styles.section} aria-labelledby="project-heading">
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.eyebrow}>01 / MODEL</p>
              <h2 id="project-heading">Cases & observations</h2>
            </div>
            <label className={styles.projectName}>
              Project name
              <input
                value={project.name}
                maxLength={160}
                onChange={(e) => edit({ ...project, name: e.target.value })}
              />
            </label>
          </div>
          {project.observations.some(
            (o) => o.adapter === "sequence-witness",
          ) && (
            <div className={styles.callout}>
              <strong>Sequence Witness is a logic simulation.</strong> Does
              remembering which events happened reveal their order? Start with
              “A seen” and “B seen,” run, then enable the order observations.
              “Before” is strictly earlier. AB and BA separate with order; ABA
              and BAB still collide. This does not validate sensors, materials,
              or damage prediction.
            </div>
          )}
          {project.observations.some(
            (o) => o.adapter === "nova-structured-data",
          ) && (
            <div className={styles.callout}>
              <strong>
                This adapter calls Nova’s actual structured-data serializer.
              </strong>{" "}
              Its contract escapes literal &lt; characters in JSON while
              preserving the decoded value. The two cases distinguish a literal
              bracket from literal escape text.
            </div>
          )}
          <div className={styles.tableScroll}>
            <table>
              <caption className={styles.srOnly}>
                Editable cases and observation values
              </caption>
              <thead>
                <tr>
                  <th>Case</th>
                  <th>Adapter input / history</th>
                  {project.observations.map((o) => (
                    <th key={o.id}>
                      {o.name}
                      <small>
                        {o.source === "adapter"
                          ? "Executed adapter"
                          : o.source === "simulated"
                            ? "Supplied simulation"
                            : "Manual table"}
                      </small>
                    </th>
                  ))}
                  <th>Remove</th>
                </tr>
              </thead>
              <tbody>
                {project.cases.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <input
                        aria-label={`Case name ${c.id}`}
                        value={c.name}
                        maxLength={160}
                        onChange={(e) =>
                          edit({
                            ...project,
                            cases: project.cases.map((x) =>
                              x.id === c.id
                                ? { ...x, name: e.target.value }
                                : x,
                            ),
                          })
                        }
                      />
                      <small>{c.id}</small>
                    </td>
                    <td>
                      <input
                        aria-label={`Input ${c.id}`}
                        value={c.input ?? ""}
                        placeholder="Used by built-in adapters"
                        maxLength={4096}
                        onChange={(e) =>
                          edit({
                            ...project,
                            cases: project.cases.map((x) =>
                              x.id === c.id
                                ? { ...x, input: e.target.value }
                                : x,
                            ),
                          })
                        }
                      />
                    </td>
                    {project.observations.map((o) => (
                      <td key={o.id}>
                        {o.source === "adapter" ? (
                          <output
                            aria-label={`${o.name} for ${c.id}`}
                            className={styles.value}
                          >
                            {display(cellValue(o, c.id))}
                          </output>
                        ) : (
                          <input
                            aria-label={`${o.name} for ${c.id}`}
                            value={
                              o.values[c.id] == null
                                ? ""
                                : String(o.values[c.id])
                            }
                            placeholder="Unknown"
                            onChange={(e) => cellEdit(o, c.id, e.target.value)}
                          />
                        )}
                      </td>
                    ))}
                    <td>
                      <button
                        aria-label={`Remove case ${c.id}`}
                        onClick={() =>
                          edit({
                            ...project,
                            cases: project.cases.filter((x) => x.id !== c.id),
                            observations: project.observations.map((o) => ({
                              ...o,
                              values: Object.fromEntries(
                                Object.entries(o.values).filter(
                                  ([id]) => id !== c.id,
                                ),
                              ),
                            })),
                            requirements: project.requirements.filter(
                              (r) => r.left !== c.id && r.right !== c.id,
                            ),
                          })
                        }
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.row}>
            <button
              disabled={project.cases.length >= LIMITS.cases}
              onClick={() => {
                const id = nextId(
                  "case",
                  project.cases.map((c) => c.id),
                );
                edit({
                  ...project,
                  cases: [
                    ...project.cases,
                    { id, name: `Case ${project.cases.length + 1}` },
                  ],
                });
              }}
            >
              + Add case
            </button>
            <p className={styles.help}>
              Blank values and ? are unknown. Enter true/false for booleans or
              exact text. Numeric observations use explicit bins. Removing a
              case also removes its requirements.
            </p>
          </div>
          <div className={styles.observations}>
            {project.observations.map((o) => (
              <article key={o.id} className={styles.observation}>
                <div className={styles.observationTop}>
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      aria-label={`Enable ${o.name}`}
                      checked={o.enabled}
                      onChange={(e) =>
                        patchObservation(o.id, { enabled: e.target.checked })
                      }
                    />
                    <strong>{o.name}</strong>
                  </label>
                  <label>
                    Cost
                    <input
                      type="number"
                      aria-label={`Cost ${o.id}`}
                      min={0}
                      max={1000000}
                      step={1}
                      value={Number.isNaN(o.cost) ? "" : o.cost}
                      onChange={(e) =>
                        patchObservation(o.id, {
                          cost:
                            e.target.value === ""
                              ? NaN
                              : Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <button
                    aria-label={`Remove observation ${o.id}`}
                    onClick={() =>
                      edit({
                        ...project,
                        observations: project.observations.filter(
                          (x) => x.id !== o.id,
                        ),
                      })
                    }
                  >
                    ×
                  </button>
                </div>
                <details>
                  <summary>Edit measurement & channels</summary>
                  <div className={styles.configGrid}>
                    <label>
                      Name
                      <input
                        value={o.name}
                        aria-label={`Observation name ${o.id}`}
                        onChange={(e) =>
                          patchObservation(o.id, { name: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Source
                      <select
                        aria-label={`Source ${o.id}`}
                        value={o.source === "adapter" ? o.adapter : o.source}
                        onChange={(e) => sourceChange(o, e.target.value)}
                      >
                        <option value="manual">Manually supplied</option>
                        <option value="simulated">
                          Supplied simulation table
                        </option>
                        <option value="sequence-witness">
                          Sequence Witness adapter
                        </option>
                        <option value="nova-structured-data">
                          Nova serializer adapter
                        </option>
                      </select>
                    </label>
                    {o.source === "adapter" && (
                      <label>
                        Operation
                        <select
                          value={o.operation}
                          aria-label={`Operation ${o.id}`}
                          onChange={(e) =>
                            patchObservation(o.id, {
                              operation: e.target.value,
                            })
                          }
                        >
                          {ADAPTER_OPERATIONS[o.adapter!].map((op) => (
                            <option key={op}>{op}</option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label>
                      Value interpretation
                      <select
                        aria-label={`Kind ${o.id}`}
                        value={o.kind}
                        onChange={(e) =>
                          patchObservation(o.id, {
                            kind: e.target.value as Observation["kind"],
                            boundaries: [],
                            values: {},
                          })
                        }
                      >
                        <option value="categorical">Exact categories</option>
                        <option value="numeric-bins">Numeric bins</option>
                      </select>
                    </label>
                    {o.kind === "numeric-bins" && (
                      <label>
                        Increasing bin boundaries
                        <input
                          aria-label={`Bins ${o.id}`}
                          defaultValue={o.boundaries?.join(", ")}
                          placeholder="10, 20, 30"
                          onBlur={(e) =>
                            patchObservation(o.id, {
                              boundaries: e.target.value.trim()
                                ? e.target.value
                                    .split(",")
                                    .map((x) => Number(x.trim()))
                                : [],
                            })
                          }
                        />
                        <small>
                          Bins: below first, then [lower, upper), then ≥ last.
                          No approximate equality.
                        </small>
                      </label>
                    )}
                  </div>
                  <fieldset>
                    <legend>Available output channels</legend>
                    {project.channels.map((c) => (
                      <label key={c.id} className={styles.check}>
                        <input
                          type="checkbox"
                          aria-label={`${o.name} on ${c.name}`}
                          checked={o.channels.includes(c.id)}
                          onChange={(e) =>
                            patchObservation(o.id, {
                              channels: e.target.checked
                                ? [...o.channels, c.id]
                                : o.channels.filter((id) => id !== c.id),
                            })
                          }
                        />
                        {c.name}
                      </label>
                    ))}
                  </fieldset>
                </details>
              </article>
            ))}
          </div>
          <button
            disabled={project.observations.length >= LIMITS.observations}
            onClick={() => {
              const id = nextId(
                "measurement",
                project.observations.map((o) => o.id),
              );
              edit({
                ...project,
                observations: [
                  ...project.observations,
                  {
                    id,
                    name: `Measurement ${project.observations.length + 1}`,
                    enabled: true,
                    cost: 1,
                    channels: project.channels.length
                      ? [project.channels[0].id]
                      : [],
                    source: "manual",
                    kind: "categorical",
                    values: {},
                  },
                ],
              });
            }}
          >
            + Add observation
          </button>
        </section>
        <section
          className={styles.section}
          aria-labelledby="requirements-heading"
        >
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.eyebrow}>02 / EXPECTATIONS</p>
              <h2 id="requirements-heading">
                What should change—and what should not?
              </h2>
            </div>
          </div>
          <p className={styles.help}>
            A channel is a named place where results can be seen. An internal
            measurement is not automatically a public output.
          </p>
          <div className={styles.channels}>
            {project.channels.map((c) => (
              <label key={c.id}>
                Channel {c.id}
                <div className={styles.row}>
                  <input
                    value={c.name}
                    aria-label={`Channel name ${c.id}`}
                    onChange={(e) =>
                      edit({
                        ...project,
                        channels: project.channels.map((x) =>
                          x.id === c.id ? { ...x, name: e.target.value } : x,
                        ),
                      })
                    }
                  />
                  <button
                    aria-label={`Remove channel ${c.id}`}
                    onClick={() =>
                      edit({
                        ...project,
                        channels: project.channels.filter((x) => x.id !== c.id),
                        observations: project.observations.map((o) => ({
                          ...o,
                          channels: o.channels.filter((id) => id !== c.id),
                        })),
                        requirements: project.requirements.filter(
                          (r) => r.channel !== c.id,
                        ),
                      })
                    }
                  >
                    ×
                  </button>
                </div>
              </label>
            ))}
            <button
              disabled={project.channels.length >= LIMITS.channels}
              onClick={() => {
                const id = nextId(
                  "channel",
                  project.channels.map((c) => c.id),
                );
                edit({
                  ...project,
                  channels: [
                    ...project.channels,
                    { id, name: `Channel ${project.channels.length + 1}` },
                  ],
                });
              }}
            >
              + Add channel
            </button>
          </div>
          {!project.requirements.length && (
            <p className={styles.empty}>
              No expectations yet. Add a pair of cases you want to compare.
            </p>
          )}
          {project.requirements.map((r) => (
            <div key={r.id} className={styles.requirement}>
              <code>{r.id}</code>
              <select
                aria-label={`Left case ${r.id}`}
                value={r.left}
                onChange={(e) =>
                  edit({
                    ...project,
                    requirements: project.requirements.map((x) =>
                      x.id === r.id ? { ...x, left: e.target.value } : x,
                    ),
                  })
                }
              >
                {project.cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select
                aria-label={`Expectation ${r.id}`}
                value={r.kind}
                onChange={(e) =>
                  edit({
                    ...project,
                    requirements: project.requirements.map((x) =>
                      x.id === r.id
                        ? { ...x, kind: e.target.value as "same" | "different" }
                        : x,
                    ),
                  })
                }
              >
                <option value="same">should look the same as</option>
                <option value="different">must be distinguishable from</option>
              </select>
              <select
                aria-label={`Right case ${r.id}`}
                value={r.right}
                onChange={(e) =>
                  edit({
                    ...project,
                    requirements: project.requirements.map((x) =>
                      x.id === r.id ? { ...x, right: e.target.value } : x,
                    ),
                  })
                }
              >
                {project.cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <span>on</span>
              <select
                aria-label={`Requirement channel ${r.id}`}
                value={r.channel}
                onChange={(e) =>
                  edit({
                    ...project,
                    requirements: project.requirements.map((x) =>
                      x.id === r.id ? { ...x, channel: e.target.value } : x,
                    ),
                  })
                }
              >
                {project.channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                aria-label={`Remove requirement ${r.id}`}
                onClick={() =>
                  edit({
                    ...project,
                    requirements: project.requirements.filter(
                      (x) => x.id !== r.id,
                    ),
                  })
                }
              >
                ×
              </button>
            </div>
          ))}
          <button
            disabled={
              !project.cases.length ||
              !project.channels.length ||
              project.requirements.length >= LIMITS.requirements
            }
            onClick={() => {
              const id = nextId(
                "r",
                project.requirements.map((r) => r.id),
              );
              edit({
                ...project,
                requirements: [
                  ...project.requirements,
                  {
                    id,
                    left: project.cases[0].id,
                    right:
                      project.cases[Math.min(1, project.cases.length - 1)].id,
                    channel: project.channels[0].id,
                    kind: "different",
                  },
                ],
              });
            }}
          >
            + Add expectation
          </button>
        </section>
        <section
          className={styles.section}
          aria-labelledby="results-heading"
          aria-busy={busy}
        >
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.eyebrow}>03 / EVIDENCE</p>
              <h2 id="results-heading">Analysis results</h2>
            </div>
            {analysis && (
              <span className={styles.badge}>
                {stale
                  ? "STALE · RERUN TO EXPORT"
                  : analysis.execution.mode === "model-analysis"
                    ? "MODEL ANALYSIS"
                    : "BUILT-IN ADAPTERS EXECUTED"}
              </span>
            )}
          </div>
          {!analysis ? (
            <div className={styles.empty}>
              Run analysis to see contradictions, usable observations, and
              concrete unresolved pairs.
            </div>
          ) : (
            <div className={stale ? styles.stale : ""}>
              <p className={styles.help}>
                {analysis.execution.adapterCalls} built-in observation calls
                executed. Exported tests are separate and have not been run by
                this page. Selection costs are independent per channel.
              </p>
              {analysis.adapterErrors.map((e, i) => (
                <p className={styles.error} key={i}>
                  {e.observation} / {e.caseId}: {e.message} This measurement is
                  unknown.
                </p>
              ))}
              {analysis.channels.map((c) => (
                <article key={c.channel} className={styles.resultChannel}>
                  <h3>
                    {
                      analysis.project.channels.find((x) => x.id === c.channel)
                        ?.name
                    }
                  </h3>
                  <div className={styles.metrics}>
                    <div>
                      <b>
                        {c.covered.length}
                        <span> / {c.covered.length + c.uncovered.length}</span>
                      </b>
                      <small>distinctions covered</small>
                    </div>
                    <div>
                      <b>{c.cost}</b>
                      <small>selected cost units</small>
                    </div>
                    <div>
                      <b>
                        {c.selection === "exact"
                          ? "Exact"
                          : c.selection === "heuristic"
                            ? "Heuristic"
                            : "Blocked"}
                      </b>
                      <small>
                        {c.selection === "exact"
                          ? "minimum cost for coverable pairs"
                          : c.selection === "heuristic"
                            ? "not proven optimal"
                            : "resolve the contradiction"}
                      </small>
                    </div>
                  </div>
                  <p>
                    <strong>Selected:</strong>{" "}
                    {c.selected
                      .map(
                        (id) =>
                          analysis.project.observations.find((o) => o.id === id)
                            ?.name,
                      )
                      .join(" + ") || "None"}
                  </p>
                  <p className={styles.help}>
                    Minimum cost does not mean all requirements are satisfied.
                    Selection uses only enabled observations verified to
                    preserve this channel’s equivalences.
                  </p>
                  {c.contradictions.map((x) => (
                    <div className={styles.error} key={x.requirement.id}>
                      <strong>Contradiction · {x.requirement.id}</strong>
                      <p>
                        {x.requirement.left} and {x.requirement.right} must
                        differ, but equivalence rules connect them:{" "}
                        {x.chain.join(" → ") || "the same case"}. No selection
                        is certified on this channel.
                      </p>
                    </div>
                  ))}
                  {c.uncovered.map((x) => (
                    <div className={styles.uncovered} key={x.requirement.id}>
                      <strong>
                        {x.requirement.left} ↔ {x.requirement.right} ·{" "}
                        {x.requirement.id}
                      </strong>
                      <p>{x.reason}</p>
                    </div>
                  ))}
                  <details
                    open={c.candidates.some((x) =>
                      x.status.includes("equivalence"),
                    )}
                  >
                    <summary>
                      Observation evidence & rejected disclosures
                    </summary>
                    <div className={styles.tableScroll}>
                      <table>
                        <thead>
                          <tr>
                            <th>Observation</th>
                            <th>Decision on this channel</th>
                            <th>Separates</th>
                            <th>Same recorded values</th>
                            <th>Missing evidence</th>
                          </tr>
                        </thead>
                        <tbody>
                          {c.candidates
                            .filter((x) => x.status !== "not-on-channel")
                            .map((x) => (
                              <tr key={x.id}>
                                <td>{x.id}</td>
                                <td>
                                  {statusLabel[x.status]}
                                  {x.violations.slice(0, 20).map((v, i) => (
                                    <p key={i}>
                                      {v.left}={display(v.leftValue)} ≠{" "}
                                      {v.right}={display(v.rightValue)}.
                                      Same-rule chain: {v.chain.join(" → ")}
                                    </p>
                                  ))}
                                  {x.violations.length > 20 && (
                                    <p>
                                      {x.violations.length - 20} more pairs in
                                      the bundle.
                                    </p>
                                  )}
                                  {x.unknownEquivalences
                                    .slice(0, 10)
                                    .map((v, i) => (
                                      <p key={i}>
                                        Unknown equivalence: {v.left} /{" "}
                                        {v.right}
                                      </p>
                                    ))}
                                </td>
                                <td>{x.separates.join(", ") || "—"}</td>
                                <td>{x.collisions.join(", ") || "—"}</td>
                                <td>{x.incomplete.join(", ") || "—"}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                  <details>
                    <summary>Decoder · vectors, ambiguity & unknowns</summary>
                    <p className={styles.help}>
                      Vector order: {c.selected.join(", ") || "(empty vector)"}.
                      An exact lookup covers supplied cases only; it does not
                      certify unseen states. ? entries are incomplete and may
                      add ambiguity.
                    </p>
                    <div className={styles.tableScroll}>
                      <table>
                        <thead>
                          <tr>
                            <th>Case</th>
                            <th>Selected vector</th>
                          </tr>
                        </thead>
                        <tbody>
                          {c.decoder.rows.map((row) => (
                            <tr key={row.caseId}>
                              <td>{row.caseId}</td>
                              <td>
                                <code>{JSON.stringify(row.values)}</code>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {c.collisions.map((x, i) => (
                      <p key={i}>
                        <strong>Ambiguous:</strong> {JSON.stringify(x.vector)} →{" "}
                        {x.caseIds.join(", ")}
                      </p>
                    ))}
                    {c.incompleteCases.length > 0 && (
                      <p>Incomplete rows: {c.incompleteCases.join(", ")}</p>
                    )}
                    <label>
                      Try a normalized JSON vector
                      <input
                        aria-label={`Decode vector ${c.channel}`}
                        value={decoderInput[c.channel] ?? ""}
                        placeholder="[true, false]"
                        onChange={(e) =>
                          setDecoderInput({
                            ...decoderInput,
                            [c.channel]: e.target.value,
                          })
                        }
                      />
                    </label>
                    <output className={styles.decoderOutput}>
                      {(() => {
                        if (!decoderInput[c.channel])
                          return "Enter a vector to inspect the lookup.";
                        try {
                          const vector: unknown = JSON.parse(
                            decoderInput[c.channel],
                          );
                          if (!Array.isArray(vector))
                            return "Use a JSON array.";
                          return JSON.stringify(
                            decode(c.decoder, vector as Normalized[]),
                          );
                        } catch {
                          return "Invalid JSON vector.";
                        }
                      })()}
                    </output>
                  </details>
                </article>
              ))}
              <div className={styles.toolbar}>
                <button
                  disabled={stale || busy}
                  onClick={() =>
                    download(
                      "nova-contrast-analysis-bundle.json",
                      JSON.stringify(makeBundle(analysis), null, 2),
                    )
                  }
                >
                  Export analysis bundle
                </button>
                <button
                  disabled={stale || busy}
                  onClick={() =>
                    download(
                      "nova-contrast-report.md",
                      readableReport(analysis),
                      "text/markdown",
                    )
                  }
                >
                  Download readable report
                </button>
                <button
                  disabled={stale || busy}
                  onClick={() =>
                    download(
                      "requirements.test.ts",
                      generateJest(makeTestSpec(analysis)),
                      "text/plain",
                    )
                  }
                >
                  Download executable tests
                </button>
              </div>
            </div>
          )}
        </section>
        <section className={styles.advanced}>
          <details>
            <summary>
              Save on this device, JSON import & computational limits
            </summary>
            <div className={styles.configGrid}>
              <div>
                <h3>Explicit device storage</h3>
                <p>
                  This browser storage is not an encrypted vault. Nothing is
                  saved automatically. Reloading the page opens the example;
                  saved work loads only when you choose.
                </p>
                <div className={styles.toolbar}>
                  <button onClick={save}>Save on this device</button>
                  <button
                    disabled={!deviceSaved}
                    onClick={() => {
                      try {
                        const text = localStorage.getItem(STORAGE_KEY);
                        if (text) importText(text);
                        else setNotice("No saved project found.");
                      } catch {
                        setError("Device storage is unavailable.");
                      }
                    }}
                  >
                    Load device save
                  </button>
                  <button
                    disabled={!deviceSaved}
                    onClick={() => {
                      try {
                        localStorage.removeItem(STORAGE_KEY);
                        setDeviceSaved(false);
                        setNotice(
                          "Device save deleted. The open project remains in memory.",
                        );
                      } catch {
                        setError("Could not delete device save.");
                      }
                    }}
                  >
                    Delete device save
                  </button>
                </div>
              </div>
              <div>
                <h3>Validated project JSON</h3>
                <textarea
                  aria-label="Project JSON import"
                  value={json}
                  onChange={(e) => setJson(e.target.value)}
                  placeholder="Paste a nova-contrast/1 project"
                  rows={7}
                  maxLength={LIMITS.bytes}
                />
                <button onClick={() => importText(json)}>
                  Import pasted JSON
                </button>
              </div>
            </div>
            <p>
              Limits: {LIMITS.cases} cases, {LIMITS.observations} observations,{" "}
              {LIMITS.channels} channels, {LIMITS.requirements} requirements, 1
              MB imports. Exact search uses at most {LIMITS.exactObservations}{" "}
              useful admissible observations and {LIMITS.exactPairs} coverable
              distinctions per channel. Larger selections use greedy
              new-coverage per cost, labeled heuristic. Zero-cost observations
              are considered first. Exact ties favor fewer observations, then
              the first subset in stable observation-ID order. Computation stops
              after 10 seconds and can be canceled.
            </p>
            <p>
              Numeric bins are explicit half-open intervals, not approximate
              equality. Channel equivalence is transitive; missing values cannot
              establish it. Decoder ambiguity is retained. No claims cover
              unmodeled states, future executions, physical safety, or
              commercial demand. Export bundles include all supplied channels
              and inputs, including private ones—review before sharing.
            </p>
          </details>
        </section>
        <footer className={styles.footer}>
          <span>Nova · A claim becomes something you can check.</span>
          <Link href="/">Return to Nova →</Link>
        </footer>
      </div>
    </main>
  );
}
