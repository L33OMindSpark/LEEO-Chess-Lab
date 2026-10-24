# LEEO Chess Lab

Reads every public game of any chess.com username, runs Stockfish on the newest ones and shows level, playstyle, openings, habits, an improvement trend and a blunder trainer. It runs entirely in the browser: no account, no server, no AI calls, nothing uploaded.

## Run it
Double-click `start.command` (it serves the prebuilt `dist/` folder and opens the browser).
To rebuild after changing code: `npm install` once, then `npm run build`. For development: `npm run dev`.

## What it does
Overview, skills against your opponents (radar), playstyle and habits, openings and an opening doctor, an engine report, mistake patterns, a spaced-repetition blunder trainer, weekly targets, game history with move-by-move review, and your own "why I lost" tags. The pages are grouped as Overview, Insights, Improve and Games.

## Hosted version
A login plus background analysis (free Supabase, GitHub Actions and Cloudflare) is set up by `GO-LIVE.md`. The quick version above needs none of it.

## How it works
- Games come from the free public chess.com API. Each month is cached in the browser, so repeat visits are instant.
- In the browser, the newest 500 games can be analysed straight away and the whole history can be analysed month by month (slow). A tracked account analyses the entire history on a server. Every analysed game is reduced to a small summary that all statistics are built from, and the full move-by-move record is loaded only when you open a game.
- Stockfish 19 (lite, WASM) runs in background workers. Results are saved per game and the batch can be stopped and resumed.
- Tips are plain rules over your own numbers. Accuracy and mistake classes follow the Lichess win-chance model.
- Settings menu: engine depth, how much history to read, and deleting saved data.

macOS may block `start.command` the first time: right-click, Open. If a downloaded copy is blocked, run `xattr -cr` on the folder.

Stockfish is licensed under the GPL v3. Source: https://github.com/official-stockfish/Stockfish and the WebAssembly build at https://github.com/nmrugg/stockfish.js
