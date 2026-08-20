import { FurnitureItem, ErgonomicScore } from './types';

/* ═══════════════════════════════════════════════════════════
   SKALA DUNIA: 1 unit = 1 meter (realistis)
   ═══════════════════════════════════════════════════════════ */
export const IDEAL = {
  chairSeat: 0.45,        // 45 cm tinggi dudukan
  deskSurface: 0.73,      // 73 cm tinggi permukaan meja
  elbowGap: 0.28,         // selisih meja - kursi (siku 90°)
  monitorEyeOffset: 0.62, // tinggi tengah monitor di atas dudukan
  monitorDist: 0.65,      // 65 cm jarak monitor dari mata
  keyboardFromEdge: 0.13, // 13 cm dari tepi meja
  mouseFromKeyboard: 0.28,
  lampSideOffset: 0.55,
};

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** 100 jika dalam zona sempurna, turun linear sampai 0 di batas maksimum */
function grade(actual: number, ideal: number, perfect: number, max: number): number {
  const d = Math.abs(actual - ideal);
  if (d <= perfect) return 100;
  if (d >= max) return 0;
  return Math.round(100 * (1 - (d - perfect) / (max - perfect)));
}

export const deskSurfaceY = (desk: FurnitureItem) => desk.position.y + desk.scale.y / 2;
export const deskFrontZ = (desk: FurnitureItem) => desk.position.z + desk.scale.z / 2;

/** Sudut (derajat) yang seharusnya dihadapi monitor agar menghadap kursi */
function facingAngle(mon: FurnitureItem, chair: FurnitureItem): number {
  return Math.atan2(chair.position.x - mon.position.x, chair.position.z - mon.position.z) * 180 / Math.PI;
}

function angleDiff(a: number, b: number): number {
  let d = ((a - b) % 360 + 540) % 360 - 180;
  return Math.abs(d);
}

/* ═══════════════════════════════════════════════════════════
   METRIK UTAMA — untuk kartu pengaturan sederhana
   ═══════════════════════════════════════════════════════════ */
export interface Metric {
  label: string;
  current: number;   // cm
  target: number;    // cm
  unit: string;
  barMin: number;
  barMax: number;
  tol: number;       // toleransi cm
  control: 'height' | 'move' | 'rotate';
}

export function getMetric(item: FurnitureItem, all: FurnitureItem[]): Metric {
  const desk = all.find(i => i.type === 'desk')!;
  const chair = all.find(i => i.type === 'chair')!;
  const kb = all.find(i => i.type === 'keyboard')!;

  switch (item.type) {
    case 'chair':
      return { label: 'Tinggi dudukan', current: item.position.y * 100, target: IDEAL.chairSeat * 100, unit: 'cm', barMin: 32, barMax: 58, tol: 3, control: 'height' };
    case 'desk':
      return { label: 'Tinggi permukaan meja', current: deskSurfaceY(item) * 100, target: IDEAL.deskSurface * 100, unit: 'cm', barMin: 62, barMax: 88, tol: 3, control: 'height' };
    case 'monitor': {
      const idealY = chair.position.y + IDEAL.monitorEyeOffset;
      // Bila tinggi sudah pas, fokus beralih ke jarak monitor
      if (Math.abs(item.position.y - idealY) <= 0.045) {
        const d = Math.hypot(item.position.x - chair.position.x, item.position.z - chair.position.z) * 100;
        return { label: 'Jarak layar ke mata', current: d, target: IDEAL.monitorDist * 100, unit: 'cm', barMin: 35, barMax: 110, tol: 8, control: 'move' };
      }
      return { label: 'Tinggi tengah layar', current: item.position.y * 100, target: idealY * 100, unit: 'cm', barMin: 88, barMax: 138, tol: 5, control: 'height' };
    }
    case 'keyboard': {
      const d = (deskFrontZ(desk) - item.position.z) * 100;
      return { label: 'Jarak dari tepi meja', current: d, target: IDEAL.keyboardFromEdge * 100, unit: 'cm', barMin: 0, barMax: 40, tol: 4, control: 'move' };
    }
    case 'mouse': {
      const d = Math.hypot(item.position.x - kb.position.x, item.position.z - kb.position.z) * 100;
      return { label: 'Jarak dari keyboard', current: d, target: IDEAL.mouseFromKeyboard * 100, unit: 'cm', barMin: 5, barMax: 70, tol: 6, control: 'move' };
    }
    case 'lamp': {
      const d = Math.abs(item.position.x - desk.position.x) * 100;
      return { label: 'Jarak dari tengah meja', current: d, target: IDEAL.lampSideOffset * 100, unit: 'cm', barMin: 0, barMax: 80, tol: 12, control: 'move' };
    }
  }
}

