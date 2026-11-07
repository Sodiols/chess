import { ImageResponse } from "next/og";
import { PIECE_GEOMETRY, PIECE_VIEWBOX } from "@/lib/pieces";

export const alt = "Gambit — play chess online, against the computer or with a friend";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Share-card image for every page that doesn't set its own. */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          gap: 64,
          padding: "0 96px",
          background: "#0e0e0d",
          color: "#f1efea",
        }}
      >
        <svg viewBox={PIECE_VIEWBOX} width={300} height={300} fill="#d6ab62">
          {PIECE_GEOMETRY.n.body.map((d, index) => (
            <path key={index} d={d} />
          ))}
        </svg>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 136, fontWeight: 800, letterSpacing: -6, lineHeight: 1 }}>Gambit</div>
          <div style={{ marginTop: 28, fontSize: 44, color: "#b3afa7", lineHeight: 1.25 }}>
            Chess, your way. Play online, vs the computer or a friend — free.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
