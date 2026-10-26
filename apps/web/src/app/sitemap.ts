import type { MetadataRoute } from "next";
import { catalog, business } from "@/lib/public/catalog";
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: business.origin, changeFrequency: "weekly", priority: 1 },
    ...[
      "/products",
      "/contact",
      "/about",
      "/start",
      "/tools/novaclean",
      "/loop",
      "/services/workflow-setup",
    ].map((path) => ({
      url: business.origin + path,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    ...catalog.map((p) => ({
      url: business.origin + "/products/" + p.slug,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    ...["/privacy", "/terms"].map((path) => ({
      url: business.origin + path,
      changeFrequency: "yearly" as const,
      priority: 0.2,
    })),
  ];
}