/* ═══════════════════════════════════════════════════════════
   SKOR PER OBJEK
   ═══════════════════════════════════════════════════════════ */
export interface ItemScore { score: number; status: 'good' | 'warning' | 'bad'; hint: string }

const stat = (s: number): 'good' | 'warning' | 'bad' => s >= 80 ? 'good' : s >= 50 ? 'warning' : 'bad';

export function getItemScore(item: FurnitureItem, all: FurnitureItem[]): ItemScore {
  const desk = all.find(i => i.type === 'desk')!;
  const chair = all.find(i => i.type === 'chair')!;
  const kb = all.find(i => i.type === 'keyboard')!;

  switch (item.type) {
    case 'chair': {
      const s = grade(item.position.y, IDEAL.chairSeat, 0.025, 0.14);
      const d = Math.round((IDEAL.chairSeat - item.position.y) * 100);
      return { score: s, status: stat(s), hint: s >= 80 ? 'Tinggi kursi pas — paha horizontal, kaki rata di lantai.' : d > 0 ? `Naikkan kursi ${d} cm lagi.` : `Turunkan kursi ${-d} cm lagi.` };
    }
    case 'desk': {
      const surf = deskSurfaceY(item);
      const s = grade(surf, IDEAL.deskSurface, 0.025, 0.14);
      const d = Math.round((IDEAL.deskSurface - surf) * 100);
      return { score: s, status: stat(s), hint: s >= 80 ? 'Tinggi meja pas — sejajar siku saat duduk.' : d > 0 ? `Naikkan meja ${d} cm lagi.` : `Turunkan meja ${-d} cm lagi.` };
    }
    case 'monitor': {
      const idealY = chair.position.y + IDEAL.monitorEyeOffset;
      const hS = grade(item.position.y, idealY, 0.04, 0.22);
      const dist = Math.hypot(item.position.x - chair.position.x, item.position.z - chair.position.z);
      const dS = grade(dist, IDEAL.monitorDist, 0.08, 0.35);
      const fS = grade(angleDiff(item.rotation.y, facingAngle(item, chair)), 0, 8, 45);
      const s = Math.round(hS * 0.5 + dS * 0.32 + fS * 0.18);
      let hint = 'Monitor sudah ergonomis — tepi atas layar sejajar mata.';
      if (hS < 80) {
        const d = Math.round((idealY - item.position.y) * 100);
        hint = d > 0 ? `Naikkan monitor ${d} cm agar sejajar mata.` : `Turunkan monitor ${-d} cm agar leher tidak mendongak.`;
      } else if (dS < 80) {
        const d = Math.round((dist - IDEAL.monitorDist) * 100);
        hint = d > 0 ? `Monitor terlalu jauh — dekatkan ${d} cm.` : `Monitor terlalu dekat — jauhkan ${-d} cm.`;
      } else if (fS < 80) hint = 'Putar monitor agar menghadap lurus ke kursi (Q/E).';
      return { score: s, status: stat(s), hint };
    }
    case 'keyboard': {
      const d = deskFrontZ(desk) - item.position.z;
      const dS = grade(d, IDEAL.keyboardFromEdge, 0.035, 0.2);
      const rS = grade(angleDiff(item.rotation.y, 0), 0, 5, 40);
      const s = Math.round(dS * 0.7 + rS * 0.3);
      let hint = 'Keyboard pas — pergelangan tangan lurus.';
      if (dS < 80) { const diff = Math.round((IDEAL.keyboardFromEdge - d) * 100); hint = diff > 0 ? `Geser keyboard ${diff} cm menjauhi tepi meja.` : `Geser keyboard ${-diff} cm mendekati tepi meja.`; }
      else if (rS < 80) hint = 'Luruskan keyboard sejajar tepi meja (Q/E).';
      return { score: s, status: stat(s), hint };
    }
    case 'mouse': {
      const d = Math.hypot(item.position.x - kb.position.x, item.position.z - kb.position.z);
      const s = grade(d, IDEAL.mouseFromKeyboard, 0.05, 0.3);
      const diff = Math.round((d - IDEAL.mouseFromKeyboard) * 100);
      return { score: s, status: stat(s), hint: s >= 80 ? 'Mouse pas — bahu rileks, siku dekat badan.' : diff > 0 ? `Dekatkan mouse ${diff} cm ke keyboard.` : `Jauhkan mouse ${-diff} cm dari keyboard.` };
    }
    case 'lamp': {
      const d = Math.abs(item.position.x - desk.position.x);
      const s = grade(d, IDEAL.lampSideOffset, 0.1, 0.45);
      return { score: s, status: stat(s), hint: s >= 80 ? 'Pencahayaan dari samping — tidak menyilaukan layar.' : 'Pindahkan lampu ke samping meja agar tidak silau.' };
    }
  }
}

