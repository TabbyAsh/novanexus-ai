import { instrumentEngine as e } from "../runtime";
import { exportStandalone } from "../export";
import capacity from "../examples/capacity.json";
import workshop from "../examples/workshop.json";
import type { Expression, InstrumentSpec } from "../types";
const fresh = (kind = "capacity") =>
  e.validate(
    JSON.parse(JSON.stringify(kind === "capacity" ? capacity : workshop)),
  );
const run = (spec: InstrumentSpec, overrides: Record<string, unknown> = {}) =>
  e.calculate(spec, Object.assign(e.defaults(spec), overrides));

describe("Instrument Forge: independently specified calculations", () => {
  test("6, 4 and 5 units/hour yield 4/hour, 32 in eight hours, shortfall 4", () => {
    const result = run(fresh());
    expect(result.ok).toBe(true);
    expect(result.values).toEqual({
      bottleneck: 4,
      shiftOutput: 32,
      shortfall: 4,
    });
    expect(result.warnings).toHaveLength(1);
  });
  test("improving the slow stage changes the bottleneck; improving another does not", () => {
    expect(run(fresh(), { prepare: 100 }).values.bottleneck).toBe(4);
    expect(run(fresh(), { assemble: 6 }).values).toEqual({
      bottleneck: 5,
      shiftOutput: 40,
      shortfall: 0,
    });
    expect(run(fresh(), { assemble: 6 }).warnings).toEqual([]);
  });
  test("stopping one stage gives zero capacity; partial items round down", () => {
    expect(run(fresh(), { pack: 0 }).values).toEqual({
      bottleneck: 0,
      shiftOutput: 0,
      shortfall: 36,
    });
    expect(run(fresh(), { shift: 1.2 }).values.shiftOutput).toBe(4);
  });
  test("decimal capacity cannot lose one whole unit to binary rounding", () => {
    expect(
      run(fresh(), { prepare: 20, assemble: 20, pack: 20, shift: 1.15 }).values
        .shiftOutput,
    ).toBe(23);
    expect(
      run(fresh("workshop"), { price: 0.3, variableCost: 0.2, fixedCost: 300 })
        .values.breakEven,
    ).toBe(3000);
  });
  test("the second imported spec computes a different model with forward references", () => {
    const doc = e.parse(JSON.stringify(workshop));
    expect(e.calculate(doc.spec, doc.values).values).toEqual({
      remaining: 300,
      breakEven: 20,
      revenue: 1000,
      totalCost: 700,
    });
    expect(run(doc.spec, { attendees: 10 }).values.remaining).toBe(-150);
    expect(run(doc.spec, { fixedCost: 301 }).values.breakEven).toBe(21);
  });
  test("an impossible break-even assumption gives a useful error, not Infinity", () => {
    const result = run(fresh("workshop"), { price: 10 });
    expect(result.ok).toBe(false);
    expect(result.values).toEqual({});
    expect(result.errors[0]).toMatch(/Ticket price must exceed/);
  });
  test.each([
    "",
    " ",
    "abc",
    "1e",
    "1e-400",
    "0x10",
    "Infinity",
    NaN,
    Infinity,
    null,
    undefined,
  ])("missing or invalid input %p does not become zero", (value) => {
    const result = run(fresh(), { prepare: value });
    expect(result.ok).toBe(false);
    expect(result.values).toEqual({});
  });
  test("range and integer requirements are enforced", () => {
    expect(run(fresh(), { prepare: -1 }).errors[0]).toMatch(/from 0/);
    expect(run(fresh(), { target: 2.5 }).errors[0]).toMatch(/whole number/);
    expect(run(fresh(), { shift: 25 }).ok).toBe(false);
    expect(run(fresh(), { prepare: "6e0" }).ok).toBe(true);
  });
});

