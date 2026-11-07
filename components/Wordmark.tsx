import { PIECE_GEOMETRY, PIECE_VIEWBOX } from "@/lib/pieces";

/** Knight silhouette from the board's own piece set, plus the product name. */
export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex size-8 items-center justify-center">
        <svg viewBox={PIECE_VIEWBOX} aria-hidden className="size-8 fill-accent">
          {PIECE_GEOMETRY.n.body.map((d, index) => (
            <path key={index} d={d} />
          ))}
        </svg>
      </span>
      <span translate="no" className="text-[1.1875rem] font-extrabold tracking-[-0.04em]">Gambit</span>
    </span>
  );
}
