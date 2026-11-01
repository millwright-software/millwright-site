// stick.js — the on-screen joystick for touch screens. A faint pad rests in its corner; a thumb that lands on the canvas
// moves the pad under it, and dragging walks: the further the drag, the faster. A quick tap without a drag is a tap (A).
//
//   const s = createStick({ dom, corner: 'left', color })
//   s.down(touch, now)  -> true if this finger is now the stick's (false if it already has one)
//   s.move(touch); s.up(touch, now) -> 'tap' | 'drag' | null (null: not this finger)
//   s.x, s.y            // -1..1, screen axes (y down); 0 inside the dead zone
//   s.mag               // 0..1
//   s.id                // the finger's identifier, -1 when free
//   s.show(on)          // the resting pad (only on touch screens, only while there is something to steer)
//   s.reset(); s.dispose()
const R = 60;          // px from the centre to full tilt
const DEAD = .18;      // fraction of R that does nothing
const TAP_MS = 240, TAP_PX = 14;

export function createStick({ dom = document.body, corner = 'left', color = '#e0b53a' } = {}) {
  const base = document.createElement('div'), knob = document.createElement('div');
  base.className = 'stick ' + corner; knob.className = 'knob'; knob.style.background = color; base.appendChild(knob); dom.appendChild(base);
  const S = { x: 0, y: 0, mag: 0, id: -1 };
  let ox = 0, oy = 0, t0 = 0, moved = 0, shown = false;
  function place(x, y) { base.style.left = `${x - R}px`; base.style.top = `${y - R}px`; base.classList.add('live'); }
  function rest() { base.style.left = base.style.top = ''; base.classList.remove('live'); knob.style.transform = ''; }
  S.down = (t, now = performance.now()) => {
    if (S.id >= 0) return false; S.id = t.identifier; ox = t.clientX; oy = t.clientY; t0 = now; moved = 0; S.x = S.y = S.mag = 0;
    place(ox, oy); base.style.display = 'block'; return true;
  };
  S.move = t => {
    if (t.identifier !== S.id) return;
    let dx = t.clientX - ox, dy = t.clientY - oy; const d = Math.hypot(dx, dy); moved = Math.max(moved, d);
    if (d > R) { dx *= R / d; dy *= R / d; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const m = Math.min(1, d / R); if (m < DEAD) { S.x = S.y = S.mag = 0; return; }
    S.mag = (m - DEAD) / (1 - DEAD); S.x = dx / Math.max(d, 1e-6) * S.mag; S.y = dy / Math.max(d, 1e-6) * S.mag;
  };
  S.up = (t, now = performance.now()) => {
    if (t.identifier !== S.id) return null; const tap = now - t0 < TAP_MS && moved < TAP_PX;
    S.id = -1; S.x = S.y = S.mag = 0; rest(); base.style.display = shown ? 'block' : 'none'; return tap ? 'tap' : 'drag';
  };
  S.show = on => { shown = !!on; if (S.id < 0) base.style.display = shown ? 'block' : 'none'; };
  S.reset = () => { S.id = -1; S.x = S.y = S.mag = 0; rest(); base.style.display = shown ? 'block' : 'none'; };
  S.dispose = () => base.remove();
  base.style.display = 'none';
  return S;
}

// One step of console-style walking (main.js). (wx, wz) is the wanted world direction (unit length, or 0, 0), mag how far
// the stick is pushed (1 for keys and the d-pad), run whether Shift / B is held or an analog stick is pushed all the way
// (main.js decides). She walks; run, or the same way for AUTO_RUN seconds, scampers. An animal goes where it faces, so the velocity always points along the heading:
//   - the heading turns toward the wanted way at a capped rate (TURN_WALK deg/s walking, TURN_RUN running), never a snap;
//   - the speed follows the error: want * max(0, cos(err))^2, so 90 degrees off she barely creeps and past TURN_IN_PLACE
//     she turns on the spot, then sets off along her new facing (a curve, not a sideways slide);
//   - only the speed eases (ACCEL_K up, DECEL_K down): no instant stops, no ice.
//   const m = moveState(); const f = stepMove(m, wx, wz, mag, run, dt); pos.x += m.vx * RUN_MPS * dt; ...
//   f = speed as a fraction of RUN_MPS; m.speed in m/s; m.turn the turn rate in rad/s (+ = turning left)
export const RUN_MPS = 3.0, WALK = .5, AUTO_RUN = 1.0;   // walk 1.5 m/s, run 3 m/s
const DEG = Math.PI / 180, TURN_WALK = 540 * DEG, TURN_RUN = 400 * DEG, TURN_IN_PLACE = 135 * DEG;
const ACCEL_K = 7, DECEL_K = 10;
export const moveState = (heading = Math.PI / 2) => ({ vx: 0, vz: 0, heading, speed: 0, turn: 0, sameT: 0, lx: 0, lz: 0, running: false });
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
export function stepMove(m, wx, wz, mag, run, dt) {
  if (mag > 0) { if (wx * m.lx + wz * m.lz > .85) m.sameT += dt; else m.sameT = 0; m.lx = wx; m.lz = wz; }
  else { m.sameT = 0; m.lx = m.lz = 0; }
  m.running = mag > 0 && (run || m.sameT > AUTO_RUN);
  let want = mag <= 0 ? 0 : (m.running ? 1 : WALK * (.4 + .6 * Math.min(1, mag))) * RUN_MPS;
  const h0 = m.heading;
  if (mag > 0) {
    const d = wrap(Math.atan2(wx, wz) - m.heading), cap = (m.running ? TURN_RUN : TURN_WALK) * dt;
    m.heading = wrap(m.heading + Math.max(-cap, Math.min(cap, d)));
    const err = Math.abs(wrap(Math.atan2(wx, wz) - m.heading));
    want = err > TURN_IN_PLACE ? 0 : want * Math.max(0, Math.cos(err)) ** 2;
  }
  m.turn = dt > 0 ? wrap(m.heading - h0) / dt : 0;
  m.speed += (want - m.speed) * (1 - Math.exp(-(want > m.speed ? ACCEL_K : DECEL_K) * dt));
  if (want === 0 && m.speed < .02) m.speed = 0;
  m.vx = Math.sin(m.heading) * m.speed / RUN_MPS; m.vz = Math.cos(m.heading) * m.speed / RUN_MPS;
  return m.speed / RUN_MPS;
}
// a gamepad's move: the left stick, else the d-pad (buttons 12-15); x right, y up
export function padMove(gp, dead = .2) {
  if (!gp) return null; const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
  if (Math.hypot(ax, ay) > dead) return { x: ax, y: -ay, mag: Math.min(1, Math.hypot(ax, ay)) };
  const b = i => !!gp.buttons[i]?.pressed; const x = (b(15) ? 1 : 0) - (b(14) ? 1 : 0), y = (b(12) ? 1 : 0) - (b(13) ? 1 : 0);
  return x || y ? { x: x / Math.hypot(x, y), y: y / Math.hypot(x, y), mag: 1 } : null;
}

// The trackpad stick (Eric, 10/31: "the trackpad is the main control"). A click on the game locks the pointer; from then
// on the finger's glide (movementX / movementY) pushes a virtual stick that STAYS where it was pushed when the finger
// stops, so she keeps walking that way with the finger resting. Gliding back into the middle (the dead zone, DEAD of the
// radius) is neutral: she stops. Inside the dead zone a slow drift pulls the stick to dead centre, so neutral stays easy
// to find. What she obeys (x, y) eases toward the stick over PAD_EASE seconds: damped, never twitchy. A ring with a dot
// in the bottom-left corner shows the stick; the dot glows at full tilt. If the lock is refused, press-and-drag drives
// it instead (the press point is the centre; letting go is neutral).
//
//   const p = createPad({ dom, color })
//   p.feed(dx, dy)          locked glide, in CSS px (movementX / movementY)
//   p.dragStart(x, y); p.dragTo(x, y); p.dragEnd(now) -> 'tap' | 'drag'   (the fallback)
//   p.update(dt)            once a frame: the ease, the recentre, the ring
//   p.x, p.y                -1..1 screen axes (y down), eased; 0 inside the dead zone.  p.mag 0..1
//   p.raw                   { x, y } the stick itself, -1..1 (before the dead zone and the ease)
//   p.fullT                 seconds at full tilt (main.js runs after 1)
//   p.dragging; p.show(on); p.reset(); p.dispose()
export const PAD_R = 150;      // px of locked glide from the centre to full tilt: one easy finger stroke (a few cm) on a trackpad
const PAD_DEAD = .2, PAD_EASE = .15, PAD_RECENTRE = 1.6, PAD_DRAG_R = 90, PAD_TAP_MS = 260, PAD_TAP_PX = 8;
export function createPad({ dom = document.body, color = '#e0b53a' } = {}) {
  const ring = document.createElement('div'), dead = document.createElement('div'), dot = document.createElement('div');
  ring.className = 'tpad'; dead.className = 'tpadDead'; dot.className = 'tpadDot'; dot.style.background = color;
  ring.append(dead, dot); dom.appendChild(ring); ring.style.display = 'none';
  const P = { x: 0, y: 0, mag: 0, raw: { x: 0, y: 0 }, fullT: 0, dragging: false };
  let ox = 0, oy = 0, t0 = 0, moved = 0, shown = false, lastDot = '';
  const clampRaw = () => { const d = Math.hypot(P.raw.x, P.raw.y); if (d > 1) { P.raw.x /= d; P.raw.y /= d; } };
  P.feed = (dx, dy) => { if (!Number.isFinite(dx) || !Number.isFinite(dy)) return; if (Math.abs(dx) > 400 || Math.abs(dy) > 400) return;   // a bogus jump (some browsers send one on lock)
    P.raw.x += dx / PAD_R; P.raw.y += dy / PAD_R; clampRaw(); };
  P.dragStart = (x, y, now = performance.now()) => { P.dragging = true; ox = x; oy = y; t0 = now; moved = 0; P.raw.x = P.raw.y = 0; };
  P.dragTo = (x, y) => { if (!P.dragging) return; const dx = x - ox, dy = y - oy; moved = Math.max(moved, Math.hypot(dx, dy)); P.raw.x = dx / PAD_DRAG_R; P.raw.y = dy / PAD_DRAG_R; clampRaw(); };
  P.dragEnd = (now = performance.now()) => { if (!P.dragging) return null; P.dragging = false; P.raw.x = P.raw.y = 0; return now - t0 < PAD_TAP_MS && moved < PAD_TAP_PX ? 'tap' : 'drag'; };
  P.update = dt => {
    const d = Math.hypot(P.raw.x, P.raw.y);
    if (d < PAD_DEAD && !P.dragging) { const k = Math.exp(-dt * PAD_RECENTRE); P.raw.x *= k; P.raw.y *= k; }   // the gentle pull to centre, only in neutral
    // the wanted output: 0 in the dead zone, then 0..1 across the rest of the radius
    let wx = 0, wy = 0; if (d >= PAD_DEAD) { const m = (Math.min(1, d) - PAD_DEAD) / (1 - PAD_DEAD); wx = P.raw.x / d * m; wy = P.raw.y / d * m; }
    const k = 1 - Math.exp(-dt / PAD_EASE); P.x += (wx - P.x) * k; P.y += (wy - P.y) * k;
    P.mag = Math.min(1, Math.hypot(P.x, P.y)); if (P.mag < .02 && !wx && !wy) { P.x = P.y = P.mag = 0; }
    P.fullT = d >= .97 ? P.fullT + dt : 0;
    if (shown) { const R = ring.clientWidth / 2 - dot.clientWidth / 2, s = `translate(${(P.raw.x * R).toFixed(1)}px, ${(P.raw.y * R).toFixed(1)}px)` + (d >= .97 ? ' scale(1.15)' : '');
      if (s !== lastDot) { lastDot = s; dot.style.transform = s; } ring.classList.toggle('full', d >= .97); ring.classList.toggle('neutral', d < PAD_DEAD); }
  };
  P.show = on => { if (shown === !!on) return; shown = !!on; ring.style.display = shown ? 'block' : 'none'; };
  P.reset = () => { P.raw.x = P.raw.y = P.x = P.y = P.mag = P.fullT = 0; P.dragging = false; };
  P.dispose = () => ring.remove();
  return P;
}
