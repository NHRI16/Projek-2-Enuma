export interface FurnitureItem {
  id: string;
  name: string;
  type: 'desk' | 'chair' | 'monitor' | 'keyboard' | 'mouse' | 'lamp';
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  color: string;
  selected: boolean;
  idealPosition: { x: number; y: number; z: number };
  idealRotation: { x: number; y: number; z: number };
  tolerancePos: number;
  toleranceRot: number;
  heightAdjustable: boolean;
  minHeight: number;
  maxHeight: number;
  // Ergonomic descriptions
  ergoTip: string;
  ergoUnit: string; // e.g. "cm" 
}

export interface ErgonomicScore {
  total: number;
  details: {
    chairHeight: number;
    monitorDistance: number;
    monitorHeight: number;
    keyboardPosition: number;
    mousePosition: number;
    deskHeight: number;
    monitorTilt: number;
    elbowAngle: number;
  };
  feedback: string[];
  color: 'green' | 'yellow' | 'red';
}

export interface GameSettings {
  mouseSensitivity: number;
  moveSpeed: number;
  volume: number;
  darkMode: boolean;
  graphicsQuality: 'low' | 'medium' | 'high';
}

export interface GameState {
  phase: 'menu' | 'tutorial' | 'playing' | 'evaluating' | 'results';
  isSitting: boolean;
  selectedObject: string | null;
  interactionMode: boolean;
  showSettings: boolean;
  showHelp: boolean;
  score: ErgonomicScore | null;
  settings: GameSettings;
  liveScore: number;
  showGuide: boolean;
}
