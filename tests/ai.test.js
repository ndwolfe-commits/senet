import test from "node:test";
import assert from "node:assert/strict";
import { newGame, throwSticks, applyMove, legalMoves } from "../src/engine.js";
import { chooseMove } from "../src/ai.js";

function seeded(seed) { let s = seed; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

// Plays one whole game. `levels` says who plays A and who plays B ("random" picks any legal move).
export function playGame(levels, rng) {
  let g = newGame();
  for (let step = 0; step < 20000 && g.phase !== "over"; step++) {
    if (!g.pending) {
      const sticks = Array.from({ length: 4 }, () => rng() < 0.5);
      g = throwSticks(g, { sticks, value: { 0: 6, 1: 1, 2: 2, 3: 3, 4: 4 }[sticks.filter(Boolean).length] });
      continue;
    }
    const level = levels[g.turn];
    const moves = legalMoves(g);
    const from = level === "random" ? moves[Math.floor(rng() * moves.length)].from : chooseMove(g, level, undefined, rng);
    g = applyMove(g, from);
  }
  return g;
}

function winRate(a, b, games, seed) {
  const rng = seeded(seed); let wins = 0;
  for (let i = 0; i < games; i++) {
    const swap = i % 2 === 1;                                    // take turns going first
    const g = playGame(swap ? { A: b, B: a } : { A: a, B: b }, rng);
    assert.equal(g.phase, "over");
    if ((g.winner === "A") !== swap) wins++;
  }
  return wins / games;
}

test("the computer always returns a legal move and games finish", () => {
  assert.ok(winRate("easy", "random", 20, 1) >= 0);
});
test("medium beats random play", () => { assert.ok(winRate("medium", "random", 40, 2) > 0.65); });
test("hard beats easy", () => { assert.ok(winRate("hard", "easy", 30, 3) > 0.6); });
