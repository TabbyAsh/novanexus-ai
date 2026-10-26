"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  intents,
  formatBrief,
  emailBriefUrl,
  validateBrief,
  type ReceptionForm,
} from "@/lib/public/reception";
import { Arrow } from "./PublicShell";
const blank: ReceptionForm = {
  intent: "",
  name: "",
  email: "",
  business: "",
  need: "",
  quantity: "",
  destination: "",
  budget: "",
  deadline: "",
};
export default function Reception() {
  const [f, setF] = useState<ReceptionForm>(blank),
    [step, setStep] = useState(1),
    [errors, setErrors] = useState<string[]>([]),
    [message, setMessage] = useState("");
  useEffect(() => {
    const i = new URLSearchParams(window.location.search).get("intent");
    if (intents.some((x) => x.id === i)) setF((v) => ({ ...v, intent: i! }));
  }, []);
  function field(k: keyof ReceptionForm, v: string) {
    setF((f) => ({ ...f, [k]: v }));
    setErrors([]);
    setMessage("");
  }
  function next() {
    if (step === 1 && !f.intent) {
      setErrors(["Choose what you need help with."]);
      return;
    }
    if (step === 2) {
      const e = validateBrief(f);
      setErrors(e);
      if (e.length) return;
    }
    setStep((s) => s + 1);
  }
  function download() {
    const url = URL.createObjectURL(
        new Blob([formatBrief(f)], { type: "text/plain;charset=utf-8" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = "Nova-Request.txt";
    a.click();
    URL.revokeObjectURL(url);
    setMessage("Brief downloaded. It has not been sent.");
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(formatBrief(f));
      setMessage("Brief copied. Paste it into an email to Wyatt.");
    } catch {
      setMessage(
        "Copy was unavailable. Use Download brief or select the text below.",
      );
    }
  }
  return (
    <div className="office-form-panel">
      <div className="office-step" aria-label="Request steps">
        {["Choose", "Details", "Review"].map((t, i) => (
          <span key={t} aria-current={step === i + 1 ? "step" : undefined}>
            0{i + 1} / {t}
          </span>
        ))}
      </div>
      {errors.length > 0 && (
        <div className="office-error" role="alert">
          {errors.map((e) => (
            <p key={e}>{e}</p>
          ))}
        </div>
      )}
      {step === 1 ? (
        <>
          <span className="office-label">A useful starting point</span>
          <h2>What do you need?</h2>
          <div className="office-options">
            {intents.map((i) => (
              <button
                type="button"
                key={i.id}
                aria-pressed={f.intent === i.id}
                onClick={() => field("intent", i.id)}
              >
                {i.label}
                <small>{i.hint}</small>
              </button>
            ))}
          </div>
          <div className="office-actions">
            <button className="office-button" onClick={next}>
              Continue <Arrow />
            </button>
          </div>
          <p className="office-small" style={{ marginTop: 20 }}>
            Your draft stays in this tab. No account is needed and no paid work
            starts here.
          </p>
        </>
      ) : step === 2 ? (
        <>
          <h2>Give us the essentials.</h2>
          {f.intent === "workflow" && (
            <div className="office-success" style={{ marginBottom: 25 }}>
              <strong>The $150 Workflow Setup Pilot has its own intake.</strong>
              <p className="office-small">
                It records your request in Nova’s inquiry queue and returns a
                receipt.
              </p>
              <Link
                className="office-text-link"
                href="/services/workflow-setup#intake"
              >
                Open the pilot intake ↗
              </Link>
              <p className="office-small">
                For a different workflow project, use the brief below.
              </p>
            </div>
          )}
          <div className="office-form-grid">
            <label className="office-field">
              Your name *
              <input
                autoComplete="name"
                maxLength={100}
                value={f.name}
                onChange={(e) => field("name", e.target.value)}
              />
            </label>
            <label className="office-field">
              Email *
              <input
                type="email"
                autoComplete="email"
                maxLength={254}
                value={f.email}
                onChange={(e) => field("email", e.target.value)}
              />
            </label>
          </div>
          <label className="office-field">
            Business or project
            <input
              maxLength={150}
              autoComplete="organization"
              value={f.business}
              onChange={(e) => field("business", e.target.value)}
            />
          </label>
          <label className="office-field">
            What would a useful result look like? *
            <textarea
              maxLength={1800}
              value={f.need}
              onChange={(e) => field("need", e.target.value)}
              placeholder={
                f.intent === "merchandise"
                  ? "Product, material, decoration, intended use and any must-haves."
                  : f.intent === "support"
                    ? "Tool or account, what you expected and what happened. Include a receipt ID if you have one."
                    : "Describe the job, what you have now, and what you need delivered."
              }
            />
          </label>
          {f.intent === "merchandise" && (
            <div className="office-form-grid">
              <label className="office-field">
                Quantity and variants *
                <input
                  value={f.quantity}
                  maxLength={160}
                  onChange={(e) => field("quantity", e.target.value)}
                  placeholder="250 units, sizes / colors"
                />
              </label>
              <label className="office-field">
                Delivery destination *
                <input
                  value={f.destination}
                  maxLength={180}
                  onChange={(e) => field("destination", e.target.value)}
                  placeholder="City, state / country and postal code"
                />
              </label>
            </div>
          )}
          <div className="office-form-grid">
            <label className="office-field">
              Budget and currency
              <input
                maxLength={100}
                value={f.budget}
                onChange={(e) => field("budget", e.target.value)}
                placeholder="A range is useful"
              />
            </label>
            <label className="office-field">
              Deadline or in-hand date
              <input
                maxLength={100}
                value={f.deadline}
                onChange={(e) => field("deadline", e.target.value)}
                placeholder="Date, or flexible"
              />
            </label>
          </div>
          <p className="office-small">
            Please leave out passwords, payment details and files containing
            personal information. We’ll agree how to share necessary files after
            reviewing the scope.
          </p>
          <div className="office-actions">
            <button className="office-button" onClick={next}>
              Review brief <Arrow />
            </button>
            <button className="office-outline" onClick={() => setStep(1)}>
              Back
            </button>
          </div>
        </>
      ) : (
        <>
          <span className="office-label">Ready for your review</span>
          <h2>Your request, in one place.</h2>
          <pre className="office-review">{formatBrief(f)}</pre>
          <p className="office-small" style={{ marginTop: 20 }}>
            “Email Wyatt” opens your email app with this brief. You review and
            send it there. This page does not submit or store it in Nova’s
            inquiry queue.
          </p>
          <div className="office-actions">
            <a className="office-button" href={emailBriefUrl(f)}>
              Email Wyatt <Arrow />
            </a>
            <button className="office-outline" onClick={copy}>
              Copy brief
            </button>
            <button className="office-outline" onClick={download}>
              Download brief
            </button>
            <button className="office-outline" onClick={() => setStep(2)}>
              Edit
            </button>
          </div>
          {message && (
            <p className="office-small" style={{ marginTop: 15 }} role="status">
              {message}
            </p>
          )}
        </>
      )}
    </div>
  );
}
