import test from 'node:test';
import assert from 'node:assert/strict';
import { createPhysicsWorld, loadSandboxPreset, spawnSandboxBody, stepPhysicsWorld } from './physics';
import type { TrackedHandState } from './types';

function makeHand(overrides: Partial<TrackedHandState> = {}): TrackedHandState {
  return {
    side: 'right',
    active: true,
    position: { x: 0.8, y: 1.5, z: -0.7 },
    velocity: { x: 0, y: 0, z: 0 },
    pinchStrength: 0,
    isPinching: false,
    isFist: false,
    punchSpeed: 0,
    screenX: 0.7,
    screenY: 0.5,
    ...overrides,
  };
}

test('tower preset remains grounded above workbench without falling through floor', () => {
  const world = createPhysicsWorld('tower');
  assert.ok(world.bodies.length >= 10, 'tower preset should populate crates and spheres');

  for (let i = 0; i < 60; i++) {
    stepPhysicsWorld(world, [], 1 / 60);
  }

  for (const body of world.bodies) {
    assert.ok(
      body.position.y >= world.floorY + body.halfExtents.y - 0.005,
      `body ${body.id} fell below workbench floor`
    );
  }
});

test('fast hand punch imparts real 3D impulse and displaces cube', () => {
  const world = createPhysicsWorld('tower');
  const target = world.bodies[0];
  const initialZ = target.position.z;

  const punchHand = makeHand({
    position: { x: target.position.x, y: target.position.y, z: target.position.z + 0.14 },
    velocity: { x: 0.4, y: 0.5, z: -6.5 },
    punchSpeed: 0.9,
  });

  const events = stepPhysicsWorld(world, [punchHand], 1 / 60);
  assert.ok(events.some((e) => e.fromHand), 'expected hand collision event');

  for (let i = 0; i < 15; i++) {
    stepPhysicsWorld(world, [], 1 / 60);
  }

  assert.ok(target.position.z < initialZ - 0.15, 'punched cube should fly backward along -Z');
});

test('pinch-grab lifts object and release throws it with hand momentum', () => {
  const world = createPhysicsWorld('tower');
  const sphere = world.bodies.find((b) => b.shape === 'sphere')!;

  // Step 1: Pinch near sphere to grab
  const grabHand = makeHand({
    position: { x: sphere.position.x, y: sphere.position.y, z: sphere.position.z },
    isPinching: true,
    pinchStrength: 1,
  });
  stepPhysicsWorld(world, [grabHand], 1 / 60);
  assert.equal(sphere.grabbedBy, 'right', 'pinching near sphere should grab it');

  // Step 2: Lift upward while still pinching
  const liftedHand = makeHand({
    position: { x: sphere.position.x + 0.25, y: sphere.position.y + 0.55, z: sphere.position.z },
    velocity: { x: 2.5, y: 3.0, z: -4.0 },
    isPinching: true,
    pinchStrength: 1,
  });
  for (let i = 0; i < 10; i++) {
    stepPhysicsWorld(world, [liftedHand], 1 / 60);
  }
  assert.ok(sphere.position.y > world.floorY + 0.35, 'grabbed sphere should follow lifted hand');

  // Step 3: Release pinch -> inherits throw velocity
  const releaseHand = makeHand({
    position: liftedHand.position,
    velocity: { x: 2.5, y: 1.5, z: -5.0 },
    isPinching: false,
    pinchStrength: 0,
  });
  stepPhysicsWorld(world, [releaseHand], 1 / 60);
  assert.equal(sphere.grabbedBy, null);
  assert.ok(sphere.velocity.z < -3.0, 'released sphere should fly forward with throw velocity');
});

test('presets and dynamic spawning maintain capped body budget', () => {
  const world = createPhysicsWorld('domino');
  assert.equal(world.preset, 'domino');
  assert.ok(world.bodies.some((b) => b.shape === 'domino'));

  loadSandboxPreset(world, 'pendulum');
  assert.ok(world.bodies.some((b) => b.tetherAnchor !== null), 'pendulum preset should include tethered spheres');

  for (let i = 0; i < 30; i++) {
    spawnSandboxBody(world, i % 2 === 0 ? 'cube' : 'sphere');
  }
  assert.ok(world.bodies.length <= 24, 'physics body count should stay capped for stable 60fps');
});
