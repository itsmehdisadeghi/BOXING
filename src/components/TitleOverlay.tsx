import type { CameraStatus, GameMode, Language } from '../game/types';
import { getCameraStatusText, getControlHint, getCopy } from '../game/i18n';

interface TitleOverlayProps {
  lang: Language;
  mode: GameMode;
  cameraStatus: CameraStatus;
  bestScore: number;
  onSelectMode: (mode: GameMode) => void;
  onStart: () => void;
  onEnableCamera: () => void;
  onToggleLang: () => void;
}

export function TitleOverlay({
  lang,
  mode,
  cameraStatus,
  bestScore,
  onSelectMode,
  onStart,
  onEnableCamera,
  onToggleLang,
}: TitleOverlayProps) {
  const copy = getCopy(lang);
  const isRtl = lang === 'fa';
  const cameraOn = cameraStatus === 'mediapipe' || cameraStatus === 'optical_flow';

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-6 md:p-10"
    >
      {/* Subtle directional vignette scrim on the text side for effortless 4.5:1 legibility */}
      <div
        aria-hidden="true"
        className="fixed inset-0 -z-10 pointer-events-none"
        style={{
          background: isRtl
            ? 'linear-gradient(270deg, rgba(11,14,20,0.88) 0%, rgba(11,14,20,0.52) 44%, rgba(11,14,20,0.12) 100%)'
            : 'linear-gradient(90deg, rgba(11,14,20,0.88) 0%, rgba(11,14,20,0.52) 44%, rgba(11,14,20,0.12) 100%)',
        }}
      />

      {/* Top corner minimal language switch */}
      <div className="flex items-center justify-end pointer-events-none">
        <button
          type="button"
          onClick={(e) => {
            e.currentTarget.blur();
            onToggleLang();
          }}
          aria-label={lang === 'fa' ? 'Switch language to English' : 'تغییر زبان به فارسی'}
          className="pointer-events-auto px-3 py-1.5 text-xs font-semibold tracking-wide text-slate-200 bg-[#151a23]/90 hover:bg-[#1f2735] border border-amber-500/30 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          {lang === 'fa' ? 'EN' : 'فارسی'}
        </button>
      </div>

      {/* Main Asymmetric Hero Title Lockup & Controls */}
      <div className="max-w-lg w-full flex flex-col gap-6 pointer-events-auto my-auto">
        {/* Bespoke Inline SVG Crest Emblem + World-Matched Display Title Lockup */}
        <div className="flex items-center gap-4">
          <svg
            viewBox="0 0 68 74"
            className="w-16 h-17 md:w-20 md:h-21 shrink-0"
            role="img"
            aria-label={copy.brandTitle}
          >
            <defs>
              <linearGradient id="brassStroke" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#fde68a" />
                <stop offset="50%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#b45309" />
              </linearGradient>
            </defs>
            <polygon
              points="34,3 64,19 64,55 34,71 4,55 4,19"
              fill="#161b24"
              stroke="url(#brassStroke)"
              strokeWidth="2.8"
            />
            <path
              d="M22 36 C20 26, 26 20, 36 20 C45 20, 50 26, 49 35 C49 41, 45 45, 41 47 L41 55 L27 55 L27 48 C22 46, 19 42, 22 36 Z"
              fill="#dc2626"
              stroke="#f8fafc"
              strokeWidth="1.5"
            />
            <path
              d="M25 34 C19 34, 18 42, 24 45"
              fill="none"
              stroke="#f8fafc"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
            <rect x="26" y="50" width="16" height="5" rx="1.5" fill="#f59e0b" />
          </svg>

          <div className="flex flex-col gap-1.5 min-w-0">
            <h1 className="font-display text-4xl md:text-5xl font-extrabold text-white tracking-tight hud-stroke leading-tight">
              {copy.brandTitle}
            </h1>
            <svg viewBox="0 0 240 4" className="w-56 md:w-64 h-1" aria-hidden="true">
              <rect x="0" y="0" width="240" height="3" rx="1.5" fill="#f59e0b" />
            </svg>
            <p className="text-sm md:text-base font-semibold text-slate-200 hud-stroke leading-snug">
              {copy.brandSubtitle}
            </p>
          </div>
        </div>

        {/* Mode Selector (Segmented Interactive Buttons — Boxing Ring vs 3D Physics Sandbox) */}
        <div
          role="tablist"
          aria-label="Game Mode"
          className="inline-flex items-center gap-1.5 p-1.5 bg-[#141922]/95 border border-slate-700/80 rounded-lg w-fit max-w-full"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'boxing'}
            onClick={() => onSelectMode('boxing')}
            className={`px-4 py-2.5 text-sm font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              mode === 'boxing'
                ? 'bg-[#dc2626] text-white shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
            }`}
          >
            {copy.modeBoxing}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'sandbox'}
            onClick={() => onSelectMode('sandbox')}
            className={`px-4 py-2.5 text-sm font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              mode === 'sandbox'
                ? 'bg-[#d97706] text-slate-950 shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
            }`}
          >
            {copy.modeSandbox}
          </button>
        </div>

        {/* Primary CTA + Camera Activation Action */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            data-start="true"
            onClick={(e) => {
              e.currentTarget.blur();
              onStart();
            }}
            className="px-7 py-3.5 text-base font-bold text-white bg-[#dc2626] hover:bg-[#b91c1c] active:scale-[0.98] border border-amber-400/40 rounded-lg shadow-lg transition-all whitespace-nowrap shrink-0 cursor-pointer"
          >
            {copy.startCta}
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              onEnableCamera();
            }}
            className={`px-5 py-3.5 text-sm font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-2 ${
              cameraOn
                ? 'bg-[#162721] text-emerald-300 border-emerald-500/50 hover:bg-[#1c332b]'
                : 'bg-[#161c26]/95 text-amber-200 border-amber-500/40 hover:bg-[#202938]'
            }`}
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 7l-7 5 7 5V7z" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
            <span>{getCameraStatusText(cameraStatus, copy)}</span>
          </button>
        </div>

        {/* Clean Unboxed Record Metadata (Zero Pill Discipline) */}
        {bestScore > 0 && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>{copy.bestLabel}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-num text-amber-300 font-bold">{bestScore.toLocaleString()}</span>
          </div>
        )}
      </div>

      {/* Single Flat Borderless Control-Hint Line in Bottom Safe Margin */}
      <div className="pointer-events-none text-xs md:text-sm text-slate-300/90 hud-stroke tracking-normal">
        {getControlHint(mode, copy)}
      </div>
    </div>
  );
}
