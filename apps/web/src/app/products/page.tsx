import type { Metadata } from "next";
import { PublicShell, PageIntro } from "@/components/public/PublicShell";
import Catalog from "@/components/public/Catalog";
export const metadata: Metadata = {
  title: "Catalog — Nova Enterprises",
  description:
    "Try NovaClean and Auction Desk, or scope merchandise sourcing, research and workflow setup.",
  alternates: { canonical: "/products" },
};
export default function Products() {
  return (
    <PublicShell current="products">
      <PageIntro eyebrow="The catalog" title="Useful on day one.">
        <p>
          Choose a tool you can use now, or a piece of work we can scope
          together. Each listing says what’s included and how to start.
        </p>
      </PageIntro>
      <Catalog />
    </PublicShell>
  );
}
