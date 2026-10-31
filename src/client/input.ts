/**
 * Input: keyboard on desktop, a thumbstick and three buttons on phones (held sideways).
 * Keyboard: WASD or arrows to move, Shift to sprint, Space (or C) to crouch (hold still to lie
 * down), E (or B, or Enter) to bark, M for sound, Esc for the menu.
 * Touch: drag anywhere (not on a button or panel) to steer (drag past the ring to sprint), BARK, a DOWN
 * toggle for crouching, and a SPRINT button you hold.
 */
export const isTouch = (() => {
  try {
    return matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window || new URLSearchParams(location.search).has('touch');
  } catch {
    return false;
  }
})();

export class Input {
  private keys = new Set<string>();
  dx = 0;
  dz = 0;
  sprint = false;
  crouch = false;
  onBark = () => {};
  onEscape = () => {};
  onMute = () => {};
  /** Called whenever movement or posture input changes (so it reaches the room without waiting for a frame). */
  onChange = () => {};
  /** For the on-screen diagnostics. */
  debug(): string {
    return `stick ${this.stick.id !== null ? `${this.stick.x.toFixed(2)},${this.stick.z.toFixed(2)}` : 'up'} in ${this.dx.toFixed(2)},${this.dz.toFixed(2)}${this.blocked ? ' BLOCKED' : ''}`;
  }
  /** Set while a text field has focus or a panel is open, so typing doesn't walk you around. */
  blocked = false;
  /**
   * Blocked right now: a menu is open or you're typing in a box. Checked live, not just once a
   * frame, so steering straight after typing a room code and pressing Enter works.
   */
  private get blockedNow(): boolean {
    return !!document.querySelector('#modal:not(.hidden):not(.glance)') || document.activeElement?.tagName === 'INPUT';
  }
  /**
   * Which finger (or mouse) holds the stick, as a key like t3 or p1; null when nobody does.
   * Never compare ids to zero: iOS hands out touch identifiers that can be negative, and an
   * `id >= 0` test once made every drag on an iPhone count as "not held".
   */
  private stick: { id: string | null; ox: number; oz: number; x: number; z: number; full: boolean } = { id: null, ox: 0, oz: 0, x: 0, z: 0, full: false };
  private touchCrouch = false;

