import {
  LIMITS,
  Project,
  Requirement,
  Value,
  normalize,
  validateProject,
} from "./schema";
import { observeCandidate } from "./adapters";

export const ENGINE_VERSION = "contrast-compiler/1.0.0";
export type Normalized = string | boolean | null;
export interface Pair {
  left: string;
  right: string;
}
export interface Violation extends Pair {
  leftValue: Normalized;
  rightValue: Normalized;
  chain: string[];
}
export interface CandidateResult {
  id: string;
  status:
    | "disabled"
    | "not-on-channel"
    | "violates-equivalence"
    | "unverified-equivalence"
    | "admissible";
  violations: Violation[];
  unknownEquivalences: Pair[];
  separates: string[];
  collisions: string[];
  incomplete: string[];
}
export interface Decoder {
  observationIds: string[];
  rows: { caseId: string; values: Normalized[] }[];
}
export interface ChannelResult {
  channel: string;
  contradictions: { requirement: Requirement; chain: string[] }[];
  equivalenceClasses: string[][];
  candidates: CandidateResult[];
  selected: string[];
  cost: number;
  selection: "exact" | "heuristic" | "blocked";
  covered: string[];
  uncovered: { requirement: Requirement; reason: string }[];
  decoder: Decoder;
  collisions: { vector: Normalized[]; caseIds: string[] }[];
  incompleteCases: string[];
}
export interface Analysis {
  engineVersion: string;
  project: Project;
  values: Record<string, Record<string, Normalized>>;
  rawValues: Record<string, Record<string, Value>>;
  adapterErrors: { observation: string; caseId: string; message: string }[];
  channels: ChannelResult[];
  execution: {
    adapterCalls: number;
    mode: "model-analysis" | "built-in-adapters-and-model";
    tests: "not-executed";
  };
}

export function equivalencePath(
  start: string,
  end: string,
  rules: Requirement[],
): string[] {
  const queue = [start],
    visited = new Set([start]);
  const previous = new Map<string, { node: string; rule: string }>();
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i];
    if (node === end) break;
    for (const r of rules) {
      const next =
        r.left === node ? r.right : r.right === node ? r.left : undefined;
      if (next !== undefined && !visited.has(next)) {
        visited.add(next);
        previous.set(next, { node, rule: r.id });
        queue.push(next);
      }
    }
  }
  if (!visited.has(end)) return [];
  const path: string[] = [];
  let n = end;
  while (n !== start) {
    const p = previous.get(n)!;
    path.unshift(p.rule);
    n = p.node;
  }
  return path;
}

export function selectCover(
  candidates: { id: string; cost: number; covers: string[] }[],
  target: string[],
): { selected: string[]; cost: number; method: "exact" | "heuristic" } {
  const usable = candidates
    .filter((c) => c.covers.length)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (!target.length) return { selected: [], cost: 0, method: "exact" };
  const index = new Map(target.map((id, i) => [id, i]));
  const bits = usable.map((c) =>
    c.covers.reduce(
      (mask, id) => mask | (BigInt(1) << BigInt(index.get(id)!)),
      BigInt(0),
    ),
  );
  const all = (BigInt(1) << BigInt(target.length)) - BigInt(1);
  const exact =
    usable.length <= LIMITS.exactObservations &&
    target.length <= LIMITS.exactPairs;
  if (exact) {
    const length = 2 ** usable.length;
    const coverage: bigint[] = new Array(length);
    coverage[0] = BigInt(0);
    const costs = new Float64Array(length),
      counts = new Uint8Array(length);
    let best = -1,
      bestCost = Infinity,
      bestCount = Infinity;
    for (let mask = 1; mask < length; mask++) {
      const low = mask & -mask,
        i = 31 - Math.clz32(low),
        prev = mask ^ low;
      coverage[mask] = coverage[prev] | bits[i];
      costs[mask] = costs[prev] + usable[i].cost;
      counts[mask] = counts[prev] + 1;
      // Equal cost: fewer observations, then first mask in stable ID order.
      if (
        coverage[mask] === all &&
        (costs[mask] < bestCost ||
          (costs[mask] === bestCost && counts[mask] < bestCount))
      ) {
        best = mask;
        bestCost = costs[mask];
        bestCount = counts[mask];
      }
    }
    return {
      selected: usable
        .filter((_, i) => best >= 0 && best & (1 << i))
        .map((c) => c.id),
      cost: best < 0 ? 0 : bestCost,
      method: "exact",
    };
  }
  let covered = BigInt(0);
  const selected: string[] = [];
  while (covered !== all) {
    let winner = -1,
      bestGain = 0,
      bestCost = 0;
    usable.forEach((c, i) => {
      if (selected.includes(c.id)) return;
      let fresh = bits[i] & ~covered,
        gain = 0;
      while (fresh) {
        fresh &= fresh - BigInt(1);
        gain++;
      }
      if (!gain) return;
      if (
        winner < 0 ||
        (c.cost === 0 && bestCost > 0) ||
        (c.cost === 0 && bestCost === 0 && gain > bestGain) ||
        (c.cost > 0 && bestCost > 0 && gain * bestCost > bestGain * c.cost)
      ) {
        winner = i;
        bestGain = gain;
        bestCost = c.cost;
      }
    });
    if (winner < 0) break;
    selected.push(usable[winner].id);
    covered |= bits[winner];
  }
  return {
    selected,
    cost: selected.reduce(
      (sum, id) => sum + usable.find((c) => c.id === id)!.cost,
      0,
    ),
    method: "heuristic",
  };
}

