import {
  computeMotionZoneTarget,
  DEFAULT_HAND_MAPPING,
  mapLandmarksToHandTarget,
  type NormalizedLandmark,
} from './handMapping';
import type { CameraStatus, HandSide, Vec3 } from './types';

export interface VisionHandSample {
  detected: boolean;
  position: Vec3;
  pinchStrength: number;
  isPinching: boolean;
  isFist: boolean;
  screenX: number;
  screenY: number;
  landmarks?: NormalizedLandmark[];
}

export interface VisionFrameResult {
  left: VisionHandSample;
  right: VisionHandSample;
}

const HAND_CONNECTIONS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

function emptySample(side: HandSide): VisionHandSample {
  return {
    detected: false,
    position: { x: side === 'left' ? -0.45 : 0.45, y: 1.28, z: -0.75 },
    pinchStrength: 0,
    isPinching: false,
    isFist: false,
    screenX: side === 'left' ? 0.28 : 0.72,
    screenY: 0.62,
  };
}

/**
 * Dual-layer real-time webcam computer vision tracker:
 * 1) Instant zero-dependency optical-flow / frame-diff dual-zone hand tracker (works offline & behind firewalls)
 * 2) Automatic upgrade to MediaPipe HandLandmarker (21 3D landmarks per hand) when WASM/model is reachable.
 */
export class WebcamHandTracker {
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private status: CameraStatus = 'idle';
  private onStatusChange: (status: CameraStatus) => void;

  // Offscreen optical-flow canvas
  private flowCanvas: HTMLCanvasElement;
  private flowCtx: CanvasRenderingContext2D | null;
  private readonly flowW = 80;
  private readonly flowH = 60;
  private prevLuma: Uint8Array;
  private currLuma: Uint8Array;
  private hasPrevFrame = false;

  // Optional MediaPipe HandLandmarker instance
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handLandmarker: any = null;
  private lastVideoTime = -1;
  private lastResult: VisionFrameResult = {
    left: emptySample('left'),
    right: emptySample('right'),
  };

  // Optional PIP preview canvas
  private pipCanvas: HTMLCanvasElement | null = null;

  constructor(onStatusChange: (status: CameraStatus) => void) {
    this.onStatusChange = onStatusChange;
    this.flowCanvas = document.createElement('canvas');
    this.flowCanvas.width = this.flowW;
    this.flowCanvas.height = this.flowH;
    this.flowCtx = this.flowCanvas.getContext('2d', { willReadFrequently: true });
    this.prevLuma = new Uint8Array(this.flowW * this.flowH);
    this.currLuma = new Uint8Array(this.flowW * this.flowH);
  }

  public getStatus(): CameraStatus {
    return this.status;
  }

  public isActive(): boolean {
    return this.status === 'mediapipe' || this.status === 'optical_flow';
  }

  public attachPipCanvas(canvas: HTMLCanvasElement | null): void {
    this.pipCanvas = canvas;
  }

  private setStatus(next: CameraStatus): void {
    this.status = next;
    this.onStatusChange(next);
  }

  public async start(): Promise<CameraStatus> {
    if (this.isActive()) return this.status;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      this.setStatus('unavailable');
      return this.status;
    }

