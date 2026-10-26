import type { Metadata } from "next";
import { PublicShell, PageIntro } from "@/components/public/PublicShell";
import CleanTool from "@/components/public/CleanTool";
export const metadata: Metadata = {
  title: "NovaClean — Browser CSV cleanup",
  description:
    "Clean a CSV locally. Review duplicate identifiers and missing fields, then download a cleaned file, exceptions and change log.",
  alternates: { canonical: "/tools/novaclean" },
};
export default function Clean() {
  return (
    <PublicShell current="products">
      <PageIntro
        eyebrow="NovaClean / Free browser tool"
        title="A cleaner file. Every change visible."
      >
        <p>
          Start with a sample or your own export. Set the checks, review the
          exceptions, and download your results.
        </p>
      </PageIntro>
      <CleanTool />
    </PublicShell>
  );
}
