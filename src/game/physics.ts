import type { HandSide, SandboxPreset, TrackedHandState, Vec3 } from './types';

export type BodyShape = 'cube' | 'sphere' | 'domino' | 'cylinder';

export interface PhysicsBody {
  id: number;
  shape: BodyShape;
  position: Vec3;
  velocity: Vec3;
  rotation: Vec3;
  angularVelocity: Vec3;
  /** Half-extents for boxes/dominoes, or radius in x/y/z for spheres */
  halfExtents: Vec3;
  radius: number;
  mass: number;
  restitution: number;
  colorIndex: number;
  grabbedBy: HandSide | null;
  hitFlash: number;
  /** Optional anchor point for pendulum bodies */
  tetherAnchor: Vec3 | null;
  tetherLength: number;
}

export interface PhysicsCollisionEvent {
  bodyId: number;
  intensity: number;
  position: Vec3;
  fromHand: boolean;
}

export interface PhysicsWorldState {
  bodies: PhysicsBody[];
  nextId: number;
  preset: SandboxPreset;
  /** Table/arena floor Y height */
  floorY: number;
  boundsX: number;
  minZ: number;
  maxZ: number;
}

const GRAVITY = -14.5;
const LINEAR_DAMPING = 0.992;
const ANGULAR_DAMPING = 0.96;
const FLOOR_FRICTION = 0.84;
const HAND_COLLIDER_RADIUS = 0.17;
const GRAB_RADIUS = 0.34;

export function createPhysicsWorld(preset: SandboxPreset = 'tower'): PhysicsWorldState {
  const world: PhysicsWorldState = {
    bodies: [],
    nextId: 1,
    preset,
    floorY: 0.88, // Workbench table surface height
    boundsX: 1.55,
    minZ: -2.45,
    maxZ: -0.75,
  };
  loadSandboxPreset(world, preset);
  return world;
}

function makeBody(
  id: number,
  shape: BodyShape,
  pos: Vec3,
  halfExtents: Vec3,
  mass: number,
  colorIndex: number,
  tetherAnchor: Vec3 | null = null,
  tetherLength = 0
): PhysicsBody {
  const radius =
    shape === 'sphere'
      ? halfExtents.x
      : Math.max(halfExtents.x, halfExtents.y, halfExtents.z) * 0.92;
  return {
    id,
    shape,
    position: { ...pos },
    velocity: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    angularVelocity: { x: 0, y: 0, z: 0 },
    halfExtents: { ...halfExtents },
    radius,
    mass,
    restitution: shape === 'sphere' ? 0.68 : 0.34,
    colorIndex,
    grabbedBy: null,
    hitFlash: 0,
    tetherAnchor: tetherAnchor ? { ...tetherAnchor } : null,
    tetherLength,
  };
}

