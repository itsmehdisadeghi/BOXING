import * as THREE from 'three';
import type { TargetArchetype } from '../game/boxingRules';
import type { BodyShape } from '../game/physics';
import type { HandSide } from '../game/types';
import type { ArenaTextures } from './proceduralTextures';

export interface FirstPersonGloveRig {
  group: THREE.Group;
  knuckleMesh: THREE.Mesh;
  cuffGlow: THREE.MeshStandardMaterial;
}

export interface KinematicHandRig {
  group: THREE.Group;
  fingers: THREE.Group[];
  thumb: THREE.Group;
  pinchHalo: THREE.Mesh;
  palmMat: THREE.MeshStandardMaterial;
}

export interface SparringBotRig {
  root: THREE.Group;
  upperBody: THREE.Group;
  headGroup: THREE.Group;
  leftArmPivot: THREE.Group;
  rightArmPivot: THREE.Group;
  leftGloveMat: THREE.MeshStandardMaterial;
  rightGloveMat: THREE.MeshStandardMaterial;
  chestCoreMat: THREE.MeshStandardMaterial;
  armorMat: THREE.MeshStandardMaterial;
}

/**
 * Builds the championship indoor boxing ring + surrounding arena truss & stadium silhouettes.
 */
export function buildBoxingRingEnvironment(textures: ArenaTextures): THREE.Group {
  const group = new THREE.Group();

  // Outer arena stadium floor
  const outerFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(42, 42),
    new THREE.MeshStandardMaterial({ color: 0x0b0e13, roughness: 0.92, metalness: 0.08 })
  );
  outerFloor.rotation.x = -Math.PI / 2;
  outerFloor.position.y = -0.78;
  group.add(outerFloor);

  // Ring structural base apron (raised championship platform)
  const apronMat = new THREE.MeshStandardMaterial({ color: 0x161a22, roughness: 0.72, metalness: 0.18 });
  const apron = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.78, 7.2), apronMat);
  apron.position.set(0, -0.39, -1.6);
  apron.receiveShadow = true;
  group.add(apron);

  // Brass skirt trim around ring perimeter
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.32, metalness: 0.78 });
  const trim = new THREE.Mesh(new THREE.BoxGeometry(7.26, 0.07, 7.26), trimMat);
  trim.position.set(0, -0.04, -1.6);
  group.add(trim);

  // Woven Canvas Mat (offset +0.02 above apron to avoid Z-fighting)
  const matMesh = new THREE.Mesh(
    new THREE.BoxGeometry(6.8, 0.04, 6.8),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.ringCanvasMap,
      bumpMap: textures.ringCanvasBump,
      bumpScale: 0.015,
      roughness: 0.86,
      metalness: 0.02,
    })
  );
  matMesh.position.set(0, 0.02, -1.6);
  matMesh.receiveShadow = true;
  group.add(matMesh);

  // 4 Corner Steel Turnbuckle Posts + Padded Cushions
  const postMetal = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.28, metalness: 0.85 });
  const corners: Array<{ x: number; z: number; padColor: number }> = [
    { x: -3.2, z: -4.8, padColor: 0xb91c1c }, // Far left (Red corner)
    { x: 3.2, z: -4.8, padColor: 0x1d4ed8 },  // Far right (Blue corner)
    { x: -3.2, z: 1.6, padColor: 0xe2e8f0 },  // Near left (Neutral)
    { x: 3.2, z: 1.6, padColor: 0xe2e8f0 },   // Near right (Neutral)
  ];

  const postGeo = new THREE.CylinderGeometry(0.085, 0.095, 1.85, 16);
  const padGeo = new THREE.BoxGeometry(0.22, 1.15, 0.22);

  for (const c of corners) {
    const postGroup = new THREE.Group();
    postGroup.position.set(c.x, 0.04, c.z);

    const post = new THREE.Mesh(postGeo, postMetal);
    post.position.y = 0.92;
    post.castShadow = true;
    postGroup.add(post);

    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.105, 14, 10), trimMat);
    cap.position.y = 1.86;
    postGroup.add(cap);

    const pad = new THREE.Mesh(
      padGeo,
      new THREE.MeshStandardMaterial({
        color: c.padColor,
        bumpMap: textures.leatherBump,
        bumpScale: 0.012,
        roughness: 0.45,
        metalness: 0.08,
      })
    );
    pad.position.set(c.x > 0 ? -0.11 : 0.11, 0.9, c.z > -1.6 ? -0.11 : 0.11);
    pad.castShadow = true;
    postGroup.add(pad);

    group.add(postGroup);
  }

  // 3 Tensioned Ring Ropes on all 4 sides
  const ropeColors = [0xdc2626, 0xf1f5f9, 0x2563eb];
  const ropeHeights = [0.58, 0.98, 1.38];
  const ropeGeo = new THREE.CylinderGeometry(0.022, 0.022, 6.4, 10);

  for (let r = 0; r < 3; r++) {
    const rMat = new THREE.MeshStandardMaterial({ color: ropeColors[r], roughness: 0.55, metalness: 0.1 });
    const y = ropeHeights[r];

    // Back & Front ropes
    const backRope = new THREE.Mesh(ropeGeo, rMat);
    backRope.rotation.z = Math.PI / 2;
    backRope.position.set(0, y, -4.8);
    group.add(backRope);

    const frontRope = new THREE.Mesh(ropeGeo, rMat);
    frontRope.rotation.z = Math.PI / 2;
    frontRope.position.set(0, y, 1.6);
    group.add(frontRope);

    // Left & Right ropes
    const leftRope = new THREE.Mesh(ropeGeo, rMat);
    leftRope.rotation.x = Math.PI / 2;
    leftRope.position.set(-3.2, y, -1.6);
    group.add(leftRope);

    const rightRope = new THREE.Mesh(ropeGeo, rMat);
    rightRope.rotation.x = Math.PI / 2;
    rightRope.position.set(3.2, y, -1.6);
    group.add(rightRope);
  }

  // Overhead Championship Lighting Truss Rig (tall landmark visible in spawn vista)
  const trussMat = new THREE.MeshStandardMaterial({ color: 0x1e2530, roughness: 0.35, metalness: 0.8 });
  const lampGlowMat = new THREE.MeshStandardMaterial({
    color: 0xfef3c7,
    emissive: 0xf59e0b,
    emissiveIntensity: 2.2,
    roughness: 0.2,
  });

  const trussY = 4.35;
  const beamGeo = new THREE.BoxGeometry(6.8, 0.18, 0.18);
  const backBeam = new THREE.Mesh(beamGeo, trussMat);
  backBeam.position.set(0, trussY, -3.5);
  group.add(backBeam);

  const frontBeam = new THREE.Mesh(beamGeo, trussMat);
  frontBeam.position.set(0, trussY, 0.1);
  group.add(frontBeam);

  const sideBeamGeo = new THREE.BoxGeometry(0.18, 0.18, 3.8);
  for (const sx of [-3.3, 3.3]) {
    const sb = new THREE.Mesh(sideBeamGeo, trussMat);
    sb.position.set(sx, trussY, -1.7);
    group.add(sb);
  }

  // Overhead tungsten spotlight housings
  const housingGeo = new THREE.CylinderGeometry(0.2, 0.3, 0.26, 12);
  const bulbGeo = new THREE.CircleGeometry(0.24, 12);
  for (const lx of [-2.0, 0, 2.0]) {
    const housing = new THREE.Mesh(housingGeo, trussMat);
    housing.position.set(lx, trussY - 0.16, -2.1);
    group.add(housing);

    const bulb = new THREE.Mesh(bulbGeo, lampGlowMat);
    bulb.rotation.x = Math.PI / 2;
    bulb.position.set(lx, trussY - 0.295, -2.1);
    group.add(bulb);
  }

  // Subtle architectural stadium backdrop ribs in distance
  const ribMat = new THREE.MeshStandardMaterial({ color: 0x131822, roughness: 0.85, metalness: 0.15 });
  const ribGeo = new THREE.BoxGeometry(0.45, 7.5, 0.45);
  for (let i = -4; i <= 4; i++) {
    const angle = i * 0.24;
    const rib = new THREE.Mesh(ribGeo, ribMat);
    rib.position.set(Math.sin(angle) * 10.5, 2.4, -1.6 - Math.cos(angle) * 9.5);
    rib.lookAt(0, 2.4, -1.6);
    group.add(rib);
  }

  return group;
}

