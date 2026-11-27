// ============================================================================
// SENET ENGINE
// ----------------------------------------------------------------------------
// Pure game logic. No screen code here, and no rule numbers: every rule comes
// from the RULES object in rules.js. Each function takes a state and returns a
// new state, so the same engine can later drive remote play or a computer
// opponent.
// ============================================================================

import { RULES } from "./rules.js";

const other = (side) => (side === "light" ? "dark" : "light");
const otherPlayer = (p) => (p === "A" ? "B" : "A");
const clone = (s) => JSON.parse(JSON.stringify(s));
const cap = (s) => s[0].toUpperCase() + s.slice(1);

export function newGame(names = {}, R = RULES) {
  const board = Array(R.squares + 1).fill(null);
  for (const sq of R.setup.light) board[sq] = "light";
  for (const sq of R.setup.dark) board[sq] = "dark";
  return {
    phase: "opening",
    board,
    off: { light: 0, dark: 0 },
    names: { A: names.A || "Player 1", B: names.B || "Player 2" },
    colour: { A: null, B: null },
    turn: "A",
    lastThrow: null,
    pending: null,
    winner: null,
    lastMove: null,
    fx: [],
    log: [`Take turns throwing. First to throw a ${R.opening.throwNeeded} starts as ${R.opening.firstPlayerColour}.`],
  };
}

// ---------------------------------------------------------------- helpers ---

export function sideToMove(state) {
  return state.colour[state.turn];
}

export function playerLabel(state, p = state.turn) {
  const c = state.colour[p];
  return c ? `${state.names[p]} (${cap(c)})` : state.names[p];
}

function say(state, msg) {
  state.log.push(msg);
  if (state.log.length > 60) state.log.shift();
}

// How many pieces of the same side sit in an unbroken run through `sq`.
export function runLength(board, sq, R = RULES) {
  const side = board[sq];
  if (!side) return 0;
  let n = 1;
  for (let s = sq - 1; s >= 1 && board[s] === side; s--) n++;
  for (let s = sq + 1; s <= R.squares && board[s] === side; s++) n++;
  return n;
}

function canBearOff(board, side, R) {
  return R.bearOff.mustClearSquares.every((sq) => board[sq] !== side);
}

function blockedByWall(board, side, from, to, R) {
  const lo = Math.min(from, to) + 1;
  const hi = Math.min(Math.max(from, to) - 1, R.squares);
  for (let s = lo; s <= hi; s++) {
    const occ = board[s];
    if (!occ) continue;
    if (occ === side && R.blocking.ownWallPassable) continue;
    if (runLength(board, s, R) >= R.blocking.wallSize) return true;
  }
  return false;
}

// Where a piece ends up after landing in the Waters (the mover has already
// left its starting square).
function watersDestination(board, R) {
  const w = R.waters;
  if (!board[w.sendTo]) return w.sendTo;
  for (let s = w.ifTakenSendTo; s <= R.squares; s++) {
    if (!board[s] && s !== w.square) return s;
  }
  return null;
}

// Try one move for the piece on `from`.
// Returns { move } if it can go, or { reason } saying why not.
function tryMove(board, side, from, dir, value, R) {
  const to = from + dir * value;

  if (dir > 0 && to > R.squares) {
    if (!canBearOff(board, side, R)) {
      return { reason: "You can't take pieces off while you still have pieces in the first row." };
    }
    if (blockedByWall(board, side, from, R.squares + 1, R)) return { reason: "Three in a row blocks the way." };
    return { move: { from, to: "off", dir, leftover: to - (R.squares + 1) } };
  }
  if (to < 1) return { reason: "That would go off the start of the board." };
  if (blockedByWall(board, side, from, to, R)) return { reason: "Three in a row blocks the way." };

  const target = board[to];
  if (target === side) return { reason: `Your own piece is on ${to}.` };
  let swap = false;
  if (target) {
    if (!R.swapOnLanding) return { reason: `Square ${to} is taken.` };
    if (R.safeSquares.includes(to)) return { reason: `Square ${to} is safe. You can't land on a piece there.` };
    if (runLength(board, to, R) >= R.blocking.protectSize) {
      return { reason: `Square ${to} is protected: two or more in a row.` };
    }
    swap = true;
  }

  const move = { from, to, dir, swap };
  if (to === R.waters.square) {
    const b = board.slice();
    b[from] = swap ? other(side) : null;
    move.waters = true;
    move.finalTo = watersDestination(b, R);
    if (move.finalTo === null) return { reason: "No free square to go back to." };
  }
  return { move };
}

function candidate(board, side, from, dir, value, R) {
  return tryMove(board, side, from, dir, value, R).move || null;
}

// Why tapping the piece on `from` does nothing. Returns null if the move is legal.
export function explainTap(state, from, R = RULES) {
  if (state.phase === "opening") return `Keep throwing. The first ${R.opening.throwNeeded} starts the game.`;
  if (state.phase === "over") return "The game is over.";
  if (!state.pending) return "Throw the sticks first.";
  const side = sideToMove(state);
  if (state.board[from] !== side) return state.board[from] ? "That's not your piece." : "No piece there.";
  const legal = legalMoves(state, R);
  if (legal.some((m) => m.from === from)) return null;
  const fwd = tryMove(state.board, side, from, +1, state.pending.value, R);
  if (fwd.reason) return fwd.reason;
  return "You can only move backward when no forward move is possible.";
}

