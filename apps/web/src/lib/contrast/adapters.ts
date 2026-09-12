import { serializeStructuredData } from "../public-structured-data";
import { AdapterId, LIMITS, Observation, Value } from "./schema";

export function evaluateHistory(history: string) {
  if (history.length > LIMITS.history || !/^[AB]*$/.test(history))
    throw new Error(
      `History must contain only A and B, at most ${LIMITS.history} events. Empty history is allowed.`,
    );
  let a = false,
    b = false,
    ab = false,
    ba = false;
  for (const event of history) {
    if (event === "A") {
      if (b) ba = true;
      a = true;
    } else {
      if (a) ab = true;
      b = true;
    }
  }
  return { "a-seen": a, "b-seen": b, "a-before-b": ab, "b-before-a": ba };
}
export const ADAPTER_OPERATIONS = {
  "sequence-witness": ["a-seen", "b-seen", "a-before-b", "b-before-a"],
  "nova-structured-data": [
    "serialized",
    "contains-literal-angle",
    "roundtrip-label",
  ],
};
// Closed registry. Case inputs are data, never executable source.
export function observe(
  adapter: AdapterId,
  caseInput: string,
  operation: string,
): Value {
  if (adapter === "sequence-witness") {
    const result = evaluateHistory(caseInput);
    if (!(operation in result))
      throw new Error("Unknown Sequence Witness operation.");
    return result[operation as keyof typeof result];
  }
  if (adapter === "nova-structured-data") {
    const input: unknown = JSON.parse(caseInput);
    const serialized = serializeStructuredData(input);
    if (operation === "serialized") return serialized;
    if (operation === "contains-literal-angle") return serialized.includes("<");
    if (operation === "roundtrip-label") {
      const decoded: unknown = JSON.parse(serialized);
      if (
        !decoded ||
        typeof decoded !== "object" ||
        !("label" in decoded) ||
        typeof decoded.label !== "string"
      )
        throw new Error(
          "This operation requires a JSON object with a text label.",
        );
      return decoded.label;
    }
    throw new Error("Unknown Nova serializer operation.");
  }
  throw new Error("Unknown adapter.");
}
export function observeCandidate(o: Observation, input: string): Value {
  return observe(o.adapter!, input, o.operation!);
}
