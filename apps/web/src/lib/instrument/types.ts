export type Unit =
  | "1"
  | "item"
  | "h"
  | "min"
  | "item/h"
  | "item/min"
  | "USD"
  | "USD/item"
  | "USD/h";
export type Operation =
  | "add"
  | "subtract"
  | "multiply"
  | "divide"
  | "min"
  | "max"
  | "abs"
  | "ceil"
  | "floor";
export type Expression =
  | { ref: string }
  | { value: number; unit: Unit }
  | { op: Operation; args: Expression[] };
export interface InstrumentInput {
  id: string;
  label: string;
  type: "number" | "integer";
  unit: Unit;
  default: number;
  min: number;
  max: number;
  step: number;
  help: string;
}
export interface InstrumentOutput {
  id: string;
  label: string;
  unit: Unit;
  expression: Expression;
  precision: number;
  help: string;
}
export interface Constraint {
  id: string;
  left: Expression;
  operator: "lt" | "lte" | "gt" | "gte" | "eq";
  right: Expression;
  message: string;
  severity: "error" | "warning";
}
export interface InstrumentSpec {
  schemaVersion: "nova-instrument/1";
  id: string;
  title: string;
  description: string;
  assumptions: string[];
  inputs: InstrumentInput[];
  outputs: InstrumentOutput[];
  constraints: Constraint[];
  chart?: {
    title: string;
    unit: Unit;
    series: { label: string; ref: string }[];
  };
}
export interface InstrumentDocument {
  documentVersion: "nova-instrument-document/1";
  spec: InstrumentSpec;
  values: Record<string, number>;
}
export interface Calculation {
  ok: boolean;
  inputs: Record<string, number>;
  values: Record<string, number>;
  errors: string[];
  warnings: string[];
  constraints: {
    id: string;
    passed: boolean;
    message: string;
    severity: "error" | "warning";
  }[];
}
