/* Loads only trusted repository TypeScript. Imported calculator specifications are parsed as JSON data. */
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );
};
const root = path.resolve(__dirname, "..");
const { instrumentEngine: engine } = require(
  path.join(root, "apps/web/src/lib/instrument/runtime.ts"),
);
const { exportStandalone } = require(
  path.join(root, "apps/web/src/lib/instrument/export.ts"),
);
const { instrumentGuide } = require(
  path.join(root, "apps/web/src/lib/instrument/guide.ts"),
);
function exportFile(input, output) {
  const stat = fs.statSync(input);
  if (stat.size > engine.limits.bytes) throw new Error("Input exceeds 200 KB.");
  const document = engine.parse(fs.readFileSync(input, "utf8"));
  if (fs.existsSync(output))
    throw new Error(
      "Output already exists; choose a new filename to preserve it.",
    );
  fs.writeFileSync(output, exportStandalone(document), { flag: "wx" });
  const result = engine.calculate(document.spec, document.values);
  console.log(JSON.stringify({ output, calculation: result }, null, 2));
}
if (process.argv[2] && process.argv[3]) {
  exportFile(path.resolve(process.argv[2]), path.resolve(process.argv[3]));
} else if (process.argv.length === 2) {
  const out = path.join(root, "examples/instrument-forge");
  fs.mkdirSync(out, { recursive: true });
  for (const name of ["capacity", "workshop"]) {
    const source = path.join(
      root,
      "apps/web/src/lib/instrument/examples",
      name + ".json",
    );
    const doc = engine.parse(fs.readFileSync(source, "utf8"));
    fs.writeFileSync(
      path.join(out, name + ".spec.json"),
      JSON.stringify(doc.spec, null, 2),
    );
    fs.writeFileSync(path.join(out, name + ".html"), exportStandalone(doc));
    fs.writeFileSync(
      path.join(out, name + ".result.json"),
      JSON.stringify(engine.calculate(doc.spec, doc.values), null, 2),
    );
  }
  const bad = engine.document(
    JSON.parse(fs.readFileSync(path.join(out, "workshop.spec.json"), "utf8")),
  );
  bad.values.price = bad.values.variableCost;
  fs.writeFileSync(
    path.join(out, "no-break-even.instrument.json"),
    JSON.stringify(bad, null, 2),
  );
  fs.writeFileSync(path.join(out, "no-break-even.html"), exportStandalone(bad));
  fs.writeFileSync(path.join(out, "instrument-spec-guide.md"), instrumentGuide);
  console.log(
    "Generated two standalone calculators, specifications, actual calculation outputs, and an editable failure example.",
  );
} else {
  console.error(
    "Usage: node scripts/instrument-export.cjs [input.spec.json new-output.html]",
  );
  process.exitCode = 1;
}
