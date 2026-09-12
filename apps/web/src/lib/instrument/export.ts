import { createInstrumentEngine, instrumentEngine } from "./runtime";
import type { InstrumentDocument } from "./types";

/** Only trusted renderer code is serialized. Imported data enters text nodes and form values. */
function mountStandalone(
  project: InstrumentDocument,
  engine: ReturnType<typeof createInstrumentEngine>,
) {
  const root = document.getElementById("app")!;
  const data = engine.document(project),
    spec = data.spec;
  let values: Record<string, unknown> = Object.assign({}, data.values);
  function el(tag: string, text?: string, className?: string) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function download(filename: string, text: string) {
    const url = URL.createObjectURL(
      new Blob([text], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  root.append(el("p", "NOVA INSTRUMENT FORGE · OFFLINE FILE", "eyebrow"));
  root.append(el("h1", spec.title), el("p", spec.description, "lead"));
  root.append(
    el(
      "p",
      "This file computes on this device. No account, network connection or Nova server is needed.",
      "local",
    ),
  );
  const grid = el("div", undefined, "grid"),
    controls = el("section"),
    results = el("section");
  controls.append(el("h2", "Change the inputs"));
  const inputs: Record<string, HTMLInputElement> = {};
  spec.inputs.forEach((input) => {
    const label = document.createElement("label");
    label.htmlFor = "input-" + input.id;
    label.textContent =
      input.label +
      (engine.units[input.unit].label
        ? " · " + engine.units[input.unit].label
        : "");
    const field = document.createElement("input");
    field.type = "number";
    field.id = label.htmlFor;
    field.value = String(values[input.id]);
    field.min = String(input.min);
    field.max = String(input.max);
    field.step = String(input.step);
    field.setAttribute("aria-describedby", "help-" + input.id);
    const help = el("p", input.help, "help");
    help.id = "help-" + input.id;
    field.addEventListener("input", () => {
      values[input.id] = field.value;
      render();
    });
    inputs[input.id] = field;
    controls.append(label, field, help);
  });
  const reset = document.createElement("button");
  reset.textContent = "Reset defaults";
  reset.addEventListener("click", () => {
    values = engine.defaults(spec);
    spec.inputs.forEach((i) => {
      inputs[i.id].value = String(values[i.id]);
    });
    render();
  });
  const save = document.createElement("button");
  save.textContent = "Export JSON";
  save.addEventListener("click", () => {
    const calculation = engine.calculate(spec, values);
    if (calculation.ok)
      download(
        spec.id + ".instrument.json",
        JSON.stringify(
          {
            documentVersion: "nova-instrument-document/1",
            spec,
            values: calculation.inputs,
          },
          null,
          2,
        ),
      );
  });
  const toolbar = el("div", undefined, "toolbar");
  toolbar.append(reset, save);
  controls.append(toolbar);
  const status = el("div");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const outputList = el("div");
  results.append(status, outputList);
  grid.append(controls, results);
  root.append(grid);
  const assumptions = el("section", undefined, "assumptions");
  assumptions.append(el("h2", "What this assumes"));
  const assumptionList = el("ul");
  spec.assumptions.forEach((a) => assumptionList.append(el("li", a)));
  assumptions.append(assumptionList);
  root.append(assumptions);
  const formulas = document.createElement("details");
  formulas.append(el("summary", "Inspect the formulas"));
  spec.outputs.forEach((o) => {
    formulas.append(
      el("h3", o.label),
      el("p", engine.describe(o.expression, spec)),
      el("p", o.help, "help"),
    );
  });
  spec.constraints.forEach((c) => {
    formulas.append(
      el(
        "p",
        c.severity +
          ": " +
          engine.describe(c.left, spec) +
          " " +
          c.operator +
          " " +
          engine.describe(c.right, spec) +
          " — " +
          c.message,
      ),
    );
  });
  root.append(
    formulas,
    el(
      "p",
      "Finite arithmetic model · display values are rounded; formulas use exact fractions of the accepted decimal numbers. No hidden AI or uploaded code execution.",
      "help",
    ),
  );
  function render() {
    const calculation = engine.calculate(spec, values);
    status.replaceChildren();
    outputList.replaceChildren();
    save.disabled = !calculation.ok;
    calculation.errors.forEach((message) =>
      status.append(el("p", message, "error")),
    );
    calculation.warnings.forEach((message) =>
      status.append(el("p", message, "warning")),
    );
    spec.outputs.forEach((output, index) => {
      const card = el(
        "article",
        undefined,
        index === 0 ? "result primary" : "result",
      );
      card.append(el("h2", output.label));
      const value = el(
        "div",
        calculation.ok
          ? engine.format(calculation.values[output.id], output.precision)
          : "—",
        "value",
      );
      value.setAttribute("data-output", output.id);
      card.append(
        value,
        el("p", engine.units[output.unit].label, "unit"),
        el("p", output.help, "help"),
      );
      outputList.append(card);
    });
    if (spec.chart && calculation.ok) {
      const chart = el("div", undefined, "chart");
      chart.append(el("h3", spec.chart.title));
      const series = engine.chartValues(spec, calculation),
        max = Math.max.apply(
          null,
          series.map((s) => Math.abs(s.value)).concat(1),
        ),
        signed = series.some((s) => s.value < 0);
      series.forEach((s) => {
        const row = el("div", undefined, "bar-row");
        row.append(
          el("span", s.label),
          el(
            "strong",
            engine.format(s.value, 2) +
              " " +
              engine.units[spec.chart!.unit].label,
          ),
        );
        const track = el("div", undefined, "track"),
          bar = el("div", undefined, s.value < 0 ? "bar negative" : "bar");
        bar.style.width = (Math.abs(s.value) / max) * (signed ? 50 : 100) + "%";
        bar.style.left = signed
          ? s.value < 0
            ? 50 - (Math.abs(s.value) / max) * 50 + "%"
            : "50%"
          : "0";
        if (!signed) track.style.background = "#e1e6d9";
        track.setAttribute("aria-hidden", "true");
        track.append(bar);
        row.append(track);
        chart.append(row);
      });
      outputList.append(chart);
    }
  }
  render();
}

const offlineStyles = `:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#f2f0e9;color:#141713;font:16px/1.5 system-ui,sans-serif}main{max-width:1120px;margin:auto;padding:40px 24px}h1{font-size:clamp(30px,5vw,52px);line-height:1.06;letter-spacing:-.04em;max-width:800px}h2{font-size:19px}h3{font-size:16px}.eyebrow{font-size:11px;font-weight:800;letter-spacing:.17em}.lead{font-size:18px;max-width:760px}.local,.warning{padding:12px 16px;background:#e7eddc}.grid{display:grid;grid-template-columns:1fr 1.1fr;gap:40px;margin:32px 0}.help{font-size:13px;color:#58614f;line-height:1.6}label{display:block;font-weight:650;margin-top:18px}input{width:100%;padding:12px;margin-top:5px;border:1px solid #929a87;background:#fffef8;font:inherit;font-size:23px;color:inherit}button{min-height:42px;border:1px solid #526148;background:transparent;padding:10px 16px;color:inherit;font:inherit;cursor:pointer}button:disabled{opacity:.45;cursor:not-allowed}.toolbar{display:flex;gap:8px;flex-wrap:wrap;margin-top:25px}.result{border:1px solid #bdc4b3;background:#fffdf7;padding:18px 22px;margin:12px 0}.result h2{margin:0;font-size:15px}.primary{background:#19271b;color:#f2f0e9}.primary .help{color:#c4d4ba}.primary .value{color:#b9ef9a}.value{font-size:36px;font-weight:850;letter-spacing:-.03em}.primary .value{font-size:62px}.unit{margin:0}.error{padding:14px;border-left:4px solid #923c25;background:#f6e3db;color:#752d1b}.warning{border-left:4px solid #997d34}.chart{margin:25px 0}.bar-row{display:grid;grid-template-columns:1fr auto;gap:5px;margin:14px 0;font-size:13px}.track{position:relative;grid-column:1/-1;height:12px;background:linear-gradient(90deg,#e1e6d9 49.8%,#7c8673 49.8%,#7c8673 50.2%,#e1e6d9 50.2%)}.bar{position:absolute;height:100%;background:#417047}.negative{background:#a65336}.assumptions,details{border-top:1px solid #929a87;margin-top:30px;padding-top:15px}li{margin:8px 0}summary{cursor:pointer;font-weight:700}button:hover{background:#dce7cf}:is(input,button,summary):focus-visible{outline:3px solid #467e52;outline-offset:3px}@media(max-width:650px){.grid{grid-template-columns:1fr;gap:20px}main{padding:25px 18px}.value{overflow-wrap:anywhere}}`;

export function exportStandalone(raw: unknown): string {
  const project = instrumentEngine.document(raw);
  const escape = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const data = JSON.stringify(project)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><title>${escape(project.spec.title)}</title><style>${offlineStyles}</style></head><body><main id="app"></main><noscript>This calculator needs JavaScript enabled; it does not need a network connection.</noscript><script id="instrument-data" type="application/json">${data}</script><script>"use strict";const engine=(${createInstrumentEngine.toString()})();(${mountStandalone.toString()})(JSON.parse(document.getElementById("instrument-data").textContent),engine);</script></body></html>`;
}
