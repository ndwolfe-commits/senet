// ============================================================================
// COMPUTER PLAYER
// ----------------------------------------------------------------------------
// Chooses a move for whoever is to move. It plays by the same engine and the
// same RULES as people do, so a rule change needs no change here.
//
//   easy   mostly picks at random
//   medium picks the move that leaves the best-looking board
//   hard   also weighs every throw the other player could make next, their
//          best reply, and its own best answer to that
// ============================================================================

import { RULES } from "./rules.js";
import { legalMoves, applyMove, throwSticks, sideToMove, runLength } from "./engine.js";

export const LEVELS = ["easy", "medium", "hard"];

// Chance of each throw value, worked out from the sticks in RULES.
function throwOdds(R) {
  const n = R.sticks.count, odds = {};
  for (let up = 0; up <= n; up++) {
    let ways = 1;
    for (let i = 0; i < up; i++) ways = (ways * (n - i)) / (i + 1);
    const v = R.sticks.valueByLightUp[up];
    odds[v] = (odds[v] || 0) + ways / 2 ** n;
  }
  return Object.entries(odds).map(([v, p]) => ({ value: Number(v), p }));
}

// How good the board looks for `side`: higher is better.
export function evaluate(state, side, R = RULES) {
  if (state.phase === "over") return state.colour[state.winner] === side ? 1000 : -1000;
  const odds = throwOdds(R);
  const total = (who) => {
    const enemy = who === "light" ? "dark" : "light";
    const b = state.board;
    let score = state.off[who] * (R.squares + 6);
    for (let s = 1; s <= R.squares; s++) {
      if (b[s] !== who) continue;
      score += s;                                              // progress along the path
      if (R.bearOff.mustClearSquares.includes(s)) score -= 2;  // still holding up bearing off
      const run = runLength(b, s, R);
      if (run >= R.blocking.protectSize) score += 1.5;
      if (run >= R.blocking.wallSize) score += 1;
      // Risk of being swapped backward by an enemy piece behind.
      if (run < R.blocking.protectSize && !R.safeSquares.includes(s)) {
        for (const { value, p } of odds) if (s - value >= 1 && b[s - value] === enemy) score -= p * value * 0.9;
      }
      // Risk of throwing straight into the Waters.
      const gap = R.waters.square - s;
      if (gap > 0) for (const { value, p } of odds) if (value === gap) score -= p * (s - R.waters.sendTo) * 0.15;
    }
    return score;
  };
  return total(side) - total(side === "light" ? "dark" : "light");
}

// Expected value of a position for `side`, looking `depth` throws ahead.
function value(state, side, depth, R, odds) {
  if (state.phase === "over") return evaluate(state, side, R);
  if (state.pending) {                                         // someone has a move to choose
    const mine = sideToMove(state) === side;
    let best = mine ? -Infinity : Infinity;
    for (const m of legalMoves(state, R)) {
      const v = value(applyMove(state, m.from, R), side, depth, R, odds);
      best = mine ? Math.max(best, v) : Math.min(best, v);
    }
    return best;
  }
  if (depth <= 0) return evaluate(state, side, R);
  let sum = 0;
  for (const { value: thrown, p } of odds) sum += p * value(throwSticks(state, { sticks: [], value: thrown }, R), side, depth - 1, R, odds);
  return sum;
}

// The square of the piece to move. `state` must be waiting for a move.
export function chooseMove(state, level = "medium", R = RULES, rng = Math.random) {
  const moves = legalMoves(state, R);
  if (moves.length <= 1) return moves.length ? moves[0].from : null;
  if (level === "easy" && rng() < 0.75) return moves[Math.floor(rng() * moves.length)].from;
  const side = sideToMove(state);
  const lean = { ...state, log: [] };                           // the search has no use for the commentary
  const depth = level === "hard" ? 2 : 0;
  const odds = throwOdds(R);
  let best = null, bestScore = -Infinity;
  for (const m of moves) {
    const score = value(applyMove(lean, m.from, R), side, depth, R, odds) + rng() * 0.01;
    if (score > bestScore) { bestScore = score; best = m.from; }
  }
  return best;
}
