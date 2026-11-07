import { PIECE_GEOMETRY, PIECE_VIEWBOX } from "@/lib/pieces";

/** Knight silhouette from the board's own piece set, plus the product name. */
export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex size-8 items-center justify-center rounded-md bg-accent/12 ring-1 ring-accent/30">
        <svg viewBox={PIECE_VIEWBOX} aria-hidden className="size-6 fill-accent">
          {PIECE_GEOMETRY.n.body.map((d, index) => (
            <path key={index} d={d} />
          ))}
        </svg>
      </span>
      <span className="text-[1.0625rem] font-bold tracking-[-0.03em]">Gambit</span>
    </span>
  );
}
