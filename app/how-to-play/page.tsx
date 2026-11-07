import type { Metadata } from "next";
import Link from "next/link";
import type { Square } from "@/types";
import { Navbar } from "@/components/Navbar";
import { MiniBoard } from "@/components/chess/MiniBoard";

export const metadata: Metadata = {
  title: "How to play — Gambit",
};

interface Diagram {
  fen: string;
  from?: Square;
  marks?: Square[];
  label: string;
}

interface Topic {
  id: string;
  heading: string;
  body: string[];
  diagrams: { caption: string; diagram: Diagram }[];
}

/**
 * Every diagram's dots are generated from the rules engine at render time, so the
 * illustrations cannot drift from how the game actually behaves.
 */
const TOPICS: Topic[] = [
  {
    id: "pieces",
    heading: "How the pieces move",
    body: [
      "Each piece has one movement pattern. A piece may never pass through another piece, with the single exception of the knight, which jumps. You capture by moving onto an occupied square — the piece there is removed from the board.",
      "In these diagrams the marked piece is highlighted and every square it may legally reach is dotted. Rings mark squares where it would capture.",
    ],
    diagrams: [
      {
        caption: "The rook moves any distance along ranks and files.",
        diagram: {
          fen: "4k3/8/8/3p4/8/3R4/8/4K3 w - - 0 1",
          from: "d3",
          label: "A rook on d3 with its legal moves marked",
        },
      },
      {
        caption: "The bishop travels diagonally and stays on one colour forever.",
        diagram: {
          fen: "4k3/8/8/8/4B3/8/8/4K3 w - - 0 1",
          from: "e4",
          label: "A bishop on e4 with its legal moves marked",
        },
      },
      {
        caption: "The queen combines the rook and the bishop.",
        diagram: {
          fen: "4k3/8/8/8/3Q4/8/8/4K3 w - - 0 1",
          from: "d4",
          label: "A queen on d4 with its legal moves marked",
        },
      },
      {
        caption: "The knight jumps in an L — two squares then one across.",
        diagram: {
          fen: "4k3/8/8/8/4N3/8/8/4K3 w - - 0 1",
          from: "e4",
          label: "A knight on e4 with its legal moves marked",
        },
      },
      {
        caption: "The king steps one square in any direction.",
        diagram: {
          fen: "4k3/8/8/8/8/4K3/8/8 w - - 0 1",
          from: "e3",
          label: "A king on e3 with its legal moves marked",
        },
      },
      {
        caption:
          "Pawns push straight ahead — two squares from their starting rank — but capture diagonally.",
        diagram: {
          fen: "4k3/8/8/8/3p4/8/2P5/4K3 w - - 0 1",
          from: "c2",
          label: "A pawn on c2 showing its pushes and a diagonal capture",
        },
      },
    ],
  },
  {
    id: "check",
    heading: "Check",
    body: [
      "Your king is in check when an enemy piece is attacking the square it stands on. You must answer a check immediately: move the king to safety, capture the attacking piece, or block the line between them.",
      "You may never make a move that leaves your own king in check — including moving a piece that was shielding it. The board will simply refuse such moves.",
    ],
    diagrams: [
      {
        caption:
          "The black king is in check from the rook on e1. Only moves that end the check are legal.",
        diagram: {
          fen: "4k3/8/8/8/8/8/8/4RK2 b - - 0 1",
          marks: ["e8", "e1"],
          label: "A black king on e8 in check from a white rook on e1",
        },
      },
    ],
  },
  {
    id: "checkmate",
    heading: "Checkmate and stalemate",
    body: [
      "Checkmate ends the game. It happens when a king is in check and no legal move exists to escape it — the side that is mated loses.",
      "Stalemate is a draw. The player to move is not in check but has no legal move at all. It is a common way for a losing side to save half a point.",
    ],
    diagrams: [
      {
        caption: "Checkmate: the black king is attacked and every escape square is covered.",
        diagram: {
          fen: "6k1/5ppp/8/8/8/8/8/4K1R1 b - - 0 1",
          marks: ["g8", "g1"],
          label: "A back-rank checkmate position",
        },
      },
      {
        caption:
          "Stalemate: black is not in check, but the king has nowhere legal to go. The game is drawn.",
        diagram: {
          fen: "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1",
          marks: ["h8"],
          label: "A stalemate position with the black king on h8",
        },
      },
    ],
  },
  {
    id: "castling",
    heading: "Castling",
    body: [
      "Castling moves the king two squares towards a rook, and the rook hops to the square the king crossed. It is the only move that shifts two pieces at once, and it is played by moving the king.",
      "It is allowed only when neither the king nor that rook has moved yet, the squares between them are empty, and the king is not in check — nor would it pass through or land on an attacked square.",
    ],
    diagrams: [
      {
        caption:
          "White may castle on either wing. Select the king to see both castling squares offered.",
        diagram: {
          fen: "r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1",
          from: "e1",
          label: "A position where white can castle on both sides",
        },
      },
    ],
  },
  {
    id: "en-passant",
    heading: "En passant",
    body: [
      "When a pawn makes its two-square opening jump and lands directly beside an enemy pawn, that pawn may capture it as though it had only moved one square. The captured pawn is removed even though the capturing pawn does not land on it.",
      "This is the only capture where the captured piece is not on the destination square, and the right to play it expires immediately — you must take on the very next move.",
    ],
    diagrams: [
      {
        caption:
          "Black has just played d7–d5. The white pawn on e5 can capture it on d6, in passing.",
        diagram: {
          fen: "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2",
          from: "e5",
          label: "An en passant capture available on d6",
        },
      },
    ],
  },
  {
    id: "promotion",
    heading: "Promotion",
    body: [
      "A pawn that reaches the far side of the board must become a queen, rook, bishop or knight of its own colour. You choose — the queen is usually strongest, but a knight sometimes delivers a mate a queen cannot.",
      "You can have as many promoted pieces as you have pawns; nothing limits you to the pieces you started with.",
    ],
    diagrams: [
      {
        caption: "The pawn on b7 promotes by stepping to b8 or capturing on a8 or c8.",
        diagram: {
          fen: "r1r1k3/1P6/8/8/8/8/8/4K3 w - - 0 1",
          from: "b7",
          label: "A white pawn on b7 about to promote",
        },
      },
    ],
  },
  {
    id: "draws",
    heading: "Ways a game is drawn",
    body: [
      "Stalemate — the player to move has no legal move and is not in check.",
      "Threefold repetition — the same position, with the same player to move and the same options, occurs three times.",
      "Fifty-move rule — fifty moves by each side pass with no capture and no pawn move.",
      "Insufficient material — neither side has enough left to force mate, such as a lone king against king and bishop.",
      "Agreement — one player offers a draw and the other accepts.",
    ],
    diagrams: [],
  },
];

