import type { HandSide, TrackedHandState, Vec3 } from './types';

export type TargetArchetype = 'jab_pad' | 'hook_pad' | 'power_orb';

export interface BoxingTarget {
  id: number;
  archetype: TargetArchetype;
  preferredSide: HandSide | 'any';
  position: Vec3;
  basePosition: Vec3;
  radius: number;
  age: number;
  lifetime: number;
  hit: boolean;
  hitAnim: number;
  phase: number;
}

export type OpponentAttackKind = 'none' | 'left' | 'right' | 'overhead';
export type OpponentPhase = 'idle' | 'windup' | 'strike' | 'recovery' | 'staggered' | 'ko';

export interface OpponentState {
  hp: number;
  maxHp: number;
  phase: OpponentPhase;
  attackKind: OpponentAttackKind;
  phaseTimer: number;
  phaseDuration: number;
  attackCooldown: number;
  guardSide: 'left' | 'right' | 'open';
  hitFlash: number;
  recoilAngleX: number;
  recoilAngleZ: number;
  staggerBonusTimer: number;
  strikeResolved: boolean;
}

export interface BoxingEvent {
  type: 'target_hit' | 'bot_hit' | 'crit_counter' | 'parry' | 'player_hurt' | 'round_clear' | 'victory' | 'ko_defeat' | 'telegraph';
  position: Vec3;
  intensity: number;
  points?: number;
  callout?: string;
}

export interface BoxingMatchState {
  round: number;
  totalRounds: number;
  roundTimeLeft: number;
  score: number;
  bestScore: number;
  combo: number;
  maxCombo: number;
  comboDecayTimer: number;
  playerHp: number;
  playerMaxHp: number;
  punchesLanded: number;
  blocksLanded: number;
  isGuarding: boolean;
  guardGraceTimer: number;
  hitstopTimer: number;
  cameraTrauma: number;
  targets: BoxingTarget[];
  nextTargetId: number;
  targetSpawnTimer: number;
  opponent: OpponentState;
  handCooldown: Record<HandSide, number>;
  victory: boolean;
  finished: boolean;
  finishBeatTimer: number;
}

const ROUND_DURATION = 60;
const TARGET_HIT_RADIUS_BONUS = 0.24;

export function createBoxingMatch(bestScore = 0): BoxingMatchState {
  return {
    round: 1,
    totalRounds: 3,
    roundTimeLeft: ROUND_DURATION,
    score: 0,
    bestScore,
    combo: 0,
    maxCombo: 0,
    comboDecayTimer: 0,
    playerHp: 5,
    playerMaxHp: 5,
    punchesLanded: 0,
    blocksLanded: 0,
    isGuarding: false,
    guardGraceTimer: 0,
    hitstopTimer: 0,
    cameraTrauma: 0,
    targets: [],
    nextTargetId: 1,
    targetSpawnTimer: 0.7,
    opponent: createOpponentForRound(1),
    handCooldown: { left: 0, right: 0 },
    victory: false,
    finished: false,
    finishBeatTimer: 0,
  };
}

export function createOpponentForRound(round: number): OpponentState {
  const maxHp = 100 + (round - 1) * 45;
  return {
    hp: maxHp,
    maxHp,
    phase: 'idle',
    attackKind: 'none',
    phaseTimer: 0,
    phaseDuration: 0,
    // Generous opening grace period so the player survives first seconds smoothly
    attackCooldown: Math.max(2.0, 4.2 - (round - 1) * 0.7),
    guardSide: 'open',
    hitFlash: 0,
    recoilAngleX: 0,
    recoilAngleZ: 0,
    staggerBonusTimer: 0,
    strikeResolved: false,
  };
}

