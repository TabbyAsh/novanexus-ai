import type { Metadata } from "next";
import ContrastLab from "./ContrastLab";
export const metadata: Metadata = {
  title: "Nova Contrast Lab — Test the differences that matter",
  description:
    "A local, deterministic lab for finite cases, observations, and expectations.",
  alternates: { canonical: "/lab/contrast" },
};
export default function ContrastPage() {
  return <ContrastLab />;
}
