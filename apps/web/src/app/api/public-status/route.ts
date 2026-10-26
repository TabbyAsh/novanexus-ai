import { NextResponse } from "next/server";
import { resolveBackendUrl } from "@/lib/backend-url";
export const dynamic = "force-dynamic";
export async function GET() {
  const checkedAt = new Date().toISOString(),
    base = resolveBackendUrl();
  let gateway = "unavailable";
  if (base)
    try {
      const r = await fetch(new URL("/health", base), {
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(6000),
      });
      const d = await r.json();
      if (r.ok && d.status === "healthy" && d.service === "gateway")
        gateway = "responding";
    } catch {
    gateway = "unavailable";
  }
  return NextResponse.json(
    {
      checkedAt,
      website: "responding",
      gateway,
      scope:
        "Connectivity check only; each account integration requires its own check.",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
