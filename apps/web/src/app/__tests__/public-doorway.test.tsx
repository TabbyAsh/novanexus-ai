import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import HomePage from "../page";
import Office from "../office/page";
import About from "../about/page";
import Contact from "../contact/page";
describe("Nova public office doorway", () => {
  const markup = renderToStaticMarkup(<HomePage />);
  it("routes a business-card visitor to products, reception or office without an account gate", () => {
    for (const href of ["/products", "/start", "/about", "/contact", "/office"])
      expect(markup).toContain('href="' + href + '"');
    expect(markup).toContain("wyatt@novanexus-ai.com");
    expect(markup).toContain("Nova Enterprises LLC");
  });
  it("keeps personal names and private workspace destinations off public pages", () => {
    for (const page of [markup, renderToStaticMarkup(<Office/>), renderToStaticMarkup(<About/>), renderToStaticMarkup(<Contact/>)]) {
      expect(page).not.toMatch(/synthetic-desk|synthetic-atlas|libfile_/i);
    }
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
