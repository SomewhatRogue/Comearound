/**
 * Keyboard input: WASD or arrows to move, E or Space to pick up / put down, Q to open the board.
 * Movement is sent only when it changes. Touch controls come with the Discord slice.
 */
export class Input {
  private keys = new Set<string>();
  dx = 0;
  dz = 0;
  onInteract = () => {};
  onBoard = () => {};
  onEscape = () => {};
  /** Set by the HUD while a panel has focus, so typing a name doesn't walk you around. */
  blocked = false;

  constructor() {
    addEventListener('keydown', (e) => {
      if (e.key === 'Escape') return this.onEscape();
      if (this.blocked || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if (!e.repeat && (k === 'e' || k === ' ')) {
        e.preventDefault();
        this.onInteract();
      }
      if (!e.repeat && k === 'q') this.onBoard();
      this.keys.add(k);
      this.update();
    });
    addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
      this.update();
    });
    addEventListener('blur', () => {
      this.keys.clear();
      this.update();
    });
  }

  private update(): void {
    const has = (...k: string[]) => k.some((x) => this.keys.has(x));
    this.dx = (has('d', 'arrowright') ? 1 : 0) - (has('a', 'arrowleft') ? 1 : 0);
    this.dz = (has('s', 'arrowdown') ? 1 : 0) - (has('w', 'arrowup') ? 1 : 0);
    if (this.blocked) this.dx = this.dz = 0;
  }

  clear(): void {
    this.keys.clear();
    this.update();
  }
}
