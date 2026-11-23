import * as THREE from 'three';

export interface ArenaTextures {
  ringCanvasMap: THREE.CanvasTexture;
  ringCanvasBump: THREE.CanvasTexture;
  leatherBump: THREE.CanvasTexture;
  woodMap: THREE.CanvasTexture;
  woodBump: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  dispose: () => void;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

export function createArenaTextures(maxAnisotropy: number): ArenaTextures {
  // 1. Boxing Ring Canvas Mat (warm off-white/slate woven canvas with championship lines)
  const [rc, rctx] = makeCanvas(512, 512);
  rctx.fillStyle = '#242933';
  rctx.fillRect(0, 0, 512, 512);

  // Subtle woven fabric cross-hatch
  rctx.strokeStyle = 'rgba(255,255,255,0.035)';
  rctx.lineWidth = 1;
  for (let i = 0; i < 512; i += 4) {
    rctx.beginPath();
    rctx.moveTo(i, 0);
    rctx.lineTo(i, 512);
    rctx.stroke();
    rctx.beginPath();
    rctx.moveTo(0, i);
    rctx.lineTo(512, i);
    rctx.stroke();
  }

  // Outer perimeter gold trim line
  rctx.strokeStyle = '#d97706';
  rctx.lineWidth = 6;
  rctx.strokeRect(24, 24, 464, 464);

  // Inner subtle ring circle emblem
  rctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
  rctx.lineWidth = 4;
  rctx.beginPath();
  rctx.arc(256, 256, 112, 0, Math.PI * 2);
  rctx.stroke();

  rctx.strokeStyle = 'rgba(220, 38, 38, 0.28)';
  rctx.lineWidth = 2;
  rctx.beginPath();
  rctx.arc(256, 256, 94, 0, Math.PI * 2);
  rctx.stroke();

  // Corner zone diagonal accents (Red & Blue corners)
  rctx.fillStyle = 'rgba(220, 38, 38, 0.32)';
  rctx.beginPath();
  rctx.moveTo(24, 24);
  rctx.lineTo(110, 24);
  rctx.lineTo(24, 110);
  rctx.closePath();
  rctx.fill();

  rctx.fillStyle = 'rgba(37, 99, 235, 0.32)';
  rctx.beginPath();
  rctx.moveTo(488, 488);
  rctx.lineTo(402, 488);
  rctx.lineTo(488, 402);
  rctx.closePath();
  rctx.fill();

  const ringCanvasMap = new THREE.CanvasTexture(rc);
  ringCanvasMap.colorSpace = THREE.SRGBColorSpace;
  ringCanvasMap.anisotropy = maxAnisotropy;

  // 2. Ring Canvas Bump (linear)
  const [rbc, rbctx] = makeCanvas(256, 256);
  rbctx.fillStyle = '#808080';
  rbctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 2) {
    for (let x = 0; x < 256; x += 2) {
      const n = ((x * 13 + y * 29) ^ (x * y)) & 31;
      const v = 112 + n;
      rbctx.fillStyle = `rgb(${v},${v},${v})`;
      rbctx.fillRect(x, y, 2, 2);
    }
  }
  const ringCanvasBump = new THREE.CanvasTexture(rbc);
  ringCanvasBump.wrapS = THREE.RepeatWrapping;
  ringCanvasBump.wrapT = THREE.RepeatWrapping;
  ringCanvasBump.repeat.set(6, 6);

  // 3. Stitched Leather Micro-grain Bump (linear)
  const [lc, lctx] = makeCanvas(256, 256);
  lctx.fillStyle = '#787878';
  lctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1600; i++) {
    const x = (i * 73) % 256;
    const y = (i * 137) % 256;
    const r = 1.5 + (i % 3);
    lctx.fillStyle = i % 2 === 0 ? 'rgba(215,215,215,0.28)' : 'rgba(55,55,55,0.28)';
    lctx.beginPath();
    lctx.arc(x, y, r, 0, Math.PI * 2);
    lctx.fill();
  }
  const leatherBump = new THREE.CanvasTexture(lc);
  leatherBump.wrapS = THREE.RepeatWrapping;
  leatherBump.wrapT = THREE.RepeatWrapping;
  leatherBump.repeat.set(2, 2);

  // 4. Warm Walnut Workbench Wood Map (SRGB) & Bump (linear)
  const [wc, wctx] = makeCanvas(512, 256);
  wctx.fillStyle = '#4a3222';
  wctx.fillRect(0, 0, 512, 256);
  for (let y = 0; y < 256; y += 2) {
    const wave = Math.sin(y * 0.14) * 10 + Math.cos(y * 0.05) * 8;
    const shade = Math.round(58 + wave);
    wctx.fillStyle = `rgb(${shade + 22}, ${shade - 4}, ${shade - 22})`;
    wctx.fillRect(0, y, 512, 2);
  }
  // Plank seams
  wctx.strokeStyle = 'rgba(20, 12, 8, 0.45)';
  wctx.lineWidth = 2;
  for (let y = 64; y < 256; y += 64) {
    wctx.beginPath();
    wctx.moveTo(0, y);
    wctx.lineTo(512, y);
    wctx.stroke();
  }
  const woodMap = new THREE.CanvasTexture(wc);
  woodMap.colorSpace = THREE.SRGBColorSpace;
  woodMap.wrapS = THREE.RepeatWrapping;
  woodMap.wrapT = THREE.RepeatWrapping;
  woodMap.anisotropy = maxAnisotropy;

  const [wbc, wbctx] = makeCanvas(256, 128);
  wbctx.fillStyle = '#808080';
  wbctx.fillRect(0, 0, 256, 128);
  for (let y = 0; y < 128; y += 2) {
    const v = Math.round(128 + Math.sin(y * 0.25) * 24);
    wbctx.fillStyle = `rgb(${v},${v},${v})`;
    wbctx.fillRect(0, y, 256, 2);
  }
  const woodBump = new THREE.CanvasTexture(wbc);
  woodBump.wrapS = THREE.RepeatWrapping;
  woodBump.wrapT = THREE.RepeatWrapping;

  // 5. Soft Radial Contact Shadow Disc
  const [sc, sctx] = makeCanvas(128, 128);
  const grad = sctx.createRadialGradient(64, 64, 6, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.34)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, 128, 128);
  const contactShadow = new THREE.CanvasTexture(sc);

  return {
    ringCanvasMap,
    ringCanvasBump,
    leatherBump,
    woodMap,
    woodBump,
    contactShadow,
    dispose: () => {
      ringCanvasMap.dispose();
      ringCanvasBump.dispose();
      leatherBump.dispose();
      woodMap.dispose();
      woodBump.dispose();
      contactShadow.dispose();
    },
  };
}
