import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePunchDamage,
  createBoxingMatch,
  spawnTargetForRound,
  stepBoxingMatch,
} from './boxingRules';
import type { TrackedHandState } from './types';

function makeStrikingHand(x: number, y: number, z: number): TrackedHandState {
  return {
    side: 'right',
    active: true,
    position: { x, y, z },
    velocity: { x: 0, y: 0, z: -5.2 },
    pinchStrength: 0,
    isPinching: false,
    isFist: true,
    punchSpeed: 0.85,
    screenX: 0.65,
    screenY: 0.45,
  };
}

test('match survives opening seconds safely without input', () => {
  const match = createBoxingMatch(0);
  for (let i = 0; i < 120; i++) {
    stepBoxingMatch(match, [], false, false, 1 / 60);
  }
  assert.equal(match.finished, false);
  assert.equal(match.playerHp, match.playerMaxHp, 'player should survive opening 2s without damage');
});

test('punching a spawned target pad increments score, combo, and damages opponent', () => {
  const match = createBoxingMatch(0);
  const target = spawnTargetForRound(match);
  const initialOppHp = match.opponent.hp;

  const hand = makeStrikingHand(target.position.x, target.position.y, target.position.z);
  const events = stepBoxingMatch(match, [hand], false, false, 1 / 60);

  assert.ok(events.some((e) => e.type === 'target_hit' || e.type === 'crit_counter'));
  assert.equal(match.combo, 1);
  assert.ok(match.score > 0);
  assert.ok(match.opponent.hp < initialOppHp);
  assert.ok(match.hitstopTimer > 0, 'heavy hit should trigger simulation hitstop');
});

test('blocking telegraphed strike triggers parry and opens counter window', () => {
  const match = createBoxingMatch(0);
  match.opponent.phase = 'strike';
  match.opponent.attackKind = 'left';
  match.opponent.phaseTimer = 0.06;
  match.opponent.phaseDuration = 0.22;
  match.opponent.strikeResolved = false;

  const events = stepBoxingMatch(match, [], true, false, 0.04);
  assert.ok(events.some((e) => e.type === 'parry'));
  assert.equal(match.blocksLanded, 1);
  assert.equal(match.playerHp, match.playerMaxHp);
  assert.ok(match.opponent.staggerBonusTimer > 1.5, 'parry should open counter damage window');
});

test('unblocked strikes drain player HP to reachable KO game over', () => {
  const match = createBoxingMatch(0);
  match.playerHp = 1;
  match.opponent.phase = 'strike';
  match.opponent.attackKind = 'right';
  match.opponent.phaseTimer = 0.07;
  match.opponent.phaseDuration = 0.22;
  match.opponent.strikeResolved = false;

  const events = stepBoxingMatch(match, [], false, false, 0.04);
  assert.ok(events.some((e) => e.type === 'ko_defeat'));
  assert.equal(match.playerHp, 0);
  assert.equal(match.finished, true);
  assert.equal(match.victory, false);
});

test('counter window boosts punch damage and points significantly', () => {
  const normal = calculatePunchDamage(0.6, 2, false, false);
  const counter = calculatePunchDamage(0.6, 2, true, false);
  assert.ok(counter.damage > normal.damage * 1.5);
  assert.ok(counter.points > normal.points * 1.5);
});
