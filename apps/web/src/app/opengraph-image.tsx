import { ImageResponse } from "next/og";
export const runtime = "edge";
export const alt =
  "Nova Enterprises LLC — Products, sourcing and business tools";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function Image() {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        height: "100%",
        width: "100%",
        background: "#f6f4ee",
        color: "#202722",
        padding: "65px 72px",
        flexDirection: "column",
        justifyContent: "space-between",
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          fontSize: 32,
          fontWeight: 700,
          letterSpacing: 7,
        }}
      >
        <span style={{ color: "#b64e2f", marginRight: 22, fontSize: 48 }}>
          N
        </span>
        NOVA ENTERPRISES
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 70,
          lineHeight: 1.05,
          letterSpacing: -3,
          maxWidth: 1000,
        }}
      >
        Good business starts with a clear brief.
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          paddingTop: 25,
          borderTop: "1px solid #bfc5b8",
          fontSize: 21,
        }}
      >
        <span>Products · Sourcing · Business tools</span>
        <span>novanexus-ai.com</span>
      </div>
    </div>,
    size,
  );
}
