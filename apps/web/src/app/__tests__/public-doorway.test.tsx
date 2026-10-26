import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import HomePage from "../page";
describe("Nova public office doorway", () => {
  const markup = renderToStaticMarkup(<HomePage />);
  it("routes a business-card visitor to products, reception or office without an account gate", () => {
    for (const href of ["/products", "/start", "/about", "/contact", "/office"])
      expect(markup).toContain('href="' + href + '"');
    expect(markup).toContain("wyatt@novanexus-ai.com");
    expect(markup).toContain("Wyatt Kirby");
    expect(markup).toContain("Terre Haute");
  });
  it("shows a small inspectable catalog rather than unsupported sectors or outcomes", () => {
    expect(markup).toContain("Merchandise sourcing");
    expect(markup).toContain("NovaClean");
    expect(markup).toContain("Workflow Setup Pilot");
    expect(markup).toContain("$150 one-time");
    expect(markup).not.toMatch(
      /live trading|updates every 30 min|before everyone else|guaranteed|\bTrade\s+#\d+\b/i,
    );
  });
  it("does not expose private business records or solicit payment on the front page", () => {
    expect(markup).not.toMatch(
      /cashRecordedByCurrency|buyerConfirmed|accountPolicy|buy\.stripe\.com/,
    );
    expect(markup).not.toContain("/dashboard/trading");
    expect(markup).toContain("written scope");
    expect(markup).toContain("before work or payment begins");
  });
});
