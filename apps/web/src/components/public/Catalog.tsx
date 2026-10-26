"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { catalog } from "@/lib/public/catalog";
import { ProductArt, Arrow } from "./PublicShell";
export default function Catalog() {
  const [type, setType] = useState("All");
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("type");
    if (v === "Tool" || v === "Service") setType(v);
  }, []);
  const rows = catalog.filter((p) => type === "All" || p.kind === type);
  return (
    <section className="office-catalog office-wrap">
      <div className="office-filters" role="group" aria-label="Catalog type">
        {[
          ["All", "Everything"],
          ["Tool", "Use a tool"],
          ["Service", "Request work"],
        ].map(([v, label]) => (
          <button key={v} aria-pressed={type === v} onClick={() => setType(v)}>
            {label}
          </button>
        ))}
      </div>
      <div className="office-product-grid">
        {rows.map((p) => (
          <article className="office-product" key={p.slug}>
            <ProductArt kind={p.art} />
            <div className="office-product-meta">
              <span>{p.tag}</span>
              <span>{p.price}</span>
            </div>
            <h3>
              <Link href={"/products/" + p.slug}>{p.name}</Link>
            </h3>
            <p>{p.summary}</p>
            <Link className="office-product-link" href={"/products/" + p.slug}>
              View product <Arrow />
            </Link>
          </article>
        ))}
      </div>
      <p className="office-small office-source-note">
        Tools marked “browser tool” run locally in your tab. Service prices
        cover the stated scope; merchandise is quoted to specification. Product
        availability, supplier terms and delivery dates are confirmed before an
        order.
      </p>
    </section>
  );
}