describe("unit-aware bounded expression evaluation", () => {
  test("minutes and hours convert before multiplication", () => {
    const spec = fresh();
    spec.inputs.find((i) => i.id === "shift")!.unit = "min";
    spec.inputs.find((i) => i.id === "shift")!.max = 1440;
    expect(run(spec, { shift: 480 }).values.shiftOutput).toBe(32);
  });
  test("rates in units/minute convert for comparison and chart display", () => {
    const spec = fresh();
    spec.inputs[0].unit = "item/min";
    const result = run(spec, { prepare: 0.05 });
    expect(result.values.bottleneck).toBe(3);
    expect(e.chartValues(spec, result)[0].value).toBe(3);
  });
  test("adding a time to a capacity and falsely labeling a result are rejected", () => {
    const spec = fresh();
    spec.outputs[0].expression = {
      op: "add",
      args: [{ ref: "shift" }, { ref: "prepare" }],
    };
    expect(() => e.validate(spec)).toThrow(/Incompatible units/);
    const badOutput = fresh();
    badOutput.outputs[0].unit = "USD";
    expect(() => e.validate(badOutput)).toThrow(/do not match/);
  });
  test("unsupported units, comparisons and dimensioned rounding are rejected", () => {
    const spec = fresh();
    (spec.inputs[0] as unknown as { unit: string }).unit = "mph";
    expect(() => e.validate(spec)).toThrow(/Unsupported unit/);
    const comparison = fresh();
    comparison.constraints[0].right = { ref: "shift" };
    expect(() => e.validate(comparison)).toThrow(/incompatible units/);
    const rounded = fresh();
    rounded.outputs[0].expression = { op: "floor", args: [{ ref: "prepare" }] };
    expect(() => e.validate(rounded)).toThrow(/Rounding is supported only/);
  });
  test("division by zero and overflow clear the entire output set", () => {
    const zero = fresh();
    zero.outputs[0].expression = {
      op: "divide",
      args: [{ ref: "prepare" }, { value: 0, unit: "1" }],
    };
    expect(run(zero).errors[0]).toMatch(/divide by zero/);
    expect(run(zero).values).toEqual({});
    const huge = fresh();
    huge.outputs[0].expression = {
      op: "multiply",
      args: [
        { ref: "prepare" },
        { value: 1e9, unit: "1" },
        { value: 1e9, unit: "1" },
      ],
    };
    expect(run(huge).errors[0]).toMatch(/magnitude/);
  });
  test("all arithmetic operations and comparison kinds have explicit behavior", () => {
    const spec = fresh();
    spec.outputs[0].expression = {
      op: "abs",
      args: [
        { op: "subtract", args: [{ ref: "assemble" }, { ref: "prepare" }] },
      ],
    };
    expect(run(spec).values.bottleneck).toBe(2);
    for (const operator of ["lt", "lte", "gt", "gte", "eq"] as const) {
      spec.constraints = [
        {
          id: "check",
          left: { ref: "prepare" },
          operator,
          right: { ref: "prepare" },
          message: "check failed",
          severity: "error",
        },
      ];
      expect(run(spec).ok).toBe(["lte", "gte", "eq"].includes(operator));
    }
  });
  test("rounding negative counts and decimal equality use exact fractions", () => {
    const spec = fresh();
    spec.outputs[1].expression = {
      op: "floor",
      args: [{ value: -1.2, unit: "item" }],
    };
    expect(run(spec).values.shiftOutput).toBe(-2);
    spec.outputs[1].expression = {
      op: "ceil",
      args: [{ value: -1.2, unit: "item" }],
    };
    expect(run(spec).values.shiftOutput).toBe(-1);
    spec.constraints = [
      {
        id: "decimalEquality",
        left: {
          op: "add",
          args: [
            { value: 0.1, unit: "1" },
            { value: 0.2, unit: "1" },
          ],
        },
        operator: "eq",
        right: { value: 0.3, unit: "1" },
        message: "Decimal equality failed",
        severity: "error",
      },
    ];
    expect(run(spec).ok).toBe(true);
  });
  test("output-based blocking constraints clear otherwise calculated values", () => {
    const spec = fresh();
    spec.constraints[0].severity = "error";
    expect(run(spec).ok).toBe(false);
    expect(run(spec).values).toEqual({});
  });
});

