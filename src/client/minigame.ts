/**
 * The minigame screen: one lane engine, six skins. Things slide right to left past the marker;
 * press E or Space when the one you want is under it. The server dealt the lane and judges your
 * press time (ms since the lane appeared on your screen), so what you see is what counts.
 * Painting first asks for medium, colour and subject (the easel), then one steady-hand press.
 */
import { ACTS, describe, laneX, type ActId, type Attrs, type Lane, type LaneObj } from '../shared/activities';
import { SWATCH } from './entities';

const TITLE: Record<ActId, string> = { fish: 'Fishing', fruit: 'Fruit picking', bake: 'Baking', candle: 'Candle lighting', archery: 'Archery', paint: 'Painting' };
const BG: Record<ActId, [string, string]> = {
  fish: ['#5aa0c8', '#2f6f8f'], fruit: ['#bfe3a0', '#6f9a4a'], bake: ['#5a2e1c', '#2a1610'],
  candle: ['#5a4a6a', '#2d2438'], archery: ['#a8c97a', '#6f8f4a'], paint: ['#f6efe0', '#e7dcc4'],
};
const PIGMENT: Record<string, string> = { yellow: '#f5c53d', blue: '#4f86c6', red: '#d8433a', green: '#5aa646' };

export class Minigame {
  lane: Lane | null = null;
  private start = 0;
  private pressed = false;
  private pressedAt = 0;
  private result: { text: string; good: boolean; until: number } | null = null;
  private el = document.getElementById('minigame')!;
  private canvas = this.el.querySelector('canvas') as HTMLCanvasElement;
  private ctx = this.canvas.getContext('2d')!;
  /** Painting choices, made at the easel before the brush stroke. */
  pick: Attrs = { medium: 'oil', color: 'yellow', subject: 'moon' };
  pickerOpen = false;
  /** Painting: the lane waits here until the picks are made. */
  private pending: Lane | null = null;
  private askText: string | null = null;

