import type { CameraStatus, GameMode, Language, SandboxPreset } from './types';

export interface CopyBundle {
  brandTitle: string;
  brandSubtitle: string;
  modeBoxing: string;
  modeSandbox: string;
  startCta: string;
  enableCamera: string;
  cameraActive: string;
  cameraFallback: string;
  cameraRequesting: string;
  cameraDenied: string;
  cameraUnavailable: string;
  controlHintBoxing: string;
  controlHintSandbox: string;
  hpLabel: string;
  opponentLabel: string;
  scoreLabel: string;
  bestLabel: string;
  comboLabel: string;
  roundLabel: string;
  guardActive: string;
  incomingLeft: string;
  incomingRight: string;
  incomingOverhead: string;
  pauseTitle: string;
  resume: string;
  restart: string;
  backToTitle: string;
  victoryTitle: string;
  defeatTitle: string;
  playAgain: string;
  punchesStat: string;
  blocksStat: string;
  maxComboStat: string;
  roundReachedStat: string;
  presetTower: string;
  presetDomino: string;
  presetPendulum: string;
  spawnCube: string;
  spawnSphere: string;
  resetScene: string;
  objectsLabel: string;
  grabbedLabel: string;
  hideControls: string;
  showControls: string;
  cameraPipLabel: string;
  muteLabel: string;
  pauseLabel: string;
  calloutMap: Record<string, string>;
}

const FA: CopyBundle = {
  brandTitle: 'رینگ لمس',
  brandSubtitle: 'بوکس اول‌شخص و فیزیک سه‌بعدی با ردیابی دست',
  modeBoxing: 'رینگ بوکس اول‌شخص',
  modeSandbox: 'آزمایشگاه فیزیک سه‌بعدی',
  startCta: 'ورود به رینگ',
  enableCamera: 'فعال‌سازی دوربین',
  cameraActive: 'دوربین فعال (ردیابی دست)',
  cameraFallback: 'دوربین فعال (ردیابی حرکت)',
  cameraRequesting: 'در انتظار اجازه دوربین...',
  cameraDenied: 'دسترسی دوربین رد شد · کنترل با ماوس',
  cameraUnavailable: 'دوربین یافت نشد · کنترل با ماوس',
  controlHintBoxing: 'دوربین یا ماوس: حرکت دست · کلیک / Q-E: مشت چپ و راست · Shift: گارد دفاعی · Esc: توقف',
  controlHintSandbox: 'نیشگون دست یا نگه‌داشتن کلیک: گرفتن و پرتاب مکعب · حرکت سریع: ضربه فیزیکی · Esc: توقف',
  hpLabel: 'جان',
  opponentLabel: 'حریف آهنی',
  scoreLabel: 'امتیاز',
  bestLabel: 'رکورد',
  comboLabel: 'کومبو',
  roundLabel: 'راند',
  guardActive: 'گارد فعال',
  incomingLeft: 'ضربه از چپ — گارد بگیر!',
  incomingRight: 'ضربه از راست — گارد بگیر!',
  incomingOverhead: 'ضربه سنگین — دست‌ها بالا!',
  pauseTitle: 'توقف بازی',
  resume: 'ادامه',
  restart: 'شروع مجدد',
  backToTitle: 'صفحه اصلی',
  victoryTitle: 'پیروزی با ناک‌اوت!',
  defeatTitle: 'پایان مبارزه',
  playAgain: 'مبارزه مجدد',
  punchesStat: 'مشت موفق',
  blocksStat: 'دفاع موفق',
  maxComboStat: 'بیشترین کومبو',
  roundReachedStat: 'راند',
  presetTower: 'برج مکعب',
  presetDomino: 'دومینو',
  presetPendulum: 'آونگ و گوی',
  spawnCube: 'مکعب جدید',
  spawnSphere: 'گوی جدید',
  resetScene: 'چیدمان مجدد',
  objectsLabel: 'اجسام',
  grabbedLabel: 'در دست',
  hideControls: 'مخفی کردن نوار',
  showControls: 'نمایش کنترل‌ها',
  cameraPipLabel: 'نمای دوربین',
  muteLabel: 'صدا',
  pauseLabel: 'توقف',
  calloutMap: {
    HIT: 'ضربه!',
    CRIT: 'ضربه سهمگین!',
    POWER: 'ضربه طلایی!',
    COUNTER: 'ضدحمله ×۲!',
    STRIKE: 'برخورد!',
    PARRY: 'دفاع عالی!',
    'GUARD!': 'گارد بگیر!',
    KO: 'ناک‌اوت!',
    TIME: 'پایان وقت',
  },
};