export function compileProject(input: unknown): Analysis {
  const project = validateProject(input);
  const values: Analysis["values"] = {},
    rawValues: Analysis["rawValues"] = {},
    adapterErrors: Analysis["adapterErrors"] = [];
  let adapterCalls = 0;
  for (const o of project.observations) {
    values[o.id] = {};
    rawValues[o.id] = {};
    for (const c of project.cases) {
      let value = o.values[c.id] ?? null;
      if (o.source === "adapter") {
        try {
          adapterCalls++;
          value = observeCandidate(o, c.input ?? "");
        } catch (error) {
          value = null;
          adapterErrors.push({
            observation: o.id,
            caseId: c.id,
            message: error instanceof Error ? error.message : "Adapter failed.",
          });
        }
      }
      try {
        values[o.id][c.id] = normalize(o, value);
        rawValues[o.id][c.id] = value;
      } catch {
        values[o.id][c.id] = null;
        rawValues[o.id][c.id] = null;
        adapterErrors.push({
          observation: o.id,
          caseId: c.id,
          message:
            "Adapter output does not match the declared observation kind.",
        });
      }
    }
  }
  const channels = project.channels.map((channel) => {
    const rules = project.requirements.filter((r) => r.channel === channel.id);
    const same = rules.filter((r) => r.kind === "same"),
      different = rules.filter((r) => r.kind === "different");
    const parent = new Map(project.cases.map((c) => [c.id, c.id]));
    function root(id: string): string {
      let p = id;
      while (parent.get(p)! !== p) p = parent.get(p)!;
      return p;
    }
    same.forEach((r) => parent.set(root(r.right), root(r.left)));
    const groups = new Map<string, string[]>();
    project.cases.forEach((c) => {
      const r = root(c.id);
      groups.set(r, [...(groups.get(r) || []), c.id]);
    });
    const equivalenceClasses = [...groups.values()];
    const contradictions = different
      .filter((r) => root(r.left) === root(r.right))
      .map((requirement) => ({
        requirement,
        chain: equivalencePath(requirement.left, requirement.right, same),
      }));
    const equivalentPairs: Pair[] = [];
    equivalenceClasses.forEach((group) =>
      group.forEach((left, i) =>
        group
          .slice(i + 1)
          .forEach((right) => equivalentPairs.push({ left, right })),
      ),
    );
    const chains = new Map(
      equivalentPairs.map((p) => [
        JSON.stringify([p.left, p.right]),
        equivalencePath(p.left, p.right, same),
      ]),
    );
    const candidates: CandidateResult[] = project.observations.map((o) => {
      const row = values[o.id];
      const violations = equivalentPairs
        .filter(
          (p) =>
            row[p.left] !== null &&
            row[p.right] !== null &&
            row[p.left] !== row[p.right],
        )
        .map((p) => ({
          ...p,
          leftValue: row[p.left],
          rightValue: row[p.right],
          chain: chains.get(JSON.stringify([p.left, p.right]))!,
        }));
      const unknownEquivalences = equivalentPairs.filter(
        (p) => row[p.left] === null || row[p.right] === null,
      );
      const status = !o.channels.includes(channel.id)
        ? "not-on-channel"
        : !o.enabled
          ? "disabled"
          : violations.length
            ? "violates-equivalence"
            : unknownEquivalences.length
              ? "unverified-equivalence"
              : "admissible";
      return {
        id: o.id,
        status,
        violations,
        unknownEquivalences,
        separates: different
          .filter(
            (r) =>
              row[r.left] !== null &&
              row[r.right] !== null &&
              row[r.left] !== row[r.right],
          )
          .map((r) => r.id),
        collisions: different
          .filter(
            (r) =>
              row[r.left] !== null &&
              row[r.right] !== null &&
              row[r.left] === row[r.right],
          )
          .map((r) => r.id),
        incomplete: different
          .filter((r) => row[r.left] === null || row[r.right] === null)
          .map((r) => r.id),
      };
    });
    const admissible = candidates.filter((c) => c.status === "admissible");
    const coverable = different
      .filter((r) => admissible.some((c) => c.separates.includes(r.id)))
      .map((r) => r.id);
    const choice = selectCover(
      admissible.map((c) => ({
        id: c.id,
        cost: project.observations.find((o) => o.id === c.id)!.cost,
        covers: c.separates,
      })),
      coverable,
    );
    const selected = contradictions.length ? [] : choice.selected;
    const covered = different
      .filter((r) =>
        selected.some((id) =>
          candidates.find((c) => c.id === id)!.separates.includes(r.id),
        ),
      )
      .map((r) => r.id);
    const uncovered = different
      .filter((r) => !covered.includes(r.id))
      .map((requirement) => ({
        requirement,
        reason: contradictions.length
          ? "Channel blocked by contradictory requirements."
          : !admissible.length
            ? "No enabled observation is verified admissible on this channel."
            : admissible.some((c) => c.incomplete.includes(requirement.id))
              ? "Insufficient evidence: one or more admissible measurements are missing; all complete measurements collide."
              : "Collision: identical recorded values under every admissible observation.",
      }));
    const decoder: Decoder = {
      observationIds: selected,
      rows: project.cases.map((c) => ({
        caseId: c.id,
        values: selected.map((id) => values[id][c.id]),
      })),
    };
    const vectors = new Map<
      string,
      { vector: Normalized[]; caseIds: string[] }
    >();
    decoder.rows
      .filter((row) => !row.values.includes(null))
      .forEach((row) => {
        const key = JSON.stringify(row.values),
          old = vectors.get(key);
        vectors.set(key, {
          vector: row.values,
          caseIds: [...(old?.caseIds || []), row.caseId],
        });
      });
    return {
      channel: channel.id,
      contradictions,
      equivalenceClasses,
      candidates,
      selected,
      cost: contradictions.length ? 0 : choice.cost,
      selection: contradictions.length ? ("blocked" as const) : choice.method,
      covered,
      uncovered,
      decoder,
      collisions: [...vectors.values()].filter((g) => g.caseIds.length > 1),
      incompleteCases: decoder.rows
        .filter((r) => r.values.includes(null))
        .map((r) => r.caseId),
    };
  });
  return {
    engineVersion: ENGINE_VERSION,
    project,
    values,
    rawValues,
    adapterErrors,
    channels,
    execution: {
      adapterCalls,
      mode: adapterCalls ? "built-in-adapters-and-model" : "model-analysis",
      tests: "not-executed",
    },
  };
}
export function decode(decoder: Decoder, vector: Normalized[]) {
  if (
    vector.length !== decoder.observationIds.length ||
    vector.some((v) => v === null || !["string", "boolean"].includes(typeof v))
  )
    return { status: "unknown" as const, candidateCaseIds: [] as string[] };
  const compatible = decoder.rows.filter((row) =>
    row.values.every((v, i) => v === null || v === vector[i]),
  );
  const complete = compatible.filter((row) => !row.values.includes(null));
  const status = !complete.length
    ? "unknown"
    : compatible.length === 1
      ? "unique"
      : "ambiguous";
  return { status, candidateCaseIds: compatible.map((row) => row.caseId) };
}
