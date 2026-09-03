import { useState, useCallback, useEffect, useRef } from 'react';
import { GameState, FurnitureItem, GameSettings, ErgonomicScore } from './game/types';
import { initialFurniture, initialGameState } from './game/initialData';
import {
  calculateErgonomicScore, getItemScore, getMetric, getSteps,
  normalizeDeskItems, ErgoStep, deskSurfaceY,
} from './game/ergonomics';
import { createRenderer, RenderWorld, raycastPlane } from './game/renderer';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const deepCopy = <T,>(o: T): T => JSON.parse(JSON.stringify(o));
const ICON: Record<string, string> = { desk: '🪵', chair: '🪑', monitor: '🖥️', keyboard: '⌨️', mouse: '🖱️', lamp: '💡' };

export default function App() {
  const [gs, setGs] = useState<GameState>(initialGameState);
  const [furniture, setFurniture] = useState<FurnitureItem[]>(() => normalizeDeskItems(deepCopy(initialFurniture)));

  const start = useCallback(() => {
    setFurniture(normalizeDeskItems(deepCopy(initialFurniture)));
    setGs(p => ({ ...p, phase: 'tutorial', score: null }));
  }, []);
  const play = useCallback(() => setGs(p => ({ ...p, phase: 'playing' })), []);
  const evaluate = useCallback(() => setGs(p => ({ ...p, phase: 'results', score: calculateErgonomicScore(furniture) })), [furniture]);
  const menu = useCallback(() => setGs(p => ({ ...p, phase: 'menu', score: null })), []);
  const upd = useCallback((s: Partial<GameSettings>) => setGs(p => ({ ...p, settings: { ...p.settings, ...s } })), []);

  if (gs.phase === 'menu') return <Menu onStart={start} settings={gs.settings} upd={upd} />;
  if (gs.phase === 'tutorial') return <Tutorial onDone={play} />;
  if (gs.phase === 'results') return <Results score={gs.score!} onMenu={menu} onRetry={start} />;
  return <Game furniture={furniture} setFurniture={setFurniture} gs={gs} setGs={setGs} onEvaluate={evaluate} onExit={menu} />;
}

