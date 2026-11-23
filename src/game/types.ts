export type GameScreenState = 'title' | 'playing' | 'paused' | 'gameover';

export type GameMode = 'boxing' | 'sandbox';

export type Language = 'fa' | 'en';

export type CameraStatus =
  | 'idle'
  | 'requesting'
  | 'mediapipe'
  | 'optical_flow'
  | 'denied'
  | 'unavailable';

export type SandboxPreset = 'tower' | 'domino' | 'pendulum';

export type HandSide = 'left' | 'right';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface TrackedHandState {
  side: HandSide;
  active: boolean;
  /** World-space target position in the 3D arena */
  position: Vec3;
  /** World-space velocity (m/s) */
  velocity: Vec3;
  /** 0 = open palm, 1 = tight fist / pinch */
  pinchStrength: number;
  isPinching: boolean;
  isFist: boolean;
  /** Forward punch intensity (0..1) */
  punchSpeed: number;
  /** Normalized webcam coords (0..1) for PIP skeleton preview */
  screenX: number;
  screenY: number;
}

export interface HudSnapshot {
  screen: GameScreenState;
  mode: GameMode;
  score: number;
  bestScore: number;
  combo: number;
  maxCombo: number;
  playerHp: number;
  playerMaxHp: number;
  opponentHp: number;
  opponentMaxHp: number;
  round: number;
  totalRounds: number;
  roundTimeLeft: number;
  isGuarding: boolean;
  incomingTelegraph: 'none' | 'left' | 'right' | 'overhead';
  telegraphProgress: number; // 0..1
  lastCallout: string;
  lastCalloutKind: 'hit' | 'crit' | 'parry' | 'miss' | 'hurt' | 'info';
  lastCalloutId: number;
  victory: boolean;
  punchesLanded: number;
  blocksLanded: number;
  sandboxObjectCount: number;
  sandboxGrabbedCount: number;
  sandboxPreset: SandboxPreset;
}

export interface RunSummary {
  victory: boolean;
  score: number;
  bestScore: number;
  maxCombo: number;
  round: number;
  punchesLanded: number;
  blocksLanded: number;
  playerHpRemaining: number;
  opponentHpRemaining: number;
}
