// A simple training partner for the lab. It produces PlayerInput for the
// same PlayerController the human uses (no special physics, no shortcuts):
//  - defender: closes down the ball carrier, jockeys, times standing tackles
//  - dribbler: keeps the ball and dribbles back and forth (tackle practice)
//  - passer:   receives and passes back to you (first touch / first time)
import type { BallController } from '../ball/BallController.ts';
import type { PlayerController } from '../player/PlayerController.ts';
import { emptyInput, type PlayerInput } from '../player/PlayerTypes.ts';
import type { SparringMode } from './labStore.ts';

interface Memory { holdUntil: number; waypoint: number; tackleCooldown: number; passAt: number }
const memory = new WeakMap<PlayerController, Memory>();

const toward = (from: { x: number; z: number }, to: { x: number; z: number }) => {
  const dx = to.x - from.x, dz = to.z - from.z, l = Math.hypot(dx, dz) || 1;
  return { x: dx / l, z: dz / l, d: Math.hypot(dx, dz) };
};

export function sparringInput(me: PlayerController, user: PlayerController, ball: BallController, mode: SparringMode, now: number): PlayerInput {
  const m = memory.get(me) ?? { holdUntil: 0, waypoint: 1, tackleCooldown: 0, passAt: 0 };
  memory.set(me, m);
  const inp = emptyInput();
  const b = ball.curr.position;
  const toBall = toward(me.pos, b);

  if (mode === 'defender') {
    // Stay goal-side (−z is "my" goal in the lab) and close the ball down.
    const goal = { x: 0, z: -52.5 };
    const guard = toward(b, goal);
    const spot = { x: b.x + guard.x * 1.6, z: b.z + guard.z * 1.6 };
    const go = toward(me.pos, spot);
    if (toBall.d > 6) { inp.move = { x: go.x, z: go.z }; inp.sprint = toBall.d > 10; }
    else {
      inp.defend = true;
      inp.move = go.d > 0.4 ? { x: go.x * Math.min(1, go.d), z: go.z * Math.min(1, go.d) } : { x: 0, z: 0 };
      if (toBall.d < 1.25 && now > m.tackleCooldown && ball.lastTouchBy !== me.id) {
        inp.standTackle = true;
        m.tackleCooldown = now + 1.6;
      }
    }
    return inp;
  }

  if (mode === 'dribbler') {
    if (me.hasBall) {
      const target = { x: 9 * m.waypoint, z: me.pos.z + 3 };
      const t = toward(me.pos, target);
      if (Math.abs(me.pos.x - target.x) < 1.5) m.waypoint *= -1;
      inp.move = { x: t.x, z: t.z * 0.35 };
      const userClose = Math.hypot(user.pos.x - me.pos.x, user.pos.z - me.pos.z) < 3;
      inp.defend = userClose; // shield when pressed
      return inp;
    }
    inp.move = { x: toBall.x, z: toBall.z };
    inp.sprint = toBall.d > 4;
    return inp;
  }

  if (mode === 'passer') {
    const toUser = toward(me.pos, user.pos);
    if (me.hasBall || (ball.lastTouchBy === me.id && toBall.d < 1.4)) {
      if (m.passAt === 0) m.passAt = now + 0.7;
      inp.move = { x: toUser.x * 0.2, z: toUser.z * 0.2 };
      if (now >= m.passAt && now < m.passAt + 0.12 + (toUser.d / 32) * 0.9) inp.pass = true;
      if (now > m.passAt + 1.5) m.passAt = 0;
      return inp;
    }
    m.passAt = 0;
    const ballComingToMe = ball.lastTouchBy === user.id && toBall.d < 30;
    if (ballComingToMe || toBall.d < 8) { inp.move = { x: toBall.x, z: toBall.z }; inp.jog = toBall.d < 3; return inp; }
    // Hold a spot ~14 m from the user.
    const spot = { x: user.pos.x + 10, z: user.pos.z + 10 };
    const go = toward(me.pos, spot);
    inp.move = go.d > 1 ? { x: go.x, z: go.z } : { x: 0, z: 0 };
    inp.jog = true;
    return inp;
  }
  return inp;
}
