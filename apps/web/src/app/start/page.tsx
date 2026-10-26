import type { Metadata } from "next";
import Link from "next/link";
import { PublicShell, PageIntro, Arrow } from "@/components/public/PublicShell";
export const metadata: Metadata = {
  title: "Get started — Nova Enterprises",
  description:
    "Choose a tool, prepare a merchandise or project brief, or set up your existing Nova workspace.",
  alternates: { canonical: "/start" },
};
export default function Start() {
  return (
    <PublicShell current="start">
      <PageIntro eyebrow="Get started" title="Choose one job to do first.">
        <p>
          You don’t need to connect accounts to explore Nova. Start with the
          result you need.
        </p>
      </PageIntro>
      <section className="office-guide office-wrap">
        <article>
          <span className="office-label">01</span>
          <h2>Try a tool.</h2>
          <p>
            Clean a CSV, cost an auction purchase or write a work record. The
            public tools open immediately and keep your entries in this tab.
          </p>
          <Link className="office-text-link" href="/products?type=Tool">
            Choose a free tool <Arrow />
          </Link>
        </article>
        <article>
          <span className="office-label">02</span>
          <h2>Request work.</h2>
          <p>
            Prepare a short brief for merchandise sourcing, catalog cleanup,
            research or workflow setup. Review it before sending; scope comes
            before payment.
          </p>
          <Link className="office-text-link" href="/contact">
            Open reception <Arrow />
          </Link>
        </article>
        <article>
          <span className="office-label">03</span>
          <h2>Set up your workspace.</h2>
          <p>
            Existing Nova account? Sign in, check the connections used by your
            workflow, and open the relevant workspace. No integration is marked
            connected without a successful check.
          </p>
          <Link className="office-text-link" href="/connections">
            Check setup & connections <Arrow />
          </Link>
        </article>
      </section>
      <section className="office-wrap" style={{ paddingBottom: 70 }}>
        <h2 style={{ fontSize: 35, marginBottom: 25 }}>
          Pick the output you want.
        </h2>
        {[
          [
            "A supplier comparison",
            "Bring your product, quantity, design, destination, delivered budget and in-hand date.",
            "/contact?intent=merchandise",
            "Prepare brief",
          ],
          [
            "A clean product export",
            "Open NovaClean, load a sample or file, choose identifier and price columns, then export all three reports.",
            "/tools/novaclean",
            "Open tool",
          ],
          [
            "An auction cost boundary",
            "Enter the original source, visible goods, resale evidence, all costs and your cash cap. Unknown values stay unknown.",
            "/tools/auction-desk/index.html",
            "Open worksheet",
          ],
          [
            "A working admin system",
            "Read the five deliverables, complete the pilot intake, retain the receipt and agree the written scope.",
            "/services/workflow-setup",
            "View pilot",
          ],
        ].map(([name, detail, url, label], i) => (
          <div className="office-directory-row" key={name}>
            <span className="office-label">0{i + 1}</span>
            <h3>{name}</h3>
            <p>{detail}</p>
            <Link href={url}>
              {label} <Arrow />
            </Link>
          </div>
        ))}
      </section>
    </PublicShell>
  );
}
