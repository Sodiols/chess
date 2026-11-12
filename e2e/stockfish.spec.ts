import { expect, test } from "@playwright/test";
import { Chess } from "chess.js";

test.skip(!process.env.E2E_BASE_URL, "Start the production app and set E2E_BASE_URL.");

test("production Stockfish assets load and the WASM worker analyzes a real position", async ({ page, request }) => {
  test.setTimeout(45_000);
  for (const file of ["stockfish-19-lite-single.js", "stockfish-19-lite-single.wasm", "stockfish-19-asm.js"]) {
    const response = await request.head(`/engine/${file}`);
    expect(response.ok(), file).toBe(true);
    expect(response.headers()["content-type"]).not.toContain("text/html");
    if (file.endsWith(".wasm")) expect(response.headers()["content-type"]).toContain("application/wasm");
  }

  await page.goto("/play");
  const result = await page.evaluate(async () => {
    const worker = new Worker("/engine/stockfish-19-lite-single.js");
    return new Promise<{ name: string; score: string; best: string }>((resolve, reject) => {
      let name = "";
      let score = "";
      const close = () => { clearTimeout(timeout); worker.terminate(); };
      const timeout = setTimeout(() => { close(); reject(new Error("Stockfish did not complete UCI analysis")); }, 25_000);
      worker.onerror = () => { close(); reject(new Error("Stockfish worker failed to load")); };
      worker.onmessage = ({ data }) => {
        for (const line of String(data).split(/\r?\n/)) {
          if (line.startsWith("id name ")) name = line.trim();
          if (line.trim() === "uciok") worker.postMessage("isready");
          if (line.trim() === "readyok") {
            worker.postMessage("position startpos moves e2e4");
            worker.postMessage("go movetime 400");
          }
          if (line.includes(" score ") && line.includes(" pv ")) score = line.trim();
          if (line.startsWith("bestmove ")) {
            close();
            resolve({ name, score, best: line.trim().split(/\s+/)[1]! });
          }
        }
      };
      worker.postMessage("uci");
    });
  });
  expect(result.name).toMatch(/Stockfish/i);
  expect(result.score).toMatch(/score (cp|mate) -?\d+/);
  const chess = new Chess();
  chess.move("e4");
  expect(chess.move(result.best)).toBeTruthy();
});
