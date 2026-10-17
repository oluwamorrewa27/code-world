# Code World

A Phaser 3 browser game with:
- pixel-art style gameplay
- wave combat and boss pressure
- collectible language pickups (JS, PY, C++, SQL, HTML, CSS, GO, JAVA, Rust)
- optional WebAudio SFX/music generated in-browser
- multiplayer-ready Socket.IO server scaffold

## Run locally

1. Install dependencies:
   npm install
2. Start the server:
   npm start
3. Open in browser:
   http://localhost:3000

## Notes
- The project is intentionally built as a single-player MVP with multiplayer plumbing already included.
- If Socket.IO is unavailable, the game still runs as a standalone local game.
- The repo is set up so you can later expand into boss phases, richer art, and network reliability improvements.

## Future phases
- Improve sprite art with a dedicated sprite sheet pipeline
- Add boss pattern tuning and attack telegraphing
- Add environment/world map and animations
- Implement stronger authoritative multiplayer state sync
