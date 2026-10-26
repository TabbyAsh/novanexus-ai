import type { Metadata } from "next";
import Link from "next/link";
import { PublicShell, PageIntro, Arrow } from "@/components/public/PublicShell";
export const metadata: Metadata = {
  title: "The office — Nova Enterprises",
  description:
    "A directory for Nova clients, public tools and account settings.",
  robots: { index: false, follow: true },
};
const rooms = [
  [
    "Reception",
    "Start or follow up on merchandise, research, catalog and workflow requests.",
    "/contact",
    "Start a request",
  ],
  [
    "Tools & products",
    "Public browser tools and the exact scope of Nova’s services.",
    "/products",
    "Open catalog",
  ],
  [
    "Account workspace",
    "Existing Nova account, saved work and account-specific features. Sign-in required.",
    "/login",
    "Sign in",
  ],
  [
    "Connections & setup",
    "Check the backend and the integrations available to your signed-in account.",
    "/connections",
    "Check connections",
  ],

];
export default function Office() {
  return (
    <PublicShell>
      <PageIntro eyebrow="Office directory" title="Everything has a place.">
        <p>
          Choose a service or public tool. Your account has its own sign-in.
        </p>
      </PageIntro>
      <section className="office-directory office-wrap">
        {rooms.map(([name, detail, href, label], i) => (
          <div className="office-directory-row" key={name}>
            <span className="office-label">0{i + 1}</span>
            <h3>{name}</h3>
            <p>{detail}</p>
            <Link href={href}>
              {label} <Arrow />
            </Link>
          </div>
        ))}
      </section>
    </PublicShell>
  );
}