const EN: CopyBundle = {
  brandTitle: 'KINETIX RING',
  brandSubtitle: 'First-Person Hand-Tracked Boxing & 3D Physics',
  modeBoxing: 'First-Person Boxing',
  modeSandbox: '3D Physics Sandbox',
  startCta: 'Enter the Ring',
  enableCamera: 'Enable Camera',
  cameraActive: 'Camera Active (Hand Tracking)',
  cameraFallback: 'Camera Active (Motion Track)',
  cameraRequesting: 'Requesting camera...',
  cameraDenied: 'Camera denied · Mouse controls active',
  cameraUnavailable: 'No camera · Mouse controls active',
  controlHintBoxing: 'Webcam or Mouse: Move Gloves · Click / Q-E: Jab & Cross · Shift: Guard · Esc: Pause',
  controlHintSandbox: 'Pinch or Hold Click: Grab & Throw · Fast Swipe: Physics Punch · Esc: Pause',
  hpLabel: 'VITALITY',
  opponentLabel: 'IRON SPAR',
  scoreLabel: 'SCORE',
  bestLabel: 'BEST',
  comboLabel: 'COMBO',
  roundLabel: 'ROUND',
  guardActive: 'GUARD UP',
  incomingLeft: 'LEFT HOOK — GUARD!',
  incomingRight: 'RIGHT CROSS — GUARD!',
  incomingOverhead: 'HEAVY STRIKE — BLOCK!',
  pauseTitle: 'Match Paused',
  resume: 'Resume',
  restart: 'Restart',
  backToTitle: 'Title Screen',
  victoryTitle: 'Knockout Victory!',
  defeatTitle: 'Knockout Defeat',
  playAgain: 'Fight Again',
  punchesStat: 'Punches',
  blocksStat: 'Parries',
  maxComboStat: 'Best Combo',
  roundReachedStat: 'Round',
  presetTower: 'Cube Tower',
  presetDomino: 'Domino Arc',
  presetPendulum: 'Pendulum Lab',
  spawnCube: 'Add Cube',
  spawnSphere: 'Add Sphere',
  resetScene: 'Reset',
  objectsLabel: 'BODIES',
  grabbedLabel: 'HELD',
  hideControls: 'Hide Controls',
  showControls: 'Show Controls',
  cameraPipLabel: 'Camera Feed',
  muteLabel: 'Audio',
  pauseLabel: 'Pause',
  calloutMap: {
    HIT: 'SOLID HIT',
    CRIT: 'CRITICAL!',
    POWER: 'POWER SHOT!',
    COUNTER: 'COUNTER 2x!',
    STRIKE: 'BODY SHOT!',
    PARRY: 'PARRIED!',
    'GUARD!': 'GUARD UP!',
    KO: 'KNOCKOUT!',
    TIME: 'TIME UP',
  },
};

export function getCopy(lang: Language): CopyBundle {
  return lang === 'fa' ? FA : EN;
}

export function getCameraStatusText(status: CameraStatus, copy: CopyBundle): string {
  switch (status) {
    case 'mediapipe':
      return copy.cameraActive;
    case 'optical_flow':
      return copy.cameraFallback;
    case 'requesting':
      return copy.cameraRequesting;
    case 'denied':
      return copy.cameraDenied;
    case 'unavailable':
      return copy.cameraUnavailable;
    default:
      return copy.enableCamera;
  }
}

export function getPresetLabel(preset: SandboxPreset, copy: CopyBundle): string {
  if (preset === 'domino') return copy.presetDomino;
  if (preset === 'pendulum') return copy.presetPendulum;
  return copy.presetTower;
}

export function getControlHint(mode: GameMode, copy: CopyBundle): string {
  return mode === 'boxing' ? copy.controlHintBoxing : copy.controlHintSandbox;
}
