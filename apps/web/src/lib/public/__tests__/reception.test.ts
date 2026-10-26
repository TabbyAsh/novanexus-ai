import {
  validateBrief,
  formatBrief,
  emailBriefUrl,
  type ReceptionForm,
} from "../reception";
const f: ReceptionForm = {
  intent: "merchandise",
  name: "Example Buyer",
  email: "buyer@example.test",
  business: "Example Co",
  need: "Please compare cotton crew socks with one existing logo.",
  quantity: "250 units",
  destination: "Terre Haute IN 47802",
  budget: "USD 1000 delivered",
  deadline: "Flexible",
};
describe("reception brief", () => {
  it("requires identity, a useful scope and merchandise quantity/destination", () => {
    expect(validateBrief(f)).toEqual([]);
    expect(
      validateBrief({
        ...f,
        quantity: "",
        destination: "",
        name: "",
        email: "bad",
        need: "short",
      }),
    ).toHaveLength(4);
    expect(
      validateBrief({ ...f, intent: "support", quantity: "", destination: "" }),
    ).toEqual([]);
  });
  it("keeps the actual requested service and marks the result as a review request", () => {
    const text = formatBrief(f);
    expect(text).toContain("Source merchandise");
    expect(text).toContain(f.need);
    expect(text).toContain(
      "Please review fit and scope before any paid work or order.",
    );
    expect(text).not.toContain("inquiry recorded");
  });
  it("encodes all entered text into the email body, with one fixed business recipient", () => {
    const url = new URL(
      emailBriefUrl({
        ...f,
        name: "Buyer\nBcc: stranger@example.test",
        need: "Example + & ? # request with sufficient details",
      }),
    );
    expect(url.pathname).toBe("wyatt@novanexus-ai.com");
    expect([...url.searchParams.keys()].sort()).toEqual(["body", "subject"]);
    expect(url.searchParams.get("body")).toContain(
      "Bcc: stranger@example.test",
    );
    expect(url.searchParams.get("subject")).toBe(
      "Nova request: Source merchandise",
    );
  });
});