  constructor() {
    addEventListener('keydown', (e) => {
      if (e.key === 'Escape') return this.onEscape();
      if (this.blockedNow || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if (k === ' ' || k.startsWith('arrow')) e.preventDefault();
      if (!e.repeat && (k === 'e' || k === 'b' || k === 'enter')) this.onBark();
      if (!e.repeat && k === 'm') this.onMute();
      this.keys.add(k);
      this.update();
    });
    addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
      this.update();
    });
    addEventListener('blur', () => this.clear());
    if (isTouch) this.touchControls();
    // Some phones and tablets don't report a coarse pointer: the first touch turns the controls on.
    else addEventListener('touchstart', () => this.touchControls(), { once: true, passive: true });
  }

  private touchOn = false;

  private update(): void {
    const has = (...k: string[]) => k.some((x) => this.keys.has(x));
    let dx = (has('d', 'arrowright') ? 1 : 0) - (has('a', 'arrowleft') ? 1 : 0);
    let dz = (has('s', 'arrowdown') ? 1 : 0) - (has('w', 'arrowup') ? 1 : 0);
    let sprint = has('shift');
    let crouch = has(' ', 'c', 'control');
    if (this.stick.id !== null) {
      [dx, dz] = [this.stick.x, this.stick.z];
      sprint ||= this.stick.full;
    }
    crouch ||= this.touchCrouch;
    if (this.blockedNow) [dx, dz, sprint, crouch] = [0, 0, false, false];
    [this.dx, this.dz, this.sprint, this.crouch] = [dx, dz, sprint && !crouch, crouch];
    this.onChange();
  }

  /**
   * The window lost focus: let go of held keys. Touch is left alone. iOS fires a window blur
   * inside the Claude app's web view as a drag starts, which used to cancel the stick mid-drag
   * (the knob followed your finger, the dog never moved). A touch ends with touchend, not blur.
   */
  clear(): void {
    this.keys.clear();
    this.update();
  }

  /** The thumbstick appears wherever your thumb lands (off the buttons and panels). */
  private touchControls(): void {
    if (this.touchOn) return;
    this.touchOn = true;
    document.body.classList.add('touch');
    document.getElementById('controls')?.setAttribute('hidden', '');
    const pad = document.getElementById('touch')!;
    pad.hidden = false;
    const base = pad.querySelector<HTMLElement>('.stick')!;
    const knob = pad.querySelector<HTMLElement>('.knob')!;
    const R = 56;
    const zone = pad.querySelector<HTMLElement>('.stick-zone')!;
    // Touch events, not pointer events, drive the stick: in phone web views (the Claude app among
    // them) the page around the game can claim a drag as a scroll and cancel the pointer. Calling
    // preventDefault on non-passive touch listeners keeps the drag ours. Pointer events stay for a
    // mouse or pen (testing on a laptop with ?touch).
    const begin = (id: string, x: number, y: number) => {
      if (this.stick.id !== null) return;
      // Only a focused text field needs letting go of; blurring anything else can blur the window.
      const focused = document.activeElement as HTMLElement | null;
      if (focused?.tagName === 'INPUT') focused.blur();
      Object.assign(this.stick, { id, ox: x, oz: y, x: 0, z: 0, full: false });
      base.style.left = `${x}px`;
      base.style.top = `${y}px`;
      base.classList.add('on');
      knob.style.transform = 'translate(-50%, -50%)';
      this.update();
    };
    const move = (id: string, cx: number, cy: number) => {
      if (id !== this.stick.id) return;
      let x = cx - this.stick.ox;
      let z = cy - this.stick.oz;
      const l = Math.hypot(x, z);
      if (l > R) [x, z] = [(x / l) * R, (z / l) * R];
      knob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${z}px))`;
      const m = Math.min(1, l / R);
      // A small dead zone, then a straight response; pushed past the edge means sprint.
      const k = m < 0.15 ? 0 : m;
      [this.stick.x, this.stick.z] = l > 0 ? [(x / Math.min(l, R)) * k, (z / Math.min(l, R)) * k] : [0, 0];
      this.stick.full = l > R * 1.25;
      // Sprinting (dragged past the ring's edge): the knob lights up.
      base.classList.toggle('sprint', this.stick.full);
      this.update();
    };
    const end = (id: string) => {
      if (id !== this.stick.id) return;
      this.stick.id = null;
      base.classList.remove('on', 'sprint');
      this.update();
    };
    const opts = { passive: false } as const;
    zone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      // A stick whose finger is gone (its touchend never arrived) gives way to the new touch.
      if (this.stick.id?.startsWith('t') && !Array.from(e.touches).some((t) => `t${t.identifier}` === this.stick.id)) end(this.stick.id);
      const t = e.changedTouches[0];
      if (t) begin(`t${t.identifier}`, t.clientX, t.clientY);
    }, opts);
    zone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) move(`t${t.identifier}`, t.clientX, t.clientY);
    }, opts);
    for (const ev of ['touchend', 'touchcancel'] as const) {
      zone.addEventListener(ev, (e) => {
        for (const t of Array.from(e.changedTouches)) end(`t${t.identifier}`);
      });
    }
    zone.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      zone.setPointerCapture(e.pointerId);
      begin(`p${e.pointerId}`, e.clientX, e.clientY);
    });
    zone.addEventListener('pointermove', (e) => e.pointerType !== 'touch' && move(`p${e.pointerId}`, e.clientX, e.clientY));
    for (const ev of ['pointerup', 'pointercancel'] as const) zone.addEventListener(ev, (e) => e.pointerType !== 'touch' && end(`p${e.pointerId}`));

    // Buttons: react on touchstart (no 300 ms wait, no scroll stealing), with pointer for a mouse.
    const btn = (sel: string) => pad.querySelector<HTMLElement>(sel)!;
    const press = (el: HTMLElement, down: () => void, up?: () => void) => {
      el.addEventListener('touchstart', (e) => (e.preventDefault(), down()), opts);
      if (up) for (const ev of ['touchend', 'touchcancel'] as const) el.addEventListener(ev, (e) => (e.preventDefault(), up()), opts);
      el.addEventListener('pointerdown', (e) => e.pointerType !== 'touch' && (e.preventDefault(), down()));
      if (up) for (const ev of ['pointerup', 'pointerleave'] as const) el.addEventListener(ev, (e) => e.pointerType !== 'touch' && up());
    };
    press(btn('.bark'), () => this.onBark());
    press(btn('.down'), () => {
      this.touchCrouch = !this.touchCrouch;
      btn('.down').classList.toggle('on', this.touchCrouch);
      this.update();
    });
    // Switching away mid-drag: let go of the stick.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'hidden') return;
      if (this.stick.id !== null) end(this.stick.id);
    });
    // The page itself never scrolls or zooms under a thumb.
    document.addEventListener('touchmove', (e) => {
      if (!(e.target as HTMLElement).closest?.('.side, .sheet')) e.preventDefault();
    }, opts);
  }

  /** Show touch buttons as ready or not (bark cooldown) without the HUD knowing about touch. */
  setBarkReady(ready: boolean): void {
    document.querySelector('#touch .bark')?.classList.toggle('cool', !ready);
  }
}
