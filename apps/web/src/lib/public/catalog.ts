export const business = {
  name: "Nova Enterprises LLC",
  shortName: "Nova",
  contact: "Wyatt Kirby",
  email: "wyatt@novanexus-ai.com",
  location: "Terre Haute, Indiana",
  origin: "https://novanexus-ai.com",
} as const;
export const catalog = [
  {
    slug: "merchandise-sourcing",
    name: "Merchandise sourcing",
    kind: "Service",
    tag: "Made to order",
    price: "Quoted to your brief",
    summary: "Compare suitable producers for your next branded order.",
    description:
      "Start with one product, a quantity, an existing design, a destination and an in-hand date. Nova can help compare supplier replies and what each quote actually includes.",
    includes: [
      "One agreed product specification and quantity",
      "Supplier comparison with source dates and quote conditions",
      "Product, decoration, freight and timing questions in one brief",
      "A recommendation or a clear no-fit finding",
    ],
    limits:
      "Samples, stock, supplier pricing and production capacity are confirmed per order. A sourcing request is not a product order. Any sourcing fee or supplier-paid referral is disclosed and agreed before work.",
    action: "Prepare a sourcing brief",
    href: "/contact?intent=merchandise",
    art: "goods",
  },
  {
    slug: "novaclean",
    name: "NovaClean",
    kind: "Tool",
    tag: "Browser tool",
    price: "Free to use",
    summary: "Clean a CSV. Keep the original. See every change.",
    description:
      "Review a catalog export without uploading it. Trim spacing, flag missing identifiers and conflicting duplicates, then download the cleaned file, issue report and change log.",
    includes: [
      "CSV, tab and semicolon-separated input",
      "Optional SKU and decimal-price checks",
      "Original rows and ambiguous values preserved",
      "Spreadsheet-safe CSV exports",
    ],
    limits:
      "Runs in the current browser tab, up to 1 MB and 5,000 data rows. No live store connection or automatic inventory update. Download before leaving.",
    action: "Open NovaClean",
    href: "/tools/novaclean",
    art: "clean",
  },
  {
    slug: "auction-desk",
    name: "Auction Desk",
    kind: "Tool",
    tag: "Public beta",
    price: "Free to use",
    summary: "Put the whole cost beside the auction bid.",
    description:
      "A purchase worksheet for visible goods: record your source, resale scenarios, taxes, rental, transport, disposal, selling costs and the cash tied up in a deposit.",
    includes: [
      "Low, middle and high operator scenarios",
      "Cash cap and conditional bid-ceiling calculation",
      "Refundable deposits separate from expenses",
      "Forecast and outcome records with local export",
    ],
    limits:
      "This public tool uses your entered evidence. It does not fetch live auctions, establish appraised values or place bids. Nova’s private auction finder is a separate workspace.",
    action: "Open Auction Desk",
    href: "/tools/auction-desk/index.html",
    art: "auction",
  },
  {
    slug: "workflow-setup",
    name: "Workflow Setup Pilot",
    kind: "Service",
    tag: "Fixed scope",
    price: "$150 one-time",
    summary: "One cleaner path from customer intake to follow-up.",
    description:
      "A human-delivered setup for one accepted admin workflow, with a client-owned workspace and practical templates. Review the exact scope before making a request.",
    includes: [
      "A workflow map and client-owned workspace structure",
      "Estimate and invoice templates",
      "Customer-intake form and follow-up scripts",
      "Combined expense and open-work tracker",
    ],
    limits:
      "Work starts after written scope acceptance and required access. No subscription or software license is included. The existing intake issues a receipt only after the inquiry is recorded.",
    action: "View scope & request setup",
    href: "/services/workflow-setup",
    art: "workflow",
  },
  {
    slug: "catalog-cleanup",
    name: "Catalog cleanup",
    kind: "Service",
    tag: "Scoped delivery",
    price: "$150 pilot",
    summary: "A reviewable product catalog, ready for your next step.",
    description:
      "For a file that needs a person’s review: one CSV or spreadsheet export, up to 250 rows and 12 columns, cleaned against an agreed target schema.",
    includes: [
      "Agreed formatting and category rules",
      "Duplicate, missing-value and price exceptions",
      "Cleaned CSV, exception report and change log",
      "One consolidated clarification revision",
    ],
    limits:
      "No live-store overwrite, invented product data or complex migration. Scope, turnaround and contracting details are confirmed before accepting payment.",
    action: "Request a file review",
    href: "/contact?intent=cleanup",
    art: "clean",
  },
  {
    slug: "research-brief",
    name: "Buyer research brief",
    kind: "Service",
    tag: "Decision support",
    price: "$150 pilot",
    summary: "One purchasing question. Sources you can inspect.",
    description:
      "A narrow research project around one product category and one destination market. Compare relevant suppliers or channels and identify the evidence still missing.",
    includes: [
      "Five to eight relevant primary sources with dates",
      "Up to five supplier, competitor or channel comparisons",
      "A short decision brief and comparison sheet",
      "One consolidated clarification revision",
    ],
    limits:
      "No promised savings, demand or profit. Supplier quotes, audits, legal advice and customs opinions require separate confirmation or specialists.",
    action: "Describe your question",
    href: "/contact?intent=research",
    art: "research",
  },
  {
    slug: "nova-loop",
    name: "Nova Loop",
    kind: "Tool",
    tag: "Browser tool",
    price: "Free to use",
    summary: "Turn a scattered situation into a portable work record.",
    description:
      "Notice what changed, frame the decision, choose an action, define evidence and record the result. Copy or download the finished record.",
    includes: [
      "Five guided steps",
      "Owner, constraints and evidence fields",
      "Copy and download",
      "No account or AI call required",
    ],
    limits:
      "Your draft stays in this browser tab. Reloading or closing loses it unless you export it.",
    action: "Start a loop",
    href: "/loop",
    art: "loop",
  },
] as const;
export type CatalogItem = (typeof catalog)[number];
