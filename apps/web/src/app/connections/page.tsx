import type { Metadata } from "next";
import { PublicShell, PageIntro } from "@/components/public/PublicShell";
import Connections from "@/components/public/Connections";
export const metadata: Metadata = {
  title: "Connections & setup — Nova Enterprises",
  description:
    "Check Nova backend availability and your signed-in account’s integration status. Choose the setup path for your use case.",
  robots: { index: false, follow: true },
};
export default function Setup() {
  return (
    <PublicShell>
      <PageIntro
        eyebrow="Setup & connections"
        title="Connect what the job needs."
      >
        <p>
          Public tools work without account access. For an existing Nova
          account, check the connection before relying on it.
        </p>
      </PageIntro>
      <Connections />
    </PublicShell>
  );
}
