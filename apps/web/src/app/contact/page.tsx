import type { Metadata } from "next";
import { PublicShell, PageIntro } from "@/components/public/PublicShell";
import Reception from "@/components/public/Reception";
import { business } from "@/lib/public/catalog";
export const metadata: Metadata = {
  title: "Contact — Nova Enterprises",
  description:
    "Contact Nova Enterprises with a merchandise, workflow, catalog or research brief.",
  alternates: { canonical: "/contact" },
};
export default function Contact() {
  return (
    <PublicShell current="contact">
      <PageIntro eyebrow="Reception" title="Let’s get the brief right.">
        <p>
          Tell us what you’re trying to get done. We’ll establish the fit, scope
          and next step before making commitments.
        </p>
      </PageIntro>
      <section className="office-contact office-wrap">
        <aside>
          <span className="office-label">Direct contact</span>
          <h3 style={{ marginTop: 15 }}>Nova Enterprises</h3>
          <a className="office-email" href={"mailto:" + business.email}>
            {business.email}
          </a>
          <p className="office-small">
            Nova Enterprises LLC
            <br />
            {business.location}
          </p>
          <p className="office-small" style={{ marginTop: 25 }}>
            For a merchandise order, include quantity, specification,
            destination, budget and the date you need it. For an existing
            request, include its receipt ID.
          </p>
          <details style={{ marginTop: 25 }}>
            <summary>What happens after I send it?</summary>
            <p>
              Nova reviews the brief and replies about fit and missing details.
              A written scope or supplier-backed quote comes before payment, an
              order or work. No response time or availability is implied by this
              form.
            </p>
          </details>
        </aside>
        <Reception />
      </section>
    </PublicShell>
  );
}
