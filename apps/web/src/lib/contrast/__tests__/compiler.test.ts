import { compileProject, decode, selectCover } from "../compiler";
import { evaluateHistory, observe } from "../adapters";
import {
  channelProject,
  contradictionProject,
  sequenceProject,
  serializerProject,
  blankProject,
} from "../examples";
import {
  exportProject,
  importProject,
  LIMITS,
  normalize,
  validateProject,
} from "../schema";
import { generateJest, makeBundle, makeTestSpec } from "../bundle";

describe("Sequence Witness actual event evaluator", () => {
  test.each([
    ["AB", true, true, true, false],
    ["BA", true, true, false, true],
    ["ABA", true, true, true, true],
    ["BAB", true, true, true, true],
    ["", false, false, false, false],
    ["AA", true, false, false, false],
    ["BB", false, true, false, false],
  ])(
    "%s has independently specified strict-order flags",
    (history, a, b, ab, ba) => {
      expect(evaluateHistory(history as string)).toEqual({
        "a-seen": a,
        "b-seen": b,
        "a-before-b": ab,
        "b-before-a": ba,
      });
    },
  );
  it("agrees with independent positional semantics over all histories of length up to eight", () => {
    for (let n = 0; n <= 8; n++)
      for (let bits = 0; bits < 2 ** n; bits++) {
        const history = Array.from({ length: n }, (_, i) =>
          bits & (2 ** i) ? "A" : "B",
        ).join("");
        const result = evaluateHistory(history);
        expect(result["a-before-b"]).toBe(
          history.indexOf("A") >= 0 &&
            history.indexOf("A") < history.lastIndexOf("B"),
        );
        expect(result["b-before-a"]).toBe(
          history.indexOf("B") >= 0 &&
            history.indexOf("B") < history.lastIndexOf("A"),
        );
      }
  });
  it("rejects unsupported events and oversized histories", () => {
    expect(() => evaluateHistory("A B")).toThrow();
    expect(() => evaluateHistory("A".repeat(257))).toThrow();
  });
});

