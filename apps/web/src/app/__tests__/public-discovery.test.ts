import robots from "../robots";
import sitemap from "../sitemap";
import { catalog } from "@/lib/public/catalog";
describe("public discovery metadata", () => {
  it("advertises the canonical domain and excludes private account areas", () => {
    const p = robots();
    expect(p.host).toBe("https://novanexus-ai.com");
    expect(p.sitemap).toBe("https://novanexus-ai.com/sitemap.xml");
    expect(p.rules).toEqual(
      expect.objectContaining({
        disallow: expect.arrayContaining([
          "/api/",
          "/dashboard/",
          "/office",
          "/connections",
        ]),
      }),
    );
  });
  it("indexes product details and public tools, with no private workspaces in the sitemap", () => {
    const urls = sitemap().map((e) => e.url);
    for (const path of [
      "/products",
      "/contact",
      "/about",
      "/start",
      "/tools/novaclean",
      "/loop",
      "/services/workflow-setup",
      "/privacy",
      "/terms",
      ...catalog.map((p) => "/products/" + p.slug),
    ])
      expect(urls).toContain("https://novanexus-ai.com" + path);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls.join("\n")).not.toMatch(
      /dashboard|chatgpt\.site|\/office|\/connections|\/api/,
    );
  });
});
