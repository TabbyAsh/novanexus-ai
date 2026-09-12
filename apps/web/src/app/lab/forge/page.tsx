import type { Metadata } from "next";
import InstrumentForge from "./InstrumentForge";
export const metadata: Metadata = {
  title: "Instrument Forge — calculators you can keep | Nova",
  description:
    "Change inputs, inspect the calculation, and download a working offline calculator. Bring your own supported specification.",
  alternates: { canonical: "/lab/forge" },
};
export default function ForgePage() {
  return <InstrumentForge />;
}