/**
 * Builds the 3D Physics Sandbox industrial walnut & steel workbench table inside the arena.
 */
export function buildPhysicsWorkbench(textures: ArenaTextures): THREE.Group {
  const group = new THREE.Group();
  const tableTopY = 0.88;

  // Thick walnut workbench tabletop
  const topMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.woodMap,
    bumpMap: textures.woodBump,
    bumpScale: 0.015,
    roughness: 0.56,
    metalness: 0.06,
  });
  const top = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.11, 1.85), topMat);
  top.position.set(0, tableTopY - 0.055, -1.6);
  top.receiveShadow = true;
  top.castShadow = true;
  group.add(top);

  // Brushed brass perimeter edge bumper rail (prevents objects rolling visually off edges)
  const railMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.28, metalness: 0.82 });
  const backRail = new THREE.Mesh(new THREE.BoxGeometry(3.36, 0.08, 0.06), railMat);
  backRail.position.set(0, tableTopY + 0.02, -2.52);
  group.add(backRail);

  const sideRailGeo = new THREE.BoxGeometry(0.06, 0.08, 1.9);
  for (const sx of [-1.65, 1.65]) {
    const sr = new THREE.Mesh(sideRailGeo, railMat);
    sr.position.set(sx, tableTopY + 0.02, -1.6);
    group.add(sr);
  }

  // Heavy industrial steel legs grounded flush on ring mat (y = 0.04)
  const legMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.78 });
  const legGeo = new THREE.BoxGeometry(0.12, 0.78, 0.12);
  for (const lx of [-1.42, 1.42]) {
    for (const lz of [-0.85, -2.35]) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(lx, 0.43, lz);
      leg.castShadow = true;
      group.add(leg);
    }
  }

  // Overhead Pendulum Gantry Arch (used cleanly for Newton pendulum preset)
  const archPostGeo = new THREE.CylinderGeometry(0.04, 0.045, 1.75, 12);
  for (const ax of [-1.45, 1.45]) {
    const post = new THREE.Mesh(archPostGeo, legMat);
    post.position.set(ax, tableTopY + 0.87, -1.45);
    group.add(post);
  }
  const crossBar = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 2.98, 12), railMat);
  crossBar.rotation.z = Math.PI / 2;
  crossBar.position.set(0, 2.55, -1.45);
  group.add(crossBar);

  return group;
}

