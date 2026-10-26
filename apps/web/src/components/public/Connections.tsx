"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
type Check = { label: string; status: string; detail: string };
export default function Connections() {
  const [health, setHealth] = useState<any>(null),
    [checks, setChecks] = useState<Check[]>([]),
    [busy, setBusy] = useState(false),
    [checked, setChecked] = useState(""),
    [message, setMessage] = useState("");
  async function check() {
    setBusy(true);
    setMessage("");
    setChecks([]);
    try {
      const r = await fetch("/api/public-status", {
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) throw Error("Website check failed");
      setHealth(await r.json());
    } catch {
      setHealth({
        gateway: "unavailable",
        website: "not verified",
        checkedAt: new Date().toISOString(),
      });
    }
    if (!api.isAuthenticated()) {
      setMessage(
        "Sign in to your Nova account to check its providers and permissions. Public tools need no account.",
      );
      setBusy(false);
      return;
    }
    const calls = await Promise.allSettled([
      api.getMe(),
      api.getMarketStatus(),
      api.getAlpacaStatus(),
      api.getAIScreenerStatus(),
      api.getBillingEntitlement(),
    ]);
    const value = (i: number): any =>
      calls[i].status === "fulfilled"
        ? (calls[i] as PromiseFulfilledResult<any>).value
        : null;
    const me = value(0),
      market = value(1),
      broker = value(2),
      ai = value(3),
      bill = value(4);
    const result: Check[] = [
      {
        label: "Nova account",
        status: me?.success ? "Signed in" : "Not verified",
        detail: me?.success
          ? "Account permissions loaded."
          : "The saved session could not be verified. Sign in again.",
      },
    ];
    result.push({
      label: "Market data",
      status: market?.success
        ? market.data?.activeDataClass || "Status returned"
        : "Not verified",
      detail: market?.success
        ? (market.data?.providers || [])
            .map((p: any) => p.name + ": " + p.health)
            .join(" · ") || "No provider detail returned."
        : "Provider status could not be checked.",
    });
    result.push({
      label: "Broker connection",
      status:
        broker?.success && broker.data?.connected
          ? "Connected (" +
            (broker.data.environment ||
              broker.data.mode ||
              "environment unconfirmed") +
            ")"
          : broker?.success
            ? "Not connected"
            : "Not verified",
      detail:
        "Connection status does not authorize orders. This page performs no trade or account change.",
    });
    result.push({
      label: "AI features",
      status: ai?.success
        ? ai.data?.ready
          ? "Ready per backend"
          : "Not ready"
        : "Not verified",
      detail: "Configuration status only. No AI generation was requested.",
    });
    result.push({
      label: "Billing",
      status: bill?.success
        ? bill.data?.entitlement?.status || "Status returned"
        : "Not verified",
      detail: bill?.success
        ? "Manage the existing account in settings. No subscription starts here."
        : "Billing status could not be checked.",
    });
    setChecks(result);
    setChecked(new Date().toISOString());
    setBusy(false);
  }
  useEffect(() => {
    check();
  }, []);
  return (
    <section className="office-wrap" style={{ paddingBottom: 75 }}>
      <div className="office-health">
        <span className="office-label">Current connection check</span>
        <h2>What’s actually responding?</h2>
        <dl>
          <dt>Website</dt>
          <dd>{health?.website || "Checking…"}</dd>
          <dt>Nova backend</dt>
          <dd>{health?.gateway || "Checking…"}</dd>
          <dt>Checked</dt>
          <dd>
            {health?.checkedAt
              ? new Date(health.checkedAt).toLocaleString()
              : "Not yet"}
          </dd>
        </dl>
        <p className="office-small" style={{ marginTop: 20 }}>
          Backend availability does not establish that every tool, provider or
          account is connected.
        </p>
      </div>
      {message && (
        <p className="office-small" role="status">
          {message}
        </p>
      )}
      <div
        className="office-actions"
        style={{ marginTop: 22, marginBottom: 35 }}
      >
        <button className="office-button" onClick={check} disabled={busy}>
          {busy ? "Checking…" : "Check again"}
        </button>
        <Link className="office-text-link" href="/login">
          Sign in to Nova ↗
        </Link>
        <Link className="office-text-link" href="/dashboard/settings">
          Account connection settings ↗
        </Link>
      </div>
      {checks.map((c) => (
        <div className="office-directory-row" key={c.label}>
          <span className="office-label">Account</span>
          <h3>{c.label}</h3>
          <p>{c.detail}</p>
          <strong style={{ fontSize: 12, textAlign: "right" }}>
            {c.status}
          </strong>
        </div>
      ))}
      {checked && (
        <p className="office-small">
          Account status checked {new Date(checked).toLocaleString()}. Status is
          an observation, not permission to act.
        </p>
      )}
      <div className="office-source-note">
        <h3>Connect for a specific use</h3>
        <details>
          <summary>I want to clean a catalog file</summary>
          <p>
            No integration is required. Open{" "}
            <Link href="/tools/novaclean">NovaClean</Link>, choose a local file
            and export the results. A separate agreement is needed before any
            live store change.
          </p>
        </details>
        <details>
          <summary>I want market research in my Nova account</summary>
          <p>
            Sign in, open account settings, and inspect the provider status and
            data latency before using the account’s market workspace. A
            reachable API does not establish real-time data. Trading permissions
            remain separate.
          </p>
        </details>
        <details>
          <summary>I want business documents or an automation set up</summary>
          <p>
            Start a project brief or the Workflow Setup Pilot. Agree the output
            and required access first. Google Drive, email, CRM and store
            permissions are arranged per project; this public website does not
            automatically connect them.
          </p>
        </details>
        <details>
          <summary>I want help with an existing order or invoice</summary>
          <p>
            Email Wyatt with the receipt or reference number. Payment links or
            account billing are used only after the applicable scope is
            accepted. Never send card credentials through a project brief.
          </p>
        </details>
      </div>
    </section>
  );
}
