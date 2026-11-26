// The page markup the game modules look up when they load (the #c canvas, the HUD nodes, the team picker and the
// aerial toggle), taken from index.html and kept in a hidden holder. Import this before any game module.
import page from 'virtual:game-page';

export const holder = document.getElementById('game-dom') || (() => {
  const doc = new DOMParser().parseFromString(page, 'text/html');
  const div = document.createElement('div');
  div.id = 'game-dom';
  div.hidden = true;
  for (const node of [...doc.body.children]) if (node.tagName !== 'SCRIPT') div.append(document.importNode(node, true));
  document.body.append(div);
  return div;
})();
// the page's own stylesheet, for the UI stories that show the real HUD
export const pageCss = new DOMParser().parseFromString(page, 'text/html').querySelector('style').textContent;
