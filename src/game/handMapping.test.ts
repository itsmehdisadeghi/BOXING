import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeMotionZoneTarget,
  DEFAULT_HAND_MAPPING,
  detectHighGuard,
  mapLandmarksToHandTarget,
  updateTrackedHandKinematics,
} from './handMapping';
import type { TrackedHandState } from './types';

function makeHandLandmarks(centerX: number, centerY: number, palmSize: number, pinchGap: number, tipReach: number) {
  const pts = Array.from({ length: 21 }, () => ({ x: centerX, y: centerY, z: 0 }));
  // Wrist (0)
  pts[0] = { x: centerX, y: centerY + palmSize * 0.6, z: 0 };
  // Index MCP (5), Middle MCP (9), Pinky MCP (17)
  pts[5] = { x: centerX - palmSize * 0.45, y: centerY - palmSize * 0.4, z: 0 };
  pts[9] = { x: centerX, y: centerY - palmSize * 0.4, z: 0 };
  pts[17] = { x: centerX + palmSize * 0.45, y: centerY - palmSize * 0.4, z: 0 };
  // Thumb tip (4) & Index tip (8)
  pts[4] = { x: centerX - pinchGap * 0.5, y: centerY - tipReach, z: 0 };
  pts[8] = { x: centerX + pinchGap * 0.5, y: centerY - tipReach, z: 0 };
  // Other tips (12, 16, 20)
  pts[12] = { x: centerX, y: centerY - tipReach, z: 0 };
  pts[16] = { x: centerX + 0.02, y: centerY - tipReach, z: 0 };
  pts[20] = { x: centerX + 0.04, y: centerY - tipReach, z: 0 };
  return pts;
}

test('mapLandmarksToHandTarget mirrors X and maps larger palm to deeper Z punch reach', () => {
  const resting = mapLandmarksToHandTarget(makeHandLandmarks(0.25, 0.5, 0.1, 0.09, 0.18), 'right');
  const thrust = mapLandmarksToHandTarget(makeHandLandmarks(0.25, 0.5, 0.22, 0.09, 0.35), 'right');

  // Raw x=0.25 mirrors to 0.75 (positive right world X)
  assert.ok(resting.position.x > 0.5, 'expected mirrored right-side X > 0.5');
  assert.ok(thrust.position.z < resting.position.z - 0.5, 'larger palm should thrust forward into deeper -Z');
});

test('mapLandmarksToHandTarget accurately detects pinch and open palm', () => {
  const pinched = mapLandmarksToHandTarget(makeHandLandmarks(0.5, 0.5, 0.15, 0.02, 0.2), 'left');
  const open = mapLandmarksToHandTarget(makeHandLandmarks(0.5, 0.5, 0.15, 0.12, 0.25), 'left');

  assert.equal(pinched.isPinching, true);
  assert.ok(pinched.pinchStrength > 0.7);
  assert.equal(open.isPinching, false);
});

test('updateTrackedHandKinematics computes forward punch speed smoothly', () => {
  const initial: TrackedHandState = {
    side: 'right',
    active: true,
    position: { x: 0.4, y: 1.3, z: -0.7 },
    velocity: { x: 0, y: 0, z: 0 },
    pinchStrength: 0,
    isPinching: false,
    isFist: true,
    punchSpeed: 0,
    screenX: 0.7,
    screenY: 0.5,
  };

  const next = updateTrackedHandKinematics(
    initial,
    { x: 0.4, y: 1.35, z: -1.65 },
    0.032,
    { active: true, pinchStrength: 0, isPinching: false, isFist: true, screenX: 0.7, screenY: 0.48 }
  );

  assert.ok(next.velocity.z < -3, 'rapid forward target should yield negative Z velocity');
  assert.ok(next.punchSpeed > 0.45, 'punchSpeed should scale up on forward jab');
});

test('detectHighGuard triggers only when both hands are raised near center', () => {
  const makeHand = (side: 'left' | 'right', x: number, y: number, z: number): TrackedHandState => ({
    side,
    active: true,
    position: { x, y, z },
    velocity: { x: 0, y: 0, z: 0 },
    pinchStrength: 0,
    isPinching: false,
    isFist: true,
    punchSpeed: 0,
    screenX: 0.5,
    screenY: 0.5,
  });

  assert.equal(
    detectHighGuard(makeHand('left', -0.3, 1.62, -0.82), makeHand('right', 0.3, 1.6, -0.82)),
    true
  );
  assert.equal(
    detectHighGuard(makeHand('left', -0.3, 1.1, -0.82), makeHand('right', 0.3, 1.1, -0.82)),
    false
  );
});

test('computeMotionZoneTarget detects localized motion in mirrored left/right zones', () => {
  const w = 40;
  const h = 30;
  const prev = new Uint8Array(w * h).fill(20);
  const curr = new Uint8Array(w * h).fill(20);

  // Paint bright motion blob in raw left half (x 4..12, y 8..16) => mirrored right hand
  for (let y = 8; y < 16; y++) {
    for (let x = 4; x < 12; x++) {
      curr[y * w + x] = 200;
    }
  }

  const rightZone = computeMotionZoneTarget(prev, curr, w, h, 'right', DEFAULT_HAND_MAPPING);
  const leftZone = computeMotionZoneTarget(prev, curr, w, h, 'left', DEFAULT_HAND_MAPPING);

  assert.equal(rightZone.detected, true);
  assert.ok(rightZone.position.x > 0.3);
  assert.equal(leftZone.detected, false);
});
