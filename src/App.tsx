import { useCallback, useEffect, useRef, useState } from 'react';
import { PlayingHud } from './components/PlayingHud';
import { StatusModal } from './components/StatusModal';
import { TitleOverlay } from './components/TitleOverlay';
import type { BodyShape } from './game/physics';
import type {
  CameraStatus,
  GameMode,
  GameScreenState,
  HudSnapshot,
  Language,
  RunSummary,
  SandboxPreset,
} from './game/types';
import { ArenaEngine } from './three/ArenaEngine';

const INITIAL_HUD: HudSnapshot = {
  screen: 'title',
  mode: 'boxing',
  score: 0,
  bestScore: 0,
  combo: 0,
  maxCombo: 0,
  playerHp: 5,
  playerMaxHp: 5,
  opponentHp: 100,
  opponentMaxHp: 100,
  round: 1,
  totalRounds: 3,
  roundTimeLeft: 60,
  isGuarding: false,
  incomingTelegraph: 'none',
  telegraphProgress: 0,
  lastCallout: '',
  lastCalloutKind: 'info',
  lastCalloutId: 0,
  victory: false,
  punchesLanded: 0,
  blocksLanded: 0,
  sandboxObjectCount: 12,
  sandboxGrabbedCount: 0,
  sandboxPreset: 'tower',
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<ArenaEngine | null>(null);

  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('idle');
  const [runSummary, setRunSummary] = useState<RunSummary | null>(null);
  const [lang, setLang] = useState<Language>('fa');
  const [muted, setMuted] = useState(false);

  const screenRef = useRef<GameScreenState>('title');
  screenRef.current = hud.screen;

  // Mount WebGL ArenaEngine ONCE in isolated sibling container (never re-mounts on HUD state updates)
  useEffect(() => {
    const mountEl = canvasMountRef.current;
    if (!mountEl) return;

    const engine = new ArenaEngine(mountEl, {
      onHudUpdate: (snapshot) => setHud(snapshot),
      onCameraStatus: (status) => setCameraStatus(status),
      onGameOver: (summary) => setRunSummary(summary),
    });
    engineRef.current = engine;

    // Parse query params (?autostart=1 & optional ?mode=sandbox & ?lang=en)
    const params = new URLSearchParams(window.location.search);
    const reqMode = params.get('mode');
    if (reqMode === 'sandbox' || reqMode === 'boxing') {
      engine.setMode(reqMode);
    }
    const reqLang = params.get('lang');
    if (reqLang === 'en' || reqLang === 'fa') {
      setLang(reqLang);
    }
    if (params.get('autostart') === '1') {
      engine.setScreen('playing', true);
    }

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Sync HTML dir/lang attribute with active language
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
  }, [lang]);

  const handleStart = useCallback(() => {
    setRunSummary(null);
    engineRef.current?.setScreen('playing');
  }, []);

  const handlePause = useCallback(() => {
    if (screenRef.current === 'playing') {
      engineRef.current?.setScreen('paused');
    } else if (screenRef.current === 'paused') {
      engineRef.current?.setScreen('playing');
    }
  }, []);

  const handleRestart = useCallback(() => {
    setRunSummary(null);
    engineRef.current?.resetMatch(true);
    engineRef.current?.setScreen('playing');
  }, []);

  const handleBackToTitle = useCallback(() => {
    setRunSummary(null);
    engineRef.current?.setScreen('title');
  }, []);

  const handleSelectMode = useCallback((mode: GameMode) => {
    engineRef.current?.setMode(mode);
  }, []);

  const handleEnableCamera = useCallback(() => {
    void engineRef.current?.enableCamera();
  }, []);

  const handleStopCamera = useCallback(() => {
    engineRef.current?.stopCamera();
  }, []);

  const handleAttachPipCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    engineRef.current?.attachPipCanvas(canvas);
  }, []);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      engineRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const handleSelectPreset = useCallback((preset: SandboxPreset) => {
    engineRef.current?.setSandboxPreset(preset);
  }, []);

  const handleSpawnBody = useCallback((shape: BodyShape) => {
    engineRef.current?.spawnSandboxObject(shape);
  }, []);

  const handleToggleLang = useCallback(() => {
    setLang((prev) => (prev === 'fa' ? 'en' : 'fa'));
  }, []);

  // Global Game Shell Shortcuts (Enter/Space to Start, Escape/P to Pause, M to Mute, R to Restart)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const current = screenRef.current;

      if (current === 'title' && (e.code === 'Enter' || e.code === 'Space')) {
        e.preventDefault();
        handleStart();
        return;
      }

      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (current === 'playing' || current === 'paused') {
          e.preventDefault();
          handlePause();
        }
        return;
      }

      if (e.code === 'KeyM') {
        handleToggleMute();
        return;
      }

      if (e.code === 'KeyR' && (current === 'playing' || current === 'paused' || current === 'gameover')) {
        handleRestart();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handlePause, handleRestart, handleStart, handleToggleMute]);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#0b0e14]">
      {/* Isolated WebGL Viewport Container */}
      <div
        ref={canvasMountRef}
        data-testid="arena-canvas-mount"
        className="fixed inset-0 w-full h-full"
      />

      {/* Game Shell Overlays */}
      {hud.screen === 'title' && (
        <TitleOverlay
          lang={lang}
          mode={hud.mode}
          cameraStatus={cameraStatus}
          bestScore={hud.bestScore}
          onSelectMode={handleSelectMode}
          onStart={handleStart}
          onEnableCamera={handleEnableCamera}
          onToggleLang={handleToggleLang}
        />
      )}

      {(hud.screen === 'playing' || hud.screen === 'paused') && (
        <PlayingHud
          hud={hud}
          lang={lang}
          muted={muted}
          cameraStatus={cameraStatus}
          onAttachPipCanvas={handleAttachPipCanvas}
          onToggleMute={handleToggleMute}
          onPause={handlePause}
          onRestart={handleRestart}
          onEnableCamera={handleEnableCamera}
          onStopCamera={handleStopCamera}
          onSwitchMode={handleSelectMode}
          onSelectPreset={handleSelectPreset}
          onSpawnBody={handleSpawnBody}
          onToggleLang={handleToggleLang}
        />
      )}

      <StatusModal
        screen={hud.screen}
        lang={lang}
        summary={runSummary}
        score={hud.score}
        bestScore={hud.bestScore}
        round={hud.round}
        onResume={handlePause}
        onRestart={handleRestart}
        onBackToTitle={handleBackToTitle}
      />
    </main>
  );
}
