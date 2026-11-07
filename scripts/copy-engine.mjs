// Copies the Stockfish engine from node_modules into public/engine so it is
// served from this site (no external analysis service). Runs before dev/build.
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const from = join("node_modules", "stockfish");
const to = join("public", "engine");
mkdirSync(to, { recursive: true });
for (const file of ["stockfish-19-lite-single.js", "stockfish-19-lite-single.wasm", "stockfish-19-asm.js"]) {
  copyFileSync(join(from, "bin", file), join(to, file));
}
// GPL-3.0: the licence travels with the engine binaries.
copyFileSync(join(from, "Copying.txt"), join(to, "COPYING.txt"));