export function spawnTargetForRound(state: BoxingMatchState): BoxingTarget {
  const id = state.nextTargetId++;
  const roll = (id * 17 + state.round * 7) % 10;

  let archetype: TargetArchetype = 'jab_pad';
  let preferredSide: HandSide | 'any' = id % 2 === 0 ? 'right' : 'left';
  let x = preferredSide === 'left' ? -0.52 : 0.52;
  let y = 1.48 + ((id % 3) - 1) * 0.18;
  let z = -1.48;
  let radius = 0.21;
  let lifetime = Math.max(2.3, 3.6 - (state.round - 1) * 0.35);

  if (roll >= 7) {
    archetype = 'power_orb';
    preferredSide = 'any';
    x = 0;
    y = 1.56;
    z = -1.42;
    radius = 0.24;
    lifetime = Math.max(2.1, 3.2 - (state.round - 1) * 0.3);
  } else if (roll >= 4) {
    archetype = 'hook_pad';
    x = preferredSide === 'left' ? -0.78 : 0.78;
    y = 1.38;
    z = -1.36;
    radius = 0.22;
  }

  const target: BoxingTarget = {
    id,
    archetype,
    preferredSide,
    position: { x, y, z },
    basePosition: { x, y, z },
    radius,
    age: 0,
    lifetime,
    hit: false,
    hitAnim: 0,
    phase: id * 1.1,
  };
  state.targets.push(target);
  return target;
}

export function calculatePunchDamage(
  punchSpeed: number,
  combo: number,
  isCounterWindow: boolean,
  isPowerTarget = false
): { damage: number; points: number; isCrit: boolean } {
  const power = Math.max(0.45, Math.min(1.4, 0.55 + punchSpeed * 0.85));
  const multiplier = 1 + Math.min(combo, 12) * 0.15;
  const counterMult = isCounterWindow ? 1.85 : 1.0;
  const targetMult = isPowerTarget ? 1.5 : 1.0;

  const damage = Math.round(9 * power * counterMult * targetMult);
  const points = Math.round(100 * power * multiplier * counterMult * targetMult);
  const isCrit = isCounterWindow || punchSpeed >= 0.72 || isPowerTarget;
  return { damage, points, isCrit };
}

/**
 * Advances the boxing simulation by dt seconds.
 * Returns discrete gameplay events for audio, particles, and HUD callouts.
 */