describe("bounded compiler", () => {
  it("changes actual coverage when order observations are enabled", () => {
    const p = sequenceProject();
    const first = compileProject(p).channels[0];
    expect(first.covered).toEqual([]);
    expect(first.uncovered).toHaveLength(4);
    expect(first.uncovered.every((x) => x.reason.startsWith("Collision"))).toBe(
      true,
    );
    p.observations[2].enabled = true;
    expect(compileProject(p).channels[0].covered).toEqual(["r1", "r3"]);
    p.observations[3].enabled = true;
    const result = compileProject(p).channels[0];
    expect(result.covered).toEqual(["r1", "r2", "r3"]);
    expect(result.uncovered[0].requirement.id).toBe("r4");
    expect(result.selected).toEqual(["a-before-b", "b-before-a"]);
    expect(result.cost).toBe(2);
    expect(decode(result.decoder, [true, true])).toEqual({
      status: "ambiguous",
      candidateCaseIds: ["ABA", "BAB"],
    });
    expect(decode(result.decoder, [false, false]).status).toBe("unknown");
    expect(decode(result.decoder, [true]).status).toBe("unknown");
  });
  it("reports the transitive conflicting rule and a connecting chain", () => {
    const r = compileProject(contradictionProject()).channels[0];
    expect(r.contradictions[0].requirement.id).toBe("apart");
    expect(r.contradictions[0].chain).toEqual(["same1", "same2"]);
    expect(r.selection).toBe("blocked");
    expect(r.selected).toEqual([]);
  });
  it("detects self-distinction without needing a nonempty equivalence chain", () => {
    const p = blankProject();
    p.requirements = [
      {
        id: "self",
        channel: "public",
        kind: "different",
        left: "case1",
        right: "case1",
      },
    ];
    expect(compileProject(p).channels[0].contradictions[0].chain).toEqual([]);
  });
  it("rejects a public disclosure while allowing that measurement internally", () => {
    const a = compileProject(channelProject());
    expect(
      a.channels[0].candidates.find((c) => c.id === "reason")?.status,
    ).toBe("violates-equivalence");
    expect(
      a.channels[0].candidates.find((c) => c.id === "reason")?.violations[0],
    ).toMatchObject({ left: "E", right: "Q", chain: ["public-same"] });
    expect(a.channels[1].selected).toEqual(["reason"]);
    expect(a.channels[0].selected).not.toContain("reason");
  });
  it("treats missing values as insufficient evidence and missing equivalence as unverified", () => {
    const p = blankProject();
    p.requirements = [
      {
        id: "r",
        channel: "public",
        kind: "different",
        left: "case1",
        right: "case2",
      },
    ];
    p.observations[0].values.case1 = "red";
    expect(compileProject(p).channels[0].uncovered[0].reason).toMatch(
      /Insufficient evidence/,
    );
    p.requirements[0].kind = "same";
    expect(compileProject(p).channels[0].candidates[0].status).toBe(
      "unverified-equivalence",
    );
    p.observations[0].values.case2 = "red";
    expect(compileProject(p).channels[0].candidates[0].status).toBe(
      "admissible",
    );
  });
  it("does not classify uniquely when an incomplete case remains compatible", () => {
    const d = {
      observationIds: ["m"],
      rows: [
        { caseId: "a", values: ["red"] },
        { caseId: "b", values: [null] },
      ],
    };
    expect(decode(d, ["red"])).toEqual({
      status: "ambiguous",
      candidateCaseIds: ["a", "b"],
    });
    expect(decode(d, ["blue"])).toEqual({
      status: "unknown",
      candidateCaseIds: ["b"],
    });
  });
  it("bins numbers with explicit half-open boundaries", () => {
    const o = {
      ...blankProject().observations[0],
      kind: "numeric-bins" as const,
      boundaries: [10, 20],
      values: { case1: 10, case2: 19 },
    };
    expect(normalize(o, 9.99)).toBe("bin:0");
    expect(normalize(o, 10)).toBe("bin:1");
    expect(normalize(o, 20)).toBe("bin:2");
    const p = blankProject();
    p.observations = [o];
    p.requirements = [
      {
        id: "r",
        kind: "same",
        channel: "public",
        left: "case1",
        right: "case2",
      },
    ];
    expect(compileProject(p).channels[0].candidates[0].status).toBe(
      "admissible",
    );
  });
  it("captures adapter failures as unknown, not equality", () => {
    const p = sequenceProject();
    p.cases[0].input = "INVALID";
    const a = compileProject(p);
    expect(a.adapterErrors).toHaveLength(4);
    expect(a.values["a-seen"].AB).toBeNull();
  });
  it("preserves analysis through validated project export and import", () => {
    const p = channelProject();
    expect(compileProject(importProject(exportProject(p)))).toEqual(
      compileProject(p),
    );
    const bundle = makeBundle(compileProject(p));
    expect(bundle.provenance.execution.tests).toBe("not-executed");
    expect(bundle.files["report.md"]).toContain("NOT EXECUTED");
    expect(bundle.testSpecification.checks.every((c) => !c.executable)).toBe(
      true,
    );
  });
  it("exports calls into actual adapters using independent relational requirements", () => {
    const p = sequenceProject();
    p.observations.forEach((o) => (o.enabled = true));
    const spec = makeTestSpec(compileProject(p));
    expect(spec.checks).toHaveLength(4);
    expect(spec.checks.every((c) => c.executable)).toBe(true);
    const source = generateJest(spec);
    expect(source).toContain("observe(o.adapter!");
    expect(source).toContain("expect(left).not.toEqual(right)");
    expect(source).not.toContain("compileProject(");
  });
});

