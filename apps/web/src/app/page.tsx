import type { Metadata } from "next";
import Link from "next/link";
import {
  PublicShell,
  ProductArt,
  Arrow,
} from "@/components/public/PublicShell";
import { catalog, business } from "@/lib/public/catalog";
export const metadata: Metadata = {
  title: "Nova Enterprises LLC — Products, sourcing & business tools",
  description:
    "Merchandise sourcing, practical software and scoped business support. Contact Nova about your next project.",
  alternates: { canonical: "/" },
};
export default function Home() {
  const featured = [catalog[0], catalog[1], catalog[3]];
  return (
    <PublicShell>
      <section className="office-hero office-wrap">
        <div>
          <span className="office-label">
            NOVA ENTERPRISES LLC · PRACTICAL BUSINESS SUPPORT
          </span>
          <h1>
            Good business starts
            <br />
            with <em>a clear brief.</em>
          </h1>
          <p className="office-lead">
            Source merchandise, clean up a product file, or put a better
            workflow in place. A small company, useful tools, and a direct line
            to the person doing the work.
          </p>
          <div className="office-actions">
            <Link className="office-button" href="/contact">
              Start a request <Arrow />
            </Link>
            <Link className="office-text-link" href="/products">
              Explore the catalog
            </Link>
          </div>
        </div>
        <aside className="office-reception">
          <span className="office-label">01 / Reception</span>
          <h2>What brings you in?</h2>
          <Link href="/contact?intent=merchandise">
            <b>01</b>
            <span>I’m planning a merchandise order</span>
            <Arrow />
          </Link>
          <Link href="/products?type=Tool">
            <b>02</b>
            <span>I want to use a tool</span>
            <Arrow />
          </Link>
          <Link href="/contact?intent=workflow">
            <b>03</b>
            <span>I need help with a workflow</span>
            <Arrow />
          </Link>
          <p>
            Already working with Nova?{" "}
            <Link
              href="/office"
              style={{
                display: "inline",
                border: 0,
                padding: 0,
                fontSize: "inherit",
              }}
            >
              Enter the office ↗
            </Link>
          </p>
        </aside>
      </section>
      <div className="office-strip">
        <span>DIRECT CONTACT / {business.contact}</span>
        <a href={"mailto:" + business.email}>
          {business.email} <Arrow />
        </a>
        <span>TOOLS YOU CAN TRY · WORK YOU CAN SCOPE</span>
      </div>
      <section className="office-section office-wrap">
        <div className="office-section-heading">
          <div>
            <span className="office-label">02 / The catalog</span>
            <h2>
              A few useful places
              <br />
              to start.
            </h2>
          </div>
          <Link className="office-text-link" href="/products">
            View the full catalog <Arrow />
          </Link>
        </div>
        <div className="office-product-grid">
          {featured.map((p) => (
            <article className="office-product" key={p.slug}>
              <Link
                href={"/products/" + p.slug}
                tabIndex={-1}
                aria-hidden="true"
              >
                <ProductArt kind={p.art} />
              </Link>
              <div className="office-product-meta">
                <span>{p.tag}</span>
                <span>{p.price}</span>
              </div>
              <h3>
                <Link href={"/products/" + p.slug}>{p.name}</Link>
              </h3>
              <p>{p.summary}</p>
              <Link
                className="office-product-link"
                href={"/products/" + p.slug}
              >
                Details & next step <Arrow />
              </Link>
            </article>
          ))}
        </div>
      </section>
      <section className="office-work">
        <div className="office-wrap">
          <div>
            <span className="office-label">03 / How we work</span>
            <h2>
              Clear scope.
              <br />
              An inspectable result.
            </h2>
          </div>
          <ol>
            <li>
              <b>01</b>
              <div>
                <h3>Bring the details.</h3>
                <p>
                  Your product or workflow, quantity, budget and deadline. We’ll
                  identify the questions still open.
                </p>
              </div>
            </li>
            <li>
              <b>02</b>
              <div>
                <h3>Agree the work.</h3>
                <p>
                  A written scope sets the deliverable, price, access and timing
                  before work or payment begins.
                </p>
              </div>
            </li>
            <li>
              <b>03</b>
              <div>
                <h3>Keep what’s useful.</h3>
                <p>
                  Receive the agreed files, comparison or workspace, with a
                  clear handoff and a record of unresolved items.
                </p>
              </div>
            </li>
          </ol>
        </div>
      </section>
      <section className="office-section office-wrap office-note">
        <div>
          <span className="office-label">04 / Behind the desk</span>
          <h2>
            A person you can
            <br />
            actually reach.
          </h2>
        </div>
        <div className="office-lead">
          <p>
            Nova brings together merchandise sourcing, research and practical
            software to organize the work. Start with a clear brief and a direct
            conversation about what you need.
          </p>
          <p>
            You can try the public tools without an account. For a project, we
            start with a brief and agree what’s being delivered.
          </p>
          <div className="office-actions">
            <Link className="office-text-link" href="/about">
              Meet Nova <Arrow />
            </Link>
            <a className="office-text-link" href={"mailto:" + business.email}>
              Email Nova <Arrow />
            </a>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
