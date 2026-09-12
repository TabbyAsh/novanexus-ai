import { Project, SCHEMA_VERSION } from "./schema";

export function sequenceProject(): Project {
  return {
    schemaVersion: SCHEMA_VERSION,
    name: "Sequence Witness · logic simulation",
    cases: ["AB", "BA", "ABA", "BAB"].map((id) => ({
      id,
      name: id,
      input: id,
    })),
    channels: [{ id: "inspection", name: "Inspection" }],
    observations: [
      ["a-seen", "A seen"],
      ["b-seen", "B seen"],
      ["a-before-b", "A before B"],
      ["b-before-a", "B before A"],
    ].map(([id, name], i) => ({
      id,
      name,
      cost: 1,
      enabled: i < 2,
      channels: ["inspection"],
      kind: "categorical",
      source: "adapter",
      adapter: "sequence-witness",
      operation: id,
      values: {},
    })),
    requirements: [
      ["AB", "BA"],
      ["AB", "ABA"],
      ["BA", "ABA"],
      ["ABA", "BAB"],
    ].map(([left, right], i) => ({
      id: `r${i + 1}`,
      channel: "inspection",
      kind: "different",
      left,
      right,
    })),
  };
}
export function contradictionProject(): Project {
  const p = sequenceProject();
  p.name = "A transitive contradiction";
  p.observations.forEach((o) => {
    o.enabled = true;
  });
  p.requirements = [
    {
      id: "same1",
      channel: "inspection",
      kind: "same",
      left: "AB",
      right: "BA",
    },
    {
      id: "same2",
      channel: "inspection",
      kind: "same",
      left: "BA",
      right: "ABA",
    },
    {
      id: "apart",
      channel: "inspection",
      kind: "different",
      left: "AB",
      right: "ABA",
    },
  ];
  return p;
}
export function channelProject(): Project {
  return {
    schemaVersion: SCHEMA_VERSION,
    name: "Public sameness, internal difference",
    cases: [
      { id: "E", name: "Earlier time" },
      { id: "Q", name: "Quiet room" },
    ],
    channels: [
      { id: "public", name: "Public arrangement" },
      { id: "internal", name: "Internal planning" },
    ],
    observations: [
      {
        id: "arrangement",
        name: "Visible arrangement",
        cost: 1,
        enabled: true,
        channels: ["public"],
        kind: "categorical",
        source: "simulated",
        values: { E: "Earlier + quiet", Q: "Earlier + quiet" },
      },
      {
        id: "reason",
        name: "Private reason",
        cost: 1,
        enabled: true,
        channels: ["public", "internal"],
        kind: "categorical",
        source: "simulated",
        values: { E: "time", Q: "noise" },
      },
    ],
    requirements: [
      {
        id: "public-same",
        channel: "public",
        kind: "same",
        left: "E",
        right: "Q",
      },
      {
        id: "internal-apart",
        channel: "internal",
        kind: "different",
        left: "E",
        right: "Q",
      },
    ],
  };
}
export function serializerProject(): Project {
  return {
    schemaVersion: SCHEMA_VERSION,
    name: "Nova structured-data contract",
    cases: [
      {
        id: "literal",
        name: "Literal angle bracket",
        input: JSON.stringify({ label: "<script>" }),
      },
      {
        id: "escaped",
        name: "Literal escape text",
        input: JSON.stringify({ label: "\\u003cscript>" }),
      },
    ],
    channels: [
      { id: "html", name: "Raw HTML boundary" },
      { id: "value", name: "Round-trip label" },
    ],
    observations: [
      {
        id: "angle",
        name: "Contains a literal <",
        cost: 1,
        enabled: true,
        channels: ["html"],
        kind: "categorical",
        source: "adapter",
        adapter: "nova-structured-data",
        operation: "contains-literal-angle",
        values: {},
      },
      {
        id: "label",
        name: "Decoded label",
        cost: 1,
        enabled: true,
        channels: ["value"],
        kind: "categorical",
        source: "adapter",
        adapter: "nova-structured-data",
        operation: "roundtrip-label",
        values: {},
      },
    ],
    requirements: [
      {
        id: "safe-boundary",
        channel: "html",
        kind: "same",
        left: "literal",
        right: "escaped",
      },
      {
        id: "preserve-value",
        channel: "value",
        kind: "different",
        left: "literal",
        right: "escaped",
      },
    ],
  };
}
export function blankProject(): Project {
  return {
    schemaVersion: SCHEMA_VERSION,
    name: "Untitled project",
    cases: [
      { id: "case1", name: "Case 1" },
      { id: "case2", name: "Case 2" },
    ],
    channels: [{ id: "public", name: "Public output" }],
    observations: [
      {
        id: "measurement1",
        name: "Measurement 1",
        cost: 1,
        enabled: true,
        channels: ["public"],
        kind: "categorical",
        source: "manual",
        values: { case1: null, case2: null },
      },
    ],
    requirements: [],
  };
}