/**
 * Builds a 6-part composite procedural First-Person Boxing Glove.
 */
export function buildFirstPersonGlove(side: HandSide, leatherBump: THREE.CanvasTexture): FirstPersonGloveRig {
  const group = new THREE.Group();
  const isLeft = side === 'left';
  const sign = isLeft ? 1 : -1;

  const leatherColor = isLeft ? 0xc81e1e : 0x1d4ed8;
  const leatherMat = new THREE.MeshPhysicalMaterial({
    color: leatherColor,
    bumpMap: leatherBump,
    bumpScale: 0.015,
    roughness: 0.34,
    metalness: 0.05,
    clearcoat: 0.45,
    clearcoatRoughness: 0.32,
  });

  const darkTrimMat = new THREE.MeshStandardMaterial({
    color: 0x11151d,
    bumpMap: leatherBump,
    bumpScale: 0.01,
    roughness: 0.65,
    metalness: 0.12,
  });

  const cuffGlow = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xd97706,
    emissiveIntensity: 0.35,
    roughness: 0.3,
    metalness: 0.72,
  });

  // 1. Primary Padded Mitt Dome
  const knuckleMesh = new THREE.Mesh(new THREE.SphereGeometry(0.135, 22, 18), leatherMat);
  knuckleMesh.scale.set(1.06, 0.92, 1.22);
  knuckleMesh.position.set(0, 0.02, -0.08);
  knuckleMesh.castShadow = true;
  group.add(knuckleMesh);

  // 2. Knuckle Impact Ridge
  const ridge = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.11, 8, 12), leatherMat);
  ridge.rotation.z = Math.PI / 2;
  ridge.position.set(0, 0.045, -0.17);
  group.add(ridge);

  // 3. Articulated Side Thumb Lock
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.095, 8, 12), leatherMat);
  thumb.position.set(sign * 0.115, -0.02, -0.04);
  thumb.rotation.set(0.45, 0, -sign * 0.35);
  group.add(thumb);

  // 4. Inner Palm Cushion
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.15), darkTrimMat);
  palm.position.set(0, -0.055, -0.04);
  group.add(palm);

  // 5. Stitched Wrist Cuff
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.098, 0.18, 18), darkTrimMat);
  cuff.rotation.x = Math.PI / 2;
  cuff.position.set(0, -0.015, 0.12);
  group.add(cuff);

  // 6. Gold Championship Wrist Strap Accent
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.094, 0.015, 10, 24), cuffGlow);
  strap.position.set(0, -0.015, 0.11);
  group.add(strap);

  return { group, knuckleMesh, cuffGlow };
}

