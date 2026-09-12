export const SCHEMA_VERSION = "nova-contrast/1" as const;
export const LIMITS = {
  cases: 80,
  observations: 48,
  channels: 8,
  requirements: 400,
  bytes: 1000000,
  history: 256,
  exactObservations: 18,
  exactPairs: 128,
};
export type Value = string | boolean | number | null;
export type AdapterId = "sequence-witness" | "nova-structured-data";
export interface Case {
  id: string;
  name: string;
  input?: string;
}
export interface Channel {
  id: string;
  name: string;
}
export interface Observation {
  id: string;
  name: string;
  cost: number;
  enabled: boolean;
  channels: string[];
  kind: "categorical" | "numeric-bins";
  boundaries?: number[];
  source: "manual" | "simulated" | "adapter";
  adapter?: AdapterId;
  operation?: string;
  values: Record<string, Value>;
}
export interface Requirement {
  id: string;
  channel: string;
  kind: "same" | "different";
  left: string;
  right: string;
}
export interface Project {
  schemaVersion: typeof SCHEMA_VERSION;
  name: string;
  cases: Case[];
  channels: Channel[];
  observations: Observation[];
  requirements: Requirement[];
}
export class ProjectError extends Error {
  constructor(public issues: string[]) {
    super(issues.join("\n"));
    this.name = "ProjectError";
  }
}
const object = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);
const idValid = (x: unknown): x is string =>
  typeof x === "string" &&
  /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(x) &&
  !["__proto__", "constructor", "prototype"].includes(x);
const nameValid = (x: unknown) =>
  typeof x === "string" && x.trim().length > 0 && x.length <= 160;

