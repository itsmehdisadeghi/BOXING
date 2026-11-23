import { useEffect, useRef, useState } from 'react';
import type { BodyShape } from '../game/physics';
import type { CameraStatus, GameMode, HudSnapshot, Language, SandboxPreset } from '../game/types';
import { getCameraStatusText, getCopy, getPresetLabel } from '../game/i18n';

interface PlayingHudProps {
  hud: HudSnapshot;
  lang: Language;
  muted: boolean;
  cameraStatus: CameraStatus;
  onAttachPipCanvas: (canvas: HTMLCanvasElement | null) => void;
  onToggleMute: () => void;
  onPause: () => void;
  onRestart: () => void;
  onEnableCamera: () => void;
  onStopCamera: () => void;
  onSwitchMode: (mode: GameMode) => void;
  onSelectPreset: (preset: SandboxPreset) => void;
  onSpawnBody: (shape: BodyShape) => void;
  onToggleLang: () => void;
}

function VitalitySocket({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 sm:w-6 sm:h-6 shrink-0" aria-hidden="true">
      <path
        d="M12 2.5 L20 6 V12.5 C20 17.2 16.5 20.6 12 22 C7.5 20.6 4 17.2 4 12.5 V6 L12 2.5 Z"
        fill={filled ? '#dc2626' : '#151a22'}
        stroke={filled ? '#fbbf24' : '#475569'}
        strokeWidth="1.8"
      />
      {filled ? (
        <path d="M8.5 8.5 L12 6.8 L15.5 8.5" fill="none" stroke="#fef3c7" strokeWidth="1.5" strokeLinecap="round" />
      ) : (
        <path d="M9 9 L15 15 M15 9 L9 15" stroke="#334155" strokeWidth="1.4" strokeLinecap="round" />
      )}
    </svg>
  );
}

