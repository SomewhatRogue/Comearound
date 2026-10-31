/**
 * Input: keyboard on desktop, a thumbstick and three buttons on phones (held sideways).
 * Keyboard: WASD or arrows to move, Shift to sprint, Space (or C) to crouch (hold still to lie
 * down), E (or B, or Enter) to bark, M for sound, Esc for the menu.
 * Touch: drag anywhere on the left half to steer (push to the edge to sprint), BARK, a DOWN
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
  /** Set while a text field has focus or a panel is open, so typing doesn't walk you around. */
  blocked = false;
  private stick = { id: -1, ox: 0, oz: 0, x: 0, z: 0, full: false };
  private touchSprint = false;
  private touchCrouch = false;

  constructor() {
    addEventListener('keydown', (e) => {
      if (e.key === 'Escape') return this.onEscape();
      if (this.blocked || (e.target as HTMLElement)?.tagName === 'INPUT') return;
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
  }

  private update(): void {
    const has = (...k: string[]) => k.some((x) => this.keys.has(x));
    let dx = (has('d', 'arrowright') ? 1 : 0) - (has('a', 'arrowleft') ? 1 : 0);
    let dz = (has('s', 'arrowdown') ? 1 : 0) - (has('w', 'arrowup') ? 1 : 0);
    let sprint = has('shift');
    let crouch = has(' ', 'c', 'control');
    if (this.stick.id >= 0) {
      [dx, dz] = [this.stick.x, this.stick.z];
      sprint ||= this.stick.full;
    }
    sprint ||= this.touchSprint;
    crouch ||= this.touchCrouch;
    if (this.blocked) [dx, dz, sprint, crouch] = [0, 0, false, false];
    [this.dx, this.dz, this.sprint, this.crouch] = [dx, dz, sprint && !crouch, crouch];
  }

  clear(): void {
    this.keys.clear();
    this.stick.id = -1;
    this.touchSprint = false;
    this.update();
  }

  /** The thumbstick appears where your thumb lands on the left side of the screen. */
  private touchControls(): void {
    document.body.classList.add('touch');
    const pad = document.getElementById('touch')!;
    pad.hidden = false;
    const base = pad.querySelector<HTMLElement>('.stick')!;
    const knob = pad.querySelector<HTMLElement>('.knob')!;
    const R = 56;
    const zone = pad.querySelector<HTMLElement>('.stick-zone')!;
    zone.addEventListener('pointerdown', (e) => {
      if (this.stick.id >= 0) return;
      zone.setPointerCapture(e.pointerId);
      Object.assign(this.stick, { id: e.pointerId, ox: e.clientX, oz: e.clientY, x: 0, z: 0, full: false });
      base.style.left = `${e.clientX}px`;
      base.style.top = `${e.clientY}px`;
      base.classList.add('on');
      knob.style.transform = 'translate(-50%, -50%)';
      this.update();
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stick.id) return;
      let x = e.clientX - this.stick.ox;
      let z = e.clientY - this.stick.oz;
      const l = Math.hypot(x, z);
      if (l > R) [x, z] = [(x / l) * R, (z / l) * R];
      knob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${z}px))`;
      const m = Math.min(1, l / R);
      // A small dead zone, then a straight response; pushed to the edge means sprint.
      const k = m < 0.15 ? 0 : m;
      [this.stick.x, this.stick.z] = l > 0 ? [(x / Math.min(l, R)) * k, (z / Math.min(l, R)) * k] : [0, 0];
      this.stick.full = l > R * 1.25;
      this.update();
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.stick.id) return;
      this.stick.id = -1;
      base.classList.remove('on');
      this.update();
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);

    const btn = (sel: string) => pad.querySelector<HTMLElement>(sel)!;
    btn('.bark').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.onBark();
    });
    const sprint = btn('.sprint');
    sprint.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      sprint.setPointerCapture(e.pointerId);
      this.touchSprint = true;
      this.touchCrouch = false;
      btn('.down').classList.remove('on');
      this.update();
    });
    for (const ev of ['pointerup', 'pointercancel'] as const) sprint.addEventListener(ev, () => ((this.touchSprint = false), this.update()));
    btn('.down').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.touchCrouch = !this.touchCrouch;
      btn('.down').classList.toggle('on', this.touchCrouch);
      this.update();
    });
    // Sideways and full screen, where the browser allows it (it often won't; that's fine).
    const goBig = () => {
      const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
      try {
        void (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.())?.catch?.(() => {});
        void (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape').catch(() => {});
      } catch {
        /* not allowed here */
      }
    };
    addEventListener('pointerdown', goBig, { once: true });
  }

  /** Show touch buttons as ready or not (bark cooldown) without the HUD knowing about touch. */
  setBarkReady(ready: boolean): void {
    document.querySelector('#touch .bark')?.classList.toggle('cool', !ready);
  }
}
