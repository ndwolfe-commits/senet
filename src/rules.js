// ============================================================================
// SENET HOUSE RULES
// ----------------------------------------------------------------------------
// Every rule of the game lives in this one file. To change how the game plays,
// edit a value here. The engine (engine.js) reads these settings and contains
// no rule numbers of its own.
//
// Squares are numbered 1 to 30 along the snake path:
//   1-10 up the first column, 11-20 down the middle, 21-30 up the last column,
//   then off the board.
// ============================================================================

export const RULES = {
  squares: 30,

  // Starting position. "light" and "dark" are the two sides.
  setup: {
    light: [1, 3, 5, 7, 9],
    dark: [2, 4, 6, 8, 10],
  },

  // Throwing sticks: how many sticks, and what a throw is worth
  // for each number of light sides facing up.
  // As played, and as most rule sheets have it: count the LIGHT sides
  // facing up (1, 2, 3 or 4); no light sides (all dark) = 6. There is no 5.
  sticks: {
    count: 4,
    valueByLightUp: { 0: 6, 1: 1, 2: 2, 3: 3, 4: 4 },
  },

  // Throws that let you throw again after moving.
  throwAgainOn: [1, 4, 6],

  // If a throw gives you no possible move, do you still throw again
  // when it was a 1, 4 or 6?
  throwAgainEvenIfNoMove: false,

  // The opening: players take turns throwing until someone throws this number.
  // That player becomes `firstPlayerColour`, and their piece on `bonusFrom`
  // jumps straight to `bonusTo`. Then they throw again (because 1 is in
  // throwAgainOn) and normal play begins.
  opening: {
    throwNeeded: 1,
    firstPlayerColour: "dark",
    bonusFrom: 10,
    bonusTo: 20,
  },

  // Blocking.
  // protectSize: this many of the same side in a row cannot be landed on
  //              (a single piece can be swapped with).
  // wallSize:    this many in a row cannot be jumped over by the other side.
  // ownWallPassable: can you jump over your own wall?
  blocking: {
    protectSize: 2,
    wallSize: 3,
    ownWallPassable: true,
  },

  // Landing on a lone enemy piece swaps the two pieces.
  swapOnLanding: true,

  // Squares where nobody can land on you.
  safeSquares: [26, 28, 29],

  // The Waters. Landing here sends the piece back to `sendTo`.
  // If that square is taken (by either side), it goes to `ifTakenSendTo`.
  // If that is also taken, it goes forward to the next empty square.
  waters: {
    square: 27,
    sendTo: 15,
    ifTakenSendTo: 1,
  },

  // Bearing off.
  bearOff: {
    // You can't take any piece off while you still have a piece on these squares.
    mustClearSquares: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    // Any throw that carries a piece past the last square takes it off.
    // The leftover count is then played with another piece
    // (and can take that one off too).
    useLeftover: true,
  },

  // If you can't move forward you must move backward.
  backwardIfStuck: true,

  // Names and symbols for the special squares (display only).
  squareInfo: {
    15: { name: "House of Rebirth", symbol: "☥" },
    26: { name: "House of Beauty", symbol: "✦" },
    27: { name: "The Waters", symbol: "≈" },
    28: { name: "House of Three", symbol: "III" },
    29: { name: "House of Two", symbol: "II" },
  },
};

// Plain-English summary of the rules, built from the settings above,
// so the rules page in the app always matches how the game actually plays.
export function rulesSummary(R = RULES) {
  const throwTable = Object.entries(R.sticks.valueByLightUp)
    .map(([up, v]) => `${up} light side${up === "1" ? "" : "s"} up = ${v}`)
    .join(", ");
  const safe = R.safeSquares
    .map((s) => `${s}${R.squareInfo[s] ? ` (${R.squareInfo[s].name})` : ""}`)
    .join(", ");
  const clear = R.bearOff.mustClearSquares;
  return [
    `Each side has ${R.setup.light.length} pieces. Light starts on ${R.setup.light.join(", ")}; dark on ${R.setup.dark.join(", ")}.`,
    `Throw ${R.sticks.count} sticks: ${throwTable}.`,
    `A throw of ${R.throwAgainOn.join(", ")} lets you throw again; anything else ends your turn.`,
    `To start, take turns throwing until someone throws a ${R.opening.throwNeeded}. That player is ${R.opening.firstPlayerColour}: their piece on ${R.opening.bonusFrom} jumps to ${R.opening.bonusTo}, and they throw again.`,
    `Land on a lone enemy piece and you swap places. You can't land on ${R.blocking.protectSize} or more enemy pieces in a row, but you can jump them.`,
    `Nobody can jump ${R.blocking.wallSize} or more enemy pieces in a row${R.blocking.ownWallPassable ? " (you can jump your own)" : ""}.`,
    `Safe squares, where nobody can land on you: ${safe}.`,
    `Land on ${R.waters.square} (The Waters) and you go back to ${R.waters.sendTo}. If ${R.waters.sendTo} is taken, back to ${R.waters.ifTakenSendTo}; if that's taken too, the next empty square after it.`,
    `You can't take pieces off while you have any on squares ${clear[0]}-${clear[clear.length - 1]}. No exact throw needed${R.bearOff.useLeftover ? "; use the leftover count to move another piece, which can take that one off too" : ""}.`,
    `If you can move forward you must.${R.backwardIfStuck ? " If you can't, you must move a piece backward." : ""} If you can't move at all, your turn passes.`,
    `First to take all their pieces off wins.`,
  ];
}
