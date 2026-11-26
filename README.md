# Pixel Plays: Cricket

Street cricket in a lane, shown as an isometric pixel diorama. Chase a target in 5 overs with 3 wickets and hit into the gaps between the fielders. It is plain JavaScript modules with their own software rasteriser, bundled by Vite: no runtime dependencies, no sprites or image assets.

**Play: https://pixel-plays-ruby.vercel.app/**

Concept by [abhi](https://x.com/awwbhi2) and Game by [AmirMushich](https://x.com/AmirMushich). Visual reference for the style: shawn.'s [Small plays](https://x.com/zzzzshawn/status/2111546123546661289); no assets or subjects were copied.

## Controls
- Aim with the arrow keys (two for a diagonal), Q W E A D Z X C, or the mouse. The dotted line from the batter shows where.
- Press Space or click to swing. With no key held you hit straight past the bowler.
- On a touch screen, tap around the batter to aim and swing at once.
- **Rules** (top right) explains scoring and how you get out. **change team** picks a new side; **sound on/off** mutes the music and effects.

## Run
Requires [Node.js](https://nodejs.org/) 20.19+ or 22.12+.

```bash
npm install
npm run dev              # the game, with reload on save
npm run build            # bundle the game into dist/
npm run preview          # serve dist/ as it will be deployed
npm run storybook        # parts of the game in Storybook, at http://localhost:6006/
npm run build-storybook  # a static Storybook in storybook-static/
```

Vercel runs `npm run build` and serves `dist/` (see `vercel.json`). Old `/cricket/` links redirect to `/`.

## Files
- `index.html` is the page: the canvas, the HUD and the team picker's markup and styles. It loads `src/main.js`.
- `src/main.js` mounts the page chrome (`src/page.js`, using `src/shell.js`: the Rules and About popups, the credits and the music), then starts the game.
- `src/engine.js` is the renderer: camera, depth buffer, colour ramps, shadows, edges, figures, trees and wind. `createTarget(canvas)` gives a canvas its own buffers and `useTarget(target)` draws to it, so several canvases can each show a scene.
- `src/game.js` boots the game: the pause rule, the frame loop and the test controls on `window.__cricket` (freeze, seed, step, advance and more).
- `src/game/` holds the game's parts as modules: `constants` (layout, bowling, teams, fields), `scene` (the baked lane), `state` (`G`), `rng` (the seeded mulberry32 sequence), `figures`, `bowler`, `delivery`, `ball`, `fielding`, `match`, `celebration`, `batter`, `fx`, `update` (one step of `dt` seconds), `draw`, `hud`, `input`, `sound` and `picker`.
- `src/stories/` holds the Storybook stories; `Scene/Ground` draws the empty lane.
- `public/cricket.mp3` is the background track, copied into the build as it is.

## Visual rules
- One small place floating on pure white, with no UI chrome around it.
- Low-resolution canvas (360x280), nearest-neighbour upscale, integer device-pixel scale.
- Fixed 30-degree orthographic camera; a ragged dithered edge dissolving into white.
- Real-time rasteriser with a depth buffer, four shade levels and Bayer dither.
- Long, hard cast shadows falling screen-right. One readable physical action.
- Hue-shifted colour ramps: shadows drift to violet, lights to warm yellow.
- Depth-buffer edges: darker where an object sits in front, a warm rim on upper-left edges.
- Large flat surfaces use closely spaced tones; wide steps make the dither read as a checkerboard.
- Characters stay sharp: flat bands with no dither, a dark silhouette on their own pixels, patterns at least 3px wide.
- Ambient motion only in plants: grass and leaves sway in whole pixels at 8 fps, and stop under `prefers-reduced-motion`.

## License
The code and the music are under the [MIT License](LICENSE). See [MUSIC.md](MUSIC.md) for the track.