  constructor(private sendPress: (at: number, pick?: Attrs) => void) {
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-pick]') as HTMLElement | null;
      if (b) {
        this.pick[b.dataset.pick!] = b.dataset.v!;
        this.renderPicker();
      }
      if ((e.target as HTMLElement).closest('[data-go]')) this.go();
    });
  }

  get busy(): boolean {
    return !!this.lane || this.pickerOpen || !!this.result;
  }

  /** The easel is yours: choose medium, colour and subject; a second E (or the button) starts the stroke. */
  private openPicker(lane: Lane, ask: string | null): void {
    this.pending = lane;
    this.askText = ask;
    this.pickerOpen = true;
    this.result = null;
    this.el.hidden = false;
    this.el.querySelector('h3')!.textContent = 'Painting';
    this.el.querySelector('.ask')!.textContent = ask ?? 'You do not know the ask. Paint something believable.';
    this.renderPicker();
  }

  go(): void {
    if (!this.pickerOpen || !this.pending) return;
    this.pickerOpen = false;
    const lane = this.pending;
    this.pending = null;
    this.start = performance.now();
    this.lane = lane;
    this.pressed = false;
    (this.el.querySelector('.picker') as HTMLElement).hidden = true;
    this.el.querySelector('.ask')!.textContent = 'Keep your hand steady: press E when the brush is on the line.';
  }

  /** Walk away from the easel: give it back (counts as a miss). */
  cancel(): void {
    if (!this.pickerOpen) return;
    this.pickerOpen = false;
    this.pending = null;
    this.sendPress(-1);
  }

  private renderPicker(): void {
    const box = this.el.querySelector('.picker') as HTMLElement;
    if (!this.pickerOpen) return void (box.hidden = true);
    box.hidden = false;
    const row = (k: string) => `<div class="pick-row"><b>${k === 'color' ? 'colour' : k}</b>${ACTS.paint.attrs[k].map((v) => `<button data-pick="${k}" data-v="${v}" class="chip ${this.pick[k] === v ? 'on' : ''}">${k === 'color' ? `<i style="background:${PIGMENT[v]}"></i>` : ''}${v}</button>`).join('')}</div>`;
    box.innerHTML = `${row('medium')}${row('color')}${row('subject')}<button class="big" data-go>Start painting (E)</button>`;
  }

  open(lane: Lane, ask: string | null): void {
    if (lane.act === 'paint') return this.openPicker(lane, ask);
    this.lane = lane;
    this.start = performance.now();
    this.pressed = false;
    this.result = null;
    this.el.hidden = false;
    (this.el.querySelector('.picker') as HTMLElement).hidden = true;
    this.el.querySelector('h3')!.textContent = TITLE[lane.act];
    this.el.querySelector('.ask')!.textContent = ask ?? 'You do not know the ask. Watch what others catch, and act natural.';
  }

  press(): void {
    if (!this.lane || this.pressed) return;
    this.pressed = true;
    this.pressedAt = performance.now();
    this.sendPress(performance.now() - this.start, this.lane.act === 'paint' ? this.pick : undefined);
  }

  /** The server's verdict on your press. */
  showResult(act: ActId, attrs: Attrs | null, spoiled: boolean): void {
    // The attempt can end while you are still choosing (the goat): close the picker too.
    this.pickerOpen = false;
    this.pending = null;
    const text = spoiled ? 'The goat! That one did not count.' : attrs ? `${act === 'paint' ? 'Painted' : act === 'archery' ? 'Hit' : 'Got'}: ${describe(act, attrs)}` : 'Missed!';
    this.result = { text, good: !!attrs && !spoiled, until: performance.now() + 1300 };
    this.lane = null;
  }

  frame(): void {
    if (this.result && performance.now() > this.result.until) this.result = null;
    // Never leave the screen stuck on "Judging..." if a result goes missing.
    if (this.lane && this.pressed && performance.now() - this.pressedAt > 3000) this.lane = null;
    if (!this.lane && !this.result && !this.pickerOpen) {
      this.el.hidden = true;
      return;
    }
    const c = this.ctx;
    const W = (this.canvas.width = this.canvas.clientWidth * devicePixelRatio);
    const H = (this.canvas.height = this.canvas.clientHeight * devicePixelRatio);
    const act = this.lane?.act ?? 'paint';
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, BG[act][0]);
    g.addColorStop(1, BG[act][1]);
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    if (this.result) {
      c.fillStyle = this.result.good ? '#fffbe8' : '#ffd9d4';
      c.font = `600 ${H * 0.2}px Fredoka, sans-serif`;
      c.textAlign = 'center';
      c.fillText(this.result.text, W / 2, H * 0.58);
      return;
    }
    if (!this.lane) return;
    const t = performance.now() - this.start;
    const s = H / 220;
    for (const o of this.lane.objs) {
      const x = laneX(this.lane, o, t);
      if (x < -1.1 || x > 1.1) continue;
      // Things travel right to left: x = -1 is the right edge.
      draw(c, act, o, W / 2 - (x * W) / 2.2, H * 0.55, s);
    }
    marker(c, act, W / 2, H, s);
    c.fillStyle = '#ffffffcc';
    c.font = `600 ${13 * s}px Fredoka, sans-serif`;
    c.textAlign = 'center';
    c.fillText(this.pressed ? 'Judging...' : 'Press E or Space when it is under the marker', W / 2, H - 10 * s);
  }
}

