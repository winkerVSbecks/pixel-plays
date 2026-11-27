// the page chrome around the game: the Controls, Rules and About popups and the music
import { mount } from './shell.js';

mount({
  music: 'cricket.mp3',
  // the Controls popup: a bold label, then its text
  controls: [
    ['Aim:', 'arrow keys (two for a diagonal), Q W E A D Z X C, or the mouse. The dotted line shows where. With no key held, you hit straight past the bowler.'],
    ['Ground shot:', 'Space, Enter, or click.'],
    ['Aerial shot:', 'hold Shift as you hit.'],
    ['Touch:', 'tap around the batter to aim and hit along the ground. Tap aerial first to hit the next ball in the air.'],
  ],
  // the Rules popup, numbered: text, or { text, items } for a rule with a list under it
  rules: [
    'Chase the target in 5 overs of 6 balls. Lose 3 wickets and you\'re all out. The bowler alternates fast and spin each over.',
    'Swing when the two ticks close into a bar. The closer to the bar, the harder and straighter the hit. Well off it, the ball pops up softly for little or nothing.',
    'Ground shots can\'t be caught unless you mistime or edge them, but score 4 at most. Aerial shots can go for 6, but can be caught or sail over the wall for out.',
    'The wedge on the landing ring shows which way and how far the ball will move. Hit with it for more runs and more risk. Hit across it and the ball slows, goes off line, or edges to a catch. The bigger the wedge, the worse. A moving ball scores one step less unless timed perfectly; hitting across it always does.',
    'Scoring: the house wall (or past the chalk line) is 4 if the ball bounces first, 6 on the full. Ground shots are 4 even on the full. A ball a fielder stops is worth 0 to 3, more the further it went, so find the gaps.',
    'You\'re out if the ball hits the bricks, clears the wall, or is caught before touching the ground or a wall. From 3 stars, the bowler can catch soft hits straight back at him. Hard-hit catches are sometimes dropped.',
    {
      text: 'Difficulty, chosen before each match. Each level adds to the last:',
      items: [
        '2 stars: higher target',
        '3 stars: quicker fielders, bowler can catch, hitting across the movement costs more',
        '4 stars: no ticks, so you judge timing yourself',
        '5 stars: no wedge (the ring stays), and the ball moves more',
      ],
    },
  ],
});