/* ═══════════════════════════════════════════════════════════
   LANGKAH-LANGKAH ERGONOMI (misi berurutan)
   ═══════════════════════════════════════════════════════════ */
export interface ErgoStep {
  id: string;
  itemId: string;
  icon: string;
  title: string;
  why: string;
  score: number;
  done: boolean;
}

export function getSteps(all: FurnitureItem[]): ErgoStep[] {
  const desk = all.find(i => i.type === 'desk')!;
  const chair = all.find(i => i.type === 'chair')!;
  const mon = all.find(i => i.type === 'monitor')!;
  const kb = all.find(i => i.type === 'keyboard')!;
  const mouse = all.find(i => i.type === 'mouse')!;
  const lamp = all.find(i => i.type === 'lamp')!;

  const chairS = grade(chair.position.y, IDEAL.chairSeat, 0.025, 0.14);
  const deskS = grade(deskSurfaceY(desk), IDEAL.deskSurface, 0.025, 0.14);
  const monHS = grade(mon.position.y, chair.position.y + IDEAL.monitorEyeOffset, 0.04, 0.22);
  const monDist = Math.hypot(mon.position.x - chair.position.x, mon.position.z - chair.position.z);
  const monDS = Math.round(
    grade(monDist, IDEAL.monitorDist, 0.08, 0.35) * 0.65 +
    grade(angleDiff(mon.rotation.y, facingAngle(mon, chair)), 0, 8, 45) * 0.35
  );
  const handS = Math.round(getItemScore(kb, all).score * 0.6 + getItemScore(mouse, all).score * 0.4);
  const lampS = getItemScore(lamp, all).score;

  const mk = (id: string, itemId: string, icon: string, title: string, why: string, score: number): ErgoStep =>
    ({ id, itemId, icon, title, why, score, done: score >= 80 });

  return [
    mk('chair', 'chair', '🪑', 'Atur tinggi kursi', 'Kaki menapak rata di lantai, paha horizontal, lutut 90°.', chairS),
    mk('desk', 'desk', '🪵', 'Atur tinggi meja', 'Permukaan meja sejajar siku agar lengan membentuk 90°.', deskS),
    mk('monitorH', 'monitor', '🖥️', 'Atur tinggi monitor', 'Tepi atas layar sejajar mata agar leher tidak menunduk.', monHS),
    mk('monitorD', 'monitor', '📏', 'Atur jarak & arah monitor', 'Jarak 50–70 cm dan layar menghadap lurus ke Anda.', monDS),
    mk('hands', 'keyboard', '⌨️', 'Atur keyboard & mouse', 'Pergelangan lurus, mouse dekat keyboard, bahu rileks.', handS),
    mk('lamp', 'lamp', '💡', 'Atur pencahayaan', 'Cahaya dari samping agar layar tidak memantulkan silau.', lampS),
  ];
}

