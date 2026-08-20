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
  keyboardFromEdge: 0.13, // 13 cm dari tepi meja (referensi lama, masih dipakai hint)
  mouseFromKeyboard: 0.28,
  lampSideOffset: 0.55,
};

/* ═══════════════════════════════════════════════════════════
   SISTEM RELATIF KURSI
   Setiap offset didefinisikan dalam LOCAL FRAME kursi:
     lokal +Z  = arah hadap kursi (arah duduk)
     lokal +X  = kiri pemain saat duduk
   Rotasi kursi (rotation.y) mengubah lokal → dunia.
   ═══════════════════════════════════════════════════════════ */
const CHAIR_LOCAL: Record<string, { x: number; z: number }> = {
  desk:     { x:  0,     z: 0.72  },  // 72 cm di depan kursi
  monitor:  { x:  0,     z: 0.64  },  // 64 cm di depan kursi
  keyboard: { x:  0,     z: 0.495 },  // 49.5 cm di depan kursi (di atas meja)
  mouse:    { x: -0.35,  z: 0.495 },  // +35 cm ke kanan pemain (kiri lokal saat 180°)
  lamp:     { x:  0.55,  z: 0.94  },  // +55 cm ke kiri pemain (kanan lokal saat 180°)
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
export const deskFrontZ   = (desk: FurnitureItem) => desk.position.z + desk.scale.z / 2;
/** Tinggi permukaan atas dudukan kursi (titik kontak paha) */
export const chairSeatY   = (chair: FurnitureItem) => chair.position.y + chair.scale.y / 2;

function angleDiff(a: number, b: number): number {
  const d = ((a - b) % 360 + 540) % 360 - 180;
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

export function getMetric(item: FurnitureItem, _all: FurnitureItem[]): Metric {
  switch (item.type) {
    case 'chair':
      return {
        label: 'Tinggi dudukan',
        current: chairSeatY(item) * 100,
        target: item.idealPosition.y * 100 + item.scale.y / 2 * 100,
        unit: 'cm', barMin: 32, barMax: 58, tol: 3, control: 'height',
      };

    case 'desk': {
      const surf = deskSurfaceY(item);
      const idealSurf = item.idealPosition.y + item.scale.y / 2;
      if (Math.abs(surf - idealSurf) <= 0.03) {
        const d = Math.hypot(item.position.x - item.idealPosition.x, item.position.z - item.idealPosition.z) * 100;
        return {
          label: 'Jarak dari posisi ideal kursi',
          current: d, target: 0,
          unit: 'cm', barMin: 0, barMax: 60, tol: 8, control: 'move',
        };
      }
      return {
        label: 'Tinggi permukaan meja',
        current: surf * 100,
        target: idealSurf * 100,
        unit: 'cm', barMin: 62, barMax: 88, tol: 3, control: 'height',
      };
    }

    case 'monitor': {
      const idealY = item.idealPosition.y;
      if (Math.abs(item.position.y - idealY) <= 0.045) {
        const d = Math.hypot(item.position.x - item.idealPosition.x, item.position.z - item.idealPosition.z) * 100;
        return {
          label: 'Jarak dari posisi ideal kursi',
          current: d, target: 0,
          unit: 'cm', barMin: 0, barMax: 80, tol: 8, control: 'move',
        };
      }
      return {
        label: 'Tinggi tengah layar',
        current: item.position.y * 100,
        target: idealY * 100,
        unit: 'cm', barMin: 88, barMax: 138, tol: 5, control: 'height',
      };
    }

    case 'keyboard': {
      const d = Math.hypot(item.position.x - item.idealPosition.x, item.position.z - item.idealPosition.z) * 100;
      return {
        label: 'Jarak dari posisi ideal kursi',
        current: d, target: 0,
        unit: 'cm', barMin: 0, barMax: 50, tol: 5, control: 'move',
      };
    }

    case 'mouse': {
      const d = Math.hypot(item.position.x - item.idealPosition.x, item.position.z - item.idealPosition.z) * 100;
      return {
        label: 'Jarak dari posisi ideal kursi',
        current: d, target: 0,
        unit: 'cm', barMin: 0, barMax: 70, tol: 6, control: 'move',
      };
    }

    case 'lamp': {
      const d = Math.hypot(item.position.x - item.idealPosition.x, item.position.z - item.idealPosition.z) * 100;
      return {
        label: 'Jarak dari posisi ideal kursi',
        current: d, target: 0,
        unit: 'cm', barMin: 0, barMax: 80, tol: 12, control: 'move',
      };
    }
  }
}

/* ═══════════════════════════════════════════════════════════
   SKOR PER OBJEK — INDEPENDEN
   Sekarang langsung menggunakan `item.idealPosition` dan `item.idealRotation`
   yang diupdate secara dinamis oleh `normalizeDeskItems`.
   ═══════════════════════════════════════════════════════════ */
export interface ItemScore { score: number; status: 'good' | 'warning' | 'bad'; hint: string }

const stat = (s: number): 'good' | 'warning' | 'bad' => s >= 80 ? 'good' : s >= 50 ? 'warning' : 'bad';

export function getItemScore(item: FurnitureItem, _all: FurnitureItem[]): ItemScore {
  switch (item.type) {
    case 'chair': {
      const seat = chairSeatY(item);
      const idealSeat = item.idealPosition.y + item.scale.y / 2;
      const s = grade(seat, idealSeat, 0.025, 0.14);
      const d = Math.round((idealSeat - seat) * 100);
      return {
        score: s, status: stat(s),
        hint: s >= 80
          ? 'Tinggi kursi pas — paha horizontal, kaki rata di lantai.'
          : d > 0 ? `Naikkan kursi ${d} cm lagi.` : `Turunkan kursi ${-d} cm lagi.`,
      };
    }

    case 'desk': {
      const surf = deskSurfaceY(item);
      const idealSurf = item.idealPosition.y + item.scale.y / 2;
      const hS = grade(surf, idealSurf, 0.025, 0.14);
      const dist = Math.hypot(item.position.x - item.idealPosition.x, item.position.z - item.idealPosition.z);
      const xzS = grade(dist, 0, 0.08, 0.40);
      const rS = grade(angleDiff(item.rotation.y, item.idealRotation.y), 0, 5, 40);
      const s = Math.round(hS * 0.45 + xzS * 0.35 + rS * 0.20);
      const d = Math.round((idealSurf - surf) * 100);
      let hint = 'Tinggi, posisi & arah meja pas.';
      if (hS < 80) {
        hint = d > 0 ? `Naikkan meja ${d} cm lagi.` : `Turunkan meja ${-d} cm lagi.`;
      } else if (xzS < 80) {
        hint = `Geser meja ${Math.round(dist * 100)} cm mendekati panduan (bayangan hijau) di depan kursi.`;
      } else if (rS < 80) {
        hint = `Putar meja sejajar dengan kursi (Q/E).`;
      }
      return { score: s, status: stat(s), hint };
    }

    case 'monitor': {
      const hS = grade(item.position.y, item.idealPosition.y, 0.04, 0.22);
      const dist = Math.hypot(item.position.x - item.idealPosition.x, item.position.z - item.idealPosition.z);
      const dS = grade(dist, 0, 0.08, 0.35);
      const fS = grade(angleDiff(item.rotation.y, item.idealRotation.y), 0, 8, 45);
      const s = Math.round(hS * 0.50 + dS * 0.32 + fS * 0.18);
      let hint = 'Monitor sudah ergonomis — tepi atas layar sejajar mata.';
      if (hS < 80) {
        const d = Math.round((item.idealPosition.y - item.position.y) * 100);
        hint = d > 0
          ? `Naikkan monitor ${d} cm agar sejajar mata.`
          : `Turunkan monitor ${-d} cm agar leher tidak mendongak.`;
      } else if (dS < 80) {
        hint = `Monitor ${Math.round(dist * 100)} cm dari posisi ideal — sesuaikan jarak terhadap kursi.`;
      } else if (fS < 80) {
        hint = 'Putar monitor agar sejajar dengan kursi (Q/E).';
      }
      return { score: s, status: stat(s), hint };
    }

    case 'keyboard': {
      const dist = Math.hypot(item.position.x - item.idealPosition.x, item.position.z - item.idealPosition.z);
      const dS = grade(dist, 0, 0.035, 0.25);
      const rS = grade(angleDiff(item.rotation.y, item.idealRotation.y), 0, 5, 40);
      const s = Math.round(dS * 0.70 + rS * 0.30);
      let hint = 'Keyboard pas — pergelangan tangan lurus.';
      if (dS < 80) {
        hint = `Geser keyboard ${Math.round(dist * 100)} cm mendekati posisi ideal (bayangan hijau).`;
      } else if (rS < 80) {
        hint = 'Luruskan keyboard sejajar meja & kursi (Q/E).';
      }
      return { score: s, status: stat(s), hint };
    }

    case 'mouse': {
      const dist = Math.hypot(item.position.x - item.idealPosition.x, item.position.z - item.idealPosition.z);
      const s = grade(dist, 0, 0.05, 0.35);
      return {
        score: s, status: stat(s),
        hint: s >= 80
          ? 'Mouse pas — bahu rileks, siku dekat badan.'
          : `Geser mouse ${Math.round(dist * 100)} cm mendekati posisi ideal.`,
      };
    }

    case 'lamp': {
      const dist = Math.hypot(item.position.x - item.idealPosition.x, item.position.z - item.idealPosition.z);
      const s = grade(dist, 0, 0.10, 0.50);
      return {
        score: s, status: stat(s),
        hint: s >= 80
          ? 'Pencahayaan dari samping — tidak menyilaukan layar.'
          : 'Pindahkan lampu ke posisi ideal agar tidak silau.',
      };
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
  const mon   = all.find(i => i.type === 'monitor')!;
  const kb    = all.find(i => i.type === 'keyboard')!;
  const mouse = all.find(i => i.type === 'mouse')!;

  const chairS = getItemScore(all.find(i => i.type === 'chair')!, all).score;
  const deskS  = getItemScore(all.find(i => i.type === 'desk')!, all).score;
  const kbS    = getItemScore(kb, all).score;
  const mouseS = getItemScore(mouse, all).score;
  const lampS  = getItemScore(all.find(i => i.type === 'lamp')!, all).score;

  // Sub-skor monitor: tinggi (relatif kursi)
  const monHS = grade(mon.position.y, mon.idealPosition.y, 0.04, 0.22);
  // Sub-skor monitor: jarak XZ relatif kursi + arah
  const monDist = Math.hypot(mon.position.x - mon.idealPosition.x, mon.position.z - mon.idealPosition.z);
  const monDS = Math.round(
    grade(monDist, 0, 0.08, 0.35) * 0.65 +
    grade(angleDiff(mon.rotation.y, mon.idealRotation.y), 0, 8, 45) * 0.35,
  );

  // Langkah keyboard+mouse digabung (masing-masing independen)
  const handS = Math.round(kbS * 0.60 + mouseS * 0.40);

  const mk = (id: string, itemId: string, icon: string, title: string, why: string, score: number): ErgoStep =>
    ({ id, itemId, icon, title, why, score, done: score >= 80 });

  return [
    mk('chair',   'chair',    '🪑', 'Atur tinggi kursi',         'Kaki menapak rata di lantai, paha horizontal, lutut 90°.',           chairS),
    mk('desk',    'desk',     '🪵', 'Atur tinggi meja',           'Permukaan meja sejajar siku agar lengan membentuk 90°.',              deskS),
    mk('monitorH','monitor',  '🖥️', 'Atur tinggi monitor',        'Tepi atas layar sejajar mata agar leher tidak menunduk.',             monHS),
    mk('monitorD','monitor',  '📏', 'Atur jarak & arah monitor',  'Jarak 50–70 cm dari kursi, layar menghadap lurus ke Anda.',           monDS),
    mk('hands',   'keyboard', '⌨️', 'Atur keyboard & mouse',      'Pergelangan lurus, mouse dekat keyboard, bahu rileks.',              handS),
    mk('lamp',    'lamp',     '💡', 'Atur pencahayaan',           'Cahaya dari samping agar layar tidak memantulkan silau.',             lampS),
  ];
}

/* ═══════════════════════════════════════════════════════════
   EVALUASI AKHIR
   ═══════════════════════════════════════════════════════════ */
export function calculateErgonomicScore(items: FurnitureItem[]): ErgonomicScore {
  const desk  = items.find(i => i.type === 'desk')!;
  const chair = items.find(i => i.type === 'chair')!;
  const mon   = items.find(i => i.type === 'monitor')!;
  const kb    = items.find(i => i.type === 'keyboard')!;
  const mouse = items.find(i => i.type === 'mouse')!;

  const chairS = getItemScore(chair, items);
  const deskS  = getItemScore(desk,  items);
  const monS   = getItemScore(mon,   items);
  const kbS    = getItemScore(kb,    items);
  const mouseS = getItemScore(mouse, items);

  const cSeat = chairSeatY(chair);
  const monHeight = grade(mon.position.y, mon.idealPosition.y, 0.04, 0.22);
  const monDistVal = Math.hypot(mon.position.x - mon.idealPosition.x, mon.position.z - mon.idealPosition.z);
  const monDist   = grade(monDistVal, 0, 0.08, 0.35);
  const monFacing = grade(angleDiff(mon.rotation.y, mon.idealRotation.y), 0, 8, 45);
  const elbow     = grade(deskSurfaceY(desk) - cSeat, IDEAL.elbowGap, 0.03, 0.16);

  const feedback: string[] = [];
  if (elbow < 80) {
    const gap = deskSurfaceY(desk) - cSeat;
    feedback.push(gap > IDEAL.elbowGap
      ? 'Selisih meja–kursi terlalu besar: bahu terangkat saat mengetik. Naikkan kursi atau turunkan meja.'
      : 'Selisih meja–kursi terlalu kecil: paha terhimpit meja. Turunkan kursi atau naikkan meja.');
  }
  [chairS, deskS, monS, kbS, mouseS].forEach(s => { if (s.score < 80) feedback.push(s.hint); });
  if (feedback.length === 0)
    feedback.push('🎉 Seluruh pengaturan sudah memenuhi standar ergonomi. Pertahankan postur ini dan istirahat 20 detik setiap 20 menit!');

  const total = Math.round(
    chairS.score * 0.18 + deskS.score * 0.14 + monHeight * 0.18 + monDist * 0.12 +
    monFacing * 0.06 + kbS.score * 0.12 + mouseS.score * 0.08 + elbow * 0.12,
  );

  return {
    total,
    details: {
      chairHeight:      chairS.score,
      deskHeight:       deskS.score,
      monitorHeight:    monHeight,
      monitorDistance:  monDist,
      monitorTilt:      monFacing,
      keyboardPosition: kbS.score,
      mousePosition:    mouseS.score,
      elbowAngle:       elbow,
    },
    feedback,
    color: total >= 80 ? 'green' : total >= 55 ? 'yellow' : 'red',
  };
}

export const calculateLiveScore = (items: FurnitureItem[]) => calculateErgonomicScore(items).total;

/* ═══════════════════════════════════════════════════════════
   NORMALISASI & IDEAL POSITION UPDATE
   Memastikan benda di meja mengikuti tinggi meja,
   DAN mengupdate idealPosition serta idealRotation semua benda
   berdasarkan posisi dan rotasi kursi saat ini.
   Ini memastikan skor & bayangan hijau (Ghost Guide) SELALU SINKRON.
   ═══════════════════════════════════════════════════════════ */
export function normalizeDeskItems(items: FurnitureItem[]): FurnitureItem[] {
  // 1. Sesuaikan tinggi benda di atas meja (seperti sebelumnya)
  const desk = items.find(i => i.type === 'desk');
  let surf = IDEAL.deskSurface;
  if (desk) {
    surf = deskSurfaceY(desk);
    const deskYaw = (desk.rotation.y || 0) * Math.PI / 180;
    const dc = Math.cos(-deskYaw), ds = Math.sin(-deskYaw);
    const rc = Math.cos(deskYaw), rs = Math.sin(deskYaw);

    for (const it of items) {
      if (['keyboard', 'mouse', 'lamp', 'monitor'].includes(it.type)) {
        // 1a. Sesuaikan tinggi (Y)
        if (it.type === 'keyboard' || it.type === 'mouse') it.position.y = surf + it.scale.y / 2;
        else if (it.type === 'lamp') it.position.y = surf + it.scale.y / 2 + 0.01;
        else if (it.type === 'monitor') {
          const minY = surf + it.scale.y / 2 + 0.164;
          it.position.y = clamp(it.position.y, minY, it.maxHeight);
        }

        // 1b. Batasi pergerakan agar tidak keluar dari meja (XZ)
        const dx = it.position.x - desk.position.x;
        const dz = it.position.z - desk.position.z;
        const lx = dx * dc - dz * ds; // desk-local X
        const lz = dx * ds + dz * dc; // desk-local Z
        
        const padX = it.scale.x / 2 + 0.02;
        const padZ = it.scale.z / 2 + 0.02;
        const minX = -desk.scale.x / 2 + padX;
        const maxX = desk.scale.x / 2 - padX;
        const minZ = -desk.scale.z / 2 + padZ;
        const maxZ = desk.scale.z / 2 - padZ;

        const clX = minX < maxX ? clamp(lx, minX, maxX) : 0;
        const clZ = minZ < maxZ ? clamp(lz, minZ, maxZ) : 0;

        it.position.x = desk.position.x + clX * rc - clZ * rs;
        it.position.z = desk.position.z + clX * rs + clZ * rc;
      }
    }
  }

  // 2. Update idealPosition & idealRotation mengikuti KURSI
  const chair = items.find(i => i.type === 'chair');
  if (chair) {
    const yaw = chair.rotation.y * Math.PI / 180;
    const c = Math.cos(yaw), s = Math.sin(yaw);

    for (const it of items) {
      if (it.type === 'chair') {
        // Ideal kursi adalah posisinya saat ini (agar tidak disuruh geser), tapi tinggi idealnya standar
        it.idealPosition = { x: it.position.x, y: IDEAL.chairSeat - it.scale.y / 2, z: it.position.z };
        it.idealRotation = { x: it.rotation.x, y: it.rotation.y, z: it.rotation.z };
        continue;
      }

      const offset = CHAIR_LOCAL[it.type];
      if (offset) {
        it.idealPosition.x = chair.position.x + offset.x * c - offset.z * s;
        it.idealPosition.z = chair.position.z + offset.x * s + offset.z * c;
        // Rotasi ideal = arah kursi, dikurangi 180 (karena 180 adalah menghadap depan layar)
        it.idealRotation.y = chair.rotation.y - 180;

        // Hitung Y ideal
        if (it.type === 'desk') {
          it.idealPosition.y = IDEAL.deskSurface - it.scale.y / 2;
        } else if (it.type === 'monitor') {
          it.idealPosition.y = IDEAL.chairSeat + IDEAL.monitorEyeOffset;
        } else if (it.type === 'keyboard' || it.type === 'mouse') {
          it.idealPosition.y = IDEAL.deskSurface + it.scale.y / 2;
        } else if (it.type === 'lamp') {
          it.idealPosition.y = IDEAL.deskSurface + it.scale.y / 2 + 0.01;
        }
      }
    }
  }
  return items;
}
