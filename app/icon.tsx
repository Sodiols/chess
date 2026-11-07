import { ImageResponse } from "next/og";
import { PIECE_GEOMETRY, PIECE_VIEWBOX } from "@/lib/pieces";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

/** The wordmark's knight on the site background; also reused as the Apple touch icon. */
export function knightIcon(px: number, radius: number) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0e0e0d",
          borderRadius: radius,
        }}
      >
        <svg viewBox={PIECE_VIEWBOX} width={px * 0.82} height={px * 0.82} fill="#d6ab62">
          {PIECE_GEOMETRY.n.body.map((d, index) => (
            <path key={index} d={d} />
          ))}
        </svg>
      </div>
    ),
    { width: px, height: px },
  );
}

export default function Icon() {
  return knightIcon(size.width, 14);
}
