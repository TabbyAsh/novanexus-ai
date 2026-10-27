import {
  validateBrief,
  formatBrief,
  emailBriefUrl,
  buildReceptionInquiry,
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
  it("keeps service identity and structured buying details in the durable request", () => {
    const key = 'request-test-123456789';
    const request = buildReceptionInquiry({ ...f, product: 'Cotton crew socks' }, key);
    expect(request.serviceCode).toBe('MERCHANDISE_SOURCING');
    expect(request.requestId).toBe(key);
    expect(request.challenge).toBe(f.need);
    expect(request.details).toMatchObject({ role: 'buyer', product: 'Cotton crew socks', quantity: f.quantity, destination: f.destination });
    expect(request.details).not.toHaveProperty('email');
    expect(buildReceptionInquiry(f, key)).toEqual(buildReceptionInquiry(f, key));
  });
  it("does not relabel general requests as an accepted pilot or a different service", () => {
    for (const [intent, serviceCode] of Object.entries({ wholesale: 'WHOLESALE_TRADE', retail: 'RETAIL_PRODUCT', supplier: 'SUPPLIER_PARTNERSHIP', cleanup: 'CATALOG_CLEANUP', research: 'RESEARCH_SERVICE', support: 'SUPPORT_REQUEST', other: 'GENERAL_INQUIRY', workflow: 'GENERAL_INQUIRY' })) {
      expect(buildReceptionInquiry({ ...f, intent }, 'request-test-123456789').serviceCode).toBe(serviceCode);
    }
  });
  it("rejects invalid payloads before a durable submission can begin", () => {
    expect(() => buildReceptionInquiry({ ...f, business: '' }, 'request-test-123456789')).toThrow();
    expect(() => buildReceptionInquiry(f, 'short')).toThrow();
    expect(validateBrief({ ...f, website: 'https://user:password@example.test' })).not.toEqual([]);
    expect(validateBrief({ ...f, deadline: 'x'.repeat(81) })).not.toEqual([]);
  });
  it("does not submit details hidden after changing the request category", () => {
    const request = buildReceptionInquiry({ ...f, intent: 'support', product: 'Earlier product', website: 'https://example.test' }, 'request-test-123456789');
    expect(request.details).not.toHaveProperty('product');
    expect(request.details).not.toHaveProperty('quantity');
    expect(request.details).not.toHaveProperty('destination');
    expect(request.details).not.toHaveProperty('website');
  });
});