    this.setStatus('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      this.stream = stream;
      const video = document.createElement('video');
      video.srcObject = stream;
      video.playsInline = true;
      video.muted = true;
      await video.play();
      this.video = video;
      this.hasPrevFrame = false;

      // Immediately activate zero-latency optical flow mode so webcam works right away!
      this.setStatus('optical_flow');

      // Asynchronously try upgrading to MediaPipe 21-point HandLandmarker
      this.tryLoadMediaPipe().catch(() => {
        // Silently stay on optical_flow if CDN/WASM is unreachable
      });

      return this.status;
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        this.setStatus('denied');
      } else {
        this.setStatus('unavailable');
      }
      return this.status;
    }
  }

  private async tryLoadMediaPipe(): Promise<void> {
    const mp = await import('@mediapipe/tasks-vision');
    const vision = await mp.FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm'
    );
    const landmarker = await mp.HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.48,
      minHandPresenceConfidence: 0.45,
      minTrackingConfidence: 0.45,
    });

    // Only upgrade if camera is still running
    if (this.stream && this.video) {
      this.handLandmarker = landmarker;
      this.setStatus('mediapipe');
    } else {
      landmarker.close();
    }
  }

  public sample(nowMs: number): VisionFrameResult | null {
    if (!this.video || !this.isActive() || this.video.readyState < 2) {
      return null;
    }

    if (this.video.currentTime === this.lastVideoTime) {
      return this.lastResult;
    }
    this.lastVideoTime = this.video.currentTime;

    const leftOut = emptySample('left');
    const rightOut = emptySample('right');

    if (this.status === 'mediapipe' && this.handLandmarker) {
      try {
        const res = this.handLandmarker.detectForVideo(this.video, nowMs);
        const handsList: NormalizedLandmark[][] = res?.landmarks ?? [];
        const handednessList: Array<Array<{ categoryName: string }>> = res?.handedness ?? [];

        for (let i = 0; i < handsList.length; i++) {
          const lm = handsList[i];
          if (!lm || lm.length < 21) continue;

          // Determine side by mirrored screen X (more intuitive in front-facing mirror mode)
          const mirroredX = 1 - lm[9].x;
          let side: HandSide = mirroredX < 0.5 ? 'left' : 'right';
          // If both hands detected and first slot already taken, assign the other side
          if (side === 'left' && leftOut.detected && !rightOut.detected) side = 'right';
          else if (side === 'right' && rightOut.detected && !leftOut.detected) side = 'left';
          else if (handsList.length === 1 && handednessList[i]?.[0]?.categoryName) {
            // MediaPipe handedness on mirrored webcam: "Left" corresponds to user's right hand
            const cat = handednessList[i][0].categoryName.toLowerCase();
            side = cat === 'left' ? 'right' : 'left';
          }

          const mapped = mapLandmarksToHandTarget(lm, side, DEFAULT_HAND_MAPPING);
          const sample: VisionHandSample = {
            detected: true,
            position: mapped.position,
            pinchStrength: mapped.pinchStrength,
            isPinching: mapped.isPinching,
            isFist: mapped.isFist,
            screenX: mapped.screenX,
            screenY: mapped.screenY,
            landmarks: lm,
          };
          if (side === 'left') Object.assign(leftOut, sample);
          else Object.assign(rightOut, sample);
        }
      } catch {
        // Fallback gracefully to optical flow if a MediaPipe frame throws
        this.runOpticalFlow(leftOut, rightOut);
      }
    } else {
      this.runOpticalFlow(leftOut, rightOut);
    }

    this.lastResult = { left: leftOut, right: rightOut };
    this.drawPipOverlay(this.lastResult);
    return this.lastResult;
  }

  private runOpticalFlow(leftOut: VisionHandSample, rightOut: VisionHandSample): void {
    if (!this.flowCtx || !this.video) return;
    this.flowCtx.drawImage(this.video, 0, 0, this.flowW, this.flowH);
    const pixels = this.flowCtx.getImageData(0, 0, this.flowW, this.flowH).data;
    const len = this.flowW * this.flowH;

    for (let i = 0; i < len; i++) {
      const p = i * 4;
      this.currLuma[i] = (pixels[p] * 77 + pixels[p + 1] * 150 + pixels[p + 2] * 29) >> 8;
    }

    if (this.hasPrevFrame) {
      const lZone = computeMotionZoneTarget(this.prevLuma, this.currLuma, this.flowW, this.flowH, 'left');
      const rZone = computeMotionZoneTarget(this.prevLuma, this.currLuma, this.flowW, this.flowH, 'right');

      if (lZone.detected) {
        leftOut.detected = true;
        leftOut.position = lZone.position;
        leftOut.screenX = lZone.screenX;
        leftOut.screenY = lZone.screenY;
        leftOut.isFist = lZone.energy > 0.25;
      }
      if (rZone.detected) {
        rightOut.detected = true;
        rightOut.position = rZone.position;
        rightOut.screenX = rZone.screenX;
        rightOut.screenY = rZone.screenY;
        rightOut.isFist = rZone.energy > 0.25;
      }
    }

    this.prevLuma.set(this.currLuma);
    this.hasPrevFrame = true;
  }

  private drawPipOverlay(result: VisionFrameResult): void {
    if (!this.pipCanvas || !this.video) return;
    const ctx = this.pipCanvas.getContext('2d');
    if (!ctx) return;

    const w = this.pipCanvas.width;
    const h = this.pipCanvas.height;

    ctx.save();
    // Draw mirrored webcam feed
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(this.video, 0, 0, w, h);
    ctx.restore();

    // Subtle dark vignette for tracking readability
    ctx.fillStyle = 'rgba(13, 16, 21, 0.22)';
    ctx.fillRect(0, 0, w, h);

    // Draw tracked hand skeletons or motion reticles
    const drawHand = (sample: VisionHandSample, color: string) => {
      if (!sample.detected) return;
      if (sample.landmarks && sample.landmarks.length >= 21) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        for (const [a, b] of HAND_CONNECTIONS) {
          const pa = sample.landmarks[a];
          const pb = sample.landmarks[b];
          ctx.moveTo((1 - pa.x) * w, pa.y * h);
          ctx.lineTo((1 - pb.x) * w, pb.y * h);
        }
        ctx.stroke();

        ctx.fillStyle = sample.isPinching ? '#fbbf24' : '#f8fafc';
        for (const p of sample.landmarks) {
          ctx.beginPath();
          ctx.arc((1 - p.x) * w, p.y * h, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        const cx = sample.screenX * w;
        const cy = sample.screenY * h;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    drawHand(result.left, '#ef4444');
    drawHand(result.right, '#3b82f6');
  }

  public stop(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.video) {
      this.video.srcObject = null;
      this.video = null;
    }
    if (this.handLandmarker) {
      try {
        this.handLandmarker.close();
      } catch {
        // ignore
      }
      this.handLandmarker = null;
    }
    this.setStatus('idle');
  }
}
