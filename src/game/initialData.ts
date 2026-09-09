import { FurnitureItem, GameSettings, GameState } from './types';

/* Semua satuan = meter. Tata letak sengaja RAPI & lurus,
   tetapi TINGGI-nya belum ergonomis supaya pemain belajar mengatur. */
export const initialFurniture: FurnitureItem[] = [
  {
    id: 'desk',
    name: 'Meja Kerja',
    type: 'desk',
    position: { x: 0, y: 0.61, z: -1.50 },   // permukaan 63,5 cm → terlalu rendah
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1.55, y: 0.05, z: 0.82 },
    color: '#282A36',
    selected: false,
    // X dan Z ideal = posisi awal (meja fixed horizontal = baseline sempurna)
    // Y ideal tetap 73 cm (penilaian tinggi tidak berubah)
    idealPosition: { x: 0, y: 0.705, z: -1.50 },
    idealRotation: { x: 0, y: 0, z: 0 },
    tolerancePos: 0.05, toleranceRot: 10,
    heightAdjustable: true, minHeight: 0.58, maxHeight: 0.86,
    ergoTip: 'Permukaan meja sejajar siku saat duduk (±73 cm).',
    ergoUnit: 'cm',
  },
  {
    id: 'chair',
    name: 'Kursi Kerja',
    type: 'chair',
    position: { x: 0, y: 0.34, z: -0.78 },   // pusat geometri 34 cm → permukaan dudukan 37 cm (terlalu rendah)
    rotation: { x: 0, y: 180, z: 0 },          // menghadap meja (sandaran ke arah pemain)
    scale: { x: 0.48, y: 0.06, z: 0.48 },
    color: '#2B2D42',
    selected: false,
    idealPosition: { x: 0, y: 0.42, z: -0.78 },  // pusat 42 cm → permukaan dudukan 45 cm (ergonomis)
    idealRotation: { x: 0, y: 180, z: 0 },
    tolerancePos: 0.05, toleranceRot: 10,
    heightAdjustable: true, minHeight: 0.29, maxHeight: 0.55,  // pusat = permukaan - 0.03
    ergoTip: 'Kaki menapak rata, lutut 90°, paha horizontal (±45 cm).',
    ergoUnit: 'cm',
  },
  {
    id: 'monitor',
    name: 'Monitor',
    type: 'monitor',
    position: { x: 0, y: 1.22, z: -1.72 },   // terlalu tinggi (tumpukan buku) & terlalu jauh
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 0.58, y: 0.35, z: 0.03 },
    color: '#1B1B1F',
    selected: false,
    // idealZ = -1.72 sesuai baseline workstation referensi (monitor di atas buku)
    idealPosition: { x: 0, y: 1.07, z: -1.72 },
    idealRotation: { x: 0, y: 0, z: 0 },
    tolerancePos: 0.06, toleranceRot: 8,
    heightAdjustable: true, minHeight: 0.85, maxHeight: 1.40,
    ergoTip: 'Tepi atas layar sejajar mata, jarak 50–70 cm.',
    ergoUnit: 'cm',
  },
  {
    id: 'keyboard',
    name: 'Keyboard',
    type: 'keyboard',
    position: { x: 0, y: 0.645, z: -1.40 },  // terlalu jauh dari tepi meja
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 0.44, y: 0.018, z: 0.15 },
    color: '#26262B',
    selected: false,
    idealPosition: { x: 0, y: 0.74, z: -1.005 },
    idealRotation: { x: 0, y: 0, z: 0 },
    tolerancePos: 0.05, toleranceRot: 5,
    heightAdjustable: false, minHeight: 0.6, maxHeight: 0.9,
    ergoTip: 'Pergelangan tangan lurus, siku 90°, 10–15 cm dari tepi.',
    ergoUnit: 'cm',
  },
  {
    id: 'mouse',
    name: 'Mouse',
    type: 'mouse',
    position: { x: 0.55, y: 0.648, z: -1.40 }, // terlalu jauh dari keyboard
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 0.062, y: 0.028, z: 0.105 },
    color: '#1F1F24',
    selected: false,
    idealPosition: { x: 0.28, y: 0.74, z: -1.005 },
    idealRotation: { x: 0, y: 0, z: 0 },
    tolerancePos: 0.06, toleranceRot: 15,
    heightAdjustable: false, minHeight: 0.6, maxHeight: 0.9,
    ergoTip: 'Mouse tepat di samping keyboard, bahu tetap rileks.',
    ergoUnit: 'cm',
  },
  {
    id: 'lamp',
    name: 'Lampu Meja',
    type: 'lamp',
    position: { x: 0.10, y: 0.79, z: -1.72 }, // masih di tengah → silau
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 0.05, y: 0.30, z: 0.05 },
    color: '#E9B949',
    selected: false,
    idealPosition: { x: 0.55, y: 0.89, z: -1.42 }, // kanan pemain (saat kursi 180°, +X = kanan pemain)
    idealRotation: { x: 0, y: 0, z: 0 },
    tolerancePos: 0.12, toleranceRot: 30,
    heightAdjustable: false, minHeight: 0.6, maxHeight: 1.1,
    ergoTip: 'Cahaya dari samping kanan, bukan dari depan/belakang layar.',
    ergoUnit: 'cm',
  },
];

export const defaultSettings: GameSettings = {
  mouseSensitivity: 50,
  moveSpeed: 50,
  volume: 70,
  darkMode: false,
  graphicsQuality: 'high',
  device: 'desktop',
  userHeightCm: 170,
};

export const initialGameState: GameState = {
  phase: 'menu',
  isSitting: false,
  selectedObject: null,
  interactionMode: false,
  showSettings: false,
  showHelp: false,
  score: null,
  settings: defaultSettings,
  liveScore: 0,
  showGuide: true,
};
