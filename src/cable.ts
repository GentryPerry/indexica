/** A cable's momentary offset from its resting hang, and how fast that offset is changing. */
export interface Spring { x: number; y: number; vx: number; vy: number }

export const still = (): Spring => ({ x: 0, y: 0, vx: 0, vy: 0 });

/**
 * The cable's ends moved by (dx, dy): its belly lags behind, so push the offset the opposite way.
 * The offset is capped so a fast drag cannot fling the cable off screen.
 */
export function kick(s: Spring, dx: number, dy: number, max = 70): Spring {
  const x = s.x - dx * 0.6, y = s.y - dy * 0.6, len = Math.hypot(x, y);
  const k = len > max ? max / len : 1;
  return { ...s, x: x * k, y: y * k };
}

/** Advance the swing by dt seconds: a damped spring pulling the offset back to zero, with a little overshoot. */
export function step(s: Spring, dt: number, stiffness = 90, damping = 9): Spring {
  const t = Math.min(dt, 0.032);
  const vx = s.vx + (-stiffness * s.x - damping * s.vx) * t;
  const vy = s.vy + (-stiffness * s.y - damping * s.vy) * t;
  return { x: s.x + vx * t, y: s.y + vy * t, vx, vy };
}

export const atRest = (s: Spring) => Math.hypot(s.x, s.y) < 0.3 && Math.hypot(s.vx, s.vy) < 3;