export function loadSandboxPreset(world: PhysicsWorldState, preset: SandboxPreset): void {
  world.bodies = [];
  world.preset = preset;
  const fy = world.floorY;

  if (preset === 'tower') {
    // 3-2-1 Pyramid of beveled crates + 2 flanking spheres
    const s = 0.14;
    const gap = 0.012;
    const zCenter = -1.55;
    // Bottom row (4 crates)
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * (s * 2 + gap);
      world.bodies.push(
        makeBody(world.nextId++, 'cube', { x, y: fy + s, z: zCenter }, { x: s, y: s, z: s }, 1.2, i % 3)
      );
    }
    // Middle row (3 crates)
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * (s * 2 + gap);
      world.bodies.push(
        makeBody(world.nextId++, 'cube', { x, y: fy + s * 3 + 0.004, z: zCenter }, { x: s, y: s, z: s }, 1.0, (i + 1) % 3)
      );
    }
    // Upper row (2 crates)
    for (let i = 0; i < 2; i++) {
      const x = (i - 0.5) * (s * 2 + gap);
      world.bodies.push(
        makeBody(world.nextId++, 'cube', { x, y: fy + s * 5 + 0.008, z: zCenter }, { x: s, y: s, z: s }, 0.9, (i + 2) % 3)
      );
    }
    // Apex crown sphere
    world.bodies.push(
      makeBody(world.nextId++, 'sphere', { x: 0, y: fy + s * 7 + 0.015, z: zCenter }, { x: 0.13, y: 0.13, z: 0.13 }, 0.85, 3)
    );
    // Two interactive spheres up front ready to grab & throw
    world.bodies.push(
      makeBody(world.nextId++, 'sphere', { x: -0.78, y: fy + 0.14, z: -1.15 }, { x: 0.14, y: 0.14, z: 0.14 }, 1.1, 3)
    );
    world.bodies.push(
      makeBody(world.nextId++, 'sphere', { x: 0.78, y: fy + 0.14, z: -1.15 }, { x: 0.14, y: 0.14, z: 0.14 }, 1.1, 4)
    );
  } else if (preset === 'domino') {
    // Curved arc of 9 weighted domino slabs + launch sphere
    const count = 9;
    const h = 0.24;
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const x = -0.95 + t * 1.9;
      const z = -1.35 - Math.sin(t * Math.PI) * 0.45;
      world.bodies.push(
        makeBody(
          world.nextId++,
          'domino',
          { x, y: fy + h, z },
          { x: 0.05, y: h, z: 0.13 },
          0.9,
          i % 4
        )
      );
    }
    // Bonus brass sphere on right
    world.bodies.push(
      makeBody(world.nextId++, 'sphere', { x: -1.15, y: fy + 0.14, z: -1.18 }, { x: 0.14, y: 0.14, z: 0.14 }, 1.2, 3)
    );
  } else {
    // Pendulum & Newton targets: 2 hanging heavy spheres + 6 target cubes
    world.bodies.push(
      makeBody(
        world.nextId++,
        'sphere',
        { x: -0.34, y: 1.52, z: -1.45 },
        { x: 0.17, y: 0.17, z: 0.17 },
        1.6,
        3,
        { x: -0.34, y: 2.55, z: -1.45 },
        1.03
      )
    );
    world.bodies.push(
      makeBody(
        world.nextId++,
        'sphere',
        { x: 0.34, y: 1.52, z: -1.45 },
        { x: 0.17, y: 0.17, z: 0.17 },
        1.6,
        4,
        { x: 0.34, y: 2.55, z: -1.45 },
        1.03
      )
    );
    // Two mini stacks underneath
    const s = 0.13;
    for (let stack = -1; stack <= 1; stack += 2) {
      for (let level = 0; level < 3; level++) {
        world.bodies.push(
          makeBody(
            world.nextId++,
            'cube',
            { x: stack * 0.85, y: fy + s + level * (s * 2 + 0.005), z: -1.52 },
            { x: s, y: s, z: s },
            1.0,
            level % 3
          )
        );
      }
    }
  }
}

export function spawnSandboxBody(world: PhysicsWorldState, shape: BodyShape): PhysicsBody {
  // Cap maximum objects at 24 for silky 60fps performance
  if (world.bodies.length >= 24) {
    const removableIdx = world.bodies.findIndex((b) => !b.tetherAnchor && !b.grabbedBy);
    if (removableIdx >= 0) world.bodies.splice(removableIdx, 1);
  }
  const offsetX = ((world.nextId * 37) % 100) / 100 - 0.5;
  const x = offsetX * 0.9;
  const z = -1.35 - (((world.nextId * 19) % 100) / 100) * 0.45;
  const y = world.floorY + 0.85;
  const halfExtents =
    shape === 'sphere'
      ? { x: 0.14, y: 0.14, z: 0.14 }
      : shape === 'domino'
      ? { x: 0.055, y: 0.22, z: 0.12 }
      : { x: 0.14, y: 0.14, z: 0.14 };

  const body = makeBody(
    world.nextId++,
    shape,
    { x, y, z },
    halfExtents,
    shape === 'sphere' ? 1.15 : 1.0,
    world.nextId % 5
  );
  world.bodies.push(body);
  return body;
}

/**
 * Advances the 3D physics sandbox one frame with clamped dt, hand grab/throw, hand punch impulses,
 * tether constraints, body-body collisions, and workbench boundaries.
 */
