# Subway Surfers Clone — "Subway Dash"

A playable 3D endless-runner game for the browser, built in the style of
**Subway Surfers** (SYBO/Kiloo). Run down the tracks, dodge trains and
barriers, grab coins and power-ups, and outrun the Inspector.

> Built with **Muse Spark 1.3** — all art and code are original and generated
> procedurally at runtime. No assets from the original game are used.
> Fan-made project, not affiliated with SYBO Games or Kiloo.

## Play it

No build step — just serve the folder over HTTP (ES modules + CDN):

```bash
cd subway-surfers-clone
npx serve .                 # or: python3 -m http.server 8000
```

Then open the printed URL in a browser. Internet access is required once,
to load Three.js from the `unpkg.com` CDN (see the `importmap` in
`index.html`).

## Controls

| Input | Action |
|---|---|
| `◀` `▶` / `A` `D` | Switch lane |
| `▲` / `W` | Jump |
| `▼` / `S` | Roll (press mid-air to slam down out of a jump) |
| `H` / double-tap / double-`Space` | Ride hoverboard (survives one crash) |
| `P` / `Esc` | Pause |
| Touch | Swipe to move, swipe down mid-air to slam, double-tap for hoverboard |

## Gameplay (researched from the original)

Mechanics were researched from the public Subway Surfers wiki, Wikipedia and
the official help center, then re-implemented from scratch:

- **3-lane endless tracks** with a behind-the-runner camera; speed (and score
  rate) rises the longer you survive.
- **Obstacles** — parked trains, oncoming trains (horn + warning light), low
  barriers (jump), overhead signs (roll), signal poles, and ramps that carry
  you up onto train roofs, where coin grids wait.
- **Coins** spawn in lines, jump arcs, roof grids and jetpack sky trails.
- **Power-ups** — 🧲 Magnet (pulls coins), 🚀 Jetpack (flies above the tracks
  on a dedicated coin trail), 👟 Super Sneakers (higher jump), ⭐ 2× score,
  🛹 Hoverboard pickups (one-hit shield).
- **Score multiplier** (up to ×30) grows by completing missions; keys revive
  you after a crash; best score and lifetime coins persist in `localStorage`.
- **Fair spawner** — at most two lanes are ever fully blocked at once, so
  there is always an escape route forward.

## Project structure

```text
subway-surfers-clone/
├── index.html   # Canvas, HUD, menus (main / pause / game-over), overlays
├── style.css    # All UI styling, responsive + mobile safe-areas
├── main.js      # Entire game: Three.js world, player, spawner, collisions,
│                #   power-ups, missions, procedural audio — no external assets
└── README.md    # This file
```

`main.js` is intentionally dependency-free apart from Three.js: trains,
graffiti textures, buildings, the runner character, the Inspector and his
dog, coins, effects and even the sound effects (WebAudio oscillators) are
all synthesized in code.

## Tech

- [Three.js](https://threejs.org/) (r160 via CDN import map) — 3D scene,
  lighting, shadows, fog.
- Vanilla JS + HTML/CSS — no framework, no build tools, no assets.
- Procedural `CanvasTexture` art (graffiti trains, buildings, ramp stripes).

## History

See `git log` — the build is committed in stages: initial playable game,
ramp rework, spawner-fairness/jetpack pass, and this README.
