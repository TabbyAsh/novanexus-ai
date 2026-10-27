import { business } from "./catalog";

export const intents = [
  {
    id: "merchandise",
    label: "Source merchandise",
    hint: "Product, quantity and delivery date",
  },
  {
    id: "wholesale",
    label: "Discuss wholesale trade",
    hint: "A bulk buying or distribution requirement",
  },
  {
    id: "retail",
    label: "Ask about a product",
    hint: "An item, availability or an existing order",
  },
  {
    id: "supplier",
    label: "Become a supply partner",
    hint: "Products, capabilities and proposed terms",
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
  product?: string;
  website?: string;
};
export const receptionServices: Record<string, string> = {
  merchandise: "MERCHANDISE_SOURCING",
  wholesale: "WHOLESALE_TRADE",
  retail: "RETAIL_PRODUCT",
  supplier: "SUPPLIER_PARTNERSHIP",
  workflow: "GENERAL_INQUIRY",
  cleanup: "CATALOG_CLEANUP",
  research: "RESEARCH_SERVICE",
  support: "SUPPORT_REQUEST",
  other: "GENERAL_INQUIRY",
};

export function needsDeliveryBrief(intent: string) {
  return intent === "merchandise" || intent === "wholesale";
}

export function validateBrief(f: ReceptionForm) {
  const errors: string[] = [];
  if (!intents.some((x) => x.id === f.intent))
    errors.push("Choose the kind of request.");
  if (f.name.trim().length < 2 || f.name.trim().length > 100) errors.push("Enter your name using 2 to 100 characters.");
  if (f.email.trim().length > 254 || f.email.includes("..") || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim()))
    errors.push("Enter a valid email address.");
  if (f.business.trim().length < 2 || f.business.trim().length > 160)
    errors.push("Enter your business or project using 2 to 160 characters.");
  if (f.need.trim().length < 20 || f.need.trim().length > 2000)
    errors.push("Describe what you need using 20 to 2,000 characters.");
  if (
    needsDeliveryBrief(f.intent) &&
    (!f.quantity.trim() || !f.destination.trim())
  )
    errors.push("Add the quantity and delivery destination for merchandise.");
  if (f.quantity.trim().length > 120 || f.destination.trim().length > 240
    || f.budget.trim().length > 160 || f.deadline.trim().length > 80
    || (f.product?.trim().length || 0) > 160)
    errors.push("Shorten the product, quantity, destination, budget or deadline to fit the stated limits.");
  if (f.website?.trim()) {
    try {
      const url = new URL(f.website.trim());
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || f.website.trim().length > 500) throw new Error();
    } catch { errors.push("Use a complete http or https business website without login details."); }
  }
  return errors;
}

export function buildReceptionInquiry(f: ReceptionForm, requestId: string) {
  const errors = validateBrief(f);
  if (errors.length) throw new Error(errors.join(" "));
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(requestId)) throw new Error("A valid request reference is required.");
  const roles: Record<string, string> = {
    merchandise: "buyer", wholesale: "buyer", retail: "retail-customer",
    supplier: "supplier", research: "research-client",
  };
  const details = Object.fromEntries(Object.entries({
    role: roles[f.intent],
    product: ['merchandise', 'wholesale', 'retail', 'supplier'].includes(f.intent) ? f.product : undefined,
    quantity: needsDeliveryBrief(f.intent) ? f.quantity : undefined,
    destination: needsDeliveryBrief(f.intent) ? f.destination : undefined,
    budget: f.budget, deadline: f.deadline,
    website: f.intent === 'supplier' ? f.website : undefined,
  }).filter(([, value]) => typeof value === "string" && value.trim()).map(([key, value]) => [key, value!.trim()]));
  return {
    name: f.name.trim(), email: f.email.trim().toLowerCase(), business: f.business.trim(),
    challenge: f.need.trim(), serviceCode: receptionServices[f.intent], requestId, details,
  };
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
    ...(['merchandise', 'wholesale', 'retail', 'supplier'].includes(f.intent) && f.product?.trim() ? ["Product / SKU: " + f.product.trim()] : []),
    ...(f.intent === 'supplier' && f.website?.trim() ? ["Website: " + f.website.trim()] : []),
    "",
    "What I need:",
    f.need.trim(),
    ...(needsDeliveryBrief(f.intent)
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