/**
 * Builds an articulated 8-part 3D Kinematic Hand for the Physics Sandbox mode
 * (visibly curls fingers on pinch/grab!).
 */
export function buildKinematicHand(side: HandSide): KinematicHandRig {
  const group = new THREE.Group();
  const isLeft = side === 'left';
  const sign = isLeft ? 1 : -1;

  const palmMat = new THREE.MeshStandardMaterial({
    color: isLeft ? 0x334155 : 0x1e3a5f,
    roughness: 0.38,
    metalness: 0.62,
  });
  const jointMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    roughness: 0.28,
    metalness: 0.82,
  });
  const fingerMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.42,
    metalness: 0.35,
  });

  // 1. Sculpted Palm Block
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.05, 0.16), palmMat);
  palm.castShadow = true;
  group.add(palm);

  // 2. Wrist Collar
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.072, 0.11, 14), jointMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.set(0, -0.005, 0.12);
  group.add(collar);

  // 3..6 Four Articulated Fingers
  const fingers: THREE.Group[] = [];
  const fingerX = [-0.054, -0.018, 0.018, 0.054];
  const fingerLen = [0.105, 0.118, 0.11, 0.092];
  for (let i = 0; i < 4; i++) {
    const fPivot = new THREE.Group();
    fPivot.position.set(fingerX[i], 0.005, -0.08);

    const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), jointMat);
    fPivot.add(knuckle);

    const phalanx = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, fingerLen[i], 6, 10), fingerMat);
    phalanx.rotation.x = Math.PI / 2;
    phalanx.position.set(0, 0, -fingerLen[i] * 0.55);
    fPivot.add(phalanx);

    group.add(fPivot);
    fingers.push(fPivot);
  }

  // 7. Articulated Thumb
  const thumb = new THREE.Group();
  thumb.position.set(sign * 0.082, -0.008, -0.01);
  const thumbJoint = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), jointMat);
  thumb.add(thumbJoint);
  const thumbBone = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.08, 6, 10), fingerMat);
  thumbBone.rotation.set(Math.PI / 2, 0, -sign * 0.45);
  thumbBone.position.set(sign * 0.02, -0.008, -0.048);
  thumb.add(thumbBone);
  group.add(thumb);

  // 8. Subtle Pinch Halo Ring (illuminates when grabbing a 3D physics object)
  const pinchHalo = new THREE.Mesh(
    new THREE.RingGeometry(0.075, 0.095, 24),
    new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.0,
    })
  );
  pinchHalo.position.set(0, 0, -0.14);
  group.add(pinchHalo);

  return { group, fingers, thumb, pinchHalo, palmMat };
}

/**
 * Builds the 11-part Composite Championship Sparring Automaton («آهنین») grounded at bottom-center.
 */
