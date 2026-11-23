import type { HandSide, TrackedHandState, Vec3 } from './types';

export interface NormalizedLandmark {
  x: number;
  y: number;
  z: number;
}

export interface HandMappingConfig {
  /** Horizontal world span (meters, +/- halfWidth) */
  worldHalfWidth: number;
  /** Vertical world range (meters) */
  minY: number;
  maxY: number;
  /** Depth range in front of camera (negative Z is forward into arena) */
  nearZ: number;
  farZ: number;
  /** Exponential smoothing rate */
  smoothingRate: number;
  /** Pinch threshold (distance between thumb tip and index tip normalized by palm size) */
  pinchRatioThreshold: number;
  /** Fist threshold (average fingertip distance to wrist normalized by palm size) */
  fistRatioThreshold: number;
}

export const DEFAULT_HAND_MAPPING: HandMappingConfig = {
  worldHalfWidth: 1.45,
  minY: 0.72,
  maxY: 2.15,
  nearZ: -0.58,
  farZ: -1.78,
  smoothingRate: 18,
  pinchRatioThreshold: 0.44,
  fistRatioThreshold: 1.25,
};

function dist2D(a: NormalizedLandmark, b: NormalizedLandmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Maps 21 MediaPipe Hand Landmarks (normalized 0..1) into first-person 3D arena space.
 * Mirrors X horizontally so moving your right hand right moves the right 3D glove right.
 */
export function mapLandmarksToHandTarget(
  landmarks: NormalizedLandmark[],
  side: HandSide,
  config: HandMappingConfig = DEFAULT_HAND_MAPPING
): {
  position: Vec3;
  pinchStrength: number;
  isPinching: boolean;
  isFist: boolean;
  screenX: number;
  screenY: number;
} {
  if (landmarks.length < 21) {
    const restX = side === 'left' ? -0.45 : 0.45;
    return {
      position: { x: restX, y: 1.28, z: config.nearZ - 0.15 },
      pinchStrength: 0,
      isPinching: false,
      isFist: false,
      screenX: side === 'left' ? 0.3 : 0.7,
      screenY: 0.65,
    };
  }

  const wrist = landmarks[0];
  const thumbTip = landmarks[4];
  const indexMcp = landmarks[5];
  const indexTip = landmarks[8];
  const middleMcp = landmarks[9];
  const middleTip = landmarks[12];
  const ringTip = landmarks[16];
  const pinkyMcp = landmarks[17];
  const pinkyTip = landmarks[20];

  // Center of palm for stable tracking
  const palmX = (wrist.x + middleMcp.x + indexMcp.x + pinkyMcp.x) * 0.25;
  const palmY = (wrist.y + middleMcp.y + indexMcp.y + pinkyMcp.y) * 0.25;

  // Mirror X for intuitive first-person mirror view
  const mirroredX = 1 - palmX;

  // Palm span acts as a reliable monocular depth proxy: larger palm in camera = hand extended forward!
  const palmLength = dist2D(wrist, middleMcp);
  const palmWidth = dist2D(indexMcp, pinkyMcp);
  const palmSize = Math.max(0.04, (palmLength + palmWidth) * 0.5);

  // Typical resting palmSize ~ 0.11; thrusting forward toward webcam ~ 0.24
  const depthFactor = clamp((palmSize - 0.085) / 0.145, 0, 1);

  const worldX = clamp((mirroredX - 0.5) * 2 * config.worldHalfWidth, -config.worldHalfWidth, config.worldHalfWidth);
  const worldY = clamp(config.maxY - palmY * (config.maxY - config.minY), config.minY, config.maxY);
  const worldZ = config.nearZ + depthFactor * (config.farZ - config.nearZ);

  // Pinch ratio: thumb tip to index tip divided by palmSize
  const pinchDist = dist2D(thumbTip, indexTip) / palmSize;
  const pinchStrength = clamp(1 - (pinchDist - 0.18) / (config.pinchRatioThreshold + 0.28), 0, 1);
  const isPinching = pinchDist < config.pinchRatioThreshold;

  // Fist detection: average distance of 4 fingertips to wrist divided by palmSize
  const avgTipDist =
    (dist2D(indexTip, wrist) +
      dist2D(middleTip, wrist) +
      dist2D(ringTip, wrist) +
      dist2D(pinkyTip, wrist)) /
    (4 * palmSize);
  const isFist = avgTipDist < config.fistRatioThreshold;

  return {
    position: { x: worldX, y: worldY, z: worldZ },
    pinchStrength,
    isPinching,
    isFist,
    screenX: mirroredX,
    screenY: palmY,
  };
}

/**
 * Exponentially smooths hand position and computes world-space velocity & forward punch speed.
 */
export function updateTrackedHandKinematics(
  prev: TrackedHandState,
  targetPos: Vec3,
  dt: number,
  options: {
    active: boolean;
    pinchStrength: number;
    isPinching: boolean;
    isFist: boolean;
    screenX: number;
    screenY: number;
  },
  smoothingRate = DEFAULT_HAND_MAPPING.smoothingRate
): TrackedHandState {
  const safeDt = Math.max(0.001, Math.min(dt, 0.05));
  const alpha = 1 - Math.exp(-smoothingRate * safeDt);

  const nx = prev.position.x + (targetPos.x - prev.position.x) * alpha;
  const ny = prev.position.y + (targetPos.y - prev.position.y) * alpha;
  const nz = prev.position.z + (targetPos.z - prev.position.z) * alpha;

  const rawVx = (nx - prev.position.x) / safeDt;
  const rawVy = (ny - prev.position.y) / safeDt;
  const rawVz = (nz - prev.position.z) / safeDt;

  // Mild velocity smoothing so punch detection stays crisp without jitter spikes
  const velAlpha = 1 - Math.exp(-24 * safeDt);
  const vx = prev.velocity.x + (rawVx - prev.velocity.x) * velAlpha;
  const vy = prev.velocity.y + (rawVy - prev.velocity.y) * velAlpha;
  const vz = prev.velocity.z + (rawVz - prev.velocity.z) * velAlpha;

  const speed = Math.hypot(vx, vy, vz);
  // Forward punch prioritizes -Z velocity plus fast lateral hook velocity
  const forwardComponent = Math.max(0, -vz);
  const punchSpeed = clamp((forwardComponent * 0.7 + speed * 0.35) / 5.5, 0, 1);

  return {
    side: prev.side,
    active: options.active,
    position: { x: nx, y: ny, z: nz },
    velocity: { x: vx, y: vy, z: vz },
    pinchStrength: options.pinchStrength,
    isPinching: options.isPinching,
    isFist: options.isFist,
    punchSpeed,
    screenX: options.screenX,
    screenY: options.screenY,
  };
}

/**
 * Checks whether both hands are raised in front of the player's face in a boxing guard stance.
 */
export function detectHighGuard(left: TrackedHandState, right: TrackedHandState): boolean {
  if (!left.active || !right.active) return false;
  const bothRaised = left.position.y >= 1.48 && right.position.y >= 1.48;
  const closeToCenter = Math.abs(left.position.x) <= 0.62 && Math.abs(right.position.x) <= 0.62;
  const nearFace = left.position.z >= -1.15 && right.position.z >= -1.15;
  return bothRaised && closeToCenter && nearFace;
}

/**
 * Computes optical-flow / frame-diff zone motion for fallback webcam CV when MediaPipe model is unavailable.
 */
export function computeMotionZoneTarget(
  prevLuma: Uint8Array,
  currLuma: Uint8Array,
  width: number,
  height: number,
  side: HandSide,
  config: HandMappingConfig = DEFAULT_HAND_MAPPING
): {
  detected: boolean;
  energy: number;
  position: Vec3;
  screenX: number;
  screenY: number;
} {
  const halfW = Math.floor(width / 2);
  // Mirrored video: user's left hand appears on left side of mirrored frame (which is right half of raw webcam)
  const xStart = side === 'left' ? halfW : 0;
  const xEnd = side === 'left' ? width : halfW;

  let weightedX = 0;
  let weightedY = 0;
  let totalDiff = 0;
  let activePixels = 0;
  const threshold = 24;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = xStart; x < xEnd; x++) {
      const idx = rowOffset + x;
      const diff = Math.abs(currLuma[idx] - prevLuma[idx]);
      if (diff > threshold) {
        weightedX += x * diff;
        weightedY += y * diff;
        totalDiff += diff;
        activePixels++;
      }
    }
  }

  const zonePixels = Math.max(1, (xEnd - xStart) * height);
  const energy = clamp(activePixels / (zonePixels * 0.16), 0, 1);

  if (totalDiff < 400 || activePixels < 12) {
    const restX = side === 'left' ? -0.45 : 0.45;
    return {
      detected: false,
      energy: 0,
      position: { x: restX, y: 1.28, z: config.nearZ - 0.15 },
      screenX: side === 'left' ? 0.28 : 0.72,
      screenY: 0.6,
    };
  }

  const rawAvgX = weightedX / totalDiff / width;
  const avgY = weightedY / totalDiff / height;
  const mirroredX = 1 - rawAvgX;

  const worldX = clamp((mirroredX - 0.5) * 2 * config.worldHalfWidth, -config.worldHalfWidth, config.worldHalfWidth);
  const worldY = clamp(config.maxY - avgY * (config.maxY - config.minY), config.minY, config.maxY);
  // Higher motion burst thrusts the glove forward into a punch!
  const worldZ = config.nearZ + clamp(energy * 0.95, 0, 1) * (config.farZ - config.nearZ);

  return {
    detected: true,
    energy,
    position: { x: worldX, y: worldY, z: worldZ },
    screenX: mirroredX,
    screenY: avgY,
  };
}