function draw(c: CanvasRenderingContext2D, act: ActId, o: LaneObj, x: number, y: number, s: number): void {
  const a = o.attrs;
  const k = (a.size === 'big' ? 1.25 : a.size === 'small' ? 0.75 : 1) * s;
  c.save();
  c.translate(x, y);
  c.scale(k, k);
  if (act === 'fish') {
    c.fillStyle = SWATCH[a.color];
    c.beginPath(); c.ellipse(0, 0, 34, 18, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.moveTo(30, 0); c.lineTo(52, -16); c.lineTo(52, 16); c.closePath(); c.fill();
    c.fillStyle = '#1d1d1d'; c.beginPath(); c.arc(-18, -4, 3.5, 0, Math.PI * 2); c.fill();
  } else if (act === 'fruit') {
    c.fillStyle = SWATCH[a.kind];
    if (a.kind === 'pear') { c.beginPath(); c.arc(0, 8, 20, 0, Math.PI * 2); c.arc(0, -12, 13, 0, Math.PI * 2); c.fill(); }
    else if (a.kind === 'plum') { c.beginPath(); c.ellipse(0, 0, 18, 22, 0, 0, Math.PI * 2); c.fill(); }
    else { c.beginPath(); c.arc(0, 0, 22, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = '#5aa646'; c.beginPath(); c.ellipse(7, -26, 9, 4, -0.5, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#6b4423'; c.lineWidth = 3; c.beginPath(); c.moveTo(0, -18); c.lineTo(1, -30); c.stroke();
  } else if (act === 'bake') {
    c.fillStyle = a.done === 'burnt' ? '#4a3226' : '#e8b04a';
    if (a.kind === 'pie') { c.beginPath(); c.ellipse(0, 0, 32, 14, 0, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#00000033'; c.lineWidth = 2; for (const d of [-14, 0, 14]) { c.beginPath(); c.moveTo(d, -12); c.lineTo(d, 12); c.stroke(); } }
    else if (a.kind === 'cake') { c.fillRect(-26, -16, 52, 32); c.fillStyle = a.done === 'burnt' ? '#2b1d15' : '#fff3f6'; c.fillRect(-26, -22, 52, 9); }
    else { c.beginPath(); c.ellipse(0, 0, 34, 18, 0, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#00000033'; c.lineWidth = 2; for (const d of [-12, 0, 12]) { c.beginPath(); c.moveTo(d - 5, -10); c.lineTo(d + 5, 10); c.stroke(); } }
  } else if (act === 'candle') {
    c.fillStyle = SWATCH[a.color];
    c.fillRect(-10, -26, 20, 52);
    c.fillStyle = '#ffcf4a'; c.beginPath(); c.ellipse(0, -36, 6, 10, 0, 0, Math.PI * 2); c.fill();
  } else if (act === 'archery') {
    const col = a.target === 'red' ? '#d8433a' : '#4f86c6';
    for (const [r, f] of [[30, col], [22, '#fff'], [14, col], [6, '#f5c53d']] as const) { c.fillStyle = f; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill(); }
  } else {
    c.fillStyle = '#2b2233'; c.beginPath(); c.ellipse(0, 0, 26, 9, 0.2, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#8b5a2b'; c.fillRect(-60, -3, 40, 6);
  }
  c.restore();
}

function marker(c: CanvasRenderingContext2D, act: ActId, x: number, H: number, s: number): void {
  c.save();
  c.strokeStyle = act === 'paint' ? '#2b2233' : '#ffffff';
  c.fillStyle = c.strokeStyle;
  c.lineWidth = 3 * s;
  if (act === 'archery') {
    c.beginPath(); c.arc(x, H * 0.55, 8 * s, 0, Math.PI * 2); c.stroke();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { c.beginPath(); c.moveTo(x + dx * 12 * s, H * 0.55 + dy * 12 * s); c.lineTo(x + dx * 24 * s, H * 0.55 + dy * 24 * s); c.stroke(); }
  } else if (act === 'fish') {
    c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H * 0.55 - 10 * s); c.stroke();
    c.beginPath(); c.arc(x - 6 * s, H * 0.55 - 10 * s, 6 * s, 0, Math.PI); c.stroke();
  } else {
    c.setLineDash([6 * s, 6 * s]);
    c.beginPath(); c.moveTo(x, 12 * s); c.lineTo(x, H - 28 * s); c.stroke();
  }
  c.restore();
}