export default function HowToPlayPage() {
  return (
    <>
      <Navbar />

      <main className="mx-auto max-w-4xl px-4 pt-10 pb-16 sm:px-5 lg:pt-14">
        <p className="eyebrow">The rules</p>
        <h1 className="mt-3 text-3xl font-bold sm:text-[2.25rem]">How to play chess</h1>
        <p className="mt-4 max-w-2xl text-[1.0625rem] leading-relaxed text-muted">
          Everything you need to sit down and play a full game. Beginner mode shows
          all of this on the board as you go, so you do not have to memorise it.
        </p>

        <nav aria-label="Sections" className="mt-8 flex flex-wrap gap-2">
          {TOPICS.map((topic) => (
            <a
              key={topic.id}
              href={`#${topic.id}`}
              className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[0.8125rem] text-muted transition-colors hover:border-line-strong hover:text-ink"
            >
              {topic.heading}
            </a>
          ))}
        </nav>

        <div className="mt-12 space-y-14">
          {TOPICS.map((topic) => (
            <section key={topic.id} id={topic.id} className="scroll-mt-20">
              <h2 className="text-xl font-bold sm:text-2xl">{topic.heading}</h2>

              <div className="mt-3 max-w-2xl space-y-3 text-[0.9375rem] leading-relaxed text-muted">
                {topic.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>

              {topic.diagrams.length > 0 && (
                <ul
                  className={
                    topic.diagrams.length > 2
                      ? "mt-7 grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
                      : "mt-7 grid gap-6 sm:grid-cols-2"
                  }
                >
                  {topic.diagrams.map(({ caption, diagram }) => (
                    <li key={caption}>
                      <MiniBoard {...diagram} />
                      <p className="mt-2.5 text-[0.8125rem] leading-snug text-muted">{caption}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <div className="mt-16 border-t border-line pt-8">
          <Link
            href="/play"
            className="inline-flex h-12 items-center rounded-lg bg-accent px-6 text-[0.9375rem] font-semibold text-[#231a0c] transition-colors hover:bg-[#dcb673]"
          >
            Start a game
          </Link>
        </div>
      </main>
    </>
  );
}