export function PlayingHud({
  hud,
  lang,
  muted,
  cameraStatus,
  onAttachPipCanvas,
  onToggleMute,
  onPause,
  onRestart,
  onEnableCamera,
  onStopCamera,
  onSwitchMode,
  onSelectPreset,
  onSpawnBody,
  onToggleLang,
}: PlayingHudProps) {
  const copy = getCopy(lang);
  const isRtl = lang === 'fa';
  const [dockOpen, setDockOpen] = useState(true);
  const [showPip, setShowPip] = useState(true);
  const [ghostOppPct, setGhostOppPct] = useState(100);
  const [calloutVisible, setCalloutVisible] = useState(false);
  const pipRef = useRef<HTMLCanvasElement | null>(null);

  const cameraActive = cameraStatus === 'mediapipe' || cameraStatus === 'optical_flow';
  const oppPct = Math.max(0, Math.min(100, (hud.opponentHp / Math.max(1, hud.opponentMaxHp)) * 100));

  // Trailing damage ghost bar for opponent armor
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setGhostOppPct(oppPct);
    }, 240);
    return () => window.clearTimeout(timer);
  }, [oppPct]);

  // Brief impact callout animation
  useEffect(() => {
    if (!hud.lastCallout) return;
    setCalloutVisible(true);
    const t = window.setTimeout(() => setCalloutVisible(false), 780);
    return () => window.clearTimeout(t);
  }, [hud.lastCalloutId, hud.lastCallout]);

  // Attach/detach PIP webcam overlay canvas
  useEffect(() => {
    if (cameraActive && showPip) {
      onAttachPipCanvas(pipRef.current);
    } else {
      onAttachPipCanvas(null);
    }
    return () => onAttachPipCanvas(null);
  }, [cameraActive, showPip, onAttachPipCanvas]);

  const translatedCallout = copy.calloutMap[hud.lastCallout] ?? hud.lastCallout;
  const lowHp = hud.mode === 'boxing' && hud.playerHp <= 2;

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-4 md:p-5"
    >
      {/* Subtle Peripheral Vignette on Low HP or Active Guard */}
      {lowHp && (
        <div
          aria-hidden="true"
          className="fixed inset-0 pointer-events-none -z-10"
          style={{
            boxShadow: 'inset 0 0 90px rgba(220, 38, 38, 0.45)',
          }}
        />
      )}
      {hud.mode === 'boxing' && hud.isGuarding && (
        <div
          aria-hidden="true"
          className="fixed inset-0 pointer-events-none -z-10"
          style={{
            boxShadow: 'inset 0 0 70px rgba(56, 189, 248, 0.35)',
          }}
        />
      )}

      {/* TOP PERIMETER CLUSTER (Compact, >=85% unobstructed center playfield) */}
      <div className="flex items-start justify-between gap-2 sm:gap-4 w-full">
        {/* Top Start: Mode-specific Vital & Status Readout */}
        {hud.mode === 'boxing' ? (
          <div className="flex flex-col gap-1.5 sm:gap-2 bg-[#11151d]/90 border border-amber-500/25 rounded-lg px-2.5 sm:px-3.5 py-2 sm:py-2.5 shadow-lg min-w-0 w-[168px] sm:w-[240px]">
            {/* Player Vitality Sockets + Round Clock */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-0.5 sm:gap-1" aria-label={`${copy.hpLabel}: ${hud.playerHp}/${hud.playerMaxHp}`}>
                {Array.from({ length: hud.playerMaxHp }, (_, idx) => (
                  <VitalitySocket key={idx} filled={idx < hud.playerHp} />
                ))}
              </div>
              <span className="font-mono-num text-xs sm:text-sm font-bold text-amber-300 shrink-0">
                {String(hud.roundTimeLeft).padStart(2, '0')}s
              </span>
            </div>

            {/* Opponent Armor Bar with Delayed Damage Ghost */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300">
                <span>
                  {copy.opponentLabel} · {copy.roundLabel} {hud.round}/{hud.totalRounds}
                </span>
                <span className="font-mono-num text-slate-200">{hud.opponentHp}</span>
              </div>
              <div className="relative h-2 w-full bg-[#1e2533] rounded-sm overflow-hidden">
                <div
                  className="absolute inset-y-0 start-0 bg-amber-300/80 transition-all duration-300"
                  style={{ width: `${ghostOppPct}%` }}
                />
                <div
                  className="absolute inset-y-0 start-0 bg-[#dc2626] transition-all duration-100"
                  style={{ width: `${oppPct}%` }}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 bg-[#11151d]/90 border border-amber-500/25 rounded-lg px-3.5 py-2 text-xs font-semibold text-slate-200 shadow-lg">
            <span>{copy.modeSandbox}</span>
            <span aria-hidden="true" className="text-slate-500">·</span>
            <span className="text-slate-400">{copy.objectsLabel}</span>
            <span className="font-mono-num text-amber-300 text-sm font-bold">{hud.sandboxObjectCount}</span>
            <span aria-hidden="true" className="text-slate-500">·</span>
            <span className="text-slate-400">{copy.grabbedLabel}</span>
            <span className="font-mono-num text-sky-300 text-sm font-bold">{hud.sandboxGrabbedCount}</span>
          </div>
        )}

        {/* Top Center: Score & Combo Readout (Boxing only) */}
        {hud.mode === 'boxing' && (
          <div className="hidden sm:flex items-baseline gap-5 bg-[#11151d]/88 border border-slate-700/70 rounded-lg px-4 py-2 shadow-lg">
            <div className="flex flex-col items-center">
              <span className="text-[10px] font-semibold text-slate-400">{copy.scoreLabel}</span>
              <span data-testid="hud-score" className="font-mono-num text-2xl font-bold text-white leading-none">
                {hud.score}
              </span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[10px] font-semibold text-slate-400">{copy.comboLabel}</span>
              <span
                data-testid="hud-combo"
                className={`font-mono-num text-2xl font-bold leading-none ${
                  hud.combo >= 4 ? 'text-amber-400' : 'text-slate-200'
                }`}
              >
                ×{hud.combo}
              </span>
            </div>
          </div>
        )}

        {/* Top End: Compact Square Utility Controls (Camera, Mute, Restart, Pause, Lang) */}
        <div className="pointer-events-auto flex items-center gap-1 sm:gap-1.5 shrink-0">
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              if (cameraActive) onStopCamera();
              else onEnableCamera();
            }}
            aria-label={getCameraStatusText(cameraStatus, copy)}
            title={getCameraStatusText(cameraStatus, copy)}
            className={`h-8 sm:h-9 px-2 sm:px-2.5 flex items-center gap-1.5 text-xs font-semibold rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              cameraActive
                ? 'bg-[#162721] text-emerald-300 border-emerald-500/50 hover:bg-[#1e352d]'
                : 'bg-[#141922]/95 text-amber-200 border-amber-500/35 hover:bg-[#1f2735]'
            }`}
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 7l-7 5 7 5V7z" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
            <span className="hidden md:inline">{cameraActive ? copy.cameraPipLabel : copy.enableCamera}</span>
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            aria-label={muted ? 'Unmute audio' : 'Mute audio'}
            title={`${copy.muteLabel} [M]`}
            className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center bg-[#141922]/95 hover:bg-[#222a38] text-slate-200 border border-slate-700/80 rounded-md transition-colors cursor-pointer"
          >
            {muted ? (
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 5L6 9H2v6h4l5 4V5z" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 5L6 9H2v6h4l5 4V5z" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
            )}
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onRestart();
            }}
            aria-label={copy.restart}
            title={`${copy.restart} [R]`}
            className="hidden sm:flex w-9 h-9 items-center justify-center bg-[#141922]/95 hover:bg-[#222a38] text-slate-200 border border-slate-700/80 rounded-md transition-colors cursor-pointer"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onPause();
            }}
            aria-label={copy.pauseLabel}
            title={`${copy.pauseLabel} [Esc]`}
            className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center bg-[#141922]/95 hover:bg-[#222a38] text-slate-200 border border-slate-700/80 rounded-md transition-colors cursor-pointer"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleLang();
            }}
            aria-label="Toggle language"
            className="h-8 sm:h-9 px-2 sm:px-2.5 flex items-center justify-center text-xs font-bold bg-[#141922]/95 hover:bg-[#222a38] text-slate-200 border border-slate-700/80 rounded-md transition-colors cursor-pointer"
          >
            {lang === 'fa' ? 'EN' : 'FA'}
          </button>
        </div>
      </div>

      {/* GAZE-ROUTED TELEGRAPH & IMPACT CALLOUTS (Non-blocking center-upper zone) */}
      <div className="flex flex-col items-center justify-center gap-2 pointer-events-none my-auto">
        {hud.mode === 'boxing' && hud.incomingTelegraph !== 'none' && (
          <div className="px-4 py-1.5 bg-[#991b1b]/95 border border-amber-400/70 rounded-md text-sm font-bold text-amber-100 shadow-lg">
            {hud.incomingTelegraph === 'left'
              ? copy.incomingLeft
              : hud.incomingTelegraph === 'right'
              ? copy.incomingRight
              : copy.incomingOverhead}
          </div>
        )}

        {hud.mode === 'boxing' && hud.isGuarding && (
          <div className="px-3 py-1 bg-[#0c4a6e]/95 border border-sky-400/70 rounded-md text-xs font-bold text-sky-100">
            {copy.guardActive}
          </div>
        )}

        {calloutVisible && translatedCallout && (
          <div
            className={`font-display text-2xl md:text-3xl font-extrabold hud-stroke transition-opacity duration-200 ${
              hud.lastCalloutKind === 'crit'
                ? 'text-amber-300'
                : hud.lastCalloutKind === 'parry'
                ? 'text-sky-300'
                : hud.lastCalloutKind === 'hurt'
                ? 'text-red-400'
                : 'text-white'
            }`}
          >
            {translatedCallout}
          </div>
        )}
      </div>

      {/* BOTTOM UNIFIED COLLAPSIBLE CONTROL DOCK + OPTIONAL CAMERA PIP */}
      <div className="relative flex items-end justify-center w-full">
        <div className="pointer-events-auto flex flex-col items-center gap-1">
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              setDockOpen((o) => !o);
            }}
            aria-expanded={dockOpen}
            className="px-3 py-1 text-[11px] font-semibold text-slate-300 bg-[#12161f]/90 hover:bg-[#1c2331] border border-slate-700/70 rounded-t-md transition-colors cursor-pointer"
          >
            {dockOpen ? `▾ ${copy.hideControls}` : `▴ ${copy.showControls}`}
          </button>

          {dockOpen && (
            <div className="flex flex-wrap items-center justify-center gap-2 bg-[#11151d]/95 border border-slate-700/80 rounded-lg px-3 py-2 shadow-xl max-w-[94vw]">
              {/* Mode Switch Tabs */}
              <div className="flex items-center gap-1 bg-[#0b0e14] p-1 rounded-md border border-slate-800">
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onSwitchMode('boxing');
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    hud.mode === 'boxing'
                      ? 'bg-[#dc2626] text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {copy.modeBoxing}
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onSwitchMode('sandbox');
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    hud.mode === 'sandbox'
                      ? 'bg-[#d97706] text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {copy.modeSandbox}
                </button>
              </div>

              {/* Sandbox Physics Presets & Object Spawners */}
              {hud.mode === 'sandbox' && (
                <>
                  <div className="w-px h-5 bg-slate-700 hidden sm:block" aria-hidden="true" />
                  <div className="flex items-center gap-1">
                    {(['tower', 'domino', 'pendulum'] as SandboxPreset[]).map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        tabIndex={-1}
                        onClick={(e) => {
                          e.currentTarget.blur();
                          onSelectPreset(preset);
                        }}
                        className={`px-2.5 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          hud.sandboxPreset === preset
                            ? 'bg-amber-500/25 text-amber-200 border border-amber-400/50'
                            : 'bg-[#1a202c] text-slate-300 hover:bg-[#242d3e] border border-transparent'
                        }`}
                      >
                        {getPresetLabel(preset, copy)}
                      </button>
                    ))}
                  </div>
                  <div className="w-px h-5 bg-slate-700 hidden sm:block" aria-hidden="true" />
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={(e) => {
                        e.currentTarget.blur();
                        onSpawnBody('cube');
                      }}
                      className="px-2.5 py-1.5 text-xs font-semibold bg-[#1e2634] hover:bg-[#2a3447] text-slate-100 rounded border border-slate-600/60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      + {copy.spawnCube}
                    </button>
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={(e) => {
                        e.currentTarget.blur();
                        onSpawnBody('sphere');
                      }}
                      className="px-2.5 py-1.5 text-xs font-semibold bg-[#1e2634] hover:bg-[#2a3447] text-slate-100 rounded border border-slate-600/60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      + {copy.spawnSphere}
                    </button>
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={(e) => {
                        e.currentTarget.blur();
                        onSelectPreset(hud.sandboxPreset);
                      }}
                      className="px-2.5 py-1.5 text-xs font-semibold bg-[#291b1b] hover:bg-[#3b2323] text-amber-200 rounded border border-amber-500/35 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {copy.resetScene}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Live Mirrored Webcam CV Preview PIP (Bottom End Corner when Camera is Active) */}
        {cameraActive && (
          <div className="pointer-events-auto fixed bottom-4 end-4 z-20 flex flex-col items-end gap-1">
            {showPip ? (
              <div className="bg-[#0e1219] border border-amber-500/45 rounded-lg overflow-hidden shadow-2xl">
                <div className="flex items-center justify-between px-2.5 py-1 bg-[#151b26] text-[11px] font-semibold text-slate-200">
                  <span>{getCameraStatusText(cameraStatus, copy)}</span>
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPip(false)}
                    aria-label="Hide camera preview"
                    className="text-slate-400 hover:text-white px-1 cursor-pointer"
                  >
                    ×
                  </button>
                </div>
                <canvas
                  ref={pipRef}
                  width={184}
                  height={138}
                  className="block w-[184px] h-[138px] bg-black"
                />
              </div>
            ) : (
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPip(true)}
                className="px-3 py-1.5 text-xs font-semibold bg-[#141922]/95 text-emerald-300 border border-emerald-500/45 rounded-md cursor-pointer"
              >
                {copy.cameraPipLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
