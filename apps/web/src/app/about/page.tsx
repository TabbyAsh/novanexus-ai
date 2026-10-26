import type { Metadata } from "next";
import Link from "next/link";
import { PublicShell, PageIntro } from "@/components/public/PublicShell";
import { business } from "@/lib/public/catalog";
export const metadata: Metadata = {
  title: "About Nova — Wyatt Kirby",
  description:
    "Nova Enterprises LLC brings together merchandise sourcing, research and practical software. Based in Terre Haute, Indiana.",
  alternates: { canonical: "/about" },
};
export default function About() {
  return (
    <PublicShell current="about">
      <PageIntro
        eyebrow="About Nova"
        title="A small company. A direct relationship."
      />
      <section className="office-about office-wrap">
        <h2>Hi, I’m Wyatt.</h2>
        <p>
          I’m Wyatt Kirby, based in Terre Haute, Indiana. I’m building Nova
          Enterprises around practical work: finding suitable products and
          suppliers, organizing messy information, and building tools that make
          the next job easier.
        </p>
        <p>
          This website is the front desk. You can inspect the catalog, use the
          public tools, prepare a request, and reach me directly. If we work
          together, we agree the scope, price and delivery before anything
          begins.
        </p>
        <h2>What you can expect</h2>
        <p>
          Source dates beside research. Supplier conditions beside prices.
          Changes recorded when a file is cleaned. A clear distinction between a
          quote, a decision and a completed result.
        </p>
        <p>
          The public catalog reflects what can be tried or scoped now. It
          doesn’t represent stocked merchandise, an established supplier
          relationship or a guarantee of business results.
        </p>
        <div className="office-actions">
          <Link className="office-button" href="/contact">
            Talk about a project ↗
          </Link>
          <a className="office-text-link" href={"mailto:" + business.email}>
            {business.email}
          </a>
        </div>
      </section>
    </PublicShell>
  );
}
