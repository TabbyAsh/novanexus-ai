/* Trusted repository utility. Only our TypeScript modules are loaded; project data is never evaluated. */
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  module._compile(
    ts.transpileModule(source, {
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
const core = path.join(root, "apps/web/src/lib/contrast");
const { compileProject } = require(path.join(core, "compiler.ts"));
const { exportProject } = require(path.join(core, "schema.ts"));
const { makeBundle, generateJest, makeTestSpec, readableReport } = require(
  path.join(core, "bundle.ts"),
);
const examples = require(path.join(core, "examples.ts"));
const output = path.join(root, "examples/contrast");
fs.mkdirSync(output, { recursive: true });
const passing = examples.sequenceProject();
passing.observations.forEach((o) => (o.enabled = true));
passing.requirements = passing.requirements.filter((r) => r.id !== "r4");
const partial = examples.sequenceProject();
partial.observations.forEach((o) => (o.enabled = true));
const projects = {
  sequence: passing,
  "sequence-collision": partial,
  "sequence-incomplete": examples.sequenceProject(),
  channels: examples.channelProject(),
  contradiction: examples.contradictionProject(),
  "nova-serializer": examples.serializerProject(),
};
for (const [name, project] of Object.entries(projects)) {
  const analysis = compileProject(project);
  fs.writeFileSync(
    path.join(output, `${name}.project.json`),
    exportProject(project),
  );
  fs.writeFileSync(
    path.join(output, `${name}.bundle.json`),
    JSON.stringify(makeBundle(analysis), null, 2),
  );
  fs.writeFileSync(
    path.join(output, `${name}.decoder.cjs`),
    makeBundle(analysis).files["decoder.cjs"],
  );
  fs.writeFileSync(
    path.join(output, `${name}.report.md`),
    readableReport(analysis),
  );
  fs.writeFileSync(
    path.join(output, `${name}.test.ts.txt`),
    generateJest(makeTestSpec(analysis)),
  );
}
for (const name of ["sequence", "nova-serializer"])
  fs.copyFileSync(
    path.join(output, `${name}.test.ts.txt`),
    path.join(core, "__tests__", `exported-${name}.test.ts`),
  );
if (process.argv.includes("--mutation")) {
  const original = fs.readFileSync(
    path.join(output, "sequence.test.ts.txt"),
    "utf8",
  );
  const mutation = `\njest.mock('../adapters', () => {\n const actual = jest.requireActual('../adapters');\n return { ...actual, observe: (adapter: any, input: string, operation: string) => operation === 'a-before-b' ? false : actual.observe(adapter, input, operation) };\n});\n`;
  fs.writeFileSync(
    path.join(core, "__tests__/exported-mutation.test.ts"),
    original + mutation,
  );
}
console.log(
  `Wrote six project/report/bundle/test sets to ${output}. Exported tests have not yet been executed.`,
);
