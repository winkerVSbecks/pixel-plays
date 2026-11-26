# Pixel Plays: Cricket

Street cricket in a lane, shown as an isometric pixel diorama. Chase a target in 5 overs with 3 wickets and hit into the gaps between the fielders. It is one page of plain JavaScript with its own software rasteriser: no build step, no dependencies, no sprites or image assets.

**Play: https://pixel-plays-ruby.vercel.app/**

Concept by [abhi](https://x.com/awwbhi2) and Game by [AmirMushich](https://x.com/AmirMushich). Visual reference for the style: shawn.'s [Small plays](https://x.com/zzzzshawn/status/2111546123546661289); no assets or subjects were copied.

## Controls
- Aim with the arrow keys (two for a diagonal), Q W E A D Z X C, or the mouse. The dotted line from the batter shows where.
- Press Space or click to swing. With no key held you hit straight past the bowler.
- On a touch screen, tap around the batter to aim and swing at once.
- **Rules** (top right) explains scoring and how you get out. **change team** picks a new side; **sound on/off** mutes the music and effects.

## Run
Requires [Node.js](https://nodejs.org/); nothing to install.

```bash
node serve.mjs
```

Then open http://127.0.0.1:5300/. Any static file server works, and the site deploys as plain static files.

## Files
- `index.html` is the game: its own `groundColor`, `bake`, `update` and `draw`, plus the HUD and team picker.
- `shell.js` provides the Rules popup, the credits and the background music.
- `engine.js` provides the camera, depth buffer, colour ramps, shadows, edges, figures, trees and wind as globals.
- `cricket.mp3` is the background track.

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
