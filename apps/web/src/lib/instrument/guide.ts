export const instrumentGuide = `# Make a calculator for Nova Instrument Forge

Return only valid JSON matching nova-instrument/1. The user imports your specification; Nova does not interpret arbitrary prose or execute your code. Do not claim the specification has been validated or tested unless it has.

Required fields: schemaVersion, id, title, description, assumptions, inputs, outputs, constraints. Optional: chart.
Use only these fields. IDs must start with a letter and contain only letters, numbers, hyphens or underscores (maximum 64). Input/output IDs share one namespace. Do not use constructor, prototype or __proto__.

Each input: {id, label, type: "number" | "integer", unit, default, min, max, step, help}.
Numbers and bounds must be finite and within ±1 billion. Defaults must fit bounds and type. Step is a positive control increment; integer inputs require integer bounds and step. It is not an additional divisibility constraint.
Each output: {id, label, unit, expression, precision, help}. Precision is 0–6 display decimal places. Accepted JavaScript number values are converted from their normalized decimal strings to exact fractions for arithmetic, comparison, unit conversion and ceil/floor. Outputs are converted to numbers for display and export; display rounding never feeds back into a formula. Arbitrary-precision input strings are not supported. The first output is the primary result. Forward references to other outputs work; cycles do not.
Each constraint: {id, left: expression, operator: "lt" | "lte" | "gt" | "gte" | "eq", right: expression, message, severity: "error" | "warning"}. A failed error blocks results. A warning leaves computed results visible. Input-only constraints are checked before outputs. Equality compares these exact fractions, not an epsilon tolerance.

Expression forms (objects, never source-code strings):
- {"ref":"anInputOrOutputId"}
- {"value":8,"unit":"h"}
- {"op":"min","args":[{"ref":"stage1"},{"ref":"stage2"}]}
Operations: add, multiply, min and max take 2–16 arguments; subtract and divide take exactly 2; abs, ceil and floor take exactly 1. There are no functions, loops, conditions, assignments, network calls or custom code.

Supported units: "1" (dimensionless), "item", "h", "min", "item/h", "item/min", "USD", "USD/item", "USD/h".
Units are checked by item, time and USD dimensions. Minutes convert to hours internally. Addition, subtraction, min, max and comparisons need matching dimensions; multiply/divide combine them. Output units must match the expression. ceil/floor accept only item counts or dimensionless quantities. No other currencies or implicit exchange rates.

Optional chart: {"title":"Comparison","unit":"item/h","series":[{"label":"Stage 1","ref":"stage1"}]}. Up to 24 series; all references must have dimensions compatible with the chart unit. Negative values are shown to the left of zero. Charts do not add calculations.

Limits: 200 KB JSON; 1–24 inputs; 1–24 outputs; 0–24 constraints; 1000 expression nodes total; expression depth 16; 1–8 assumptions. Intermediate/output magnitudes above 10^15, reduced fractions exceeding 240 digits and division by zero are errors. Unsupported units or operations must be explained rather than disguised with labels.

Download either built-in specification for a complete editable example. Provide explicit assumptions and independently calculated expected answers with your specification. A valid specification is a bounded calculator, not proof that its model is appropriate.

Saved documents use {"documentVersion":"nova-instrument-document/1","spec":<InstrumentSpec>,"values":<all current numeric input values>}. Both this document and a bare InstrumentSpec can be imported.
`;
