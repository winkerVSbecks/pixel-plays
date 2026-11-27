# Gully Cricket

Street cricket in a lane, shown as an isometric pixel diorama. Chase a target in 5 overs with 3 wickets and hit into the gaps between the fielders. It is plain JavaScript modules with their own software rasteriser, bundled by Vite, with no runtime dependencies. The scene uses no sprites or image assets. The only images are the favicon, the touch icon and the link preview, all drawn as pixel art by a script (`npm run art`).

**Play: https://pixel-plays-ruby.vercel.app/**

Gully Cricket by [Varun](https://varun.ca), based on the original concept by [abhi](https://x.com/awwbhi2) and games by [AmirMushich](https://x.com/AmirMushich): [Pixel Plays on GitHub](https://github.com/amirmushichge/pixel-plays). Visual reference for the style: shawn.'s [Small plays](https://x.com/zzzzshawn/status/2111546123546661289); no assets or subjects were copied.

## Controls
- Aim with the arrow keys (two for a diagonal), Q W E A D Z X C, or the mouse. The dotted line from the batter shows where. With no direction held you hit straight past the bowler.
- Space, Enter or a click plays a grounded shot, along the ground. Hold Shift for an aerial shot, in the air: Shift+Space, Shift+Enter or Shift+click. Shift on its own does nothing.
- A grounded shot is safer: a clean one can't be caught on the full, and it scores at most 4. An aerial shot can go for 6 but is caught far more often.
- On a touch screen, tap around the batter to aim and swing at once; a tap plays grounded. The **aerial** button above the bottom bar arms the next ball for an aerial shot and resets after it. It shows only while you play by touch.
- **Rules** (top right) explains scoring and how you get out, and the info icon beside it opens About. **change team** goes back to the welcome screen; **sound on/off** mutes the music and effects.

## Welcome screen and difficulty
Before each match the welcome screen asks for your team (nine kits; the fielding side is drawn from the rest, in a kit unlike yours) and a difficulty of 1 to 5 stars. Play starts the match. Both choices are remembered in the browser, and the HUD shows the stars in play. Each level adds to the one before it:

| Stars | Name | What changes |
| --- | --- | --- |
| 1 | easy | The game as tuned: a target of 50 to 85, with the timing cue and the movement wedge shown. |
| 2 | steady | A higher target, 60 to 95. |
| 3 | tough | Fielders react quicker and run faster to catches, the bowler takes wider return catches, and hitting across a ball that moved costs more and edges more often. |
| 4 | hard | As 3, with no timing cue: judge the swing yourself. |
| 5 | expert | As 4, with no movement wedge on the landing ring, and the ball moves 25% more off the pitch. |

All the values are in `src/game/difficulty.js`.

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
- `src/main.js` mounts the page chrome (`src/page.js`, using `src/shell.js`: the Rules and About popups and the music), then starts the game.
- `src/engine.js` is the renderer: camera, depth buffer, colour ramps, shadows, edges, figures, trees and wind. `createTarget(canvas)` gives a canvas its own buffers and `useTarget(target)` draws to it, so several canvases can each show a scene.
- `src/game.js` boots the game: the pause rule, the frame loop and the test controls on `window.__cricket` (freeze, seed, step, advance, swing, setDifficulty, simulate and more).
- `src/game/` holds the game's parts as modules: `constants` (layout, bowling, teams, fields), `scene` (the baked lane), `state` (`G`), `rng` (the seeded mulberry32 sequence), `screen` (the page canvas as the render target), `figures`, `bowler`, `delivery`, `ball`, `fielding`, `match`, `celebration`, `batter`, `fx`, `update` (one step of `dt` seconds), `draw`, `hud`, `input` (aim and the grounded and aerial shots), `sound`, `picker` (the welcome screen), `difficulty` (the five levels) and `simulate` (headless seeded balls that tally what each shot type does).
- `src/stories/` holds the Storybook stories: Scene/Ground (the empty lane), Batter, Bowler, Fielding, Ball and UI (the HUD and the welcome screen). Each story has time, play, rate, seed and difficulty controls.
- `src/stories/harness/` drives them: `dom` loads the page markup the game modules expect, `scenario` replays a seeded delivery through the real game modules to any time, and `view` is the story frame and its shared controls.
- `public/cricket.mp3` is the background track, copied into the build as it is.
- `public/favicon.svg` is the favicon, a redrawn 16×16 pixel tennis ball, copied into the build as it is.
- `public/apple-touch-icon.png` is the same ball as a home-screen icon, and `public/og.png` is the 1200×630 pixel-art link preview image that the sharing tags in `index.html` point at.
- `scripts/` draws those three images in code; `npm run art` regenerates them, with no extra dependencies.

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