export function validateProject(input: unknown): Project {
  const errors: string[] = [];
  if (!object(input))
    throw new ProjectError(["Project must be a JSON object."]);
  if (input.schemaVersion !== SCHEMA_VERSION)
    errors.push(`Unsupported schemaVersion. Expected ${SCHEMA_VERSION}.`);
  if (!nameValid(input.name))
    errors.push("Project name must contain 1–160 characters.");
  for (const [field, max] of Object.entries({
    cases: LIMITS.cases,
    observations: LIMITS.observations,
    channels: LIMITS.channels,
    requirements: LIMITS.requirements,
  })) {
    if (
      !Array.isArray(input[field]) ||
      (input[field] as unknown[]).length > max
    )
      errors.push(`${field} must be an array with at most ${max} entries.`);
  }
  if (errors.length) throw new ProjectError(errors);
  const p = input as unknown as Project;
  function checkIds(items: unknown[], label: string) {
    const seen = new Set<string>();
    items.forEach((item, i) => {
      if (!object(item) || !idValid(item.id))
        errors.push(
          `${label}[${i}] needs a valid ID (letter, then letters, digits, _ or -).`,
        );
      else if (seen.has(item.id))
        errors.push(`Duplicate ${label} ID: ${item.id}.`);
      else seen.add(item.id);
    });
  }
  checkIds(p.cases, "case");
  checkIds(p.channels, "channel");
  checkIds(p.observations, "observation");
  checkIds(p.requirements, "requirement");
  if (errors.length) throw new ProjectError(errors);
  if (!p.cases.length) errors.push("Add at least one case.");
  if (!p.channels.length) errors.push("Add at least one channel.");
  const caseIds = new Set(p.cases.map((c) => c.id));
  const channelIds = new Set(p.channels.map((c) => c.id));
  p.cases.forEach((c) => {
    if (!nameValid(c.name))
      errors.push(`Case ${c.id}: name must contain 1–160 characters.`);
    if (
      c.input !== undefined &&
      (typeof c.input !== "string" || c.input.length > 4096)
    )
      errors.push(`Case ${c.id}: input must be text up to 4096 characters.`);
  });
  p.channels.forEach((c) => {
    if (!nameValid(c.name)) errors.push(`Channel ${c.id}: invalid name.`);
  });
  p.observations.forEach((o) => {
    if (!nameValid(o.name)) errors.push(`Observation ${o.id}: invalid name.`);
    if (!Number.isSafeInteger(o.cost) || o.cost < 0 || o.cost > 1000000)
      errors.push(
        `Observation ${o.id}: cost must be a whole number from 0 to 1000000 (use smaller cost units for fractions).`,
      );
    if (typeof o.enabled !== "boolean")
      errors.push(`Observation ${o.id}: enabled must be boolean.`);
    if (
      !Array.isArray(o.channels) ||
      !o.channels.length ||
      o.channels.length > LIMITS.channels ||
      new Set(o.channels).size !== o.channels.length ||
      o.channels.some((c) => !channelIds.has(c))
    )
      errors.push(
        `Observation ${o.id}: channels must be unique existing channel IDs.`,
      );
    if (!["categorical", "numeric-bins"].includes(o.kind))
      errors.push(
        `Observation ${o.id}: unsupported kind; approximate tolerances are not supported.`,
      );
    if (
      o.kind === "numeric-bins" &&
      (!Array.isArray(o.boundaries) ||
        o.boundaries.length > 32 ||
        o.boundaries.some(
          (v, i, a) => !Number.isFinite(v) || (i > 0 && v <= a[i - 1]),
        ))
    )
      errors.push(
        `Observation ${o.id}: bins need at most 32 strictly increasing finite boundaries.`,
      );
    if (!["manual", "simulated", "adapter"].includes(o.source))
      errors.push(`Observation ${o.id}: invalid source.`);
    if (
      o.source === "adapter" &&
      (!["sequence-witness", "nova-structured-data"].includes(
        o.adapter || "",
      ) ||
        typeof o.operation !== "string")
    )
      errors.push(
        `Observation ${o.id}: choose a built-in adapter and operation. Uploaded code is not supported.`,
      );
    if (
      o.source === "adapter" &&
      o.adapter === "sequence-witness" &&
      !["a-seen", "b-seen", "a-before-b", "b-before-a"].includes(
        o.operation || "",
      )
    )
      errors.push(`Observation ${o.id}: unknown Sequence Witness operation.`);
    if (
      o.source === "adapter" &&
      o.adapter === "nova-structured-data" &&
      !["serialized", "contains-literal-angle", "roundtrip-label"].includes(
        o.operation || "",
      )
    )
      errors.push(`Observation ${o.id}: unknown Nova serializer operation.`);
    if (!object(o.values) || Object.keys(o.values).length > LIMITS.cases)
      errors.push(`Observation ${o.id}: invalid values table.`);
    else
      Object.entries(o.values).forEach(([c, v]) => {
        if (!caseIds.has(c))
          errors.push(`Observation ${o.id}: unknown case ${c}.`);
        if (
          v !== null &&
          (o.kind === "numeric-bins"
            ? typeof v !== "number" || !Number.isFinite(v)
            : !["string", "boolean"].includes(typeof v))
        )
          errors.push(
            `Observation ${o.id}, case ${c}: use ${o.kind === "numeric-bins" ? "a finite number" : "text or boolean"} or null for unknown.`,
          );
        if (typeof v === "string" && v.length > 4096)
          errors.push(
            `Observation ${o.id}, case ${c}: value exceeds 4096 characters.`,
          );
      });
  });
  p.requirements.forEach((r) => {
    if (!channelIds.has(r.channel))
      errors.push(`Requirement ${r.id}: unknown channel ${r.channel}.`);
    if (!caseIds.has(r.left) || !caseIds.has(r.right))
      errors.push(`Requirement ${r.id}: unknown case reference.`);
    if (!["same", "different"].includes(r.kind))
      errors.push(`Requirement ${r.id}: kind must be same or different.`);
  });
  if (errors.length) throw new ProjectError(errors.slice(0, 100));
  // Return only schema fields; imported objects never become code or property names on a prototype.
  return {
    schemaVersion: SCHEMA_VERSION,
    name: p.name,
    cases: p.cases.map((c) => ({
      id: c.id,
      name: c.name,
      ...(c.input !== undefined ? { input: c.input } : {}),
    })),
    channels: p.channels.map((c) => ({ id: c.id, name: c.name })),
    observations: p.observations.map((o) => ({
      id: o.id,
      name: o.name,
      cost: o.cost,
      enabled: o.enabled,
      channels: [...o.channels],
      kind: o.kind,
      ...(o.kind === "numeric-bins" ? { boundaries: [...o.boundaries!] } : {}),
      source: o.source,
      ...(o.source === "adapter"
        ? { adapter: o.adapter, operation: o.operation }
        : {}),
      values: { ...o.values },
    })),
    requirements: p.requirements.map((r) => ({
      id: r.id,
      channel: r.channel,
      kind: r.kind,
      left: r.left,
      right: r.right,
    })),
  };
}
export function importProject(text: string): Project {
  if (new TextEncoder().encode(text).length > LIMITS.bytes)
    throw new ProjectError([`Import exceeds ${LIMITS.bytes} bytes.`]);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ProjectError([
      "Invalid JSON. Check commas, quotes, and brackets.",
    ]);
  }
  return validateProject(value);
}
export function exportProject(p: Project): string {
  return JSON.stringify(validateProject(p), null, 2);
}
export function normalize(
  o: Observation,
  value: Value | undefined,
): string | boolean | null {
  if (value === null || value === undefined) return null;
  if (o.kind === "numeric-bins") {
    if (typeof value !== "number" || !Number.isFinite(value))
      throw new Error(`Invalid numeric value for ${o.id}.`);
    const i = o.boundaries!.findIndex((b) => value < b);
    return `bin:${i < 0 ? o.boundaries!.length : i}`;
  }
  if (typeof value !== "string" && typeof value !== "boolean")
    throw new Error(`Invalid categorical value for ${o.id}.`);
  return value;
}
