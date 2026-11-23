import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ArenaAudioEngine } from '../game/audio';
import {
  createBoxingMatch,
  stepBoxingMatch,
  type BoxingMatchState,
} from '../game/boxingRules';
import { WebcamHandTracker } from '../game/cameraTracker';
import {
  detectHighGuard,
  updateTrackedHandKinematics,
} from '../game/handMapping';
import {
  createPhysicsWorld,
  loadSandboxPreset,
  spawnSandboxBody,
  stepPhysicsWorld,
  type BodyShape,
  type PhysicsWorldState,
} from '../game/physics';
import type {
  CameraStatus,
  GameMode,
  GameScreenState,
  HandSide,
  HudSnapshot,
  RunSummary,
  SandboxPreset,
  TrackedHandState,
  Vec3,
} from '../game/types';
import {
  buildBoxingRingEnvironment,
  buildFirstPersonGlove,
  buildKinematicHand,
  buildPhysicsWorkbench,
  buildSandboxPropMesh,
  buildSparringAutomaton,
  buildTargetPadMesh,
  type FirstPersonGloveRig,
  type KinematicHandRig,
  type SparringBotRig,
} from './models';
import { createArenaTextures, type ArenaTextures } from './proceduralTextures';

const SPARK_POOL_SIZE = 72;

interface SparkParticle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  scale: number;
}

export interface ArenaEngineCallbacks {
  onHudUpdate: (snapshot: HudSnapshot) => void;
  onCameraStatus: (status: CameraStatus) => void;
  onGameOver: (summary: RunSummary) => void;
}

// Reusable scratch math objects outside the render loop (zero GC)
const _dummyMatrix = new THREE.Matrix4();
const _dummyPos = new THREE.Vector3();
const _dummyScale = new THREE.Vector3();
const _dummyQuat = new THREE.Quaternion();
const _color = new THREE.Color();