/* ═══════════════════════════════════════════════════════════
   EVALUASI AKHIR
   ═══════════════════════════════════════════════════════════ */
export function calculateErgonomicScore(items: FurnitureItem[]): ErgonomicScore {
  const desk = items.find(i => i.type === 'desk')!;
  const chair = items.find(i => i.type === 'chair')!;
  const mon = items.find(i => i.type === 'monitor')!;
  const kb = items.find(i => i.type === 'keyboard')!;
  const mouse = items.find(i => i.type === 'mouse')!;

  const chairS = getItemScore(chair, items);
  const deskS = getItemScore(desk, items);
  const monS = getItemScore(mon, items);
  const kbS = getItemScore(kb, items);
  const mouseS = getItemScore(mouse, items);

  const monHeight = grade(mon.position.y, chair.position.y + IDEAL.monitorEyeOffset, 0.04, 0.22);
  const monDist = grade(Math.hypot(mon.position.x - chair.position.x, mon.position.z - chair.position.z), IDEAL.monitorDist, 0.08, 0.35);
  const monFacing = grade(angleDiff(mon.rotation.y, facingAngle(mon, chair)), 0, 8, 45);
  const elbow = grade(deskSurfaceY(desk) - chair.position.y, IDEAL.elbowGap, 0.03, 0.16);

  const feedback: string[] = [];
  if (elbow < 80) {
    const gap = deskSurfaceY(desk) - chair.position.y;
    feedback.push(gap > IDEAL.elbowGap
      ? 'Selisih meja–kursi terlalu besar: bahu terangkat saat mengetik. Naikkan kursi atau turunkan meja.'
      : 'Selisih meja–kursi terlalu kecil: paha terhimpit meja. Turunkan kursi atau naikkan meja.');
  }
  [chairS, deskS, monS, kbS, mouseS].forEach(s => { if (s.score < 80) feedback.push(s.hint); });
  if (feedback.length === 0) feedback.push('🎉 Seluruh pengaturan sudah memenuhi standar ergonomi. Pertahankan postur ini dan istirahat 20 detik setiap 20 menit!');

  const total = Math.round(
    chairS.score * 0.18 + deskS.score * 0.14 + monHeight * 0.18 + monDist * 0.12 +
    monFacing * 0.06 + kbS.score * 0.12 + mouseS.score * 0.08 + elbow * 0.12
  );

  return {
    total,
    details: {
      chairHeight: chairS.score,
      deskHeight: deskS.score,
      monitorHeight: monHeight,
      monitorDistance: monDist,
      monitorTilt: monFacing,
      keyboardPosition: kbS.score,
      mousePosition: mouseS.score,
      elbowAngle: elbow,
    },
    feedback,
    color: total >= 80 ? 'green' : total >= 55 ? 'yellow' : 'red',
  };
}

export const calculateLiveScore = (items: FurnitureItem[]) => calculateErgonomicScore(items).total;

/* ═══════════════════════════════════════════════════════════
   NORMALISASI — benda di atas meja mengikuti tinggi meja
   ═══════════════════════════════════════════════════════════ */
export function normalizeDeskItems(items: FurnitureItem[]): FurnitureItem[] {
  const desk = items.find(i => i.type === 'desk');
  if (!desk) return items;
  const surf = deskSurfaceY(desk);
  for (const it of items) {
    if (it.type === 'keyboard') it.position.y = surf + it.scale.y / 2;
    else if (it.type === 'mouse') it.position.y = surf + it.scale.y / 2;
    else if (it.type === 'lamp') it.position.y = surf + it.scale.y / 2 + 0.01;
    else if (it.type === 'monitor') {
      // dudukan monitor menapak permukaan meja → tinggi minimum mengikuti meja
      const minY = surf + it.scale.y / 2 + 0.164;
      it.position.y = clamp(it.position.y, minY, it.maxHeight);
    }
  }
  return items;
}
