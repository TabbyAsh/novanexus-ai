import Link from "next/link";
import { business } from "@/lib/public/catalog";
import "./office.css";
export function Arrow() {
  return <span aria-hidden="true">↗</span>;
}
export function Wordmark() {
  return (
    <Link className="office-brand" href="/" aria-label="Nova Enterprises home">
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <path d="M5 30V6h6l14 17V6h6v24h-6L11 13v17Z" fill="currentColor" />
      </svg>
      <span>
        NOVA<small>ENTERPRISES</small>
      </span>
    </Link>
  );
}
export function PublicShell({
  children,
  current,
}: {
  children: React.ReactNode;
  current?: string;
}) {
  return (
    <div className="office-site">
      <a className="office-skip" href="#main-content">
        Skip to content
      </a>
      <header className="office-header">
        <Wordmark />
        <nav aria-label="Main navigation">
          <Link
            href="/products"
            aria-current={current === "products" ? "page" : undefined}
          >
            Catalog
          </Link>
          <Link
            href="/start"
            aria-current={current === "start" ? "page" : undefined}
          >
            Get started
          </Link>
          <Link
            href="/about"
            aria-current={current === "about" ? "page" : undefined}
          >
            About
          </Link>
          <Link
            href="/contact"
            aria-current={current === "contact" ? "page" : undefined}
          >
            Contact
          </Link>
        </nav>
        <Link className="office-entry" href="/office">
          The office <Arrow />
        </Link>
      </header>
      <main id="main-content">{children}</main>
      <footer className="office-footer">
        <div>
          <Wordmark />
          <p>
            {business.name}
            <br />
            {business.location}
          </p>
        </div>
        <div>
          <span className="office-label">A direct line</span>
          <a className="office-email" href={"mailto:" + business.email}>
            {business.email}
          </a>
          <p>You’ll work with Wyatt Kirby.</p>
        </div>
        <div className="office-footer-links">
          <Link href="/products">Catalog</Link>
          <Link href="/connections">Connections & setup</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/office">Office directory</Link>
        </div>
        <div className="office-footer-bottom">
          <span>© {new Date().getFullYear()} Nova Enterprises</span>
          <span>Start with the details. Agree the work. Keep the record.</span>
        </div>
      </footer>
    </div>
  );
}
export function PageIntro({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="office-intro office-wrap">
      <span className="office-label">{eyebrow}</span>
      <h1>{title}</h1>
      {children && <div className="office-lead">{children}</div>}
    </section>
  );
}
export function ProductArt({ kind }: { kind: string }) {
  return (
    <svg
      className={"office-art office-art-" + kind}
      viewBox="0 0 400 240"
      role="img"
      aria-label={
        kind === "goods"
          ? "Illustration of made-to-order merchandise"
          : kind === "clean"
            ? "Illustration of a structured product file"
            : "Illustration of a Nova work record"
      }
    >
      <g fill="none" stroke="currentColor" strokeWidth="2.2">
        {kind === "goods" ? (
          <>
            <path d="M115 63h64v65c0 20-36 29-49 43l-29-28 31-31V63M226 69h76v103h-76zM219 61h90v8M237 91h54M237 101h54M237 111h54M235 170v13M245 170v13M255 170v13M265 170v13M275 170v13M285 170v13M295 170v13" />
            <path d="M115 80h63M113 148l24 20" />
          </>
        ) : kind === "clean" ? (
          <>
            <rect x="85" y="54" width="230" height="139" rx="5" />
            <path d="M85 86h230M85 121h230M85 156h230M144 86v107M239 86v107M103 104h25M163 105h55M258 104h35M102 139h25M163 139h55M258 138h35M102 174h25M163 174h55" />
            <path strokeWidth="4" d="m258 172 9 8 19-22" />
          </>
        ) : (
          <>
            <path d="M120 40h121l47 46v117H120Z" />
            <path d="M241 40v47h47M143 106h120M143 126h95M143 146h109M143 166h63" />
            {kind === "auction" ? (
              <>
                <circle cx="257" cy="171" r="36" fill="#e4aa8b" />
                <path d="m243 172 10 10 18-23" />
              </>
            ) : (
              <>
                <circle cx="93" cy="75" r="30" />
                <path d="m80 75 10 10 18-22" />
              </>
            )}
          </>
        )}
      </g>
    </svg>
  );
}