export function buildSparringAutomaton(textures: ArenaTextures): SparringBotRig {
  const root = new THREE.Group();
  root.position.set(0, 0.04, -1.78);

  // Contact shadow disc grounded on mat
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.72, 24),
    new THREE.MeshBasicMaterial({
      map: textures.contactShadow,
      transparent: true,
      depthWrite: false,
      opacity: 0.55,
    })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.015;
  root.add(shadow);

  const castIronMat = new THREE.MeshStandardMaterial({ color: 0x181e28, roughness: 0.62, metalness: 0.72 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.28, metalness: 0.86 });
  const armorMat = new THREE.MeshPhysicalMaterial({
    color: 0x2a3444,
    bumpMap: textures.leatherBump,
    bumpScale: 0.012,
    roughness: 0.36,
    metalness: 0.55,
    clearcoat: 0.35,
  });
  const chestCoreMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    emissive: 0xd97706,
    emissiveIntensity: 0.7,
    roughness: 0.25,
    metalness: 0.4,
  });

  // 1. Heavy Weighted Floor Pedestal Base
  const baseDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.54, 0.18, 24), castIronMat);
  baseDisc.position.y = 0.09;
  baseDisc.castShadow = true;
  baseDisc.receiveShadow = true;
  root.add(baseDisc);

  // 2. Brass Spring Collar
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 0.22, 16), brassMat);
  collar.position.y = 0.28;
  root.add(collar);

  // Pivoting Upper Body (bends & recoils on spring when punched!)
  const upperBody = new THREE.Group();
  upperBody.position.y = 0.36;
  root.add(upperBody);

  // 3. Hydraulic Spine Column
  const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.68, 16), castIronMat);
  spine.position.y = 0.34;
  upperBody.add(spine);

  // 4. Sculpted Armored Torso
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.22, 0.66, 20), armorMat);
  torso.position.y = 0.96;
  torso.scale.set(1.08, 1, 0.78);
  torso.castShadow = true;
  upperBody.add(torso);

  // 5. Ribbed Chest Impact Pad
  const chestPad = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.14), armorMat);
  chestPad.position.set(0, 1.0, 0.21);
  upperBody.add(chestPad);

  // 6. Illuminated Championship Target Core Ring
  const coreRing = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.026, 12, 24), chestCoreMat);
  coreRing.position.set(0, 1.01, 0.29);
  upperBody.add(coreRing);

  // 7. Shoulder Yoke Bar
  const yoke = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.68, 8, 14), brassMat);
  yoke.rotation.z = Math.PI / 2;
  yoke.position.set(0, 1.24, 0);
  upperBody.add(yoke);

  // 8. Articulated Head Guard Assembly
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.48, 0.02);
  const headShell = new THREE.Mesh(new THREE.SphereGeometry(0.195, 20, 16), armorMat);
  headShell.scale.set(0.95, 1.12, 1.0);
  headShell.castShadow = true;
  headGroup.add(headShell);

  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.055, 0.08),
    new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.1,
      roughness: 0.15,
    })
  );
  visor.position.set(0, 0.03, 0.165);
  headGroup.add(visor);

  const chinGuard = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.1), brassMat);
  chinGuard.position.set(0, -0.11, 0.14);
  headGroup.add(chinGuard);
  upperBody.add(headGroup);

  // 9 & 10. Left & Right Articulated Punching Arms + Oversized Telegraph Gloves
  const makeBotArm = (side: -1 | 1) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.44, 1.22, 0.04);

    const upperArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.34, 8, 12), castIronMat);
    upperArm.position.set(0, -0.18, 0.08);
    upperArm.rotation.x = -0.35;
    pivot.add(upperArm);

    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.078, 12, 10), brassMat);
    elbow.position.set(0, -0.34, 0.18);
    pivot.add(elbow);

    const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.28, 8, 12), castIronMat);
    forearm.position.set(-side * 0.06, -0.22, 0.36);
    forearm.rotation.x = 1.15;
    pivot.add(forearm);

    const gloveMat = new THREE.MeshPhysicalMaterial({
      color: 0x991b1b,
      emissive: 0x000000,
      emissiveIntensity: 0,
      bumpMap: textures.leatherBump,
      bumpScale: 0.015,
      roughness: 0.32,
      metalness: 0.12,
      clearcoat: 0.4,
    });
    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.15, 18, 14), gloveMat);
    glove.scale.set(1.0, 0.95, 1.15);
    glove.position.set(-side * 0.1, -0.12, 0.54);
    glove.castShadow = true;
    pivot.add(glove);

    upperBody.add(pivot);
    return { pivot, gloveMat };
  };

  const leftArm = makeBotArm(-1);
  const rightArm = makeBotArm(1);

  return {
    root,
    upperBody,
    headGroup,
    leftArmPivot: leftArm.pivot,
    rightArmPivot: rightArm.pivot,
    leftGloveMat: leftArm.gloveMat,
    rightGloveMat: rightArm.gloveMat,
    chestCoreMat,
    armorMat,
  };
}

/**
 * Builds a 3-part composite Boxing Target Focus Mitt / Hook Pad / Gold Power Orb.
 */
