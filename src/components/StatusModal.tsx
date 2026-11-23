import type { GameScreenState, Language, RunSummary } from '../game/types';
import { getCopy } from '../game/i18n';

interface StatusModalProps {
  screen: GameScreenState;
  lang: Language;
  summary: RunSummary | null;
  score: number;
  bestScore: number;
  round: number;
  onResume: () => void;
  onRestart: () => void;
  onBackToTitle: () => void;
}

export function StatusModal({
  screen,
  lang,
  summary,
  score,
  bestScore,
  round,
  onResume,
  onRestart,
  onBackToTitle,
}: StatusModalProps) {
  if (screen !== 'paused' && screen !== 'gameover') return null;

  const copy = getCopy(lang);
  const isRtl = lang === 'fa';
  const isPause = screen === 'paused';
  const isVictory = Boolean(summary?.victory);

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      role="dialog"
      aria-modal="true"
      aria-label={isPause ? copy.pauseTitle : isVictory ? copy.victoryTitle : copy.defeatTitle}
      className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#07090d]/78"
    >
      <div className="w-full max-w-md bg-[#131822] border border-amber-500/40 rounded-xl p-6 shadow-2xl flex flex-col gap-5">
        <div className="flex flex-col gap-1 text-center">
          <h2
            className={`font-display text-3xl font-extrabold ${
              isPause ? 'text-white' : isVictory ? 'text-amber-300' : 'text-red-400'
            }`}
          >
            {isPause ? copy.pauseTitle : isVictory ? copy.victoryTitle : copy.defeatTitle}
          </h2>
        </div>

        {/* Focused 3-Stat Tabular Readout Grid */}
        <div className="grid grid-cols-3 gap-2.5">
          <div className="bg-[#0c1017] border border-slate-800 rounded-lg p-3 flex flex-col items-center gap-1">
            <span className="text-[11px] font-semibold text-slate-400">{copy.scoreLabel}</span>
            <span className="font-mono-num text-xl font-bold text-white">
              {(summary?.score ?? score).toLocaleString()}
            </span>
          </div>
          <div className="bg-[#0c1017] border border-slate-800 rounded-lg p-3 flex flex-col items-center gap-1">
            <span className="text-[11px] font-semibold text-slate-400">
              {isPause ? copy.bestLabel : copy.maxComboStat}
            </span>
            <span className="font-mono-num text-xl font-bold text-amber-300">
              {isPause ? bestScore.toLocaleString() : `×${summary?.maxCombo ?? 0}`}
            </span>
          </div>
          <div className="bg-[#0c1017] border border-slate-800 rounded-lg p-3 flex flex-col items-center gap-1">
            <span className="text-[11px] font-semibold text-slate-400">
              {isPause ? copy.roundReachedStat : copy.punchesStat}
            </span>
            <span className="font-mono-num text-xl font-bold text-sky-300">
              {isPause ? round : summary?.punchesLanded ?? 0}
            </span>
          </div>
        </div>

        {!isPause && summary && (
          <div className="flex items-center justify-center gap-3 text-xs text-slate-400">
            <span>
              {copy.blocksStat}: <strong className="font-mono-num text-slate-200">{summary.blocksLanded}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {copy.bestLabel}: <strong className="font-mono-num text-amber-300">{summary.bestScore.toLocaleString()}</strong>
            </span>
          </div>
        )}

        {/* Primary & Secondary Action Buttons */}
        <div className="flex flex-col gap-2.5 pt-1">
          {isPause ? (
            <button
              type="button"
              onClick={onResume}
              className="w-full py-3 text-sm font-bold text-white bg-[#dc2626] hover:bg-[#b91c1c] rounded-lg transition-colors cursor-pointer"
            >
              {copy.resume}
            </button>
          ) : (
            <button
              type="button"
              data-start="true"
              onClick={onRestart}
              className="w-full py-3 text-sm font-bold text-white bg-[#dc2626] hover:bg-[#b91c1c] rounded-lg transition-colors cursor-pointer"
            >
              {copy.playAgain}
            </button>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            {isPause && (
              <button
                type="button"
                onClick={onRestart}
                className="py-2.5 text-sm font-semibold text-slate-200 bg-[#1d2534] hover:bg-[#273247] border border-slate-700 rounded-lg transition-colors cursor-pointer"
              >
                {copy.restart}
              </button>
            )}
            <button
              type="button"
              onClick={onBackToTitle}
              className={`${isPause ? '' : 'col-span-2'} py-2.5 text-sm font-semibold text-slate-200 bg-[#1d2534] hover:bg-[#273247] border border-slate-700 rounded-lg transition-colors cursor-pointer`}
            >
              {copy.backToTitle}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