export function stepBoxingMatch(
  state: BoxingMatchState,
  hands: TrackedHandState[],
  manualGuardHeld: boolean,
  autoGuardDetected: boolean,
  rawDt: number
): BoxingEvent[] {
  const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
  const events: BoxingEvent[] = [];

  // Decay camera trauma in real time even during hitstop
  state.cameraTrauma = Math.max(0, state.cameraTrauma - dt * 1.9);

  if (state.finished) {
    state.finishBeatTimer = Math.max(0, state.finishBeatTimer - dt);
    return events;
  }

  // Sim-level hitstop freeze on heavy hits & parries
  if (state.hitstopTimer > 0) {
    state.hitstopTimer = Math.max(0, state.hitstopTimer - dt);
    return events;
  }

  // Guard state with slight 0.14s grace buffer so quick blocks feel generous
  const guardingNow = manualGuardHeld || autoGuardDetected;
  if (guardingNow) {
    state.isGuarding = true;
    state.guardGraceTimer = 0.14;
  } else if (state.guardGraceTimer > 0) {
    state.guardGraceTimer = Math.max(0, state.guardGraceTimer - dt);
    state.isGuarding = state.guardGraceTimer > 0;
  } else {
    state.isGuarding = false;
  }

  // Hand punch cooldowns
  state.handCooldown.left = Math.max(0, state.handCooldown.left - dt);
  state.handCooldown.right = Math.max(0, state.handCooldown.right - dt);

  // Combo decay timer
  if (state.combo > 0) {
    state.comboDecayTimer -= dt;
    if (state.comboDecayTimer <= 0) {
      state.combo = 0;
    }
  }

  // Round clock
  state.roundTimeLeft = Math.max(0, state.roundTimeLeft - dt);

  // Opponent decay visuals
  const opp = state.opponent;
  opp.hitFlash = Math.max(0, opp.hitFlash - dt * 3.8);
  opp.recoilAngleX *= Math.exp(-10 * dt);
  opp.recoilAngleZ *= Math.exp(-10 * dt);
  if (opp.staggerBonusTimer > 0) {
    opp.staggerBonusTimer = Math.max(0, opp.staggerBonusTimer - dt);
  }

  // 1. Spawn & animate floating target pads (3 distinct archetypes)
  const maxConcurrentTargets = Math.min(3, 1 + state.round);
  state.targetSpawnTimer -= dt;
  const activeTargets = state.targets.filter((t) => !t.hit);
  if (state.targetSpawnTimer <= 0 && activeTargets.length < maxConcurrentTargets && opp.phase !== 'ko') {
    spawnTargetForRound(state);
    state.targetSpawnTimer = Math.max(1.05, 1.9 - (state.round - 1) * 0.28);
  }

  for (let i = state.targets.length - 1; i >= 0; i--) {
    const t = state.targets[i];
    t.age += dt;
    if (t.hit) {
      t.hitAnim += dt * 4.5;
      if (t.hitAnim >= 1) {
        state.targets.splice(i, 1);
      }
      continue;
    }

    // Distinct movement policy per target archetype
    if (t.archetype === 'jab_pad') {
      // Gentle figure-8 bobbing
      t.position.y = t.basePosition.y + Math.sin(t.age * 3.1 + t.phase) * 0.08;
    } else if (t.archetype === 'hook_pad') {
      // Sweeping lateral arc from outer flank inward
      const sweep = Math.sin(t.age * 2.4 + t.phase) * 0.16;
      t.position.x = t.basePosition.x + sweep;
      t.position.z = t.basePosition.z + Math.cos(t.age * 2.4 + t.phase) * 0.08;
    } else {
      // Power orb pulses forward into strike zone
      t.position.z = t.basePosition.z + Math.sin(t.age * 4.0) * 0.12;
      t.position.y = t.basePosition.y + Math.cos(t.age * 3.0) * 0.06;
    }

    if (t.age >= t.lifetime) {
      state.targets.splice(i, 1);
    }
  }

  // 2. Check Hand Punches against Target Pads & Opponent Sparring Bot
  const botCenter: Vec3 = { x: 0, y: 1.52, z: -1.72 };
  const botHitRadius = 0.42;

  for (const hand of hands) {
    if (!hand.active) continue;
    if (state.handCooldown[hand.side] > 0) continue;

    // Require intentional forward reach or punch velocity (prevents accidental idle hits)
    const isStriking = hand.position.z <= -1.08 && (hand.punchSpeed >= 0.22 || hand.velocity.z <= -0.9);
    if (!isStriking) continue;

    // 2a. Check Target Pads first
    let landedTarget = false;
    for (const target of state.targets) {
      if (target.hit) continue;
      const dist = Math.hypot(
        hand.position.x - target.position.x,
        hand.position.y - target.position.y,
        hand.position.z - target.position.z
      );
      if (dist <= target.radius + TARGET_HIT_RADIUS_BONUS) {
        target.hit = true;
        landedTarget = true;
        state.handCooldown[hand.side] = 0.2;
        state.combo += 1;
        state.maxCombo = Math.max(state.maxCombo, state.combo);
        state.comboDecayTimer = 3.2;
        state.punchesLanded += 1;

        const isPower = target.archetype === 'power_orb';
        const { damage, points, isCrit } = calculatePunchDamage(
          hand.punchSpeed,
          state.combo,
          opp.staggerBonusTimer > 0,
          isPower
        );

        state.score += points;
        state.bestScore = Math.max(state.bestScore, state.score);
        opp.hp = Math.max(0, opp.hp - damage);
        opp.hitFlash = 1;
        opp.recoilAngleX = -0.26 - hand.punchSpeed * 0.22;
        opp.recoilAngleZ = hand.side === 'left' ? -0.22 : 0.22;

        state.hitstopTimer = isCrit ? 0.05 : 0.028;
        state.cameraTrauma = Math.min(1, state.cameraTrauma + (isCrit ? 0.55 : 0.28));

        events.push({
          type: isCrit ? 'crit_counter' : 'target_hit',
          position: { ...target.position },
          intensity: isCrit ? 1 : 0.7,
          points,
          callout: isPower ? 'POWER' : isCrit ? 'CRIT' : 'HIT',
        });
        break;
      }
    }

    // 2b. Direct punch to the Sparring Automaton torso/head
    if (!landedTarget && opp.phase !== 'ko') {
      const distToBot = Math.hypot(
        hand.position.x - botCenter.x,
        hand.position.y - botCenter.y,
        hand.position.z - botCenter.z
      );
      if (distToBot <= botHitRadius + 0.16 && hand.position.z <= -1.25) {
        state.handCooldown[hand.side] = 0.24;
        state.combo += 1;
        state.maxCombo = Math.max(state.maxCombo, state.combo);
        state.comboDecayTimer = 3.0;
        state.punchesLanded += 1;

        const isCounter = opp.staggerBonusTimer > 0;
        const { damage, points, isCrit } = calculatePunchDamage(hand.punchSpeed, state.combo, isCounter, false);
        state.score += points;
        state.bestScore = Math.max(state.bestScore, state.score);
        opp.hp = Math.max(0, opp.hp - damage);
        opp.hitFlash = 1;
        opp.recoilAngleX = -0.32;
        opp.recoilAngleZ = hand.side === 'left' ? -0.25 : 0.25;

        state.hitstopTimer = isCounter ? 0.06 : 0.032;
        state.cameraTrauma = Math.min(1, state.cameraTrauma + (isCounter ? 0.6 : 0.32));

        events.push({
          type: isCounter ? 'crit_counter' : 'bot_hit',
          position: { x: hand.position.x * 0.4, y: hand.position.y, z: botCenter.z + 0.22 },
          intensity: isCrit ? 0.95 : 0.65,
          points,
          callout: isCounter ? 'COUNTER' : 'STRIKE',
        });
      }
    }
  }

  // 3. Check Opponent KO / Round Clear
  if (opp.hp <= 0 && opp.phase !== 'ko') {
    opp.phase = 'ko';
    opp.phaseTimer = 0;
    opp.phaseDuration = 1.1;
    state.score += 500 * state.round;
    state.bestScore = Math.max(state.bestScore, state.score);
    state.hitstopTimer = 0.075;
    state.cameraTrauma = 0.85;

    if (state.round >= state.totalRounds) {
      state.victory = true;
      state.finished = true;
      state.finishBeatTimer = 0.65;
      events.push({
        type: 'victory',
        position: { ...botCenter },
        intensity: 1,
        points: 500 * state.round,
        callout: 'KO',
      });
    } else {
      events.push({
        type: 'round_clear',
        position: { ...botCenter },
        intensity: 1,
        points: 500 * state.round,
        callout: `ROUND ${state.round + 1}`,
      });
    }
    return events;
  }

  // 4. Opponent AI Telegraph -> Strike -> Recovery State Machine
  if (opp.phase === 'ko') {
    opp.phaseTimer += dt;
    if (opp.phaseTimer >= opp.phaseDuration) {
      state.round += 1;
      state.roundTimeLeft = ROUND_DURATION;
      state.opponent = createOpponentForRound(state.round);
      state.targets = [];
      state.targetSpawnTimer = 0.6;
      // Restore 1 HP between rounds as a rewarding breather
      state.playerHp = Math.min(state.playerMaxHp, state.playerHp + 1);
    }
  } else if (opp.phase === 'idle') {
    opp.attackCooldown -= dt;
    if (opp.attackCooldown <= 0) {
      const kinds: OpponentAttackKind[] = state.round === 1 ? ['left', 'right'] : ['left', 'right', 'overhead'];
      const chosen = kinds[(state.punchesLanded + state.round + state.nextTargetId) % kinds.length];
      opp.phase = 'windup';
      opp.attackKind = chosen;
      opp.phaseTimer = 0;
      // Generous visible + audible windup telegraph (0.65s - 0.85s)
      opp.phaseDuration = chosen === 'overhead' ? 0.88 : Math.max(0.62, 0.82 - (state.round - 1) * 0.08);
      opp.strikeResolved = false;

      events.push({
        type: 'telegraph',
        position: { ...botCenter },
        intensity: 0.5,
      });
    }
  } else if (opp.phase === 'windup') {
    opp.phaseTimer += dt;
    if (opp.phaseTimer >= opp.phaseDuration) {
      opp.phase = 'strike';
      opp.phaseTimer = 0;
      opp.phaseDuration = 0.22;
      opp.strikeResolved = false;
    }
  } else if (opp.phase === 'strike') {
    opp.phaseTimer += dt;
    if (!opp.strikeResolved && opp.phaseTimer >= 0.08) {
      opp.strikeResolved = true;
      if (state.isGuarding) {
        // Successful Block / Parry -> Opens Counter Window!
        state.blocksLanded += 1;
        state.score += 150;
        state.bestScore = Math.max(state.bestScore, state.score);
        opp.staggerBonusTimer = 2.4;
        opp.phase = 'staggered';
        opp.phaseTimer = 0;
        opp.phaseDuration = 1.25;
        state.hitstopTimer = 0.055;
        state.cameraTrauma = Math.min(1, state.cameraTrauma + 0.35);

        events.push({
          type: 'parry',
          position: { x: 0, y: 1.5, z: -0.95 },
          intensity: 0.9,
          points: 150,
          callout: 'PARRY',
        });
      } else {
        // Player Hit! Reachable defeat condition
        const dmg = opp.attackKind === 'overhead' ? 2 : 1;
        state.playerHp = Math.max(0, state.playerHp - dmg);
        state.combo = 0;
        state.hitstopTimer = 0.06;
        state.cameraTrauma = 0.95;

        if (state.playerHp <= 0) {
          state.victory = false;
          state.finished = true;
          state.finishBeatTimer = 0.55;
          events.push({
            type: 'ko_defeat',
            position: { x: 0, y: 1.45, z: -0.7 },
            intensity: 1,
            callout: 'KO',
          });
        } else {
          events.push({
            type: 'player_hurt',
            position: { x: 0, y: 1.45, z: -0.7 },
            intensity: 0.9,
            callout: 'GUARD!',
          });
        }
      }
    }
    if (opp.phase === 'strike' && opp.phaseTimer >= opp.phaseDuration) {
      opp.phase = 'recovery';
      opp.phaseTimer = 0;
      opp.phaseDuration = 0.55;
    }
  } else if (opp.phase === 'recovery' || opp.phase === 'staggered') {
    opp.phaseTimer += dt;
    if (opp.phaseTimer >= opp.phaseDuration) {
      opp.phase = 'idle';
      opp.attackKind = 'none';
      opp.phaseTimer = 0;
      opp.attackCooldown = Math.max(1.85, 3.6 - (state.round - 1) * 0.55);
    }
  }

  // Round timer expiry check: if time runs out, evaluate win if opponent HP < 50%, otherwise defeat
  if (state.roundTimeLeft <= 0 && !state.finished) {
    if (opp.hp < opp.maxHp * 0.5) {
      opp.hp = 0;
    } else {
      state.playerHp = 0;
      state.victory = false;
      state.finished = true;
      state.finishBeatTimer = 0.55;
      events.push({
        type: 'ko_defeat',
        position: { x: 0, y: 1.5, z: -0.8 },
        intensity: 1,
        callout: 'TIME',
      });
    }
  }

  return events;
}
