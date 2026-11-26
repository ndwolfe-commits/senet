# Senet

Two-player Senet, played to our house rules.

- `src/rules.js` holds every rule. Change a rule by editing a value there.
- `src/engine.js` is the game logic. It reads the rules and has no rule numbers of its own.
- `tests/` checks the rules. Run with `npm test`.
- `index.html`, `style.css`, `src/ui.js` are the screen. `src/net.js` links the two phones (game moves, video and sound).
- No build step: the files run as they are.