describe("import boundary, identity and reusable export", () => {
  test("unknown versions, arbitrary prose, code and extra fields fail closed", () => {
    expect(() => e.parse("make a calculator")).toThrow(/Invalid JSON/);
    expect(() => e.parse('{"schemaVersion":"future"}')).toThrow(
      /schemaVersion/,
    );
    expect(() =>
      e.validate(Object.assign(fresh(), { script: "alert(1)" })),
    ).toThrow(/Unsupported field/);
    const spec = fresh();
    spec.outputs[0].expression = "Math.min(6,4,5)" as unknown as Expression;
    expect(() => e.validate(spec)).toThrow(/Expected an object/);
    spec.outputs[0].expression = {
      op: "eval",
      args: [],
    } as unknown as Expression;
    expect(() => e.validate(spec)).toThrow(/Unsupported operation/);
  });
  test("duplicate IDs, unsafe IDs, missing references and cycles are rejected", () => {
    const duplicate = fresh();
    duplicate.outputs[0].id = duplicate.inputs[0].id;
    expect(() => e.validate(duplicate)).toThrow(/Duplicate/);
    const unsafe = fresh();
    unsafe.inputs[0].id = "constructor";
    expect(() => e.validate(unsafe)).toThrow(/safe ID/);
    const missing = fresh();
    missing.outputs[0].expression = { ref: "doesNotExist" };
    expect(() => e.validate(missing)).toThrow(/Unknown reference/);
    const cycle = fresh();
    cycle.outputs[0].expression = { ref: "bottleneck" };
    expect(() => e.validate(cycle)).toThrow(/Circular formula/);
  });
  test("bad arity, excess depth, oversized arrays and byte limits reject early", () => {
    const spec = fresh();
    spec.outputs[0].expression = { op: "min", args: [] };
    expect(() => e.validate(spec)).toThrow(/2–16/);
    let expr: Expression = { ref: "prepare" };
    for (let i = 0; i < 18; i++) expr = { op: "abs", args: [expr] };
    spec.outputs[0].expression = expr;
    expect(() => e.validate(spec)).toThrow(/Expression limit/);
    const large = fresh();
    large.inputs = Array(25).fill(large.inputs[0]);
    expect(() => e.validate(large)).toThrow(/1–24/);
    expect(() => e.parse(" ".repeat(200001))).toThrow(/200 KB/);
    expect(() => e.parse("é".repeat(100001))).toThrow(/200 KB/);
    let wide: Expression = { ref: "prepare" };
    for (let i = 0; i < 3; i++)
      wide = { op: "min", args: Array(16).fill(wide) };
    spec.outputs[0].expression = wide;
    expect(() => e.validate(spec)).toThrow(/Expression limit/);
    expect(run(fresh(), { prepare: 1e-250 }).errors[0]).toMatch(/240-digit/);
  });
  test("saved documents retain current numbers; unknown or incomplete saved values fail", () => {
    const spec = fresh(),
      values = Object.assign(e.defaults(spec), { assemble: 6 });
    const doc = e.parse(
      JSON.stringify({
        documentVersion: "nova-instrument-document/1",
        spec,
        values,
      }),
    );
    expect(e.calculate(doc.spec, doc.values).values.bottleneck).toBe(5);
    expect(() =>
      e.document({ documentVersion: "future", spec, values }),
    ).toThrow(/Expected InstrumentSpec/);
    delete (values as Record<string, unknown>).prepare;
    expect(() =>
      e.document({
        documentVersion: "nova-instrument-document/1",
        spec,
        values,
      }),
    ).toThrow(/finite number/);
  });
  test("export encodes hostile text as data and has no remote dependencies or eval", () => {
    const spec = fresh();
    spec.title = '</script><img src=x onerror="alert(1)">';
    const html = exportStandalone(spec);
    expect(html).not.toContain('<img src=x onerror="alert(1)">');
    expect(html).toContain("\\u003c/script\\u003e");
    expect(html).not.toMatch(/<script[^>]+src=|\beval\s*\(|new Function\s*\(/);
    expect(html).toContain("connect-src 'none'");
  });
});