function detectSoftwareWebGL(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class ArenaEngine {
  private container: HTMLElement;
  private callbacks: ArenaEngineCallbacks;
  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private textures: ArenaTextures;
  private audio: ArenaAudioEngine;
  private tracker: WebcamHandTracker;

  // Scene groups
  private ringGroup: THREE.Group;
  private workbenchGroup: THREE.Group;
  private botRig: SparringBotRig;
  private leftGlove: FirstPersonGloveRig;
  private rightGlove: FirstPersonGloveRig;
  private leftKinematic: KinematicHandRig;
  private rightKinematic: KinematicHandRig;
  private targetsContainer: THREE.Group;
  private sandboxContainer: THREE.Group;
  private tetherLinesGroup: THREE.Group;

  // Dynamic mesh maps
  private targetMeshes = new Map<number, THREE.Group>();
  private bodyMeshes = new Map<number, THREE.Group>();
  private tetherLines = new Map<number, THREE.Line>();

  // Pooled sparks (zero-GC InstancedMesh)
  private sparkMesh: THREE.InstancedMesh;
  private sparks: SparkParticle[] = [];
  private sparkCursor = 0;

  // Game & Physics states
  private screen: GameScreenState = 'title';
  private mode: GameMode = 'boxing';
  private boxing: BoxingMatchState;
  private physics: PhysicsWorldState;
  private bestScore = 0;

  // Dual tracked hands
  private leftHand: TrackedHandState;
  private rightHand: TrackedHandState;

  // Fallback Mouse / Keyboard controls
  private pointerNormX = 0;
  private pointerNormY = 0;
  private activePointerSide: HandSide = 'right';
  private mouseLeftDown = false;
  private mouseRightDown = false;
  private keysHeld = new Set<string>();
  private keyPunchTimer: Record<HandSide, number> = { left: 0, right: 0 };

  // Timing & Loop
  private frameId = 0;
  private disposed = false;
  private lastTimestamp = 0;
  private elapsedTitle = 0;
  private hudEmitAccumulator = 0;
  private lastCallout = '';
  private lastCalloutKind: HudSnapshot['lastCalloutKind'] = 'info';
  private lastCalloutId = 0;
  private gameOverNotified = false;

  // Camera rig damping state
  private camPos = new THREE.Vector3(-1.25, 1.98, 1.5);
  private camLook = new THREE.Vector3(0.58, 1.36, -1.78);
  private headSlipX = 0;

  // Event cleanup
  private resizeObserver: ResizeObserver;

  constructor(container: HTMLElement, callbacks: ArenaEngineCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareWebGL();
    this.audio = new ArenaAudioEngine();
    this.tracker = new WebcamHandTracker((status) => this.callbacks.onCameraStatus(status));

    try {
      const saved = window.localStorage.getItem('kinetix_ring_best_score');
      if (saved) this.bestScore = Math.max(0, parseInt(saved, 10) || 0);
    } catch {
      // ignore storage restrictions
    }

    this.boxing = createBoxingMatch(this.bestScore);
    this.physics = createPhysicsWorld('tower');

    this.leftHand = this.createDefaultHand('left');
    this.rightHand = this.createDefaultHand('right');

    // Initialize Renderer (Three.js r160+ modern color & software-WebGL guard)
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.container.appendChild(this.renderer.domElement);

    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);

    // Scene, Fog & Studio Environment Reflection (RoomEnvironment on every device)
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0e14);
    this.scene.fog = new THREE.FogExp2(0x0b0e14, 0.068);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const aspect = w / h;
    this.camera = new THREE.PerspectiveCamera(aspect < 0.8 ? 72 : 58, aspect, 0.08, 60);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);

    // Warm/Cool Championship Three-Point Lighting Rig (<= 1 shadow caster)
    const hemi = new THREE.HemisphereLight(0x93c5fd, 0x261d17, 0.72);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xffedd5, 2.35);
    keyLight.position.set(3.2, 6.2, 2.8);
    keyLight.castShadow = !this.isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 16;
    const d = 4.6;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    this.scene.add(keyLight);

    // Cool Arena Rim Backlight
    const rimLight = new THREE.DirectionalLight(0x60a5fa, 1.15);
    rimLight.position.set(-3.5, 3.8, -5.2);
    this.scene.add(rimLight);

    // Warm Ring Overhead Accent Point Light
    const ringSpot = new THREE.PointLight(0xf59e0b, 3.2, 12, 1.6);
    ringSpot.position.set(0, 3.8, -1.65);
    this.scene.add(ringSpot);

    // Procedural Textures & Composite Models
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.textures = createArenaTextures(maxAniso);

    this.ringGroup = buildBoxingRingEnvironment(this.textures);
    this.scene.add(this.ringGroup);

    this.workbenchGroup = buildPhysicsWorkbench(this.textures);
    this.workbenchGroup.visible = false;
    this.scene.add(this.workbenchGroup);

    this.botRig = buildSparringAutomaton(this.textures);
    this.scene.add(this.botRig.root);

    // First-person gloves & sandbox kinematic hands
    this.leftGlove = buildFirstPersonGlove('left', this.textures.leatherBump);
    this.rightGlove = buildFirstPersonGlove('right', this.textures.leatherBump);
    this.scene.add(this.leftGlove.group, this.rightGlove.group);

    this.leftKinematic = buildKinematicHand('left');
    this.rightKinematic = buildKinematicHand('right');
    this.leftKinematic.group.visible = false;
    this.rightKinematic.group.visible = false;
    this.scene.add(this.leftKinematic.group, this.rightKinematic.group);

    this.targetsContainer = new THREE.Group();
    this.sandboxContainer = new THREE.Group();
    this.tetherLinesGroup = new THREE.Group();
    this.sandboxContainer.visible = false;
    this.tetherLinesGroup.visible = false;
    this.scene.add(this.targetsContainer, this.sandboxContainer, this.tetherLinesGroup);

    // Pooled InstancedMesh sparks
    const sparkGeo = new THREE.OctahedronGeometry(0.032, 0);
    const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.sparkMesh = new THREE.InstancedMesh(sparkGeo, sparkMat, SPARK_POOL_SIZE);
    this.sparkMesh.frustumCulled = false;
    for (let i = 0; i < SPARK_POOL_SIZE; i++) {
      this.sparks.push({
        active: false,
        x: 0,
        y: -10,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 0.4,
        scale: 0,
      });
      _dummyMatrix.makeScale(0, 0, 0);
      this.sparkMesh.setMatrixAt(i, _dummyMatrix);
      this.sparkMesh.setColorAt(i, _color.setHex(0xfbbf24));
    }
    this.sparkMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.sparkMesh);

    this.syncSandboxMeshes();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // Bind Input & Resize Listeners
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);
    this.bindEvents();

    // Start loop with immediate initial frame render for zero-flash first paint
    this.lastTimestamp = performance.now();
    this.emitHud();
    this.renderer.render(this.scene, this.camera);
    this.scheduleNextFrame();
  }

  private createDefaultHand(side: HandSide): TrackedHandState {
    return {
      side,
      active: true,
      position: { x: side === 'left' ? -0.34 : 0.34, y: 1.24, z: -0.68 },
      velocity: { x: 0, y: 0, z: 0 },
      pinchStrength: 0,
      isPinching: false,
      isFist: true,
      punchSpeed: 0,
      screenX: side === 'left' ? 0.3 : 0.7,
      screenY: 0.62,
    };
  }

  private bindEvents(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onWindowBlur);
    document.addEventListener('visibilitychange', this.onVisibilityChange);

    const dom = this.renderer.domElement;
    dom.addEventListener('pointermove', this.onPointerMove);
    dom.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    dom.addEventListener('contextmenu', this.onContextMenu);
    dom.addEventListener('webglcontextlost', this.onContextLost);
  }

  private unbindEvents(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onWindowBlur);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);

    const dom = this.renderer.domElement;
    dom.removeEventListener('pointermove', this.onPointerMove);
    dom.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    dom.removeEventListener('contextmenu', this.onContextMenu);
    dom.removeEventListener('webglcontextlost', this.onContextLost);
  }

  private onContextLost = (e: Event): void => {
    e.preventDefault();
  };

  private onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  private onWindowBlur = (): void => {
    this.keysHeld.clear();
    this.mouseLeftDown = false;
    this.mouseRightDown = false;
  };

  private onVisibilityChange = (): void => {
    if (document.hidden) {
      this.keysHeld.clear();
      this.mouseLeftDown = false;
      this.mouseRightDown = false;
    }
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.screen !== 'playing') return;
    const code = e.code;
    const isFresh = !this.keysHeld.has(code);
    this.keysHeld.add(code);

    if (isFresh) {
      if (code === 'KeyQ' || code === 'KeyJ') {
        this.triggerKeyboardPunch('left');
      } else if (code === 'KeyE' || code === 'KeyK') {
        this.triggerKeyboardPunch('right');
      }
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keysHeld.delete(e.code);
  };

  private onPointerMove = (e: PointerEvent): void => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    this.pointerNormX = Math.max(-1, Math.min(1, nx));
    this.pointerNormY = Math.max(-1, Math.min(1, ny));
    this.activePointerSide = this.pointerNormX < 0 ? 'left' : 'right';
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (this.screen !== 'playing') return;
    this.onPointerMove(e);
    if (e.button === 2) {
      this.mouseRightDown = true;
      if (this.mode === 'boxing') this.triggerKeyboardPunch('right');
    } else {
      this.mouseLeftDown = true;
      if (this.mode === 'boxing') {
        this.triggerKeyboardPunch(this.pointerNormX < -0.08 ? 'left' : 'right');
      }
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (e.button === 2) this.mouseRightDown = false;
    else this.mouseLeftDown = false;
  };

  public triggerKeyboardPunch(side: HandSide): void {
    this.keyPunchTimer[side] = 0.24;
  }

  // Public Control API called by React shell
  public async enableCamera(): Promise<CameraStatus> {
    return this.tracker.start();
  }

  public stopCamera(): void {
    this.tracker.stop();
  }

  public attachPipCanvas(canvas: HTMLCanvasElement | null): void {
    this.tracker.attachPipCanvas(canvas);
  }

  public setMuted(muted: boolean): void {
    this.audio.setMuted(muted);
  }

  public setMode(mode: GameMode): void {
    this.mode = mode;
    const isBoxing = mode === 'boxing';
    this.workbenchGroup.visible = !isBoxing;
    this.sandboxContainer.visible = !isBoxing;
    this.tetherLinesGroup.visible = !isBoxing;
    this.botRig.root.visible = isBoxing;
    this.targetsContainer.visible = isBoxing;
    this.leftGlove.group.visible = isBoxing;
    this.rightGlove.group.visible = isBoxing;
    this.leftKinematic.group.visible = !isBoxing;
    this.rightKinematic.group.visible = !isBoxing;

    if (!isBoxing) {
      this.syncSandboxMeshes();
    }
    this.emitHud();
  }

  public setScreen(screen: GameScreenState, immediateCameraSnap = false): void {
    const prev = this.screen;
    this.screen = screen;
    document.body.dataset.state = screen;

    if (screen === 'playing') {
      this.keysHeld.clear();
      this.mouseLeftDown = false;
      this.mouseRightDown = false;
      if (prev === 'title' || prev === 'gameover') {
        this.resetMatch(false);
        if (!immediateCameraSnap) {
          this.audio.playRingBell(1);
        }
      }
      if (immediateCameraSnap || this.isSoftwareGl) {
        const targetY = this.mode === 'sandbox' ? 1.68 : 1.56;
        const targetZ = this.mode === 'sandbox' ? -0.18 : -0.12;
        const targetLookY = this.mode === 'sandbox' ? 1.18 : 1.44;
        this.camPos.set(0, targetY, targetZ);
        this.camLook.set(0, targetLookY, -1.85);
        this.camera.position.copy(this.camPos);
        this.camera.lookAt(this.camLook);
        this.updateFirstPersonHandsVisuals(0.016);
        this.renderer.render(this.scene, this.camera);
      }
    }
    this.emitHud();
  }

  public resetMatch(playBell = true): void {
    this.boxing = createBoxingMatch(this.bestScore);
    this.gameOverNotified = false;
    this.lastCallout = '';
    this.clearTargetMeshes();
    if (this.mode === 'sandbox') {
      loadSandboxPreset(this.physics, this.physics.preset);
      this.syncSandboxMeshes();
    }
    if (playBell) this.audio.playRingBell(1);
    this.emitHud();
  }

  public setSandboxPreset(preset: SandboxPreset): void {
    loadSandboxPreset(this.physics, preset);
    this.syncSandboxMeshes();
    this.audio.playPhysicsClack(0.55, false);
    this.emitHud();
  }

  public spawnSandboxObject(shape: BodyShape): void {
    spawnSandboxBody(this.physics, shape);
    this.syncSandboxMeshes();
    this.audio.playPhysicsClack(0.45, false);
    this.emitHud();
  }

  public handleResize(): void {
    if (this.disposed) return;
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    const aspect = w / h;
    this.camera.aspect = aspect;
    this.camera.fov = aspect < 0.8 ? 72 : 58;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  private emitSparks(pos: Vec3, count: number, colorHex: number, speed = 3.2): void {
    _color.setHex(colorHex);
    for (let i = 0; i < count; i++) {
      const idx = this.sparkCursor;
      this.sparkCursor = (this.sparkCursor + 1) % SPARK_POOL_SIZE;
      const p = this.sparks[idx];
      p.active = true;
      p.x = pos.x;
      p.y = pos.y;
      p.z = pos.z;
      const theta = Math.random() * Math.PI * 2;
      const up = (Math.random() - 0.15) * speed;
      const rad = (0.4 + Math.random() * 0.85) * speed;
      p.vx = Math.cos(theta) * rad;
      p.vy = up + 1.2;
      p.vz = Math.sin(theta) * rad;
      p.life = 0;
      p.maxLife = 0.28 + Math.random() * 0.25;
      p.scale = 0.75 + Math.random() * 0.85;
      this.sparkMesh.setColorAt(idx, _color);
    }
    if (this.sparkMesh.instanceColor) {
      this.sparkMesh.instanceColor.needsUpdate = true;
    }
  }

  private updateSparks(dt: number): void {
    let anyChanged = false;
    for (let i = 0; i < SPARK_POOL_SIZE; i++) {
      const p = this.sparks[i];
      if (!p.active) continue;
      anyChanged = true;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        _dummyMatrix.makeScale(0, 0, 0);
        this.sparkMesh.setMatrixAt(i, _dummyMatrix);
        continue;
      }
      p.vy -= 9.5 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      const s = p.scale * (1 - p.life / p.maxLife);
      _dummyPos.set(p.x, p.y, p.z);
      _dummyScale.set(s, s, s);
      _dummyMatrix.compose(_dummyPos, _dummyQuat, _dummyScale);
      this.sparkMesh.setMatrixAt(i, _dummyMatrix);
    }
    if (anyChanged) {
      this.sparkMesh.instanceMatrix.needsUpdate = true;
    }
  }

  private clearTargetMeshes(): void {
    for (const mesh of this.targetMeshes.values()) {
      this.targetsContainer.remove(mesh);
    }
    this.targetMeshes.clear();
  }

  private syncSandboxMeshes(): void {
    const aliveIds = new Set(this.physics.bodies.map((b) => b.id));
    for (const [id, mesh] of this.bodyMeshes.entries()) {
      if (!aliveIds.has(id)) {
        this.sandboxContainer.remove(mesh);
        this.bodyMeshes.delete(id);
      }
    }
    for (const [id, line] of this.tetherLines.entries()) {
      if (!aliveIds.has(id)) {
        this.tetherLinesGroup.remove(line);
        line.geometry.dispose();
        this.tetherLines.delete(id);
      }
    }

    for (const body of this.physics.bodies) {
      let mesh = this.bodyMeshes.get(body.id);
      if (!mesh) {
        mesh = buildSandboxPropMesh(body.shape, body.halfExtents, body.colorIndex, this.textures);
        this.sandboxContainer.add(mesh);
        this.bodyMeshes.set(body.id, mesh);
      }
      mesh.position.set(body.position.x, body.position.y, body.position.z);
      mesh.rotation.set(body.rotation.x, body.rotation.y, body.rotation.z);

      if (body.tetherAnchor) {
        let line = this.tetherLines.get(body.id);
        if (!line) {
          const geo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(body.tetherAnchor.x, body.tetherAnchor.y, body.tetherAnchor.z),
            new THREE.Vector3(body.position.x, body.position.y, body.position.z),
          ]);
          const mat = new THREE.LineBasicMaterial({ color: 0xf59e0b });
          line = new THREE.Line(geo, mat);
          this.tetherLinesGroup.add(line);
          this.tetherLines.set(body.id, line);
        } else {
          const posAttr = line.geometry.getAttribute('position') as THREE.BufferAttribute;
          posAttr.setXYZ(0, body.tetherAnchor.x, body.tetherAnchor.y, body.tetherAnchor.z);
          posAttr.setXYZ(1, body.position.x, body.position.y, body.position.z);
          posAttr.needsUpdate = true;
        }
      }
    }
  }

  private updateHandsInput(dt: number, nowMs: number): boolean {
    const manualGuard = this.keysHeld.has('ShiftLeft') || this.keysHeld.has('ShiftRight') || this.keysHeld.has('Space');

    // Head slip left/right via A/D or Arrow keys
    const slipDir =
      (this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight') ? 1 : 0) -
      (this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft') ? 1 : 0);
    this.headSlipX = THREE.MathUtils.damp(this.headSlipX, slipDir * 0.34, 10, dt);

    // Decay keyboard punch impulse timers
    this.keyPunchTimer.left = Math.max(0, this.keyPunchTimer.left - dt);
    this.keyPunchTimer.right = Math.max(0, this.keyPunchTimer.right - dt);

    const vision = this.tracker.sample(nowMs);
    const hasVisionLeft = Boolean(vision?.left.detected);
    const hasVisionRight = Boolean(vision?.right.detected);

    // Left Hand Target
    if (hasVisionLeft && vision) {
      this.leftHand = updateTrackedHandKinematics(this.leftHand, vision.left.position, dt, {
        active: true,
        pinchStrength: vision.left.pinchStrength,
        isPinching: vision.left.isPinching,
        isFist: vision.left.isFist,
        screenX: vision.left.screenX,
        screenY: vision.left.screenY,
      });
    } else {
      const punching = this.keyPunchTimer.left > 0;
      const isMouseControllingLeft = this.activePointerSide === 'left' || this.mode === 'sandbox';
      const aimX =
        manualGuard
          ? -0.24
          : punching
          ? Math.min(0.15, this.pointerNormX * 0.95)
          : isMouseControllingLeft && this.mode === 'boxing'
          ? Math.min(-0.14, this.pointerNormX * 0.92)
          : -0.34 + this.headSlipX * 0.5;
      const aimY =
        manualGuard
          ? 1.54
          : punching
          ? 1.5 - this.pointerNormY * 0.45
          : isMouseControllingLeft && this.mode === 'boxing'
          ? 1.35 - this.pointerNormY * 0.32
          : 1.24 + Math.sin(nowMs * 0.004) * 0.025;
      const aimZ = manualGuard ? -0.68 : punching ? -1.62 : -0.7;

      this.leftHand = updateTrackedHandKinematics(
        this.leftHand,
        { x: aimX, y: aimY, z: aimZ },
        dt,
        {
          active: true,
          pinchStrength: this.mouseRightDown ? 1 : 0,
          isPinching: this.mouseRightDown && this.mode === 'sandbox',
          isFist: this.mode === 'boxing' || this.mouseRightDown,
          screenX: 0.3,
          screenY: 0.6,
        },
        punching ? 28 : 14
      );
    }

    // Right Hand Target
    if (hasVisionRight && vision) {
      this.rightHand = updateTrackedHandKinematics(this.rightHand, vision.right.position, dt, {
        active: true,
        pinchStrength: vision.right.pinchStrength,
        isPinching: vision.right.isPinching,
        isFist: vision.right.isFist,
        screenX: vision.right.screenX,
        screenY: vision.right.screenY,
      });
    } else {
      const punching = this.keyPunchTimer.right > 0;
      const inSandbox = this.mode === 'sandbox';
      const sandboxPinch = inSandbox && this.mouseLeftDown;
      const aimX =
        manualGuard && !inSandbox
          ? 0.24
          : inSandbox
          ? this.pointerNormX * 1.35
          : punching
          ? Math.max(-0.15, this.pointerNormX * 0.95)
          : this.activePointerSide === 'right'
          ? Math.max(0.14, this.pointerNormX * 0.92)
          : 0.34 + this.headSlipX * 0.5;
      const aimY =
        manualGuard && !inSandbox
          ? 1.54
          : inSandbox
          ? THREE.MathUtils.clamp(1.52 - this.pointerNormY * 0.62, 0.96, 2.05)
          : punching
          ? 1.5 - this.pointerNormY * 0.45
          : this.activePointerSide === 'right'
          ? 1.35 - this.pointerNormY * 0.32
          : 1.24 + Math.cos(nowMs * 0.004) * 0.025;
      const aimZ =
        manualGuard && !inSandbox
          ? -0.68
          : inSandbox
          ? sandboxPinch
            ? -1.42
            : -1.32
          : punching
          ? -1.62
          : -0.7;

      this.rightHand = updateTrackedHandKinematics(
        this.rightHand,
        { x: aimX, y: aimY, z: aimZ },
        dt,
        {
          active: true,
          pinchStrength: sandboxPinch ? 1 : 0,
          isPinching: sandboxPinch,
          isFist: !inSandbox || sandboxPinch,
          screenX: 0.7,
          screenY: 0.6,
        },
        punching ? 28 : 16
      );
    }

    return manualGuard;
  }

  private updateFirstPersonHandsVisuals(dt: number): void {
    const isBoxing = this.mode === 'boxing';
    const showHands = this.screen === 'playing' || this.screen === 'paused';

    this.leftGlove.group.visible = isBoxing && showHands;
    this.rightGlove.group.visible = isBoxing && showHands;
    this.leftKinematic.group.visible = !isBoxing && showHands;
    this.rightKinematic.group.visible = !isBoxing && showHands;

    if (!showHands) return;

    if (isBoxing) {
      const updateGlove = (rig: FirstPersonGloveRig, hand: TrackedHandState, sign: number) => {
        rig.group.position.set(hand.position.x, hand.position.y, hand.position.z);
        const reach = THREE.MathUtils.clamp((-hand.position.z - 0.8) / 0.85, 0, 1);
        const guardTilt = this.boxing.isGuarding ? 0.45 : 0;
        rig.group.rotation.set(
          -0.22 + reach * 0.25 + guardTilt,
          sign * (0.28 - reach * 0.25),
          sign * (-0.18 + guardTilt * 0.6)
        );
        // Subtle squash-and-stretch on punch extension
        const stretchZ = 1 + reach * 0.16;
        const squashXY = 1 - reach * 0.06;
        rig.knuckleMesh.scale.set(1.06 * squashXY, 0.92 * squashXY, 1.22 * stretchZ);
        rig.cuffGlow.emissiveIntensity = this.boxing.isGuarding ? 1.4 : 0.35 + hand.punchSpeed * 0.9;
      };
      updateGlove(this.leftGlove, this.leftHand, 1);
      updateGlove(this.rightGlove, this.rightHand, -1);
    } else {
      const updateKinematic = (rig: KinematicHandRig, hand: TrackedHandState, sign: number) => {
        rig.group.position.set(hand.position.x, hand.position.y, hand.position.z);
        rig.group.rotation.set(-0.52, sign * 0.24, sign * -0.14);

        const curl = hand.isPinching ? 1.15 : hand.pinchStrength * 0.85;
        for (const f of rig.fingers) {
          f.rotation.x = THREE.MathUtils.damp(f.rotation.x, -curl, 18, dt);
        }
        rig.thumb.rotation.y = THREE.MathUtils.damp(rig.thumb.rotation.y, -sign * curl * 0.55, 18, dt);

        const haloMat = rig.pinchHalo.material as THREE.MeshBasicMaterial;
        haloMat.opacity = THREE.MathUtils.damp(haloMat.opacity, hand.isPinching ? 0.85 : 0.0, 14, dt);
        const haloScale = hand.isPinching ? 0.85 : 1.15;
        rig.pinchHalo.scale.setScalar(THREE.MathUtils.damp(rig.pinchHalo.scale.x, haloScale, 14, dt));
      };
      updateKinematic(this.leftKinematic, this.leftHand, 1);
      updateKinematic(this.rightKinematic, this.rightHand, -1);
    }
  }

  private updateBoxingVisuals(dt: number, nowMs: number): void {
    const opp = this.boxing.opponent;
    const t = nowMs * 0.001;

    // 1. Sparring Automaton idle sway + recoil + KO topple + attack windup/strike!
    let targetBodyX = opp.recoilAngleX;
    let targetBodyZ = opp.recoilAngleZ + Math.sin(t * 2.1) * 0.04;
    if (opp.phase === 'ko') {
      targetBodyX = -1.08;
      targetBodyZ = 0.25;
    } else if (opp.phase === 'staggered') {
      targetBodyX = -0.32;
      targetBodyZ = Math.sin(t * 14) * 0.12;
    }

    this.botRig.upperBody.rotation.x = THREE.MathUtils.damp(this.botRig.upperBody.rotation.x, targetBodyX, 14, dt);
    this.botRig.upperBody.rotation.z = THREE.MathUtils.damp(this.botRig.upperBody.rotation.z, targetBodyZ, 14, dt);

    // Hit flash on torso armor & core
    const flash = opp.hitFlash;
    this.botRig.armorMat.emissive.setHex(flash > 0.05 ? 0xf59e0b : 0x000000);
    this.botRig.armorMat.emissiveIntensity = flash * 0.75;
    this.botRig.chestCoreMat.emissive.setHex(opp.staggerBonusTimer > 0 ? 0x22c55e : 0xd97706);
    this.botRig.chestCoreMat.emissiveIntensity = opp.staggerBonusTimer > 0 ? 1.8 : 0.7 + Math.sin(t * 4) * 0.2;

    // Opponent Arm Telegraph & Strike Animation
    let lPitch = -0.15 + Math.sin(t * 2.8) * 0.06;
    let rPitch = -0.15 + Math.cos(t * 2.8) * 0.06;
    let lGlow = 0;
    let rGlow = 0;

    if (opp.phase === 'windup') {
      const p = Math.min(1, opp.phaseTimer / Math.max(0.01, opp.phaseDuration));
      if (opp.attackKind === 'left' || opp.attackKind === 'overhead') {
        lPitch = -0.15 - p * 1.15;
        lGlow = 0.6 + p * 1.8;
      }
      if (opp.attackKind === 'right' || opp.attackKind === 'overhead') {
        rPitch = -0.15 - p * 1.15;
        rGlow = 0.6 + p * 1.8;
      }
    } else if (opp.phase === 'strike') {
      if (opp.attackKind === 'left' || opp.attackKind === 'overhead') {
        lPitch = 0.95;
        lGlow = 2.2;
      }
      if (opp.attackKind === 'right' || opp.attackKind === 'overhead') {
        rPitch = 0.95;
        rGlow = 2.2;
      }
    }

    this.botRig.leftArmPivot.rotation.x = THREE.MathUtils.damp(this.botRig.leftArmPivot.rotation.x, lPitch, 18, dt);
    this.botRig.rightArmPivot.rotation.x = THREE.MathUtils.damp(this.botRig.rightArmPivot.rotation.x, rPitch, 18, dt);
    this.botRig.leftGloveMat.emissive.setHex(0xf97316);
    this.botRig.leftGloveMat.emissiveIntensity = lGlow;
    this.botRig.rightGloveMat.emissive.setHex(0xf97316);
    this.botRig.rightGloveMat.emissiveIntensity = rGlow;

    // 2. Sync Target Pad Meshes
    const activeIds = new Set(this.boxing.targets.map((tg) => tg.id));
    for (const [id, mesh] of this.targetMeshes.entries()) {
      if (!activeIds.has(id)) {
        this.targetsContainer.remove(mesh);
        this.targetMeshes.delete(id);
      }
    }

    for (const target of this.boxing.targets) {
      let mesh = this.targetMeshes.get(target.id);
      if (!mesh) {
        mesh = buildTargetPadMesh(target.archetype, target.preferredSide);
        this.targetsContainer.add(mesh);
        this.targetMeshes.set(target.id, mesh);
      }
      mesh.position.set(target.position.x, target.position.y, target.position.z);
      const popIn = Math.min(1, target.age * 5.5);
      const hitPop = target.hit ? Math.max(0.01, 1 + target.hitAnim * 0.45 - target.hitAnim * 1.35) : 1;
      mesh.scale.setScalar(popIn * hitPop);
      if (target.archetype === 'power_orb') {
        mesh.rotation.y += dt * 2.4;
        mesh.rotation.x += dt * 1.2;
      } else {
        mesh.lookAt(this.camera.position.x, target.position.y, this.camera.position.z);
      }
    }
  }

  private updateCamera(dt: number): void {
    if (this.screen === 'title') {
      // Cinematic slow orbital camera pan framing the ring & sparring bot in the left-center third,
      // leaving calm dark arena negative space on the right for the Persian title lockup
      this.elapsedTitle += dt;
      const angle = -0.42 + Math.sin(this.elapsedTitle * 0.28) * 0.24;
      const targetPosX = Math.sin(angle) * 3.0;
      const targetPosZ = -1.55 + Math.cos(angle) * 3.35;
      const targetPosY = 1.98 + Math.sin(this.elapsedTitle * 0.45) * 0.12;

      this.camPos.x = THREE.MathUtils.damp(this.camPos.x, targetPosX, 3.5, dt);
      this.camPos.y = THREE.MathUtils.damp(this.camPos.y, targetPosY, 3.5, dt);
      this.camPos.z = THREE.MathUtils.damp(this.camPos.z, targetPosZ, 3.5, dt);

      this.camLook.x = THREE.MathUtils.damp(this.camLook.x, 0.58, 3.5, dt);
      this.camLook.y = THREE.MathUtils.damp(this.camLook.y, 1.36, 3.5, dt);
      this.camLook.z = THREE.MathUtils.damp(this.camLook.z, -1.78, 3.5, dt);

      this.camera.position.copy(this.camPos);
      this.camera.lookAt(this.camLook);
      return;
    }

    // First-person stance in Playing / Paused / Gameover
    const targetY = this.mode === 'sandbox' ? 1.68 : 1.56;
    const targetZ = this.mode === 'sandbox' ? -0.18 : -0.12;
    const targetLookY = this.mode === 'sandbox' ? 1.18 : 1.44;

    this.camPos.x = THREE.MathUtils.damp(this.camPos.x, this.headSlipX, 10, dt);
    this.camPos.y = THREE.MathUtils.damp(this.camPos.y, targetY, 8, dt);
    this.camPos.z = THREE.MathUtils.damp(this.camPos.z, targetZ, 8, dt);

    this.camLook.x = THREE.MathUtils.damp(this.camLook.x, this.headSlipX * 0.25, 10, dt);
    this.camLook.y = THREE.MathUtils.damp(this.camLook.y, targetLookY, 8, dt);
    this.camLook.z = THREE.MathUtils.damp(this.camLook.z, -1.85, 8, dt);

    // Decaying trauma^2 camera shake on heavy impacts
    const shakeAmt = this.boxing.cameraTrauma * this.boxing.cameraTrauma;
    const shakeX = (Math.random() * 2 - 1) * 0.08 * shakeAmt;
    const shakeY = (Math.random() * 2 - 1) * 0.06 * shakeAmt;

    this.camera.position.set(this.camPos.x + shakeX, this.camPos.y + shakeY, this.camPos.z);
    this.camera.lookAt(this.camLook.x, this.camLook.y, this.camLook.z);
  }

  private tick = (nowMs: number): void => {
    if (this.disposed) return;

    const rawDt = (nowMs - this.lastTimestamp) / 1000;
    this.lastTimestamp = nowMs;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

    if (this.screen === 'playing') {
      const manualGuard = this.updateHandsInput(dt, nowMs);

      if (this.mode === 'boxing') {
        const autoGuard = detectHighGuard(this.leftHand, this.rightHand);
        const events = stepBoxingMatch(
          this.boxing,
          [this.leftHand, this.rightHand],
          manualGuard,
          autoGuard,
          dt
        );

        for (const ev of events) {
          if (ev.type === 'target_hit' || ev.type === 'bot_hit') {
            this.audio.playPunchImpact(ev.intensity, false);
            this.emitSparks(ev.position, 12, 0xfbbf24, 3.2);
            this.triggerCallout(ev.callout || 'HIT', 'hit');
          } else if (ev.type === 'crit_counter') {
            this.audio.playPunchImpact(1, true);
            this.emitSparks(ev.position, 22, 0xf59e0b, 4.4);
            this.triggerCallout(ev.callout || 'CRIT', 'crit');
          } else if (ev.type === 'parry') {
            this.audio.playParry();
            this.emitSparks(ev.position, 18, 0x38bdf8, 3.8);
            this.triggerCallout('PARRY', 'parry');
          } else if (ev.type === 'telegraph') {
            this.audio.playTelegraph();
          } else if (ev.type === 'player_hurt') {
            this.audio.playPlayerHurt();
            this.triggerCallout('GUARD!', 'hurt');
          } else if (ev.type === 'round_clear') {
            this.audio.playRingBell(2);
            this.emitSparks(ev.position, 26, 0xfbbf24, 4.8);
            this.triggerCallout(ev.callout || 'KO', 'crit');
          } else if (ev.type === 'victory' || ev.type === 'ko_defeat') {
            this.audio.playRingBell(ev.type === 'victory' ? 3 : 2);
            this.emitSparks(ev.position, 28, ev.type === 'victory' ? 0xfbbf24 : 0xef4444, 5.0);
            this.triggerCallout(ev.callout || 'KO', ev.type === 'victory' ? 'crit' : 'hurt');
          }
        }

        if (this.boxing.bestScore > this.bestScore) {
          this.bestScore = this.boxing.bestScore;
          try {
            window.localStorage.setItem('kinetix_ring_best_score', String(this.bestScore));
          } catch {
            // ignore
          }
        }

        if (this.boxing.finished && this.boxing.finishBeatTimer <= 0 && !this.gameOverNotified) {
          this.gameOverNotified = true;
          this.screen = 'gameover';
          document.body.dataset.state = 'gameover';
          this.callbacks.onGameOver({
            victory: this.boxing.victory,
            score: this.boxing.score,
            bestScore: this.bestScore,
            maxCombo: this.boxing.maxCombo,
            round: this.boxing.round,
            punchesLanded: this.boxing.punchesLanded,
            blocksLanded: this.boxing.blocksLanded,
            playerHpRemaining: this.boxing.playerHp,
            opponentHpRemaining: this.boxing.opponent.hp,
          });
          this.emitHud();
        }
      } else {
        // 3D Physics Sandbox simulation
        const collisions = stepPhysicsWorld(this.physics, [this.leftHand, this.rightHand], dt);
        for (const col of collisions) {
          this.audio.playPhysicsClack(col.intensity, col.fromHand);
          if (col.fromHand) {
            this.emitSparks(col.position, 8, 0xfbbf24, 2.5);
          }
        }
        this.syncSandboxMeshes();
      }
    }

    if (this.mode === 'boxing') {
      this.updateBoxingVisuals(dt, nowMs);
    }
    this.updateFirstPersonHandsVisuals(dt);
    this.updateSparks(dt);
    this.updateCamera(dt);

    // Throttled HUD updates (~10Hz) so React stays completely decoupled from 60Hz loop
    this.hudEmitAccumulator += dt;
    if (this.hudEmitAccumulator >= 0.1) {
      this.hudEmitAccumulator = 0;
      this.emitHud();
    }

    this.renderer.render(this.scene, this.camera);
    this.scheduleNextFrame();
  };

  private triggerCallout(text: string, kind: HudSnapshot['lastCalloutKind']): void {
    this.lastCallout = text;
    this.lastCalloutKind = kind;
    this.lastCalloutId += 1;
    this.emitHud();
  }

  private emitHud(): void {
    const opp = this.boxing.opponent;
    const isWindup = opp.phase === 'windup';
    const telegraphProgress = isWindup
      ? Math.min(1, opp.phaseTimer / Math.max(0.01, opp.phaseDuration))
      : 0;

    this.callbacks.onHudUpdate({
      screen: this.screen,
      mode: this.mode,
      score: Math.round(this.boxing.score),
      bestScore: Math.round(this.bestScore),
      combo: this.boxing.combo,
      maxCombo: this.boxing.maxCombo,
      playerHp: this.boxing.playerHp,
      playerMaxHp: this.boxing.playerMaxHp,
      opponentHp: Math.round(opp.hp),
      opponentMaxHp: Math.round(opp.maxHp),
      round: this.boxing.round,
      totalRounds: this.boxing.totalRounds,
      roundTimeLeft: Math.ceil(this.boxing.roundTimeLeft),
      isGuarding: this.boxing.isGuarding,
      incomingTelegraph: isWindup ? opp.attackKind : 'none',
      telegraphProgress,
      lastCallout: this.lastCallout,
      lastCalloutKind: this.lastCalloutKind,
      lastCalloutId: this.lastCalloutId,
      victory: this.boxing.victory,
      punchesLanded: this.boxing.punchesLanded,
      blocksLanded: this.boxing.blocksLanded,
      sandboxObjectCount: this.physics.bodies.length,
      sandboxGrabbedCount: this.physics.bodies.filter((b) => b.grabbedBy !== null).length,
      sandboxPreset: this.physics.preset,
    });
  }

  private scheduleNextFrame(): void {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(() => this.tick(performance.now()));
    } else {
      this.frameId = window.requestAnimationFrame(this.tick);
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 85);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  public dispose(): void {
    this.disposed = true;
    window.cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.frameId);
    this.resizeObserver.disconnect();
    this.unbindEvents();
    this.tracker.stop();
    this.textures.dispose();
    this.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        m.geometry?.dispose();
        if (Array.isArray(m.material)) {
          m.material.forEach((mat) => mat.dispose());
        } else {
          m.material?.dispose();
        }
      }
    });
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