describe("exact selection checked against an independent brute-force oracle", () => {
  function oracle(
    cs: { id: string; cost: number; covers: string[] }[],
    targets: string[],
  ) {
    let best = Infinity;
    for (let mask = 0; mask < 2 ** cs.length; mask++) {
      const selected = cs.filter((_, i) => Math.floor(mask / 2 ** i) % 2);
      if (targets.every((t) => selected.some((c) => c.covers.includes(t))))
        best = Math.min(
          best,
          selected.reduce((s, c) => s + c.cost, 0),
        );
    }
    return best;
  }
  it("matches independent optima for 150 deterministic varied instances", () => {
    let seed = 47802;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed;
    };
    for (let n = 0; n < 150; n++) {
      const targets = ["r1", "r2", "r3", "r4"];
      const candidates = Array.from({ length: 8 }, (_, i) => ({
        id: `m${i}`,
        cost: random() % 6,
        covers: targets.filter(() => (random() >>> 16) % 2 === 0),
      }));
      const coverable = targets.filter((t) =>
        candidates.some((c) => c.covers.includes(t)),
      );
      const result = selectCover(candidates, coverable);
      expect(result.method).toBe("exact");
      expect(result.cost).toBe(oracle(candidates, coverable));
    }
  });
  it("handles zero cost and deterministic ties", () => {
    expect(
      selectCover(
        [
          { id: "b", cost: 0, covers: ["r"] },
          { id: "a", cost: 0, covers: ["r"] },
        ],
        ["r"],
      ),
    ).toEqual({ selected: ["a"], cost: 0, method: "exact" });
  });
  it("labels larger selections heuristic and still covers the target", () => {
    const candidates = Array.from({ length: 19 }, (_, i) => ({
      id: `m${i}`,
      cost: i,
      covers: ["r"],
    }));
    expect(selectCover(candidates, ["r"])).toEqual({
      selected: ["m0"],
      cost: 0,
      method: "heuristic",
    });
  });
});

describe("validation and the actual Nova contract", () => {
  test.each([
    ["version", (p: any) => (p.schemaVersion = "future")],
    ["negative cost", (p: any) => (p.observations[0].cost = -1)],
    ["NaN cost", (p: any) => (p.observations[0].cost = NaN)],
    ["fractional cost", (p: any) => (p.observations[0].cost = 1.2)],
    ["duplicate ID", (p: any) => (p.cases[1].id = p.cases[0].id)],
    ["unknown reference", (p: any) => (p.observations[0].channels = ["nope"])],
    [
      "too many cases",
      (p: any) =>
        (p.cases = Array.from({ length: LIMITS.cases + 1 }, (_, i) => ({
          id: `c${i}`,
          name: "Case",
        }))),
    ],
    ["unbinned number", (p: any) => (p.observations[0].values.case1 = 1)],
    [
      "approximate equality",
      (p: any) => (p.observations[0].kind = "tolerance"),
    ],
    [
      "invalid bins",
      (p: any) => {
        p.observations[0].kind = "numeric-bins";
        p.observations[0].boundaries = [10, 10];
      },
    ],
    [
      "uploaded adapter",
      (p: any) => {
        p.observations[0].source = "adapter";
        p.observations[0].adapter = "eval";
      },
    ],
  ])("rejects %s", (_, change) => {
    const p = blankProject();
    change(p);
    expect(() => validateProject(p)).toThrow();
  });
  it("rejects invalid JSON, oversized files and invalid IDs", () => {
    expect(() => importProject("{bad")).toThrow("Invalid JSON");
    expect(() => importProject(" ".repeat(LIMITS.bytes + 1))).toThrow(
      "exceeds",
    );
    const p = blankProject();
    p.cases[0].id = "constructor";
    expect(() => validateProject(p)).toThrow();
  });
  it("executes the real serializer and preserves distinct literal text", () => {
    const p = serializerProject();
    const a = compileProject(p);
    expect(a.rawValues.angle).toEqual({ literal: false, escaped: false });
    expect(a.rawValues.label).toEqual({
      literal: "<script>",
      escaped: "\\u003cscript>",
    });
    expect(a.channels[1].covered).toEqual(["preserve-value"]);
    expect(
      observe(
        "nova-structured-data",
        JSON.stringify({ label: "<script>" }),
        "serialized",
      ),
    ).toBe('{"label":"\\u003cscript>"}');
  });
});
