import test from "node:test";
import assert from "node:assert/strict";
import { RULES } from "../src/rules.js";
import { newGame, throwSticks, applyMove, legalMoves, rollSticks } from "../src/engine.js";

const roll = (value) => ({ sticks: [], value });

// A game already past the opening, with a custom board.
function position(pieces, { turnSide = "dark", off = { light: 0, dark: 0 } } = {}) {
  const s = newGame();
  s.phase = "play";
  s.colour = { A: "dark", B: "light" };
  s.turn = turnSide === "dark" ? "A" : "B";
  s.board = Array(RULES.squares + 1).fill(null);
  for (const [sq, side] of Object.entries(pieces)) s.board[+sq] = side;
  s.off = off;
  return s;
}
const fromSquares = (s) => legalMoves(s).map((m) => m.from).sort((a, b) => a - b);

test("sticks: odds are 4/16, 6/16, 4/16, 1/16, 1/16 and no 5", () => {
  const counts = {};
  for (let i = 0; i < 16; i++) {
    const bits = [0, 1, 2, 3].map((k) => (i >> k) & 1);
    let n = 0;
    const r = rollSticks(() => (bits[n++] ? 0 : 0.9));
    counts[r.value] = (counts[r.value] || 0) + 1;
  }
  assert.deepEqual(counts, { 1: 4, 2: 6, 3: 4, 4: 1, 6: 1 });
});

test("opening: throws pass until a 1; thrower becomes dark, 10 jumps to 20, throws again", () => {
  let s = newGame({ A: "Nathan", B: "Asa" });
  s = throwSticks(s, roll(3));
  assert.equal(s.turn, "B");
  assert.equal(s.phase, "opening");
  s = throwSticks(s, roll(4));
  assert.equal(s.turn, "A");
  s = throwSticks(s, roll(6));
  s = throwSticks(s, roll(1)); // Asa throws the 1
  assert.equal(s.phase, "play");
  assert.equal(s.colour.B, "dark");
  assert.equal(s.colour.A, "light");
  assert.equal(s.board[10], null);
  assert.equal(s.board[20], "dark");
  assert.equal(s.turn, "B"); // throws again
  assert.equal(s.pending, null);
});

test("throws of 2 or 3 end the turn; 1, 4, 6 throw again", () => {
  for (const [v, same] of [[1, true], [2, false], [3, false], [4, true], [6, true]]) {
    let s = position({ 5: "dark", 25: "light" });
    s = throwSticks(s, roll(v));
    s = applyMove(s, 5);
    assert.equal(s.turn === "A", same, `throw ${v}`);
  }
});

test("landing on a lone enemy swaps; on a pair is not allowed; a pair can be jumped", () => {
  let s = position({ 5: "dark", 7: "light", 12: "light", 13: "light", 3: "dark" });
  s.pending = { value: 2, again: false };
  s = applyMove(s, 5);
  assert.equal(s.board[7], "dark");
  assert.equal(s.board[5], "light");

  const t = position({ 10: "dark", 12: "light", 13: "light", 2: "dark" });
  t.pending = { value: 3, again: false };
  assert.ok(!fromSquares(t).includes(10), "can't land on a pair");
  t.pending = { value: 4, again: false };
  assert.ok(fromSquares(t).includes(10), "can jump a pair");
});

test("three in a row can't be jumped by the other side, but your own can", () => {
  const s = position({ 10: "dark", 11: "light", 12: "light", 13: "light", 1: "dark" });
  s.pending = { value: 4, again: false };
  assert.ok(!fromSquares(s).includes(10));

  const t = position({ 10: "dark", 11: "dark", 12: "dark", 13: "dark", 25: "light" });
  t.pending = { value: 4, again: false };
  assert.ok(fromSquares(t).includes(10));
});

test("safe squares 26, 28, 29 can't be landed on; 15 and 30 can", () => {
  for (const sq of [26, 28, 29]) {
    const s = position({ [sq - 1]: "dark", [sq]: "light", 5: "light" });
    s.pending = { value: 1, again: false };
    assert.ok(!legalMoves(s).some((m) => m.to === sq), `square ${sq}`);
  }
  for (const sq of [15, 30]) {
    const s = position({ [sq - 1]: "dark", [sq]: "light", 3: "light" });
    s.pending = { value: 1, again: false };
    assert.ok(legalMoves(s).some((m) => m.to === sq && m.swap), `square ${sq}`);
  }
});

test("Waters: back to 15; if 15 taken, back to 1; if 1 taken, next empty after", () => {
  let s = position({ 24: "dark", 3: "light" });
  s.pending = { value: 3, again: false };
  s = applyMove(s, 24);
  assert.equal(s.board[15], "dark");
  assert.equal(s.board[27], null);

  s = position({ 24: "dark", 15: "light" });
  s.pending = { value: 3, again: false };
  s = applyMove(s, 24);
  assert.equal(s.board[1], "dark");

  s = position({ 24: "dark", 15: "dark", 1: "light", 2: "dark", 3: "light" });
  s.pending = { value: 3, again: false };
  s = applyMove(s, 24);
  assert.equal(s.board[4], "dark");
});

test("no taking off while you still have a piece in the first column", () => {
  const s = position({ 28: "dark", 9: "dark", 20: "light" });
  s.pending = { value: 6, again: false };
  assert.ok(!legalMoves(s).some((m) => m.to === "off"));
});

test("no exact throw needed; leftover moves another piece and can take it off too", () => {
  let s = position({ 30: "dark", 29: "dark", 20: "dark", 12: "light" });
  s.pending = { value: 6, again: true };
  s = applyMove(s, 30); // 30 + 6: off, leftover 5
  assert.equal(s.off.dark, 1);
  assert.equal(s.pending.value, 5);
  assert.equal(s.pending.leftover, true);
  s = applyMove(s, 29); // 29 + 5: off, leftover 3
  assert.equal(s.off.dark, 2);
  assert.equal(s.pending.value, 3);
  s = applyMove(s, 20);
  assert.equal(s.board[23], "dark");
  assert.equal(s.turn, "A"); // original throw was a 6, so throw again
});

test("stuck forward means move backward, swapping if you land on a lone enemy", () => {
  // Dark on 25 with a 4 can't go forward (29 is safe and occupied by light).
  let s = position({ 25: "dark", 29: "light", 21: "light", 5: "dark", 6: "light", 7: "light", 8: "light", 9: "light" });
  s.board[5] = null; // only piece is on 25
  s.pending = { value: 4, again: false };
  const moves = legalMoves(s);
  assert.equal(moves.length, 1);
  assert.equal(moves[0].dir, -1);
  s = applyMove(s, 25);
  assert.equal(s.board[21], "dark");
  assert.equal(s.board[25], "light");
});

test("no move at all: turn passes", () => {
  let s = position({ 1: "dark", 2: "light", 3: "light" });
  s = throwSticks(s, roll(2)); // 1->3 is a pair: blocked; can't go back
  assert.equal(s.turn, "B");
  assert.equal(s.pending, null);
});

test("winning: last piece off ends the game", () => {
  let s = position({ 30: "dark", 12: "light" }, { off: { light: 0, dark: 4 } });
  s.pending = { value: 1, again: true };
  s = applyMove(s, 30);
  assert.equal(s.phase, "over");
  assert.equal(s.winner, "A");
});
