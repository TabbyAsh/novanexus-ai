import type {
  Calculation,
  Constraint,
  Expression,
  InstrumentDocument,
  InstrumentInput,
  InstrumentOutput,
  InstrumentSpec,
  Operation,
  Unit,
} from "./types";

/** Self-contained trusted runtime, also embedded in offline exports. Keep runtime dependencies inside this factory. */
export function createInstrumentEngine() {
  type Dimension = [number, number, number]; // items, hours, USD
  const units: Record<
    Unit,
    { label: string; dimension: Dimension; scale: number }
  > = {
    "1": { label: "", dimension: [0, 0, 0], scale: 1 },
    item: { label: "units", dimension: [1, 0, 0], scale: 1 },
    h: { label: "hours", dimension: [0, 1, 0], scale: 1 },
    min: { label: "minutes", dimension: [0, 1, 0], scale: 1 / 60 },
    "item/h": { label: "units / hour", dimension: [1, -1, 0], scale: 1 },
    "item/min": { label: "units / minute", dimension: [1, -1, 0], scale: 60 },
    USD: { label: "USD", dimension: [0, 0, 1], scale: 1 },
    "USD/item": { label: "USD / unit", dimension: [-1, 0, 1], scale: 1 },
    "USD/h": { label: "USD / hour", dimension: [0, -1, 1], scale: 1 },
  };
  const limits = {
    bytes: 200000,
    inputs: 24,
    outputs: 24,
    constraints: 24,
    nodes: 1000,
    depth: 16,
  };
  const own = (o: object, key: string) =>
    Object.prototype.hasOwnProperty.call(o, key);
  const fail = (where: string, message: string): never => {
    throw new Error(where + ": " + message);
  };
  function object(v: unknown, where: string): Record<string, unknown> {
    if (!v || typeof v !== "object" || Array.isArray(v))
      return fail(where, "Expected an object.");
    return v as Record<string, unknown>;
  }
  function keys(v: Record<string, unknown>, allowed: string[], where: string) {
    Object.keys(v).forEach((key) => {
      if (!allowed.includes(key)) fail(where, "Unsupported field " + key + ".");
    });
  }
  function text(v: unknown, where: string, max = 160): string {
    if (typeof v !== "string" || !v.trim() || v.length > max)
      return fail(where, "Use nonempty text up to " + max + " characters.");
    return v;
  }
  function id(v: unknown, where: string): string {
    const s = text(v, where, 64);
    if (
      !/^[A-Za-z][A-Za-z0-9_-]*$/.test(s) ||
      ["constructor", "prototype", "__proto__"].includes(s)
    )
      return fail(where, "Use a safe ID starting with a letter.");
    return s;
  }
  function number(v: unknown, where: string): number {
    if (typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > 1e9)
      return fail(
        where,
        "Use a finite number between -1 billion and 1 billion.",
      );
    return v;
  }
  function unit(v: unknown, where: string): Unit {
    if (typeof v !== "string" || !own(units, v))
      return fail(
        where,
        "Unsupported unit. Supported: " + Object.keys(units).join(", ") + ".",
      );
    return v as Unit;
  }
  function list(
    v: unknown,
    where: string,
    min: number,
    max: number,
  ): unknown[] {
    if (!Array.isArray(v) || v.length < min || v.length > max)
      return fail(where, "Expected " + min + "–" + max + " entries.");
    return v;
  }
  const sameDimension = (a: Dimension, b: Dimension) =>
    a.every((n, i) => n === b[i]);
  type Fraction = { n: bigint; d: bigint };
  const zero = BigInt(0),
    one = BigInt(1),
    ten = BigInt(10);
  const absInteger = (v: bigint) => (v < zero ? -v : v);
  function fraction(n: bigint, d: bigint = one): Fraction {
    if (d === zero)
      return fail("Formula", "Cannot divide by zero. Change the inputs.");
    if (d < zero) {
      n = -n;
      d = -d;
    }
    let a = absInteger(n),
      b = d;
    while (b !== zero) {
      const remainder = a % b;
      a = b;
      b = remainder;
    }
    n /= a;
    d /= a;
    if (absInteger(n) > d * BigInt(1e15))
      return fail(
        "Formula",
        "Result exceeds the supported finite magnitude of 10^15.",
      );
    if (absInteger(n).toString().length > 240 || d.toString().length > 240)
      return fail(
        "Formula",
        "Exact arithmetic exceeds its 240-digit precision limit.",
      );
    return { n, d };
  }
  function decimal(value: number): Fraction {
    const pieces = value.toString().toLowerCase().split("e"),
      decimalPlaces = (pieces[0].split(".")[1] || "").length;
    const exponent = Number(pieces[1] || 0) - decimalPlaces;
    let power = one;
    for (let i = 0; i < Math.abs(exponent); i++) power *= ten;
    const n = BigInt(pieces[0].replace(".", ""));
    return exponent >= 0 ? fraction(n * power) : fraction(n, power);
  }
  function convert(value: Fraction, unit: Unit, reverse = false): Fraction {
    if (unit === "min")
      return reverse
        ? fraction(value.n * BigInt(60), value.d)
        : fraction(value.n, value.d * BigInt(60));
    if (unit === "item/min")
      return reverse
        ? fraction(value.n, value.d * BigInt(60))
        : fraction(value.n * BigInt(60), value.d);
    return value;
  }
  function compare(a: Fraction, b: Fraction) {
    const difference = a.n * b.d - b.n * a.d;
    return difference < zero ? -1 : difference > zero ? 1 : 0;
  }
  function checkInput(input: InstrumentInput, value: unknown): number {
    const n = number(value, input.label);
    if (n < input.min || n > input.max)
      return fail(
        input.label,
        "Enter a value from " + input.min + " to " + input.max + ".",
      );
    if (input.type === "integer" && !Number.isInteger(n))
      return fail(input.label, "Enter a whole number.");
    return n;
  }
  function validate(raw: unknown): InstrumentSpec {
    const p = object(raw, "Instrument");
    keys(
      p,
      [
        "schemaVersion",
        "id",
        "title",
        "description",
        "assumptions",
        "inputs",
        "outputs",
        "constraints",
        "chart",
      ],
      "Instrument",
    );
    if (p.schemaVersion !== "nova-instrument/1")
      fail(
        "Instrument",
        "Unsupported schemaVersion. Expected nova-instrument/1.",
      );
    let nodes = 0;
    function expression(
      rawExpr: unknown,
      where: string,
      depth = 0,
    ): Expression {
      if (++nodes > limits.nodes || depth > limits.depth)
        return fail(where, "Expression limit exceeded (1000 nodes, depth 16).");
      const e = object(rawExpr, where);
      if (own(e, "ref")) {
        keys(e, ["ref"], where);
        return { ref: id(e.ref, where) };
      }
      if (own(e, "value")) {
        keys(e, ["value", "unit"], where);
        return { value: number(e.value, where), unit: unit(e.unit, where) };
      }
      keys(e, ["op", "args"], where);
      if (
        typeof e.op !== "string" ||
        ![
          "add",
          "subtract",
          "multiply",
          "divide",
          "min",
          "max",
          "abs",
          "ceil",
          "floor",
        ].includes(e.op)
      )
        return fail(
          where,
          "Unsupported operation. Formulas must use the restricted expression tree, never JavaScript or prose.",
        );
      const unary = ["abs", "ceil", "floor"].includes(e.op);
      const binary = ["subtract", "divide"].includes(e.op);
      return {
        op: e.op as Operation,
        args: list(
          e.args,
          where,
          unary ? 1 : 2,
          unary ? 1 : binary ? 2 : 16,
        ).map((x, i) => expression(x, where + ".args[" + i + "]", depth + 1)),
      };
    }
    const inputs = list(p.inputs, "inputs", 1, limits.inputs).map(
      (rawInput, i): InstrumentInput => {
        const where = "inputs[" + i + "]",
          a = object(rawInput, where);
        keys(
          a,
          [
            "id",
            "label",
            "type",
            "unit",
            "default",
            "min",
            "max",
            "step",
            "help",
          ],
          where,
        );
        if (a.type !== "number" && a.type !== "integer")
          fail(where, "Input type must be number or integer.");
        const result: InstrumentInput = {
          id: id(a.id, where),
          label: text(a.label, where),
          type: a.type as InstrumentInput["type"],
          unit: unit(a.unit, where),
          default: number(a.default, where),
          min: number(a.min, where),
          max: number(a.max, where),
          step: number(a.step, where),
          help: text(a.help, where, 240),
        };
        if (result.min > result.max || result.step <= 0)
          fail(
            where,
            "Minimum must not exceed maximum; step must be positive.",
          );
        if (
          result.type === "integer" &&
          (!Number.isInteger(result.min) ||
            !Number.isInteger(result.max) ||
            !Number.isInteger(result.step))
        )
          fail(where, "Integer input bounds and step must be whole numbers.");
        checkInput(result, result.default);
        return result;
      },
    );
    const outputs = list(p.outputs, "outputs", 1, limits.outputs).map(
      (rawOutput, i): InstrumentOutput => {
        const where = "outputs[" + i + "]",
          a = object(rawOutput, where);
        keys(
          a,
          ["id", "label", "unit", "expression", "precision", "help"],
          where,
        );
        const precision = number(a.precision, where);
        if (!Number.isInteger(precision) || precision < 0 || precision > 6)
          fail(where, "Output precision must be an integer from 0 to 6.");
        return {
          id: id(a.id, where),
          label: text(a.label, where),
          unit: unit(a.unit, where),
          expression: expression(a.expression, where + ".expression"),
          precision,
          help: text(a.help, where, 240),
        };
      },
    );
    const constraints = list(
      p.constraints,
      "constraints",
      0,
      limits.constraints,
    ).map((rawConstraint, i): Constraint => {
      const where = "constraints[" + i + "]",
        c = object(rawConstraint, where);
      keys(
        c,
        ["id", "left", "operator", "right", "message", "severity"],
        where,
      );
      if (
        typeof c.operator !== "string" ||
        !["lt", "lte", "gt", "gte", "eq"].includes(c.operator)
      )
        fail(where, "Unsupported comparison.");
      if (c.severity !== "error" && c.severity !== "warning")
        fail(where, "Severity must be error or warning.");
      return {
        id: id(c.id, where),
        left: expression(c.left, where + ".left"),
        operator: c.operator as Constraint["operator"],
        right: expression(c.right, where + ".right"),
        message: text(c.message, where, 240),
        severity: c.severity as Constraint["severity"],
      };
    });
    const allIds: string[] = [];
    inputs
      .map((i) => i.id)
      .concat(outputs.map((o) => o.id))
      .forEach((itemId) => {
        if (allIds.includes(itemId)) fail(itemId, "Duplicate input/output ID.");
        allIds.push(itemId);
      });
    const constraintIds: string[] = [];
    constraints.forEach((c) => {
      if (constraintIds.includes(c.id)) fail(c.id, "Duplicate constraint ID.");
      constraintIds.push(c.id);
    });
    const dimensions: Record<string, Dimension> = Object.create(null);
    const active: string[] = [];
    inputs.forEach((input) => {
      dimensions[input.id] = units[input.unit].dimension;
    });
    function referenceDimension(ref: string): Dimension {
      if (own(dimensions, ref)) return dimensions[ref];
      const output = outputs.find((o) => o.id === ref);
      if (!output) return fail(ref, "Unknown reference.");
      if (active.includes(ref))
        return fail(
          ref,
          "Circular formula: " + active.concat(ref).join(" → ") + ".",
        );
      active.push(ref);
      const d = expressionDimension(output.expression);
      active.pop();
      if (!sameDimension(d, units[output.unit].dimension))
        return fail(
          output.label,
          "Formula units do not match declared output unit " +
            output.unit +
            ".",
        );
      dimensions[ref] = d;
      return d;
    }
    function expressionDimension(e: Expression): Dimension {
      if ("ref" in e) return referenceDimension(e.ref);
      if ("value" in e) return units[e.unit].dimension;
      const ds = e.args.map(expressionDimension);
      if (e.op === "multiply" || e.op === "divide")
        return ds
          .slice(1)
          .reduce(
            (a, b) =>
              a.map(
                (n, i) => n + (e.op === "divide" ? -b[i] : b[i]),
              ) as Dimension,
            ds[0],
          );
      if (!ds.every((d) => sameDimension(d, ds[0])))
        return fail(
          e.op,
          "Incompatible units. Addition, subtraction, min and max require matching dimensions.",
        );
      if (
        (e.op === "ceil" || e.op === "floor") &&
        !sameDimension(ds[0], [0, 0, 0]) &&
        !sameDimension(ds[0], [1, 0, 0])
      )
        return fail(
          e.op,
          "Rounding is supported only for dimensionless numbers or item counts.",
        );
      return ds[0];
    }
    outputs.forEach((o) => referenceDimension(o.id));
    constraints.forEach((c) => {
      if (
        !sameDimension(
          expressionDimension(c.left),
          expressionDimension(c.right),
        )
      )
        fail(c.id, "Constraint compares incompatible units.");
    });
    const result: InstrumentSpec = {
      schemaVersion: "nova-instrument/1",
      id: id(p.id, "id"),
      title: text(p.title, "title"),
      description: text(p.description, "description", 500),
      assumptions: list(p.assumptions, "assumptions", 1, 8).map((a) =>
        text(a, "assumptions", 240),
      ),
      inputs,
      outputs,
      constraints,
    };
    if (p.chart !== undefined) {
      const c = object(p.chart, "chart");
      keys(c, ["title", "unit", "series"], "chart");
      const u = unit(c.unit, "chart");
      result.chart = {
        title: text(c.title, "chart"),
        unit: u,
        series: list(c.series, "chart.series", 1, 24).map((v) => {
          const s = object(v, "chart.series");
          keys(s, ["label", "ref"], "chart.series");
          const ref = id(s.ref, "chart.series");
          if (!sameDimension(referenceDimension(ref), units[u].dimension))
            fail("chart", "Series units must match the chart unit.");
          return { label: text(s.label, "chart.series"), ref };
        }),
      };
    }
    return result;
  }
  function defaults(spec: InstrumentSpec): Record<string, number> {
    const result: Record<string, number> = {};
    spec.inputs.forEach((input) => {
      result[input.id] = input.default;
    });
    return result;
  }
  function calculate(
    raw: unknown,
    rawValues: Record<string, unknown>,
  ): Calculation {
    const result: Calculation = {
      ok: false,
      inputs: {},
      values: {},
      errors: [],
      warnings: [],
      constraints: [],
    };
    try {
      const spec = validate(raw);
      keys(
        object(rawValues, "Values"),
        spec.inputs.map((i) => i.id),
        "Values",
      );
      spec.inputs.forEach((input) => {
        try {
          let value = rawValues[input.id];
          if (typeof value === "string") {
            if (
              !/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(value.trim())
            )
              fail(input.label, "Enter a number; an empty field is not zero.");
            if (
              Number(value) === 0 &&
              /[1-9]/.test(value.toLowerCase().split("e")[0])
            )
              fail(
                input.label,
                "Number is too small to represent; it was not treated as zero.",
              );
            value = Number(value);
          }
          result.inputs[input.id] = checkInput(input, value);
        } catch (error) {
          result.errors.push((error as Error).message);
        }
      });
      if (result.errors.length) return result;
      const canonical: Record<string, Fraction> = Object.create(null);
      spec.inputs.forEach((input) => {
        canonical[input.id] = convert(
          decimal(result.inputs[input.id]),
          input.unit,
        );
      });
      const reference = (ref: string): Fraction => {
        if (own(canonical, ref)) return canonical[ref];
        const output = spec.outputs.find((o) => o.id === ref)!;
        canonical[ref] = evaluate(output.expression);
        return canonical[ref];
      };
      const evaluate = (e: Expression): Fraction => {
        if ("ref" in e) return reference(e.ref);
        if ("value" in e) return convert(decimal(e.value), e.unit);
        const a = e.args.map(evaluate);
        switch (e.op) {
          case "add":
            return a.reduce(
              (x, y) => fraction(x.n * y.d + y.n * x.d, x.d * y.d),
              fraction(zero),
            );
          case "subtract":
            return fraction(a[0].n * a[1].d - a[1].n * a[0].d, a[0].d * a[1].d);
          case "multiply":
            return a.reduce(
              (x, y) => fraction(x.n * y.n, x.d * y.d),
              fraction(one),
            );
          case "divide":
            return fraction(a[0].n * a[1].d, a[0].d * a[1].n);
          case "min":
            return a.reduce((x, y) => (compare(x, y) <= 0 ? x : y));
          case "max":
            return a.reduce((x, y) => (compare(x, y) >= 0 ? x : y));
          case "abs":
            return fraction(absInteger(a[0].n), a[0].d);
          case "ceil":
            return fraction(
              a[0].n / a[0].d +
                (a[0].n > zero && a[0].n % a[0].d !== zero ? one : zero),
            );
          case "floor":
            return fraction(
              a[0].n / a[0].d -
                (a[0].n < zero && a[0].n % a[0].d !== zero ? one : zero),
            );
        }
      };
      // Input-only constraints run first, so useful messages precede arithmetic failures.
      const onlyInputs = (e: Expression): boolean => {
        if ("ref" in e) return spec.inputs.some((i) => i.id === e.ref);
        return "value" in e || e.args.every(onlyInputs);
      };
      const check = (c: Constraint) => {
        const comparison = compare(evaluate(c.left), evaluate(c.right));
        const passed =
          c.operator === "lt"
            ? comparison < 0
            : c.operator === "lte"
              ? comparison <= 0
              : c.operator === "gt"
                ? comparison > 0
                : c.operator === "gte"
                  ? comparison >= 0
                  : comparison === 0;
        result.constraints.push({
          id: c.id,
          passed,
          message: c.message,
          severity: c.severity,
        });
        if (!passed)
          (c.severity === "error" ? result.errors : result.warnings).push(
            c.message,
          );
      };
      const early = spec.constraints.filter(
        (c) => onlyInputs(c.left) && onlyInputs(c.right),
      );
      early.forEach(check);
      if (result.errors.length) return result;
      spec.outputs.forEach((output) => {
        const value = convert(reference(output.id), output.unit, true);
        result.values[output.id] = Number(value.n) / Number(value.d);
      });
      spec.constraints.filter((c) => !early.includes(c)).forEach(check);
      if (result.errors.length) result.values = {};
      result.ok = result.errors.length === 0;
    } catch (error) {
      result.errors.push((error as Error).message);
      result.values = {};
    }
    return result;
  }
  function document(raw: unknown): InstrumentDocument {
    const p = object(raw, "Import");
    if (own(p, "schemaVersion")) {
      const spec = validate(p);
      return {
        documentVersion: "nova-instrument-document/1",
        spec,
        values: defaults(spec),
      };
    }
    keys(p, ["documentVersion", "spec", "values"], "Document");
    if (p.documentVersion !== "nova-instrument-document/1")
      return fail(
        "Import",
        "Expected InstrumentSpec nova-instrument/1 or document nova-instrument-document/1. Arbitrary prose is not supported.",
      );
    const spec = validate(p.spec),
      values = object(p.values, "values"),
      normalized: Record<string, number> = {};
    keys(
      values,
      spec.inputs.map((i) => i.id),
      "values",
    );
    spec.inputs.forEach((i) => {
      normalized[i.id] = checkInput(i, values[i.id]);
    });
    return {
      documentVersion: "nova-instrument-document/1",
      spec,
      values: normalized,
    };
  }
  function parse(json: string): InstrumentDocument {
    if (
      json.length > limits.bytes ||
      new TextEncoder().encode(json).byteLength > limits.bytes
    )
      return fail("Import", "File exceeds 200 KB limit.");
    let raw: unknown;
    try {
      raw = JSON.parse(json);
    } catch {
      return fail(
        "Import",
        "Invalid JSON. Import the structured specification, not an explanation or code fence.",
      );
    }
    return document(raw);
  }
  function describe(e: Expression, spec: InstrumentSpec): string {
    if ("ref" in e)
      return (
        spec.inputs.find((i) => i.id === e.ref)?.label ||
        spec.outputs.find((o) => o.id === e.ref)?.label ||
        e.ref
      );
    if ("value" in e)
      return e.value + (units[e.unit].label ? " " + units[e.unit].label : "");
    const args = e.args.map((a) => describe(a, spec));
    const symbols: Record<string, string> = {
      add: "+",
      subtract: "−",
      multiply: "×",
      divide: "÷",
    };
    return own(symbols, e.op)
      ? "(" + args.join(" " + symbols[e.op] + " ") + ")"
      : e.op + "(" + args.join(", ") + ")";
  }
  function format(value: number, precision: number) {
    return value.toLocaleString("en-US", { maximumFractionDigits: precision });
  }
  function chartValues(spec: InstrumentSpec, calculation: Calculation) {
    if (!spec.chart || !calculation.ok) return [];
    const target = units[spec.chart.unit];
    return spec.chart.series.map((s) => {
      const input = spec.inputs.find((i) => i.id === s.ref),
        output = spec.outputs.find((o) => o.id === s.ref);
      const value = input
        ? calculation.inputs[s.ref] * units[input.unit].scale
        : calculation.values[s.ref] * units[output!.unit].scale;
      return { label: s.label, value: value / target.scale };
    });
  }
  return {
    units,
    limits,
    validate,
    defaults,
    calculate,
    document,
    parse,
    describe,
    format,
    chartValues,
  };
}
export const instrumentEngine = createInstrumentEngine();