export function buildTargetPadMesh(archetype: TargetArchetype, preferredSide: HandSide | 'any'): THREE.Group {
  const group = new THREE.Group();

  const accentHex =
    archetype === 'power_orb'
      ? 0xf59e0b
      : preferredSide === 'left'
      ? 0xef4444
      : 0x3b82f6;

  const rimMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 0.45,
    roughness: 0.3,
    metalness: 0.45,
  });

  if (archetype === 'power_orb') {
    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.16, 1),
      new THREE.MeshStandardMaterial({
        color: 0xfef3c7,
        emissive: 0xf59e0b,
        emissiveIntensity: 0.85,
        roughness: 0.18,
        metalness: 0.75,
      })
    );
    group.add(core);

    const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.02, 10, 28), rimMat);
    group.add(ring1);

    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.015, 10, 28), rimMat);
    ring2.rotation.y = Math.PI / 2;
    group.add(ring2);
  } else {
    // Focus Mitt Pad
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.19, 0.21, 0.09, 22),
      new THREE.MeshStandardMaterial({
        color: 0x161b24,
        roughness: 0.55,
        metalness: 0.2,
      })
    );
    disc.rotation.x = Math.PI / 2;
    group.add(disc);

    const outerRing = new THREE.Mesh(new THREE.TorusGeometry(0.195, 0.024, 10, 24), rimMat);
    outerRing.position.z = 0.045;
    group.add(outerRing);

    const bullseye = new THREE.Mesh(
      new THREE.CircleGeometry(0.08, 18),
      new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        emissive: accentHex,
        emissiveIntensity: 0.6,
        roughness: 0.25,
      })
    );
    bullseye.position.z = 0.052;
    group.add(bullseye);
  }

  return group;
}

const SANDBOX_PALETTE = [0xd97706, 0xb91c1c, 0x2563eb, 0xd4a373, 0x475569];

/**
 * Builds composite 3-part 3D physics props (framed wooden crates, machined steel spheres, domino slabs).
 */
export function buildSandboxPropMesh(
  shape: BodyShape,
  halfExtents: { x: number; y: number; z: number },
  colorIndex: number,
  textures: ArenaTextures
): THREE.Group {
  const group = new THREE.Group();
  const accent = SANDBOX_PALETTE[colorIndex % SANDBOX_PALETTE.length];

  if (shape === 'sphere') {
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(halfExtents.x, 22, 18),
      new THREE.MeshPhysicalMaterial({
        color: accent,
        roughness: 0.22,
        metalness: 0.76,
        clearcoat: 0.6,
      })
    );
    core.castShadow = true;
    core.receiveShadow = true;
    group.add(core);

    const band = new THREE.Mesh(
      new THREE.TorusGeometry(halfExtents.x * 0.99, 0.012, 8, 24),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.25, metalness: 0.85 })
    );
    group.add(band);

    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(halfExtents.x * 0.28, halfExtents.x * 0.28, halfExtents.x * 2.02, 12),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.45, metalness: 0.65 })
    );
    group.add(cap);
  } else if (shape === 'domino') {
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(halfExtents.x * 2, halfExtents.y * 2, halfExtents.z * 2),
      new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        roughness: 0.35,
        metalness: 0.15,
      })
    );
    slab.castShadow = true;
    slab.receiveShadow = true;
    group.add(slab);

    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(halfExtents.x * 2.04, 0.04, halfExtents.z * 2.04),
      new THREE.MeshStandardMaterial({ color: accent, roughness: 0.3, metalness: 0.5 })
    );
    group.add(stripe);

    const pip = new THREE.Mesh(
      new THREE.SphereGeometry(0.022, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4 })
    );
    pip.position.set(halfExtents.x, halfExtents.y * 0.45, 0);
    group.add(pip);
  } else {
    // Framed industrial crate cube
    const w = halfExtents.x * 2;
    const h = halfExtents.y * 2;
    const d = halfExtents.z * 2;

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.94, h * 0.94, d * 0.94),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: textures.woodMap,
        bumpMap: textures.woodBump,
        bumpScale: 0.012,
        roughness: 0.65,
        metalness: 0.08,
      })
    );
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Painted corner frame collar
    const frameMat = new THREE.MeshStandardMaterial({
      color: accent,
      roughness: 0.32,
      metalness: 0.62,
    });
    const topBand = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.16, d), frameMat);
    topBand.position.y = h * 0.42;
    group.add(topBand);

    const botBand = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.16, d), frameMat);
    botBand.position.y = -h * 0.42;
    group.add(botBand);
  }

  return group;
}