export function stepPhysicsWorld(
  world: PhysicsWorldState,
  hands: TrackedHandState[],
  rawDt: number
): PhysicsCollisionEvent[] {
  const dt = Math.min(Math.max(rawDt, 0.001), 0.04);
  const events: PhysicsCollisionEvent[] = [];

  // 1. Handle Pinch-Grab & Release per hand
  for (const hand of hands) {
    const currentlyHeld = world.bodies.find((b) => b.grabbedBy === hand.side);

    if (hand.active && hand.isPinching) {
      if (!currentlyHeld) {
        // Find closest ungrabbed body within GRAB_RADIUS
        let best: PhysicsBody | null = null;
        let bestDist = GRAB_RADIUS;
        for (const body of world.bodies) {
          if (body.grabbedBy !== null) continue;
          const d = Math.hypot(
            body.position.x - hand.position.x,
            body.position.y - hand.position.y,
            body.position.z - hand.position.z
          );
          if (d < bestDist + body.radius * 0.4) {
            bestDist = d;
            best = body;
          }
        }
        if (best) {
          best.grabbedBy = hand.side;
          best.hitFlash = 0.18;
        }
      }
    } else if (currentlyHeld) {
      // Release with hand throw momentum!
      currentlyHeld.grabbedBy = null;
      currentlyHeld.velocity.x = hand.velocity.x * 1.15;
      currentlyHeld.velocity.y = hand.velocity.y * 1.15 + 0.6;
      currentlyHeld.velocity.z = hand.velocity.z * 1.15;
      currentlyHeld.angularVelocity.x += (Math.random() - 0.5) * 3;
      currentlyHeld.angularVelocity.y += hand.velocity.x * 1.8;
    }
  }

  // 2. Integrate bodies & apply hand collisions/grab springs
  for (const body of world.bodies) {
    if (body.hitFlash > 0) body.hitFlash = Math.max(0, body.hitFlash - dt);

    if (body.grabbedBy) {
      const hand = hands.find((h) => h.side === body.grabbedBy);
      if (hand && hand.active) {
        const pull = 24;
        body.velocity.x = (hand.position.x - body.position.x) * pull;
        body.velocity.y = (hand.position.y - body.position.y) * pull;
        body.velocity.z = (hand.position.z - body.position.z) * pull;
        body.position.x += body.velocity.x * dt;
        body.position.y += body.velocity.y * dt;
        body.position.z += body.velocity.z * dt;
        body.angularVelocity.x *= 0.85;
        body.angularVelocity.y *= 0.85;
        body.angularVelocity.z *= 0.85;
      } else {
        body.grabbedBy = null;
      }
    } else {
      // Gravity
      body.velocity.y += GRAVITY * dt;

      // Hand punch / push collision
      for (const hand of hands) {
        if (!hand.active) continue;
        const dx = body.position.x - hand.position.x;
        const dy = body.position.y - hand.position.y;
        const dz = body.position.z - hand.position.z;
        const dist = Math.hypot(dx, dy, dz);
        const minDist = HAND_COLLIDER_RADIUS + body.radius;

        if (dist < minDist && dist > 0.0001) {
          const nx = dx / dist;
          const ny = dy / dist;
          const nz = dz / dist;
          const overlap = minDist - dist;

          // Push out of overlap
          body.position.x += nx * overlap * 0.9;
          body.position.y += ny * overlap * 0.9;
          body.position.z += nz * overlap * 0.9;

          const relVx = hand.velocity.x - body.velocity.x;
          const relVy = hand.velocity.y - body.velocity.y;
          const relVz = hand.velocity.z - body.velocity.z;
          const impactSpeed = relVx * nx + relVy * ny + relVz * nz;

          const punchBoost = Math.max(1.4, Math.hypot(hand.velocity.x, hand.velocity.y, hand.velocity.z) * 1.15);
          const impulse = Math.max(impactSpeed * 1.35, punchBoost * 0.65) / body.mass;

          body.velocity.x += nx * impulse + hand.velocity.x * 0.45;
          body.velocity.y += ny * impulse + Math.max(0.35, hand.velocity.y * 0.4);
          body.velocity.z += nz * impulse + hand.velocity.z * 0.55;

          // Impart spin torque
          body.angularVelocity.x += -nz * impulse * 1.8;
          body.angularVelocity.y += nx * impulse * 2.2;
          body.angularVelocity.z += -nx * impulse * 1.4;
          body.hitFlash = 0.22;

          if (impulse > 1.2) {
            events.push({
              bodyId: body.id,
              intensity: Math.min(1, impulse / 7.5),
              position: { ...body.position },
              fromHand: true,
            });
          }
        }
      }

      // Integrate position & rotation
      body.velocity.x *= LINEAR_DAMPING;
      body.velocity.y *= LINEAR_DAMPING;
      body.velocity.z *= LINEAR_DAMPING;

      body.position.x += body.velocity.x * dt;
      body.position.y += body.velocity.y * dt;
      body.position.z += body.velocity.z * dt;

      body.angularVelocity.x *= ANGULAR_DAMPING;
      body.angularVelocity.y *= ANGULAR_DAMPING;
      body.angularVelocity.z *= ANGULAR_DAMPING;

      body.rotation.x += body.angularVelocity.x * dt;
      body.rotation.y += body.angularVelocity.y * dt;
      body.rotation.z += body.angularVelocity.z * dt;
    }

    // Tether constraint (for hanging pendulum spheres)
    if (body.tetherAnchor) {
      const dx = body.position.x - body.tetherAnchor.x;
      const dy = body.position.y - body.tetherAnchor.y;
      const dz = body.position.z - body.tetherAnchor.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > body.tetherLength && dist > 0.0001) {
        const nx = dx / dist;
        const ny = dy / dist;
        const nz = dz / dist;
        body.position.x = body.tetherAnchor.x + nx * body.tetherLength;
        body.position.y = body.tetherAnchor.y + ny * body.tetherLength;
        body.position.z = body.tetherAnchor.z + nz * body.tetherLength;
        // Remove outward radial velocity
        const radialVel = body.velocity.x * nx + body.velocity.y * ny + body.velocity.z * nz;
        if (radialVel > 0) {
          body.velocity.x -= nx * radialVel;
          body.velocity.y -= ny * radialVel;
          body.velocity.z -= nz * radialVel;
        }
      }
    }

    // Floor & Arena Wall Boundaries
    const bottomY = world.floorY + body.halfExtents.y;
    if (body.position.y < bottomY) {
      const impact = -body.velocity.y;
      body.position.y = bottomY;
      if (impact > 1.35) {
        body.velocity.y = impact * body.restitution;
        events.push({
          bodyId: body.id,
          intensity: Math.min(0.8, impact / 8),
          position: { x: body.position.x, y: world.floorY, z: body.position.z },
          fromHand: false,
        });
      } else {
        body.velocity.y = 0;
        // Gently settle upright rotation for resting cubes
        if (body.shape === 'cube' && Math.hypot(body.velocity.x, body.velocity.z) < 0.25) {
          body.angularVelocity.x *= 0.7;
          body.angularVelocity.z *= 0.7;
        }
      }
      body.velocity.x *= FLOOR_FRICTION;
      body.velocity.z *= FLOOR_FRICTION;
    }

    if (body.position.x < -world.boundsX + body.halfExtents.x) {
      body.position.x = -world.boundsX + body.halfExtents.x;
      body.velocity.x = Math.abs(body.velocity.x) * body.restitution;
    } else if (body.position.x > world.boundsX - body.halfExtents.x) {
      body.position.x = world.boundsX - body.halfExtents.x;
      body.velocity.x = -Math.abs(body.velocity.x) * body.restitution;
    }

    if (body.position.z < world.minZ + body.halfExtents.z) {
      body.position.z = world.minZ + body.halfExtents.z;
      body.velocity.z = Math.abs(body.velocity.z) * body.restitution;
    } else if (body.position.z > world.maxZ - body.halfExtents.z) {
      body.position.z = world.maxZ - body.halfExtents.z;
      body.velocity.z = -Math.abs(body.velocity.z) * body.restitution;
    }
  }

  // 3. Pairwise Body-Body Collisions (3 solver iterations for clean cube stacking)
  const bodies = world.bodies;
  for (let iter = 0; iter < 3; iter++) {
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i];
        const b = bodies[j];
        if (a.grabbedBy && b.grabbedBy) continue;

        const bothBoxLike = a.shape !== 'sphere' && b.shape !== 'sphere';
        if (bothBoxLike) {
          // AABB separation for crisp stable cube & domino stacking
          const ox = a.halfExtents.x + b.halfExtents.x - Math.abs(b.position.x - a.position.x);
          const oy = a.halfExtents.y + b.halfExtents.y - Math.abs(b.position.y - a.position.y);
          const oz = a.halfExtents.z + b.halfExtents.z - Math.abs(b.position.z - a.position.z);

          if (ox > 0 && oy > 0 && oz > 0) {
            let nx = 0;
            let ny = 0;
            let nz = 0;
            let pen = ox;

            if (oy <= ox && oy <= oz) {
              pen = oy;
              ny = b.position.y >= a.position.y ? 1 : -1;
            } else if (ox <= oz) {
              pen = ox;
              nx = b.position.x >= a.position.x ? 1 : -1;
            } else {
              pen = oz;
              nz = b.position.z >= a.position.z ? 1 : -1;
            }

            const totalInvMass = (a.grabbedBy ? 0 : 1 / a.mass) + (b.grabbedBy ? 0 : 1 / b.mass);
            if (totalInvMass <= 0) continue;

            const shareA = a.grabbedBy ? 0 : (1 / a.mass) / totalInvMass;
            const shareB = b.grabbedBy ? 0 : (1 / b.mass) / totalInvMass;

            a.position.x -= nx * pen * shareA;
            a.position.y -= ny * pen * shareA;
            a.position.z -= nz * pen * shareA;
            b.position.x += nx * pen * shareB;
            b.position.y += ny * pen * shareB;
            b.position.z += nz * pen * shareB;

            const rvx = b.velocity.x - a.velocity.x;
            const rvy = b.velocity.y - a.velocity.y;
            const rvz = b.velocity.z - a.velocity.z;
            const velAlongNormal = rvx * nx + rvy * ny + rvz * nz;

            if (velAlongNormal < 0) {
              const e = Math.min(a.restitution, b.restitution);
              const jImp = (-(1 + e) * velAlongNormal) / totalInvMass;
              if (!a.grabbedBy) {
                a.velocity.x -= (jImp / a.mass) * nx;
                a.velocity.y -= (jImp / a.mass) * ny;
                a.velocity.z -= (jImp / a.mass) * nz;
              }
              if (!b.grabbedBy) {
                b.velocity.x += (jImp / b.mass) * nx;
                b.velocity.y += (jImp / b.mass) * ny;
                b.velocity.z += (jImp / b.mass) * nz;
              }
              // Domino topple torque on horizontal collisions
              if (Math.abs(nx) > 0.5 || Math.abs(nz) > 0.5) {
                if (b.shape === 'domino') b.angularVelocity.z -= nx * Math.abs(velAlongNormal) * 2.2;
                if (a.shape === 'domino') a.angularVelocity.z += nx * Math.abs(velAlongNormal) * 2.2;
              }
              if (iter === 0 && -velAlongNormal > 1.8) {
                events.push({
                  bodyId: b.id,
                  intensity: Math.min(0.75, -velAlongNormal / 7),
                  position: {
                    x: (a.position.x + b.position.x) * 0.5,
                    y: (a.position.y + b.position.y) * 0.5,
                    z: (a.position.z + b.position.z) * 0.5,
                  },
                  fromHand: false,
                });
              }
            }
          }
        } else {
          // Sphere-sphere or sphere-box bounding sphere resolution
          const dx = b.position.x - a.position.x;
          const dy = b.position.y - a.position.y;
          const dz = b.position.z - a.position.z;
          const dist = Math.hypot(dx, dy, dz);
          const minDist = a.radius + b.radius;

          if (dist < minDist && dist > 0.0001) {
            const nx = dx / dist;
            const ny = dy / dist;
            const nz = dz / dist;
            const pen = minDist - dist;

            const totalInvMass = (a.grabbedBy ? 0 : 1 / a.mass) + (b.grabbedBy ? 0 : 1 / b.mass);
            if (totalInvMass <= 0) continue;

            const shareA = a.grabbedBy ? 0 : (1 / a.mass) / totalInvMass;
            const shareB = b.grabbedBy ? 0 : (1 / b.mass) / totalInvMass;

            a.position.x -= nx * pen * shareA;
            a.position.y -= ny * pen * shareA;
            a.position.z -= nz * pen * shareA;
            b.position.x += nx * pen * shareB;
            b.position.y += ny * pen * shareB;
            b.position.z += nz * pen * shareB;

            const rvx = b.velocity.x - a.velocity.x;
            const rvy = b.velocity.y - a.velocity.y;
            const rvz = b.velocity.z - a.velocity.z;
            const velAlongNormal = rvx * nx + rvy * ny + rvz * nz;

            if (velAlongNormal < 0) {
              const e = Math.min(a.restitution, b.restitution);
              const jImp = (-(1 + e) * velAlongNormal) / totalInvMass;
              if (!a.grabbedBy) {
                a.velocity.x -= (jImp / a.mass) * nx;
                a.velocity.y -= (jImp / a.mass) * ny;
                a.velocity.z -= (jImp / a.mass) * nz;
              }
              if (!b.grabbedBy) {
                b.velocity.x += (jImp / b.mass) * nx;
                b.velocity.y += (jImp / b.mass) * ny;
                b.velocity.z += (jImp / b.mass) * nz;
              }
              if (iter === 0 && -velAlongNormal > 1.8) {
                events.push({
                  bodyId: b.id,
                  intensity: Math.min(0.85, -velAlongNormal / 7),
                  position: {
                    x: (a.position.x + b.position.x) * 0.5,
                    y: (a.position.y + b.position.y) * 0.5,
                    z: (a.position.z + b.position.z) * 0.5,
                  },
                  fromHand: false,
                });
              }
            }
          }
        }
      }
    }

    // Re-clamp floor constraint after each solver pass so upper stacked blocks cannot push lower blocks into the workbench
    for (let k = 0; k < bodies.length; k++) {
      const b = bodies[k];
      const minY = world.floorY + b.halfExtents.y;
      if (b.position.y < minY) {
        b.position.y = minY;
        if (b.velocity.y < 0) b.velocity.y = 0;
      }
    }
  }

  return events;
}