// All moves the side to move may make with the pending throw.
// Forward moves if there are any; otherwise backward moves; otherwise none.
export function legalMoves(state, R = RULES) {
  if (state.phase !== "play" || !state.pending) return [];
  const side = sideToMove(state);
  const v = state.pending.value;
  const pieces = [];
  for (let s = 1; s <= R.squares; s++) if (state.board[s] === side) pieces.push(s);

  const fwd = pieces.map((s) => candidate(state.board, side, s, +1, v, R)).filter(Boolean);
  if (fwd.length) return fwd;
  if (!R.backwardIfStuck) return [];
  return pieces.map((s) => candidate(state.board, side, s, -1, v, R)).filter(Boolean);
}

// ------------------------------------------------------------------ turns ---

function endOfMove(state, again) {
  state.pending = null;
  if (state.phase === "over") return state;
  if (again) {
    say(state, `${playerLabel(state)} throws again.`);
  } else {
    state.turn = otherPlayer(state.turn);
    say(state, `${playerLabel(state)} to throw.`);
  }
  return state;
}

export function rollSticks(rng = Math.random, R = RULES) {
  const sticks = Array.from({ length: R.sticks.count }, () => rng() < 0.5);
  const lightUp = sticks.filter(Boolean).length;
  return { sticks, value: R.sticks.valueByLightUp[lightUp] };
}

// Throw the sticks. `roll` can be passed in (for tests or remote play);
// otherwise sticks are thrown at random.
export function throwSticks(state, roll = null, R = RULES) {
  if (state.phase === "over" || state.pending) return state;
  const s = clone(state);
  const r = roll || rollSticks(Math.random, R);
  s.lastThrow = r;
  s.fx = ["throw"]; // what just happened, for sounds and animation
  const who = playerLabel(s);

  if (s.phase === "opening") {
    if (r.value !== R.opening.throwNeeded) {
      say(s, `${who} threw ${r.value}.`);
      s.turn = otherPlayer(s.turn);
      say(s, `${playerLabel(s)} to throw.`);
      return s;
    }
    const first = R.opening.firstPlayerColour;
    s.colour[s.turn] = first;
    s.colour[otherPlayer(s.turn)] = other(first);
    s.phase = "play";
    const { bonusFrom, bonusTo } = R.opening;
    if (s.board[bonusFrom] === first && !s.board[bonusTo]) {
      s.board[bonusFrom] = null;
      s.board[bonusTo] = first;
      s.lastMove = { from: bonusFrom, to: bonusTo };
      s.fx.push("move");
    }
    say(s, `${s.names[s.turn]} threw ${r.value} and plays ${cap(first)}. The piece on ${bonusFrom} jumps to ${bonusTo}.`);
    return endOfMove(s, R.throwAgainOn.includes(r.value));
  }

  const again = R.throwAgainOn.includes(r.value);
  s.pending = { value: r.value, again, leftover: false };
  if (legalMoves(s, R).length === 0) {
    say(s, `${who} threw ${r.value} but has no move.`);
    return endOfMove(s, again && R.throwAgainEvenIfNoMove);
  }
  say(s, `${who} threw ${r.value}.`);
  return s;
}

// Make a move. `from` is the square of the piece to move; it must be one of
// the legal moves.
export function applyMove(state, from, R = RULES) {
  const move = legalMoves(state, R).find((m) => m.from === from);
  if (!move) return state;
  const s = clone(state);
  const side = sideToMove(s);
  const enemy = other(side);
  const b = s.board;
  const who = playerLabel(s);

  b[from] = null;
  s.fx = [move.to === "off" ? "off" : move.waters ? "waters" : move.swap ? "swap" : "move"];
  s.lastMove = { from, to: move.to === "off" ? null : move.waters ? move.finalTo : move.to };
  if (move.to === "off") {
    s.off[side] += 1;
    say(s, `${who} took a piece off from ${from}.`);
    if (s.off[side] === R.setup[side].length) {
      s.phase = "over";
      s.winner = s.turn;
      s.pending = null;
      s.fx.push("win");
      say(s, `${playerLabel(s)} wins!`);
      return s;
    }
    if (R.bearOff.useLeftover && move.leftover > 0) {
      s.pending = { value: move.leftover, again: s.pending.again, leftover: true };
      if (legalMoves(s, R).length) {
        say(s, `Leftover ${move.leftover} to move another piece.`);
        return s;
      }
      say(s, `Leftover ${move.leftover} can't be used.`);
    }
    return endOfMove(s, s.pending.again);
  }

  if (move.swap) {
    b[from] = enemy;
    say(s, `${who} moved ${from} to ${move.to} and swapped with ${cap(enemy)}.`);
  } else {
    say(s, `${who} moved ${from} to ${move.to}.`);
  }
  if (move.waters) {
    b[move.finalTo] = side;
    say(s, `Into the Waters! Back to ${move.finalTo}.`);
  } else {
    b[move.to] = side;
  }
  return endOfMove(s, s.pending.again);
}

// Give up the game: the other player wins at once.
export function resign(state, who) {
  if (state.phase === "over") return state;
  const s = clone(state);
  s.phase = "over";
  s.winner = otherPlayer(who);
  s.resigned = who;
  s.pending = null;
  s.fx = ["win"];
  say(s, `${s.names[who]} resigned. ${s.names[s.winner]} wins.`);
  return s;
}
