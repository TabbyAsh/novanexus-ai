import { business } from "./catalog";

export const intents = [
  {
    id: "merchandise",
    label: "Source merchandise",
    hint: "Product, quantity and delivery date",
  },
  {
    id: "workflow",
    label: "Set up a workflow",
    hint: "Customer intake, files and follow-up",
  },
  {
    id: "cleanup",
    label: "Review a product file",
    hint: "Catalog and spreadsheet cleanup",
  },
  {
    id: "research",
    label: "Research a buying decision",
    hint: "Suppliers, products and sources",
  },
  {
    id: "support",
    label: "Get help with Nova",
    hint: "A tool, account or existing request",
  },
  {
    id: "other",
    label: "Something else",
    hint: "Describe the job in your own words",
  },
] as const;
export type ReceptionForm = {
  intent: string;
  name: string;
  email: string;
  business: string;
  need: string;
  quantity: string;
  destination: string;
  budget: string;
  deadline: string;
};
export function validateBrief(f: ReceptionForm) {
  const errors: string[] = [];
  if (!intents.some((x) => x.id === f.intent))
    errors.push("Choose the kind of request.");
  if (f.name.trim().length < 2) errors.push("Enter your name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim()))
    errors.push("Enter a valid email address.");
  if (f.need.trim().length < 20)
    errors.push("Describe what you need in at least 20 characters.");
  if (
    f.intent === "merchandise" &&
    (!f.quantity.trim() || !f.destination.trim())
  )
    errors.push("Add the quantity and delivery destination for merchandise.");
  return errors;
}
export function formatBrief(f: ReceptionForm) {
  const label =
    intents.find((i) => i.id === f.intent)?.label || "Business inquiry";
  return [
    "NOVA REQUEST / " + label,
    "",
    "Name: " + f.name.trim(),
    "Reply email: " + f.email.trim(),
    "Business: " + (f.business.trim() || "Not provided"),
    "",
    "What I need:",
    f.need.trim(),
    ...(f.intent === "merchandise"
      ? [
          "",
          "Quantity / variants: " + f.quantity.trim(),
          "Delivery destination: " + f.destination.trim(),
        ]
      : []),
    "",
    "Budget: " + (f.budget.trim() || "To be discussed"),
    "In-hand date / deadline: " + (f.deadline.trim() || "To be discussed"),
    "",
    "Please review fit and scope before any paid work or order.",
  ].join("\n");
}
export function emailBriefUrl(f: ReceptionForm) {
  const label =
    intents.find((i) => i.id === f.intent)?.label || "Business inquiry";
  return (
    "mailto:" + business.email + "?subject=" +
    encodeURIComponent("Nova request: " + label) +
    "&body=" +
    encodeURIComponent(formatBrief(f))
  );
}
