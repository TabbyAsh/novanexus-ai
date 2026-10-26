import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { catalog } from "@/lib/public/catalog";
import {
  PublicShell,
  PageIntro,
  ProductArt,
  Arrow,
} from "@/components/public/PublicShell";
export function generateStaticParams() {
  return catalog.map((p) => ({ slug: p.slug }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const p = catalog.find((p) => p.slug === slug);
  return {
    title: p ? p.name + " — Nova Enterprises" : "Product not found",
    description: p?.summary,
    alternates: { canonical: "/products/" + slug },
  };
}
export default async function Product({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params,
    p = catalog.find((p) => p.slug === slug);
  if (!p) notFound();
  return (
    <PublicShell current="products">
      <PageIntro eyebrow={p.kind + " / " + p.tag} title={p.name}>
        <p>{p.summary}</p>
      </PageIntro>
      <section className="office-detail office-wrap">
        <div>
          <Link className="office-back" href="/products">
            ← Back to catalog
          </Link>
          <p className="office-lead">{p.description}</p>
          <h2>What’s included</h2>
          <ul>
            {p.includes.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <div className="office-limits">{p.limits}</div>
          <div className="office-actions">
            <Link className="office-button" href={p.href}>
              {p.action}
              <Arrow />
            </Link>
          </div>
        </div>
        <aside>
          <ProductArt kind={p.art} />
          <div style={{ padding: "24px 0" }}>
            <span className="office-label">Price</span>
            <p className="office-price">{p.price}</p>
            <p className="office-small" style={{ marginTop: 15 }}>
              {p.kind === "Tool"
                ? "Open the tool directly. No paid account is required."
                : "Start with a scope review. Sending a brief does not place an order or start paid work."}
            </p>
          </div>
        </aside>
      </section>
    </PublicShell>
  );
}
