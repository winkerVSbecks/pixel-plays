// the page chrome around the game: the Rules and About popups, the credits and the music
import { mount } from './shell.js';

mount({
  title: 'Cricket',
  music: 'cricket.mp3',
  rules: [
    'Chase the target in 5 overs of 6 balls. Lose 3 wickets and you are all out. The bowler swaps between fast and spin each over.',
    'Swing when the two ticks on the ball\'s path close into a bar. Right on it and the ball goes up in the air, usually for six, but it can be caught or sail over a wall and out. A little off and it is hit hard along the ground. Further off and it pops up softly for little or nothing. A moved ball drops a step unless perfect; one hit against its line always does.',
    'The wedge on the landing ring shows which way the ball will move, and how far. Hit with it and the ball goes where you aim and carries: more runs, but more often out. Hit across it and the ball squirts off your line and slows, or takes an edge that can be caught; the bigger the wedge, the worse. Good timing helps but does not save you.',
    'Aim with the arrow keys (two for a diagonal), Q W E A D Z X C or the mouse; the dotted line from the batter shows where. Press Space or click to swing. With no key held you hit straight past the bowler. On a touch screen, tap around the batter to aim and swing at once.',
    'House rules: the house wall is 4 if the ball bounces first and 6 on the full. Past the chalk line is the same. Clean over the wall is out.',
    'You are also out if the ball knocks over the bricks, or a fielder catches it before it touches the ground or a wall. Hard-hit catches are sometimes dropped. A ball a fielder stops is worth 0 to 3 runs, more the further it went, so find the gaps.',
  ],
});