/* ═══════════════════════ MENU ═══════════════════════ */
function Menu({ onStart, settings, upd }: { onStart: () => void; settings: GameSettings; upd: (s: Partial<GameSettings>) => void }) {
  const [modal, setModal] = useState<null | 'set' | 'about'>(null);
  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden" style={{ background: 'radial-gradient(ellipse at 50% 0%, #2d2a5e 0%, #14122b 55%, #0a0918 100%)' }}>
      <div className="absolute inset-0 pointer-events-none opacity-60">
        {Array.from({ length: 26 }).map((_, i) => (
          <span key={i} className="absolute rounded-full animate-pulse" style={{
            width: 3 + (i % 4) * 2, height: 3 + (i % 4) * 2, left: `${(i * 37) % 100}%`, top: `${(i * 61) % 100}%`,
            background: `hsl(${210 + (i % 5) * 14}, 85%, 72%)`, animationDelay: `${i * 0.2}s`, animationDuration: `${2 + (i % 4)}s`,
          }} />
        ))}
      </div>
      <div className="relative z-10 text-center px-6">
        <div className="inline-flex items-center justify-center w-24 h-24 rounded-[28px] mb-6 text-5xl"
          style={{ background: 'linear-gradient(140deg,#6366f1,#a855f7)', boxShadow: '0 24px 70px -12px rgba(99,102,241,.7)' }}>🪑</div>
        <h1 className="text-6xl font-black text-white tracking-tight mb-2">
          Ergo<span style={{ background: 'linear-gradient(90deg,#818cf8,#f0abfc)', WebkitBackgroundClip: 'text', color: 'transparent' }}>Sim</span>
        </h1>
        <p className="text-indigo-200 text-lg font-semibold mb-1">Simulasi Ergonomi Ruang Kerja 3D</p>
        <p className="text-indigo-300/60 text-sm max-w-md mx-auto mb-9">Ikuti 6 langkah menata meja kerja yang sehat — atur tinggi kursi, meja, monitor, keyboard, dan pencahayaan.</p>
        <div className="flex flex-col items-center gap-3">
          <button onClick={onStart} className="w-72 py-4 rounded-2xl text-white font-bold text-lg hover:scale-[1.03] active:scale-95 transition"
            style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 14px 40px -10px rgba(99,102,241,.8)' }}>▶  Mulai Simulasi</button>
          
          <div className="flex bg-slate-800/50 rounded-xl p-1 w-72 border border-slate-700/50">
            <button onClick={() => upd({ device: 'desktop' })} className={`flex-1 py-2 text-sm font-bold rounded-lg transition ${settings.device === 'desktop' ? 'bg-indigo-500/30 text-indigo-200 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}>💻 Desktop</button>
            <button onClick={() => upd({ device: 'mobile' })} className={`flex-1 py-2 text-sm font-bold rounded-lg transition ${settings.device === 'mobile' ? 'bg-indigo-500/30 text-indigo-200 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}>📱 Mobile</button>
          </div>

          <button onClick={() => setModal('set')} className="w-72 py-3 rounded-2xl text-indigo-200 font-semibold border border-indigo-400/25 hover:bg-indigo-500/15 transition">⚙️  Pengaturan</button>
          <button onClick={() => setModal('about')} className="w-72 py-3 rounded-2xl text-indigo-200 font-semibold border border-indigo-400/25 hover:bg-indigo-500/15 transition">📖  Panduan Ergonomi</button>
        </div>
        <p className="text-indigo-400/40 text-xs mt-10">© 2025 ErgoSim 3D — Media Pembelajaran Ergonomi</p>
      </div>
      {modal === 'set' && <Modal title="⚙️ Pengaturan" onClose={() => setModal(null)}><SettingsBody settings={settings} upd={upd} /></Modal>}
      {modal === 'about' && (
        <Modal title="📖 Panduan Ergonomi" onClose={() => setModal(null)}>
          <div className="space-y-3 text-sm text-slate-300">
            <p><b className="text-white">Ergonomi</b> menyesuaikan lingkungan kerja dengan tubuh manusia agar kerja terasa nyaman, efisien, sehat, dan aman.</p>
            {[
              ['🪑', 'Tinggi kursi 42–48 cm', 'Kaki menapak rata di lantai, lutut ±90°, paha sejajar lantai.'],
              ['🪵', 'Tinggi meja ±73 cm', 'Permukaan meja sejajar siku sehingga lengan membentuk 90°.'],
              ['🖥️', 'Monitor sejajar mata', 'Tepi atas layar setinggi mata, jarak 50–70 cm, tegak lurus pandangan.'],
              ['⌨️', 'Keyboard 10–15 cm dari tepi', 'Pergelangan tangan lurus, bukan menekuk ke atas.'],
              ['🖱️', 'Mouse menempel keyboard', 'Siku tetap dekat badan, bahu rileks tidak terangkat.'],
              ['💡', 'Cahaya dari samping', 'Menghindari pantulan silau pada layar yang melelahkan mata.'],
              ['⏱️', 'Aturan 20-20-20', 'Tiap 20 menit, lihat objek 20 kaki (6 m) selama 20 detik.'],
            ].map(([i, t, d]) => (
              <div key={t} className="flex gap-3 bg-slate-900/50 rounded-xl p-3">
                <span className="text-xl">{i}</span>
                <div><p className="text-white font-semibold text-[13px]">{t}</p><p className="text-slate-400 text-xs mt-0.5">{d}</p></div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ═══════════════════════ SHARED UI ═══════════════════════ */
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-slate-800/95 border border-slate-700 rounded-3xl p-6 w-full max-w-md max-h-[82vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-700 hover:bg-slate-600 text-slate-300">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SettingsBody({ settings, upd }: { settings: GameSettings; upd: (s: Partial<GameSettings>) => void }) {
  return (
    <div className="space-y-5">
      <Slider label="🖱️ Sensitivitas Mouse" v={settings.mouseSensitivity} on={v => upd({ mouseSensitivity: v })} />
      <Slider label="🏃 Kecepatan Gerak" v={settings.moveSpeed} on={v => upd({ moveSpeed: v })} />
      <Slider label="🔊 Volume" v={settings.volume} on={v => upd({ volume: v })} />
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-300 font-medium">🌙 Mode Gelap</span>
        <button onClick={() => upd({ darkMode: !settings.darkMode })} className={`w-14 h-7 rounded-full transition ${settings.darkMode ? 'bg-indigo-500' : 'bg-slate-600'}`}>
          <div className={`w-5 h-5 bg-white rounded-full transition-transform mt-1 ${settings.darkMode ? 'translate-x-8' : 'translate-x-1'}`} />
        </button>
      </div>
    </div>
  );
}

function Slider({ label, v, on }: { label: string; v: number; on: (n: number) => void }) {
  return (
    <div>
      <div className="flex justify-between mb-1.5"><span className="text-sm text-slate-300">{label}</span><span className="text-sm font-bold text-indigo-400">{v}%</span></div>
      <input type="range" min={10} max={100} value={v} onChange={e => on(+e.target.value)} className="w-full h-2 rounded-full appearance-none cursor-pointer"
        style={{ background: `linear-gradient(90deg,#6366f1 ${v}%,#334155 ${v}%)` }} />
    </div>
  );
}

/* ═══════════════════════ TUTORIAL ═══════════════════════ */
function Tutorial({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const isMobile = initialGameState.settings.device === 'mobile';
  const steps = [
    { ic: isMobile ? '📱' : '🎮', t: 'Jelajahi Ruangan', d: isMobile ? 'Gunakan joystick kiri untuk berjalan, geser layar kanan untuk melihat sekeliling.' : 'Gunakan W A S D untuk berjalan dan gerakkan mouse untuk melihat sekeliling.', s: isMobile ? 'Joystick muncul otomatis di pojok bawah kiri.' : 'Klik layar dahulu untuk mengunci kursor.' },
    { ic: '✋', t: 'Ambil & Pindahkan Objek', d: isMobile ? 'Tap objek (kursi, meja, dll) → objek bersinar hijau → geser layar → objek mengikuti pandangan → tap lagi untuk meletakkan.' : 'Arahkan crosshair ke objek → Klik kiri → objek bersinar hijau & mengikuti pandangan → Klik kiri lagi untuk meletakkan.', s: 'Skor ergonomi berubah otomatis setiap objek dilepas.' },
    { ic: '📊', t: 'Pantau Skor Real-Time', d: 'Panel kiri menampilkan 6 langkah ergonomi. Skor berubah langsung saat objek dipindah.', s: 'Kejar zona hijau di setiap langkah!' },
    { ic: '🎯', t: 'Kejar Zona Hijau', d: 'Setiap langkah punya penunjuk target. Klik langkah di panel kiri untuk memilih objek langsung.', s: 'Bayangan hijau di ruangan menunjukkan posisi ideal.' },
    { ic: '🪑', t: 'Duduk & Rasakan', d: isMobile ? 'Tekan tombol C di layar untuk duduk.' : 'Tekan C untuk duduk di kursi. Kamera turun ke tinggi mata Anda saat duduk.', s: 'Tekan C lagi untuk berdiri.' },
  ];
  const s = steps[i];
  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ background: 'radial-gradient(ellipse at 50% 0%, #2d2a5e 0%, #14122b 55%, #0a0918 100%)' }}>
      <div className="bg-slate-800/90 border border-slate-700 rounded-3xl p-8 w-full max-w-lg shadow-2xl text-center">
        <span className="text-6xl block mb-4">{s.ic}</span>
        <h2 className="text-2xl font-bold text-white mb-2">{s.t}</h2>
        <p className="text-slate-300 leading-relaxed">{s.d}</p>
        <p className="text-slate-400 text-sm italic mt-3">{s.s}</p>
        <div className="flex justify-center gap-2 my-6">
          {steps.map((_, k) => <span key={k} className={`h-2 rounded-full transition-all ${k === i ? 'w-8 bg-indigo-500' : 'w-2 bg-slate-600'}`} />)}
        </div>
        <div className="flex gap-3 justify-center">
          {i > 0 && <button onClick={() => setI(i - 1)} className="px-6 py-3 rounded-xl bg-slate-700 text-slate-200 font-medium hover:bg-slate-600">← Kembali</button>}
          {i < steps.length - 1
            ? <button onClick={() => setI(i + 1)} className="px-7 py-3 rounded-xl text-white font-bold hover:scale-105 transition" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>Lanjut →</button>
            : <button onClick={onDone} className="px-8 py-3 rounded-xl text-white font-bold hover:scale-105 transition" style={{ background: 'linear-gradient(135deg,#10b981,#22d3ee)' }}>Mulai! 🎮</button>}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════ RESULTS ═══════════════════════ */
function Results({ score, onMenu, onRetry }: { score: ErgonomicScore; onMenu: () => void; onRetry: () => void }) {
  const C = { green: '#22c55e', yellow: '#eab308', red: '#ef4444' }[score.color];
  const L = { green: 'Sangat Ergonomis! 🎉', yellow: 'Cukup Baik 👍', red: 'Perlu Perbaikan ⚠️' }[score.color];
  const rows: [string, number, string][] = [
    ['Tinggi kursi', score.details.chairHeight, '🪑'], ['Tinggi meja', score.details.deskHeight, '🪵'],
    ['Tinggi monitor', score.details.monitorHeight, '🖥️'], ['Jarak monitor', score.details.monitorDistance, '📏'],
    ['Arah monitor', score.details.monitorTilt, '🔄'], ['Posisi keyboard', score.details.keyboardPosition, '⌨️'],
    ['Posisi mouse', score.details.mousePosition, '🖱️'], ['Sudut siku', score.details.elbowAngle, '💪'],
  ];
  const bc = (v: number) => v >= 80 ? '#22c55e' : v >= 50 ? '#eab308' : '#ef4444';
  return (
    <div className="fixed inset-0 overflow-y-auto py-8 px-4" style={{ background: 'radial-gradient(ellipse at 50% 0%, #2d2a5e 0%, #14122b 55%, #0a0918 100%)' }}>
      <div className="max-w-lg mx-auto bg-slate-800/90 border border-slate-700 rounded-3xl p-7 shadow-2xl">
        <h2 className="text-xl font-bold text-white text-center mb-5">📊 Hasil Evaluasi Ergonomi</h2>
        <div className="flex flex-col items-center mb-6">
          <div className="relative w-36 h-36">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              <circle cx="50" cy="50" r="43" fill="none" stroke="#334155" strokeWidth="9" />
              <circle cx="50" cy="50" r="43" fill="none" stroke={C} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${score.total * 2.7} 270`} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-black" style={{ color: C }}>{score.total}%</span>
              <span className="text-[11px] text-slate-400">ergonomis</span>
            </div>
          </div>
          <span className="mt-3 px-4 py-1.5 rounded-full text-sm font-bold" style={{ background: C + '22', color: C }}>{L}</span>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 mb-6">
          {rows.map(([l, v, ic]) => (
            <div key={l}>
              <div className="flex justify-between text-[11px] mb-1"><span className="text-slate-300">{ic} {l}</span><span className="font-bold" style={{ color: bc(v) }}>{v}%</span></div>
              <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden"><div className="h-full rounded-full transition-all duration-700" style={{ width: `${v}%`, background: bc(v) }} /></div>
            </div>
          ))}
        </div>
        <div className="bg-slate-900/60 rounded-2xl p-4 mb-6">
          <h3 className="text-white font-bold text-sm mb-2.5">💡 Catatan & Saran</h3>
          <ul className="space-y-1.5">{score.feedback.map((f, i) => <li key={i} className="text-[13px] text-slate-300 flex gap-2"><span className="text-indigo-400">•</span>{f}</li>)}</ul>
        </div>
        <div className="flex gap-3 justify-center">
          <button onClick={onRetry} className="px-6 py-3 rounded-xl text-white font-bold hover:scale-105 transition" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>🔄 Ulangi</button>
          <button onClick={onMenu} className="px-6 py-3 rounded-xl bg-slate-700 text-slate-200 font-medium hover:bg-slate-600">🏠 Menu</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════ GAME ═══════════════════════ */
type Action = 'up' | 'down' | 'fwd' | 'back' | 'left' | 'right' | 'rotL' | 'rotR';

// ref untuk menyimpan state joystick mobile (tidak perlu re-render)
type JoyState = { active: boolean; id: number; x: number; y: number; dx: number; dy: number };
const mkJoy = (): JoyState => ({ active: false, id: -1, x: 0, y: 0, dx: 0, dy: 0 });

function Game({ furniture, setFurniture, gs, setGs, onEvaluate, onExit }: {
  furniture: FurnitureItem[]; setFurniture: React.Dispatch<React.SetStateAction<FurnitureItem[]>>;
  gs: GameState; setGs: React.Dispatch<React.SetStateAction<GameState>>;
  onEvaluate: () => void; onExit: () => void;
}) {
  const isMobile = gs.settings.device === 'mobile';
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const world = useRef<RenderWorld & { keys: Record<string, boolean>; locked: boolean; sitting: boolean; sitT: number; moveSpeed: number; sens: number; raf: number }>({
    camX: 0, camY: 1.65, camZ: 0.9, yaw: Math.PI, pitch: -0.12,
    furniture: deepCopy(furniture), selectedId: null, hoveredId: null, heldId: null,
    darkMode: gs.settings.darkMode, showGuide: true, interactionMode: false,
    keys: {}, locked: false, sitting: false, sitT: 0, moveSpeed: 50, sens: 50, raf: 0,
  });

  // Joystick refs (Mobile)
  const joyMove = useRef<JoyState>(mkJoy());
  const joyLook = useRef<JoyState>(mkJoy());
  const [joyMoveUi, setJoyMoveUi] = useState({ active: false, x: 0, y: 0, dx: 0, dy: 0 });
  const [joyLookUi, setJoyLookUi] = useState({ active: false, x: 0, y: 0, dx: 0, dy: 0 });

  // State untuk objek yang sedang "dipegang"
  const heldId = useRef<string | null>(null);
  const [heldName, setHeldName] = useState<string | null>(null);

  const [ui, setUi] = useState({ selId: null as string | null, adjust: false, sitting: false, hoverName: '', help: false, guide: true, toast: '' });
  const toastT = useRef<number>(0);

  useEffect(() => { world.current.furniture = deepCopy(furniture); }, [furniture]);
  useEffect(() => {
    world.current.darkMode = gs.settings.darkMode;
    world.current.moveSpeed = gs.settings.moveSpeed;
    world.current.sens = gs.settings.mouseSensitivity;
  }, [gs.settings]);

  const steps = getSteps(furniture);
  const score = calculateErgonomicScore(furniture);
  const activeStep = steps.find(s => !s.done) || steps[steps.length - 1];
  const selected = ui.selId ? furniture.find(f => f.id === ui.selId) ?? null : null;

  const toast = useCallback((m: string) => {
    setUi(p => ({ ...p, toast: m }));
    window.clearTimeout(toastT.current);
    toastT.current = window.setTimeout(() => setUi(p => ({ ...p, toast: '' })), 2600);
  }, []);

  /* ── Pilih objek (untuk panel kiri / keyboard shortcut) ── */
  const selectItem = useCallback((id: string | null, silent = false) => {
    world.current.selectedId = id;
    world.current.interactionMode = !!id;
    if (id) document.exitPointerLock();
    setUi(p => ({ ...p, selId: id, adjust: !!id }));
    if (id && !silent) {
      const it = world.current.furniture.find(f => f.id === id);
      if (it) toast(`${ICON[it.type]} ${it.name} siap diatur`);
    }
  }, [toast]);

  /* ── Commit posisi furniture yang dipegang ke React state → score update ── */
  const commitHeld = useCallback(() => {
    const id = heldId.current;
    if (!id) return;
    const worldFurniture = world.current.furniture;
    const updated = deepCopy(worldFurniture);
    heldId.current = null;
    world.current.heldId = null;
    setHeldName(null);
    setFurniture(updated);
  }, [setFurniture]);

  /* ── Ambil objek (Hold mechanic) ── */
  const pickupObject = useCallback((id: string) => {
    heldId.current = id;
    world.current.heldId = id;
    const it = world.current.furniture.find(f => f.id === id);
    if (it) {
      setHeldName(it.name);
      if (it.type === 'desk') {
        toast(`✋ ${ICON[it.type]} ${it.name} — Scroll untuk naik/turun. Posisi horizontal terkunci.`);
      } else {
        toast(`✋ ${ICON[it.type]} ${it.name} — Klik/tap lagi untuk meletakkan`);
      }
    }
  }, [toast]);

  /* ── Terapkan perubahan (tetap tersedia untuk AdjustCard & keyboard) ── */
  const applyRef = useRef<(a: Action) => void>(() => {});
  applyRef.current = (a: Action) => {
    const id = world.current.selectedId;
    if (!id) return;
    setFurniture(prev => {
      const next = deepCopy(prev);
      const it = next.find(f => f.id === id);
      if (!it) return prev;
      const H = 0.01, M = 0.02, R = 5;
      const before = it.position.y;
      switch (a) {
        case 'up': it.position.y = clamp(it.position.y + H, it.minHeight, it.maxHeight); break;
        case 'down': it.position.y = clamp(it.position.y - H, it.minHeight, it.maxHeight); break;
        // Meja tidak bisa dipindah horizontal
        case 'fwd':  if (it.type !== 'desk') it.position.z -= M; break;
        case 'back': if (it.type !== 'desk') it.position.z += M; break;
        case 'left': if (it.type !== 'desk') it.position.x -= M; break;
        case 'right':if (it.type !== 'desk') it.position.x += M; break;
        case 'rotL': it.rotation.y -= R; break;
        case 'rotR': it.rotation.y += R; break;
      }
      if (it.type !== 'desk') {
        it.position.x = clamp(it.position.x, -2.1, 2.1);
        it.position.z = clamp(it.position.z, -1.90, 2.40);
      }
      if (it.type === 'desk' && it.position.y !== before) {
        const d = it.position.y - before;
        next.forEach(o => { if (o.type === 'monitor') o.position.y = clamp(o.position.y + d, o.minHeight, o.maxHeight); });
      }
      normalizeDeskItems(next);
      world.current.furniture = deepCopy(next);
      return next;
    });
  };



  /* ── keyboard handlers (desktop) & game loop (shared) ── */
  const onKey = useCallback((e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    world.current.keys[k] = true;
    const w = world.current;

    if (k === 'c') {
      w.sitting = !w.sitting;
      setUi(p => ({ ...p, sitting: w.sitting }));
      toast(w.sitting ? '🪑 Duduk — arahkan pandangan ke monitor, apakah sejajar mata?' : '🧍 Berdiri');
      if (w.sitting) { w.yaw = Math.PI; w.pitch = 0; }
    }
    if (k === 'g') { w.showGuide = !w.showGuide; setUi(p => ({ ...p, guide: w.showGuide })); }
    if (k === 'h') setUi(p => ({ ...p, help: !p.help }));
    if (k === 'escape') {
      if (heldId.current) commitHeld();
      else if (w.selectedId) selectItem(null);
    }
    if (k === 'f') {
      if (heldId.current) { commitHeld(); }
      else if (w.hoveredId && !heldId.current) pickupObject(w.hoveredId);
    }

    if (w.selectedId) {
      const map: Record<string, Action> = {
        arrowup: 'fwd', arrowdown: 'back', arrowleft: 'left', arrowright: 'right',
        r: 'up', t: 'down', q: 'rotL', e: 'rotR',
      };
      const a = map[k];
      if (a) { e.preventDefault(); applyRef.current(a); }
    } else if (heldId.current) {
      const it = w.furniture.find(f => f.id === heldId.current);
      if (it) {
        if (k === 'r') it.position.y = clamp(it.position.y + 0.05, it.minHeight, it.maxHeight);
        if (k === 't') it.position.y = clamp(it.position.y - 0.05, it.minHeight, it.maxHeight);
        if (k === 'q') it.rotation.y = (it.rotation.y - 5 + 360) % 360;
        if (k === 'e') it.rotation.y = (it.rotation.y + 5) % 360;
      }
    }
  }, [toast, selectItem, commitHeld, pickupObject]);

  const onKeyUp = useCallback((e: KeyboardEvent) => { world.current.keys[e.key.toLowerCase()] = false; }, []);

  /* ── Main render loop (always runs) ── */
  useEffect(() => {
    const canvas = canvasRef.current!;
    let renderer: ReturnType<typeof createRenderer>;
    try { renderer = createRenderer(canvas, () => world.current); }
    catch { alert('WebGL tidak didukung browser ini.'); return; }

    renderer.resize();
    const onResize = () => renderer.resize();
    window.addEventListener('resize', onResize);
    document.addEventListener('keydown', onKey);
    document.addEventListener('keyup', onKeyUp);

    // Desktop pointer lock
    let cleanupDesktop: (() => void) | null = null;
    if (!isMobile) {
      const onCanvasClick = () => {
        const w = world.current;
        if (heldId.current) { commitHeld(); return; }
        if (w.hoveredId && w.locked) { pickupObject(w.hoveredId); return; }
        if (!w.locked) canvas.requestPointerLock();
      };
      const onLockChange = () => { world.current.locked = document.pointerLockElement === canvas; };
      const onMouse = (e: MouseEvent) => {
        if (!world.current.locked) return;
        const s = world.current.sens / 6000;
        world.current.yaw -= e.movementX * s;
        world.current.pitch = clamp(world.current.pitch - e.movementY * s, -1.25, 1.25);
      };
      const onWheel = (e: WheelEvent) => {
        const id = heldId.current;
        if (!id) return;
        e.preventDefault();
        const it = world.current.furniture.find(f => f.id === id);
        if (!it) return;
        it.position.y = clamp(it.position.y - e.deltaY * 0.0005, it.minHeight, it.maxHeight);
      };
      canvas.addEventListener('click', onCanvasClick);
      document.addEventListener('pointerlockchange', onLockChange);
      document.addEventListener('mousemove', onMouse);
      canvas.addEventListener('wheel', onWheel, { passive: false });
      cleanupDesktop = () => {
        canvas.removeEventListener('click', onCanvasClick);
        document.removeEventListener('pointerlockchange', onLockChange);
        document.removeEventListener('mousemove', onMouse);
        canvas.removeEventListener('wheel', onWheel);
      };
    }

    // Mobile touch
    let cleanupMobile: (() => void) | null = null;
    if (isMobile) {
      const JOYSTICK_R = 60;
      const onTouchStart = (e: TouchEvent) => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          const midX = Math.abs(t.clientX - window.innerWidth / 2);
          const midY = Math.abs(t.clientY - window.innerHeight / 2);
          if (midX < 70 && midY < 70) {
            if (heldId.current) { commitHeld(); return; }
            if (world.current.hoveredId) { pickupObject(world.current.hoveredId); return; }
          }
          const isLeft = t.clientX < window.innerWidth / 2;
          if (isLeft && !joyMove.current.active) {
            joyMove.current = { active: true, id: t.identifier, x: t.clientX, y: t.clientY, dx: 0, dy: 0 };
            setJoyMoveUi({ active: true, x: t.clientX, y: t.clientY, dx: 0, dy: 0 });
          } else if (!isLeft && !joyLook.current.active) {
            joyLook.current = { active: true, id: t.identifier, x: t.clientX, y: t.clientY, dx: 0, dy: 0 };
            setJoyLookUi({ active: true, x: t.clientX, y: t.clientY, dx: 0, dy: 0 });
          }
        }
      };
      const onTouchMove = (e: TouchEvent) => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (joyMove.current.active && t.identifier === joyMove.current.id) {
            const rawDx = t.clientX - joyMove.current.x, rawDy = t.clientY - joyMove.current.y;
            const len = Math.hypot(rawDx, rawDy);
            const capped = Math.min(len, JOYSTICK_R);
            joyMove.current.dx = (rawDx / (len || 1)) * capped;
            joyMove.current.dy = (rawDy / (len || 1)) * capped;
            setJoyMoveUi(p => ({ ...p, dx: joyMove.current.dx, dy: joyMove.current.dy }));
          }
          if (joyLook.current.active && t.identifier === joyLook.current.id) {
            const rawDx = t.clientX - joyLook.current.x, rawDy = t.clientY - joyLook.current.y;
            const len = Math.hypot(rawDx, rawDy);
            const capped = Math.min(len, JOYSTICK_R);
            joyLook.current.dx = (rawDx / (len || 1)) * capped;
            joyLook.current.dy = (rawDy / (len || 1)) * capped;
            setJoyLookUi(p => ({ ...p, dx: joyLook.current.dx, dy: joyLook.current.dy }));
            // Apply look immediately
            world.current.yaw -= (rawDx - joyLook.current.dx) * 0.003;
            world.current.pitch = clamp(world.current.pitch - (rawDy - joyLook.current.dy) * 0.003, -1.25, 1.25);
          }
        }
      };
      const onTouchEnd = (e: TouchEvent) => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (joyMove.current.id === t.identifier) { joyMove.current = mkJoy(); setJoyMoveUi({ active: false, x: 0, y: 0, dx: 0, dy: 0 }); }
          if (joyLook.current.id === t.identifier) { joyLook.current = mkJoy(); setJoyLookUi({ active: false, x: 0, y: 0, dx: 0, dy: 0 }); }
        }
      };
      canvas.addEventListener('touchstart', onTouchStart, { passive: false });
      canvas.addEventListener('touchmove', onTouchMove, { passive: false });
      canvas.addEventListener('touchend', onTouchEnd, { passive: false });
      canvas.addEventListener('touchcancel', onTouchEnd, { passive: false });
      cleanupMobile = () => {
        canvas.removeEventListener('touchstart', onTouchStart);
        canvas.removeEventListener('touchmove', onTouchMove);
        canvas.removeEventListener('touchend', onTouchEnd);
        canvas.removeEventListener('touchcancel', onTouchEnd);
      };
    }

    let last = 0, hoverName = '', lastLiveUpdate = 0;
    let initDesk = false, prevDesk = { x: 0, y: 0, z: 0 };
    const loop = (t: number) => {
      const dt = Math.min((t - last) / 1000, 0.05); last = t;
      const w = world.current;

      // ── Gerak Desktop ──
      if (!isMobile && w.locked && !w.sitting) {
        const sp = (w.moveSpeed / 50) * 2.4 * dt;
        const sy = Math.sin(w.yaw), cy = Math.cos(w.yaw);
        if (w.keys['w'] || w.keys['arrowup']) { w.camX += sy * sp; w.camZ += cy * sp; }
        if (w.keys['s'] || w.keys['arrowdown']) { w.camX -= sy * sp; w.camZ -= cy * sp; }
        if (w.keys['a']) { w.camX += cy * sp; w.camZ -= sy * sp; }
        if (w.keys['d']) { w.camX -= cy * sp; w.camZ += sy * sp; }
        // Batas dinding ruangan: X ±2.34, Z dari -1.94 (belakang) s/d +2.62 (depan)
        w.camX = clamp(w.camX, -2.34, 2.34); w.camZ = clamp(w.camZ, -1.94, 2.62);
      }

      // ── Gerak Mobile (joystick) ──
      if (isMobile && !w.sitting) {
        const jm = joyMove.current;
        const jl = joyLook.current;
        if (jm.active) {
          const sp = (w.moveSpeed / 50) * 2.4 * dt;
          const nx = jm.dx / 60, ny = jm.dy / 60;
          const sy = Math.sin(w.yaw), cy = Math.cos(w.yaw);
          w.camX += (sy * ny + cy * (-nx)) * sp;
          w.camZ += (cy * ny + sy * nx) * sp;
          // Batas dinding ruangan (mobile): X ±2.34, Z dari -1.94 s/d +2.62
          w.camX = clamp(w.camX, -2.34, 2.34); w.camZ = clamp(w.camZ, -1.94, 2.62);
        }
        if (jl.active) {
          const sens = w.sens / 6000 * 60;
          w.yaw -= jl.dx * sens * dt;
          w.pitch = clamp(w.pitch - jl.dy * sens * dt, -1.25, 1.25);
        }
      }

      // ── Duduk ──
      const chair = w.furniture.find(f => f.type === 'chair')!;
      w.sitT += ((w.sitting ? 1 : 0) - w.sitT) * Math.min(1, dt * 6);
      const tX = chair.position.x, tZ = chair.position.z + 0.04;
      const chairSeatSurf = chair.position.y + chair.scale.y / 2;
      const eyeSit = chairSeatSurf + 0.72;
      w.camY += ((w.sitting ? eyeSit : 1.65) - w.camY) * Math.min(1, dt * 6);
      if (w.sitT > 0.01) {
        w.camX += (tX - w.camX) * Math.min(1, dt * 5 * w.sitT);
        w.camZ += (tZ - w.camZ) * Math.min(1, dt * 5 * w.sitT);
      }

      // ── Enforce Desk Bounds & Hierarchy ──
      const desk = w.furniture.find(f => f.type === 'desk');
      if (desk) {
        if (!initDesk) {
          prevDesk = { x: desk.position.x, y: desk.position.y, z: desk.position.z };
          initDesk = true;
        }
        const deskDx = desk.position.x - prevDesk.x;
        const deskDy = desk.position.y - prevDesk.y;
        const deskDz = desk.position.z - prevDesk.z;

        const deskY = deskSurfaceY(desk);
        const deskMinX = desk.position.x - desk.scale.x / 2;
        const deskMaxX = desk.position.x + desk.scale.x / 2;
        const deskMinZ = desk.position.z - desk.scale.z / 2;
        const deskMaxZ = desk.position.z + desk.scale.z / 2;

        w.furniture.forEach(it => {
          if (['monitor', 'keyboard', 'mouse', 'lamp'].includes(it.type)) {
            // Apply delta if desk moved and this item is NOT currently held
            if (it.id !== heldId.current && (deskDx !== 0 || deskDy !== 0 || deskDz !== 0)) {
              it.position.x += deskDx;
              it.position.y += deskDy;
              it.position.z += deskDz;
            }
            // Constrain to desk bounds (applies to all, even held items)
            const hw = it.scale.x / 2, hz = it.scale.z / 2;
            it.position.x = clamp(it.position.x, deskMinX + hw, deskMaxX - hw);
            it.position.z = clamp(it.position.z, deskMinZ + hz, deskMaxZ - hz);
            const targetMinY = deskY + it.scale.y / 2 + 0.005;
            if (it.position.y < targetMinY) it.position.y = targetMinY;
          }
        });
        prevDesk = { x: desk.position.x, y: desk.position.y, z: desk.position.z };
      }

      // ── Update posisi objek yang dipegang (raycast ke permukaan meja/lantai) ──
      if (heldId.current) {
        const it = w.furniture.find(f => f.id === heldId.current);
        if (it) {
          const cp = Math.cos(w.pitch);
          const dir: [number,number,number] = [Math.sin(w.yaw)*cp, Math.sin(w.pitch), Math.cos(w.yaw)*cp];
          const ori: [number,number,number] = [w.camX, w.camY, w.camZ];

          // Tentukan bidang target berdasarkan tipe objek
          const deskItem = w.furniture.find(f => f.type === 'desk');
          const deskY = deskItem ? deskSurfaceY(deskItem) : 0.735;
          const isOnDesk = ['monitor','keyboard','mouse','lamp'].includes(it.type);
          const targetY = isOnDesk ? deskY : (it.position.y); // lantai untuk kursi/meja

          const hit = raycastPlane(ori, dir, targetY);
          if (hit) {
            // Meja fixed horizontal: hanya izinkan update X/Z untuk bukan meja
            if (it.type !== 'desk') {
              it.position.x = clamp(hit[0], -2.1, 2.1);
              it.position.z = clamp(hit[2], -1.90, 2.40);
            }
            // Untuk meja: X/Z tidak berubah, hanya Y via scroll
          }
        }
        if (t - lastLiveUpdate > 100) {
          setFurniture(deepCopy(w.furniture));
          lastLiveUpdate = t;
        }
      }

      // ── Hover detection (hanya saat tidak ada yang dipegang) ──
      if (!heldId.current) {
        const id = renderer.pick();
        w.hoveredId = id;
        const n = id ? w.furniture.find(f => f.id === id)?.name ?? '' : '';
        if (n !== hoverName) { hoverName = n; setUi(p => ({ ...p, hoverName: n })); }
      } else {
        w.hoveredId = null;
        if (hoverName) { hoverName = ''; setUi(p => ({ ...p, hoverName: '' })); }
      }

      renderer.frame(t / 1000);
      w.raf = requestAnimationFrame(loop);
    };
    world.current.raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(world.current.raf);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('keyup', onKeyUp);
      cleanupDesktop?.();
      cleanupMobile?.();
    };
  }, [isMobile, onKey, onKeyUp, commitHeld, pickupObject]);

  const allDone = steps.every(s => s.done);
  const sc = score.total;
  const scColor = sc >= 80 ? '#22c55e' : sc >= 55 ? '#eab308' : '#ef4444';
  const JOYSTICK_R = 60;

  return (
    <div className="fixed inset-0 bg-black overflow-hidden select-none">
      <canvas ref={canvasRef} className="block w-full h-full" />

      {/* Crosshair */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="relative">
          <div className={`w-6 h-6 rounded-full border-2 transition-colors ${heldName ? 'border-green-400 shadow-[0_0_12px_rgba(74,222,128,0.8)]' : 'border-white/40'}`} />
          <div className="absolute inset-0 flex items-center justify-center"><div className={`w-1.5 h-1.5 rounded-full ${heldName ? 'bg-green-400' : 'bg-white/90'}`} /></div>
          {heldName && (
            <div className="absolute top-9 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] bg-green-700/90 text-white px-2.5 py-1 rounded-lg border border-green-400/40">
              ✋ {heldName} — klik/tap untuk lepas
            </div>
          )}
          {!heldName && ui.hoverName && (
            <div className="absolute top-9 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] bg-black/80 text-white px-2.5 py-1 rounded-lg border border-white/15">
              {ui.hoverName} · <span className="text-indigo-300">{isMobile ? 'Tap' : 'F / Klik'} ambil</span>
            </div>
          )}
        </div>
      </div>

      {/* ══ SKOR (kanan atas) ══ */}
      <div className="absolute top-4 right-4 flex items-start gap-2">
        <div className="bg-black/65 backdrop-blur-md rounded-2xl px-4 py-3 border border-white/10 flex items-center gap-3">
          <div className="relative w-11 h-11">
            <svg viewBox="0 0 40 40" className="w-full h-full -rotate-90">
              <circle cx="20" cy="20" r="16.5" fill="none" stroke="#334155" strokeWidth="4" />
              <circle cx="20" cy="20" r="16.5" fill="none" stroke={scColor} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${sc * 1.037} 103.7`} className="transition-all duration-300" />
            </svg>
            <span className="absolute inset-0 grid place-items-center text-[11px] font-black" style={{ color: scColor }}>{sc}</span>
          </div>
          <div>
            <p className="text-white text-[13px] font-bold leading-tight">Skor Ergonomi</p>
            <p className="text-[11px]" style={{ color: scColor }}>{sc >= 80 ? 'Sangat baik' : sc >= 55 ? 'Cukup' : 'Perlu perbaikan'}</p>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <IconBtn onClick={() => { document.exitPointerLock(); setUi(p => ({ ...p, help: true })); }} label="Bantuan">❓</IconBtn>
          <IconBtn onClick={() => { document.exitPointerLock(); setGs(p => ({ ...p, showSettings: true })); }} label="Pengaturan">⚙️</IconBtn>
          <IconBtn onClick={() => { document.exitPointerLock(); onExit(); }} label="Keluar" danger>✕</IconBtn>
        </div>
      </div>

      {/* ══ LANGKAH ERGONOMI (kiri) ══ */}
      <div className="absolute top-4 left-4 w-[260px]">
        <div className="bg-black/65 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-white/10 flex items-center justify-between">
            <h3 className="text-white text-[13px] font-bold">📋 Langkah Ergonomi</h3>
            <span className="text-[11px] text-slate-400">{steps.filter(s => s.done).length}/{steps.length}</span>
          </div>
          <div className="p-2 space-y-1">
            {steps.map((s, i) => <StepRow key={s.id} step={s} n={i + 1} active={s.id === activeStep.id} selected={ui.selId === s.itemId} onClick={() => selectItem(s.itemId)} />)}
          </div>
          {allDone && (
            <button onClick={onEvaluate} className="w-full py-3 text-white font-bold text-sm" style={{ background: 'linear-gradient(135deg,#10b981,#059669)' }}>
              ✅ Semua selesai — Lihat Hasil
            </button>
          )}
        </div>
        {!allDone && (
          <button onClick={onEvaluate} className="mt-2 w-full py-2.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/15 text-white text-[13px] font-semibold hover:bg-white/20 transition">
            📊 Evaluasi Sekarang
          </button>
        )}
      </div>

      {/* ══ KARTU PENGATURAN (bawah tengah) — untuk height/rotate saja ══ */}
      {selected && !heldName && <AdjustCard item={selected} all={furniture} onAct={a => applyRef.current(a)} onClose={() => selectItem(null)} guide={ui.guide}
        onToggleGuide={() => { world.current.showGuide = !world.current.showGuide; setUi(p => ({ ...p, guide: world.current.showGuide })); }} />}

      {/* ══ HELD OBJECT CONTROLS (Tengah Bawah) ══ */}
      {heldName && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-black/60 backdrop-blur-md px-5 py-3 rounded-2xl border border-green-500/30">
          <div className="flex flex-col items-center gap-1.5">
             <span className="text-[10px] text-green-400 font-bold tracking-wider">TINGGI (R/T)</span>
             <div className="flex gap-2">
               <Hold onAct={() => { const w=world.current; if(w.heldId){ const it=w.furniture.find(f=>f.id===w.heldId); if(it) it.position.y = clamp(it.position.y+0.05, it.minHeight, it.maxHeight); }}}>▲</Hold>
               <Hold onAct={() => { const w=world.current; if(w.heldId){ const it=w.furniture.find(f=>f.id===w.heldId); if(it) it.position.y = clamp(it.position.y-0.05, it.minHeight, it.maxHeight); }}}>▼</Hold>
             </div>
          </div>
          <div className="w-px h-10 bg-white/20" />
          <div className="flex flex-col items-center gap-1.5">
             <span className="text-[10px] text-green-400 font-bold tracking-wider">PUTAR (Q/E)</span>
             <div className="flex gap-2">
               <Hold onAct={() => { const w=world.current; if(w.heldId){ const it=w.furniture.find(f=>f.id===w.heldId); if(it) it.rotation.y = (it.rotation.y - 5 + 360)%360; }}}>⟲</Hold>
               <Hold onAct={() => { const w=world.current; if(w.heldId){ const it=w.furniture.find(f=>f.id===w.heldId); if(it) it.rotation.y = (it.rotation.y + 5)%360; }}}>⟳</Hold>
             </div>
          </div>
        </div>
      )}

      {/* ══ Petunjuk bawah kiri ══ */}
      {!selected && !heldName && (
        <div className="absolute bottom-4 left-4 bg-black/55 backdrop-blur-md rounded-xl px-4 py-3 border border-white/10 max-w-[270px]">
          <p className="text-white text-[12px] font-semibold mb-1">✋ Cara memindahkan objek</p>
          <p className="text-slate-400 text-[11px] leading-relaxed">
            {isMobile
              ? 'Arahkan crosshair ke objek → tap tengah layar → objek mengikuti pandangan → tap lagi untuk letakkan.'
              : 'Arahkan crosshair ke objek → klik kiri untuk ambil → objek mengikuti cursor → klik kiri lagi untuk letakkan. Scroll untuk naik/turun.'}
          </p>
        </div>
      )}

      {/* ══ Kontrol bawah kanan (Desktop) ══ */}
      {!isMobile && (
        <div className="absolute bottom-4 right-4 bg-black/45 backdrop-blur-sm rounded-xl px-3 py-2.5 text-[11px] text-slate-400 space-y-0.5 leading-relaxed">
          <p><K>W A S D</K> jalan · <K>Mouse</K> lihat</p>
          <p><K>Klik</K> ambil/letakkan · <K>Scroll</K> naik/turun</p>
          <p><K>C</K> duduk · <K>G</K> panduan · <K>H</K> bantuan</p>
          <p><K>F</K> angkat dilihat</p>
        </div>
      )}

      {/* ══ Virtual Joystick (Mobile) ══ */}
      {isMobile && (
        <>
          {/* Joystick Kiri - Gerak */}
          <div className="absolute bottom-8 left-8 pointer-events-none">
            <div className="relative w-32 h-32 rounded-full bg-white/10 border-2 border-white/25 backdrop-blur-sm">
              <div className="absolute inset-0 flex items-center justify-center text-[10px] text-white/30">MOVE</div>
              {joyMoveUi.active && (
                <div className="absolute w-12 h-12 rounded-full bg-indigo-400/80 border-2 border-indigo-200/60 shadow-lg"
                  style={{
                    left: `calc(50% + ${Math.min(joyMoveUi.dx, JOYSTICK_R)}px - 24px)`,
                    top: `calc(50% + ${Math.min(joyMoveUi.dy, JOYSTICK_R)}px - 24px)`,
                  }} />
              )}
              {!joyMoveUi.active && <div className="absolute inset-0 flex items-center justify-center"><div className="w-12 h-12 rounded-full bg-white/15 border border-white/20" /></div>}
            </div>
          </div>
          {/* Joystick Kanan - Lihat */}
          <div className="absolute bottom-8 right-8 pointer-events-none">
            <div className="relative w-32 h-32 rounded-full bg-white/10 border-2 border-white/25 backdrop-blur-sm">
              <div className="absolute inset-0 flex items-center justify-center text-[10px] text-white/30">LOOK</div>
              {joyLookUi.active && (
                <div className="absolute w-12 h-12 rounded-full bg-purple-400/80 border-2 border-purple-200/60 shadow-lg"
                  style={{
                    left: `calc(50% + ${Math.min(joyLookUi.dx, JOYSTICK_R)}px - 24px)`,
                    top: `calc(50% + ${Math.min(joyLookUi.dy, JOYSTICK_R)}px - 24px)`,
                  }} />
              )}
              {!joyLookUi.active && <div className="absolute inset-0 flex items-center justify-center"><div className="w-12 h-12 rounded-full bg-white/15 border border-white/20" /></div>}
            </div>
          </div>
          {/* Tombol Aksi Mobile */}
          <div className="absolute bottom-36 right-8 flex flex-col gap-2">
            <button
              onTouchStart={e => { e.preventDefault(); world.current.sitting = !world.current.sitting; setUi(p => ({ ...p, sitting: world.current.sitting })); }}
              className="w-12 h-12 rounded-full bg-amber-500/80 border border-amber-300/40 text-white text-lg grid place-items-center backdrop-blur-sm active:scale-90 transition"
            >🪑</button>
            <button
              onTouchStart={e => { e.preventDefault(); if (heldId.current) commitHeld(); else if (world.current.hoveredId) pickupObject(world.current.hoveredId); }}
              className={`w-12 h-12 rounded-full border text-white text-lg grid place-items-center backdrop-blur-sm active:scale-90 transition ${
                heldName ? 'bg-green-500/80 border-green-300/40' : 'bg-white/20 border-white/20'
              }`}
            >{heldName ? '📤' : '✋'}</button>
          </div>
        </>
      )}

      {/* ══ Status duduk ══ */}
      {ui.sitting && (
        <div className="absolute bottom-[112px] left-1/2 -translate-x-1/2 bg-amber-500/90 text-white text-[12px] font-semibold px-4 py-1.5 rounded-full backdrop-blur-sm">
          🪑 Mode duduk — tinggi mata mengikuti tinggi kursi · <b>C</b> berdiri
        </div>
      )}

      {/* ══ Toast ══ */}
      {ui.toast && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-indigo-600/90 backdrop-blur-md text-white text-[13px] font-medium px-5 py-2.5 rounded-2xl border border-indigo-400/30 shadow-xl">
          {ui.toast}
        </div>
      )}

      {ui.help && <Modal title="❓ Bantuan" onClose={() => setUi(p => ({ ...p, help: false }))}><HelpBody isMobile={isMobile} /></Modal>}
      {gs.showSettings && <Modal title="⚙️ Pengaturan" onClose={() => setGs(p => ({ ...p, showSettings: false }))}>
        <SettingsBody settings={gs.settings} upd={s => setGs(p => ({ ...p, settings: { ...p.settings, ...s } }))} />
      </Modal>}
    </div>
  );
}

const K = ({ children }: { children: React.ReactNode }) => <b className="text-white font-semibold">{children}</b>;

function IconBtn({ children, onClick, label, danger }: { children: React.ReactNode; onClick: () => void; label: string; danger?: boolean }) {
  return (
    <button onClick={onClick} title={label}
      className={`w-9 h-9 rounded-xl backdrop-blur-md border text-sm grid place-items-center transition ${danger ? 'bg-red-600/70 border-red-400/30 hover:bg-red-500' : 'bg-black/60 border-white/10 hover:bg-white/20'}`}>
      {children}
    </button>
  );
}

function StepRow({ step, n, active, selected, onClick }: { step: ErgoStep; n: number; active: boolean; selected: boolean; onClick: () => void }) {
  const col = step.done ? '#22c55e' : step.score >= 50 ? '#eab308' : '#ef4444';
  return (
    <button onClick={onClick}
      className={`w-full text-left rounded-xl px-2.5 py-2 transition flex items-start gap-2.5 ${selected ? 'bg-indigo-500/25 ring-1 ring-indigo-400/50' : active ? 'bg-white/10' : 'hover:bg-white/5'}`}>
      <span className="text-base leading-none mt-0.5">{step.done ? '✅' : step.icon}</span>
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-1.5">
          <span className={`text-[12px] font-semibold truncate ${step.done ? 'text-emerald-300' : 'text-white'}`}>{n}. {step.title}</span>
        </span>
        <span className="block mt-1 h-1 rounded-full bg-slate-700 overflow-hidden">
          <span className="block h-full rounded-full transition-all duration-500" style={{ width: `${step.score}%`, background: col }} />
        </span>
      </span>
      <span className="text-[10px] font-bold tabular-nums mt-0.5" style={{ color: col }}>{step.score}</span>
    </button>
  );
}

/* ══ Kartu pengaturan sederhana ══ */
function AdjustCard({ item, all, onAct, onClose, guide, onToggleGuide }: {
  item: FurnitureItem; all: FurnitureItem[]; onAct: (a: Action) => void; onClose: () => void; guide: boolean; onToggleGuide: () => void;
}) {
  const m = getMetric(item, all);
  const s = getItemScore(item, all);
  const col = s.status === 'good' ? '#22c55e' : s.status === 'warning' ? '#eab308' : '#ef4444';
  const pct = (v: number) => clamp(((v - m.barMin) / (m.barMax - m.barMin)) * 100, 0, 100);
  const zoneL = pct(m.target - m.tol), zoneW = pct(m.target + m.tol) - zoneL;
  const diff = m.target - m.current;

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[440px] max-w-[calc(100vw-2rem)]">
      <div className="bg-black/75 backdrop-blur-xl rounded-2xl border border-white/15 shadow-2xl overflow-hidden">
        {/* header */}
        <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-white/10">
          <span className="text-lg">{ICON[item.type]}</span>
          <span className="text-white font-bold text-sm flex-1">{item.name}</span>
          <button onClick={onToggleGuide} title="Tampilkan posisi ideal"
            className={`text-[10px] px-2 py-1 rounded-lg border transition ${guide ? 'bg-emerald-500/25 border-emerald-400/40 text-emerald-300' : 'bg-white/5 border-white/15 text-slate-400'}`}>
            👁 Panduan
          </button>
          <button onClick={onClose} className="w-6 h-6 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 text-xs grid place-items-center">✕</button>
        </div>

        {/* pengukuran */}
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-end justify-between mb-1.5">
            <span className="text-[11px] text-slate-400">{m.label}</span>
            <span className="text-[11px] text-slate-400">target <b className="text-emerald-400">{m.target.toFixed(0)} {m.unit}</b></span>
          </div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-3xl font-black tabular-nums" style={{ color: col }}>{m.current.toFixed(1)}</span>
            <span className="text-sm text-slate-400 font-medium">{m.unit}</span>
            {Math.abs(diff) > m.tol && (
              <span className="ml-auto text-[12px] font-bold" style={{ color: col }}>
                {diff > 0 ? '▲ kurang' : '▼ lebih'} {Math.abs(diff).toFixed(1)} {m.unit}
              </span>
            )}
            {Math.abs(diff) <= m.tol && <span className="ml-auto text-[12px] font-bold text-emerald-400">✓ sudah pas</span>}
          </div>

          {/* gauge */}
          <div className="relative h-3 rounded-full bg-slate-700/70 overflow-hidden">
            <div className="absolute inset-y-0 bg-emerald-500/40" style={{ left: `${zoneL}%`, width: `${zoneW}%` }} />
            <div className="absolute inset-y-0 w-0.5 bg-emerald-400" style={{ left: `${pct(m.target)}%` }} />
            <div className="absolute -top-0.5 h-4 w-1.5 rounded-full shadow-lg transition-all duration-150"
              style={{ left: `calc(${pct(m.current)}% - 3px)`, background: col }} />
          </div>
          <div className="flex justify-between text-[9px] text-slate-500 mt-1">
            <span>{m.barMin} {m.unit}</span><span className="text-emerald-500/80">zona ideal</span><span>{m.barMax} {m.unit}</span>
          </div>

          <p className="text-[12px] mt-2 leading-snug" style={{ color: col }}>💬 {s.hint}</p>
        </div>

        {/* kontrol */}
        <div className="flex items-stretch gap-2 px-4 pb-3 pt-1">
          {item.heightAdjustable && (
            <div className="flex flex-col gap-1">
              <span className="text-[9px] text-slate-500 text-center">TINGGI</span>
              <div className="flex gap-1">
                <Hold onAct={() => onAct('up')} big highlight={m.control === 'height'}>▲</Hold>
                <Hold onAct={() => onAct('down')} big highlight={m.control === 'height'}>▼</Hold>
              </div>
            </div>
          )}
          {item.type !== 'desk' ? (
            <div className="flex flex-col gap-1">
              <span className="text-[9px] text-slate-500 text-center">GESER</span>
              <div className="grid grid-cols-3 gap-0.5" style={{ width: 96 }}>
                <span /><Hold onAct={() => onAct('fwd')} highlight={m.control === 'move'}>↑</Hold><span />
                <Hold onAct={() => onAct('left')} highlight={m.control === 'move'}>←</Hold>
                <Hold onAct={() => onAct('back')} highlight={m.control === 'move'}>↓</Hold>
                <Hold onAct={() => onAct('right')} highlight={m.control === 'move'}>→</Hold>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1 justify-center items-center" style={{ width: 96 }}>
              <span className="text-[9px] text-slate-500 text-center">GESER</span>
              <div className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg bg-slate-700/40 border border-slate-600/30">
                <span className="text-[18px]">🔒</span>
                <span className="text-[9px] text-slate-500 text-center leading-tight">Posisi<br/>terkunci</span>
              </div>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <span className="text-[9px] text-slate-500 text-center">PUTAR</span>
            <div className="flex gap-1">
              <Hold onAct={() => onAct('rotL')} highlight={m.control === 'rotate'}>⟲</Hold>
              <Hold onAct={() => onAct('rotR')} highlight={m.control === 'rotate'}>⟳</Hold>
            </div>
          </div>
          <div className="flex-1 flex flex-col justify-center pl-1">
            <p className="text-[10px] text-slate-400 leading-snug">💡 {item.ergoTip}</p>
            <p className="text-[9px] text-slate-600 mt-1">Keyboard: R/T · ↑↓←→ · Q/E</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Tombol yang mengulang aksi saat ditahan */
function Hold({ children, onAct, big, highlight }: { children: React.ReactNode; onAct: () => void; big?: boolean; highlight?: boolean }) {
  const t = useRef<number>(0);
  const start = () => { onAct(); window.clearInterval(t.current); t.current = window.setInterval(onAct, 90); };
  const stop = () => window.clearInterval(t.current);
  useEffect(() => () => window.clearInterval(t.current), []);
  return (
    <button onMouseDown={start} onMouseUp={stop} onMouseLeave={stop} onTouchStart={start} onTouchEnd={stop}
      className={`${big ? 'w-11' : 'w-[30px]'} h-[30px] rounded-lg grid place-items-center text-[13px] font-bold transition active:scale-90 border
        ${highlight ? 'bg-indigo-500/90 border-indigo-300/40 text-white hover:bg-indigo-400' : 'bg-white/10 border-white/15 text-slate-200 hover:bg-white/20'}`}>
      {children}
    </button>
  );
}

function HelpBody({ isMobile = false }: { isMobile?: boolean }) {
  return (
    <div className="space-y-3 text-[13px] text-slate-300">
      <div className="bg-slate-900/60 rounded-xl p-3.5">
        <h3 className="text-white font-bold mb-2 text-sm">{isMobile ? '📱' : '🎮'} Kontrol</h3>
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
          {isMobile ? (<>
            <b className="text-indigo-300">Joystick Kiri</b><span>Berjalan</span>
            <b className="text-indigo-300">Joystick Kanan</b><span>Melihat sekeliling</span>
            <b className="text-indigo-300">Tap Tengah Layar</b><span>Ambil / Letakkan objek</span>
            <b className="text-indigo-300">Tombol ✋</b><span>Angkat objek yang dilihat</span>
            <b className="text-indigo-300">Tombol 🪑</b><span>Duduk / berdiri di kursi</span>
          </>) : (<>
            <b className="text-indigo-300">W A S D</b><span>Berjalan</span>
            <b className="text-indigo-300">Mouse</b><span>Melihat sekeliling</span>
            <b className="text-indigo-300">Klik Kiri</b><span>Ambil / Letakkan objek</span>
            <b className="text-indigo-300">Scroll Mouse</b><span>Naikkan / turunkan objek yang dipegang</span>
            <b className="text-indigo-300">C</b><span>Duduk / berdiri di kursi</span>
            <b className="text-indigo-300">F</b><span>Angkat objek yang dilihat crosshair</span>
            <b className="text-indigo-300">R / T</b><span>Naikkan / turunkan (di AdjustCard)</span>
            <b className="text-indigo-300">↑ ↓ ← →</b><span>Geser objek (di AdjustCard)</span>
            <b className="text-indigo-300">Q / E</b><span>Putar objek (di AdjustCard)</span>
            <b className="text-indigo-300">G</b><span>Bayangan posisi ideal</span>
            <b className="text-indigo-300">Esc</b><span>Letakkan objek / batal memilih</span>
          </>)}
        </div>
      </div>
      <div className="bg-slate-900/60 rounded-xl p-3.5">
        <h3 className="text-white font-bold mb-2 text-sm">🎯 Cara Bermain</h3>
        <ol className="list-decimal list-inside space-y-1 text-xs leading-relaxed">
          {isMobile ? (<>
            <li>Gunakan <b className="text-white">joystick kiri</b> untuk jalan & joystick kanan untuk lihat.</li>
            <li>Arahkan crosshair ke objek — tap tengah layar atau tombol ✋ untuk <b className="text-white">mengambil</b>.</li>
            <li>Objek bersinar <b className="text-emerald-400">hijau</b> dan mengikuti pandangan Anda.</li>
            <li>Tap lagi untuk <b className="text-white">meletakkan</b> — skor ergonomi langsung berubah.</li>
            <li>Tekan tombol 🪑 untuk duduk dan memeriksa posisi monitor.</li>
            <li>Selesaikan 6 langkah lalu klik <b className="text-white">Evaluasi</b>.</li>
          </>) : (<>
            <li>Klik layar untuk mengunci kursor, lalu <b className="text-white">WASD</b> untuk jalan.</li>
            <li>Arahkan crosshair ke objek — <b className="text-white">klik kiri</b> untuk mengambil.</li>
            <li>Objek bersinar <b className="text-emerald-400">hijau</b> dan mengikuti pandangan Anda.</li>
            <li>Klik kiri lagi untuk <b className="text-white">meletakkan</b> — skor ergonomi langsung berubah.</li>
            <li>Gunakan <b className="text-white">scroll</b> untuk naikkan/turunkan ketinggian objek yang dipegang.</li>
            <li>Tekan <b className="text-white">C</b> untuk duduk dan memeriksa hasilnya.</li>
            <li>Selesaikan 6 langkah lalu klik <b className="text-white">Lihat Hasil</b>.</li>
          </>)}
        </ol>
      </div>
      <div className="bg-emerald-900/25 border border-emerald-500/20 rounded-xl p-3.5">
        <h3 className="text-emerald-400 font-bold mb-2 text-sm">📐 Acuan Standar</h3>
        <ul className="space-y-1 text-xs">
          <li>🪑 Tinggi dudukan kursi <b className="text-white">±45 cm</b></li>
          <li>🪵 Tinggi permukaan meja <b className="text-white">±73 cm</b></li>
          <li>🖥️ Tengah layar <b className="text-white">±10 cm di bawah mata</b></li>
          <li>📏 Jarak monitor <b className="text-white">50–70 cm</b></li>
          <li>⌨️ Keyboard <b className="text-white">10–15 cm</b> dari tepi meja</li>
          <li>🖱️ Mouse <b className="text-white">±28 cm</b> dari tengah keyboard</li>
        </ul>
      </div>
    </div>
  );
}
