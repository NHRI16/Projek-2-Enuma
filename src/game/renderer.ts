import { FurnitureItem } from './types';
import { deskSurfaceY } from './ergonomics';
import {
  DESK_NORM_OFFSET, DESK_WIDTH, DESK_DEPTH, DESK_HEIGHT, DESK_PARTS,
  MONITOR_NORM_OFFSET, MONITOR_WIDTH, MONITOR_HEIGHT, MONITOR_DEPTH, MONITOR_PARTS,
  KEYBOARD_NORM_OFFSET, KEYBOARD_WIDTH, KEYBOARD_HEIGHT, KEYBOARD_DEPTH, KEYBOARD_PARTS,
  MOUSE_NORM_OFFSET, MOUSE_WIDTH, MOUSE_HEIGHT, MOUSE_DEPTH, MOUSE_PARTS,
} from './deskModel';
import {
  CHAIR_NORM_OFFSET, CHAIR_WIDTH, CHAIR_HEIGHT, CHAIR_DEPTH, CHAIR_PARTS,
} from './chairModel';
import {
  LAMP_NORM_OFFSET, LAMP_WIDTH, LAMP_HEIGHT, LAMP_DEPTH, LAMP_PARTS,
} from './lampModel';

export interface RenderWorld {
  camX: number; camY: number; camZ: number; yaw: number; pitch: number;
  furniture: FurnitureItem[];
  selectedId: string | null;
  hoveredId: string | null;
  heldId: string | null;
  darkMode: boolean;
  showGuide: boolean;
  interactionMode: boolean;
}

type V3 = [number, number, number];
type MeshT = 'cube' | 'cyl';

/* ── Matrix helpers (column-major) ── */
const I = () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
const mul = (a: Float32Array, b: Float32Array) => {
  const r = new Float32Array(16);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++)
    r[j*4+i] = a[i]*b[j*4] + a[4+i]*b[j*4+1] + a[8+i]*b[j*4+2] + a[12+i]*b[j*4+3];
  return r;
};
const T = (x: number, y: number, z: number) => { const m = I(); m[12]=x; m[13]=y; m[14]=z; return m; };
const S = (x: number, y: number, z: number) => { const m = I(); m[0]=x; m[5]=y; m[10]=z; return m; };
const RY = (a: number) => { const c=Math.cos(a), s=Math.sin(a), m=I(); m[0]=c; m[2]=s; m[8]=-s; m[10]=c; return m; };
const persp = (fov: number, asp: number, n: number, f: number) => {
  const t = 1/Math.tan(fov/2), nf = 1/(n-f);
  return new Float32Array([t/asp,0,0,0, 0,t,0,0, 0,0,(f+n)*nf,-1, 0,0,2*f*n*nf,0]);
};
const lookDir = (ex: number, ey: number, ez: number, yaw: number, pitch: number) => {
  const cp = Math.cos(pitch);
  const fx = Math.sin(yaw)*cp, fy = Math.sin(pitch), fz = Math.cos(yaw)*cp;
  const fl = Math.hypot(fx, fy, fz) || 1;
  const fxn = fx/fl, fyn = fy/fl, fzn = fz/fl;
  let rx = fyn*0 - fzn*1, ry = 0, rz = fxn*1 - 0;
  const rl = Math.hypot(rx, ry, rz) || 1; rx/=rl; ry/=rl; rz/=rl;
  const ux = ry*fzn - rz*fyn, uy = rz*fxn - rx*fzn, uz = rx*fyn - ry*fxn;
  return new Float32Array([
    rx, ux, -fxn, 0,
    ry, uy, -fyn, 0,
    rz, uz, -fzn, 0,
    -(rx*ex+ry*ey+rz*ez), -(ux*ex+uy*ey+uz*ez), -(-fxn*ex + -fyn*ey + -fzn*ez), 1,
  ]);
};
const nMat = (m: Float32Array) => new Float32Array([m[0],m[1],m[2], m[4],m[5],m[6], m[8],m[9],m[10]]);
const hex = (h: string): V3 => { const v = parseInt(h.replace('#',''),16); return [(v>>16&255)/255,(v>>8&255)/255,(v&255)/255]; };
const shade = (c: V3, f: number): V3 => [Math.min(1,c[0]*f), Math.min(1,c[1]*f), Math.min(1,c[2]*f)];
/** Matriks rotasi dari tiga vektor basis ortogonal (kolom = arah lokal X, Y, Z di ruang dunia) */
const mkRot = (lx: V3, ly: V3, lz: V3): Float32Array => new Float32Array([
  lx[0], lx[1], lx[2], 0,
  ly[0], ly[1], ly[2], 0,
  lz[0], lz[1], lz[2], 0,
  0,     0,     0,     1,
]);

/** Transformasi bagian anak: induk(posisi+rotasi) → offset lokal → skala.
 *  Inilah kunci agar objek TIDAK terpotong / tercerai saat diputar. */
const part = (px: number, py: number, pz: number, rot: number,
              lx: number, ly: number, lz: number,
              sx: number, sy: number, sz: number) =>
  mul(mul(mul(T(px,py,pz), RY(rot)), T(lx,ly,lz)), S(sx,sy,sz));

/* ── Rotation-aware AABB untuk seleksi ── */
export function pickBox(it: FurnitureItem): { p: V3; h: V3 } {
  const r = (it.rotation.y||0) * Math.PI/180;
  const ac = Math.abs(Math.cos(r)), as = Math.abs(Math.sin(r));
  let sx = it.scale.x, sy = it.scale.y, sz = it.scale.z;
  let cy = it.position.y;
  switch (it.type) {
    case 'chair':    sy = 0.85; cy = it.position.y + 0.18; sx = it.scale.x + 0.12; sz = it.scale.z + 0.12; break;
    case 'monitor':  sy = it.scale.y + 0.28; cy = it.position.y - 0.08; sz = 0.18; break;
    case 'keyboard': sy = 0.07; sx += 0.06; sz += 0.06; break;
    case 'mouse':    sy = 0.07; sx = 0.13; sz = 0.15; break;
    case 'lamp':     sy = it.scale.y + 0.22; cy = it.position.y + 0.06; sx = 0.20; sz = 0.20; break;
    case 'desk':     sy = it.scale.y + 0.04; break;
  }
  return { p: [it.position.x, cy, it.position.z], h: [(ac*sx + as*sz)/2, sy/2, (as*sx + ac*sz)/2] };
}

export function rayHit(o: V3, d: V3, p: V3, h: V3): number | null {
  let tmin = -Infinity, tmax = Infinity;
  for (let i = 0; i < 3; i++) {
    const mn = p[i]-h[i], mx = p[i]+h[i];
    if (Math.abs(d[i]) < 1e-8) { if (o[i] < mn || o[i] > mx) return null; continue; }
    let t1 = (mn-o[i])/d[i], t2 = (mx-o[i])/d[i];
    if (t1 > t2) [t1,t2] = [t2,t1];
    tmin = Math.max(tmin,t1); tmax = Math.min(tmax,t2);
  }
  if (tmax < 0 || tmin > tmax) return null;
  return tmin > 0 ? tmin : tmax;
}

export function raycastPlane(o: V3, d: V3, yPlane: number): V3 | null {
  if (Math.abs(d[1]) < 1e-6) return null; // Arah paralel dengan bidang
  const t = (yPlane - o[1]) / d[1];
  if (t < 0) return null; // Titik potong ada di belakang kamera
  return [o[0] + d[0] * t, yPlane, o[2] + d[2] * t];
}

/* ═══════════════════════════════════════════════════════════ */
export function createRenderer(canvas: HTMLCanvasElement, getWorld: () => RenderWorld) {
  const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl')) as WebGLRenderingContext | null;
  if (!gl) throw new Error('WebGL tidak didukung');

  const vs = `attribute vec4 aPos; attribute vec3 aNorm;
    uniform mat4 uMVP, uModel; uniform mat3 uNMat;
    varying vec3 vN, vW;
    void main(){ gl_Position=uMVP*aPos; vN=uNMat*aNorm; vW=(uModel*aPos).xyz; }`;
  const fs = `precision mediump float;
    varying vec3 vN, vW;
    uniform vec3 uCol, uCam, uL1, uL2;
    uniform float uSel, uHov, uTime, uGhost, uEmis, uHeld;
    void main(){
      vec3 n = normalize(vN);
      vec3 v = normalize(uCam - vW);
      vec3 l1 = normalize(uL1 - vW);
      vec3 l2 = normalize(uL2 - vW);
      float d1 = max(dot(n,l1),0.0), d2 = max(dot(n,l2),0.0);
      float sp = pow(max(dot(n, normalize(l1+v)),0.0), 40.0);
      vec3 c = uCol*0.34 + uCol*d1*0.55 + uCol*d2*0.22 + vec3(0.22)*sp;
      c = mix(c, uCol, uEmis);
      if(uHeld > 0.5){ c = mix(c, vec3(0.1, 0.9, 0.3), 0.4 + sin(uTime*6.0)*0.15); }
      else if(uSel > 0.5){ c = mix(c, vec3(0.45,0.62,1.0), 0.28 + sin(uTime*4.0)*0.10); }
      else if(uHov > 0.5){ c = mix(c, vec3(0.55,0.85,1.0), 0.16); }
      if(uGhost > 0.5) c = vec3(0.25,0.95,0.55);
      gl_FragColor = vec4(c, uGhost > 0.5 ? 0.30 : (uHeld > 0.5 ? 0.85 : 1.0));
    }`;
  const sh = (t: number, src: string) => { const s = gl.createShader(t)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);

  const A = { pos: gl.getAttribLocation(prog,'aPos'), norm: gl.getAttribLocation(prog,'aNorm') };
  const U = {
    mvp: gl.getUniformLocation(prog,'uMVP'), model: gl.getUniformLocation(prog,'uModel'),
    nmat: gl.getUniformLocation(prog,'uNMat'), col: gl.getUniformLocation(prog,'uCol'),
    cam: gl.getUniformLocation(prog,'uCam'), l1: gl.getUniformLocation(prog,'uL1'),
    l2: gl.getUniformLocation(prog,'uL2'), sel: gl.getUniformLocation(prog,'uSel'),
    hov: gl.getUniformLocation(prog,'uHov'), time: gl.getUniformLocation(prog,'uTime'),
    ghost: gl.getUniformLocation(prog,'uGhost'), emis: gl.getUniformLocation(prog,'uEmis'),
    held: gl.getUniformLocation(prog,'uHeld'),
  };

  /* Geometry */
  const cubeV = new Float32Array([
    -.5,-.5,.5,0,0,1, .5,-.5,.5,0,0,1, .5,.5,.5,0,0,1, -.5,.5,.5,0,0,1,
    .5,-.5,-.5,0,0,-1, -.5,-.5,-.5,0,0,-1, -.5,.5,-.5,0,0,-1, .5,.5,-.5,0,0,-1,
    -.5,.5,.5,0,1,0, .5,.5,.5,0,1,0, .5,.5,-.5,0,1,0, -.5,.5,-.5,0,1,0,
    -.5,-.5,-.5,0,-1,0, .5,-.5,-.5,0,-1,0, .5,-.5,.5,0,-1,0, -.5,-.5,.5,0,-1,0,
    .5,-.5,.5,1,0,0, .5,-.5,-.5,1,0,0, .5,.5,-.5,1,0,0, .5,.5,.5,1,0,0,
    -.5,-.5,-.5,-1,0,0, -.5,-.5,.5,-1,0,0, -.5,.5,.5,-1,0,0, -.5,.5,-.5,-1,0,0,
  ]);
  const cubeI = new Uint16Array([0,1,2,0,2,3,4,5,6,4,6,7,8,9,10,8,10,11,12,13,14,12,14,15,16,17,18,16,18,19,20,21,22,20,22,23]);
  const mkBuf = (v: Float32Array, i: Uint16Array) => {
    const vb = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW);
    const ib = gl.createBuffer()!; gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, i, gl.STATIC_DRAW);
    return { vb, ib, n: i.length };
  };

  // ── Pre-baked GLTF 3D Model Buffers from low_poly_gaming_desk.gltf ──
  type PartBuf = {
    id: string;
    vb: WebGLBuffer;
    ib: WebGLBuffer;
    n: number;
    color: V3;
    emissive: number;
  };
  const makePartBufs = (parts: { id: string; color: [number, number, number]; emissive: number; verts: Float32Array; indices: Uint16Array; }[]): PartBuf[] => parts.map(p => ({
    id: p.id,
    vb: (() => { const b = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, p.verts, gl.STATIC_DRAW); return b; })(),
    ib: (() => { const b = gl.createBuffer()!; gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, p.indices, gl.STATIC_DRAW); return b; })(),
    n: p.indices.length,
    color: p.color as V3,
    emissive: p.emissive,
  }));

  const deskPartBufs = makePartBufs(DESK_PARTS);
  const chairPartBufs = makePartBufs(CHAIR_PARTS);
  const monitorPartBufs = makePartBufs(MONITOR_PARTS);
  const keyboardPartBufs = makePartBufs(KEYBOARD_PARTS);
  const mousePartBufs = makePartBufs(MOUSE_PARTS);
  const lampPartBufs = makePartBufs(LAMP_PARTS);
  const cube = mkBuf(cubeV, cubeI);

  const seg = 20, cv: number[] = [], ci: number[] = [];
  for (let i = 0; i <= seg; i++) { const a = i/seg*Math.PI*2, c = Math.cos(a), s = Math.sin(a);
    cv.push(c*.5,-.5,s*.5,c,0,s, c*.5,.5,s*.5,c,0,s); }
  for (let i = 0; i < seg; i++) { const b = i*2; ci.push(b,b+1,b+3,b,b+3,b+2); }
  let base = cv.length/6; cv.push(0,.5,0,0,1,0);
  for (let i = 0; i <= seg; i++) { const a = i/seg*Math.PI*2; cv.push(Math.cos(a)*.5,.5,Math.sin(a)*.5,0,1,0); }
  for (let i = 0; i < seg; i++) ci.push(base, base+1+i, base+2+i);
  base = cv.length/6; cv.push(0,-.5,0,0,-1,0);
  for (let i = 0; i <= seg; i++) { const a = i/seg*Math.PI*2; cv.push(Math.cos(a)*.5,-.5,Math.sin(a)*.5,0,-1,0); }
  for (let i = 0; i < seg; i++) ci.push(base, base+2+i, base+1+i);
  const cyl = mkBuf(new Float32Array(cv), new Uint16Array(ci));

  let vpM = I(); let camP: V3 = [0,0,0]; let now = 0;
  let curSel = false, curHov = false, curGhost = false, curHeld = false;
  let deskSurf = 0.73;

  function draw(t: MeshT, m: Float32Array, c: V3, emis = 0) {
    const b = t === 'cube' ? cube : cyl;
    gl!.bindBuffer(gl!.ARRAY_BUFFER, b.vb);
    gl!.bindBuffer(gl!.ELEMENT_ARRAY_BUFFER, b.ib);
    gl!.enableVertexAttribArray(A.pos); gl!.vertexAttribPointer(A.pos,3,gl!.FLOAT,false,24,0);
    gl!.enableVertexAttribArray(A.norm); gl!.vertexAttribPointer(A.norm,3,gl!.FLOAT,false,24,12);
    gl!.uniformMatrix4fv(U.mvp,false,mul(vpM,m));
    gl!.uniformMatrix4fv(U.model,false,m);
    gl!.uniformMatrix3fv(U.nmat,false,nMat(m));
    gl!.uniform3fv(U.col,c); gl!.uniform3fv(U.cam,camP);
    gl!.uniform3f(U.l1,1.6,2.7,0.6); gl!.uniform3f(U.l2,-2.2,2.4,-2.0);
    gl!.uniform1f(U.sel,curSel?1:0); gl!.uniform1f(U.hov,curHov?1:0);
    gl!.uniform1f(U.time,now); gl!.uniform1f(U.ghost,curGhost?1:0);
    gl!.uniform1f(U.emis,emis); gl!.uniform1f(U.held,curHeld?1:0);
    gl!.drawElements(gl!.TRIANGLES,b.n,gl!.UNSIGNED_SHORT,0);
  }

  /** Draw a raw VBO/IBO pair with the same shader pipeline as draw(). */
  function drawBuf(db: { vb: WebGLBuffer; ib: WebGLBuffer; n: number }, m: Float32Array, c: V3, emis = 0) {
    gl!.bindBuffer(gl!.ARRAY_BUFFER, db.vb);
    gl!.bindBuffer(gl!.ELEMENT_ARRAY_BUFFER, db.ib);
    gl!.enableVertexAttribArray(A.pos); gl!.vertexAttribPointer(A.pos,3,gl!.FLOAT,false,24,0);
    gl!.enableVertexAttribArray(A.norm); gl!.vertexAttribPointer(A.norm,3,gl!.FLOAT,false,24,12);
    gl!.uniformMatrix4fv(U.mvp,false,mul(vpM,m));
    gl!.uniformMatrix4fv(U.model,false,m);
    gl!.uniformMatrix3fv(U.nmat,false,nMat(m));
    gl!.uniform3fv(U.col,c); gl!.uniform3fv(U.cam,camP);
    gl!.uniform3f(U.l1,1.6,2.7,0.6); gl!.uniform3f(U.l2,-2.2,2.4,-2.0);
    gl!.uniform1f(U.sel,curSel?1:0); gl!.uniform1f(U.hov,curHov?1:0);
    gl!.uniform1f(U.time,now); gl!.uniform1f(U.ghost,curGhost?1:0);
    gl!.uniform1f(U.emis,emis); gl!.uniform1f(U.held,curHeld?1:0);
    gl!.drawElements(gl!.TRIANGLES,db.n,gl!.UNSIGNED_SHORT,0);
  }

  /**
   * Segmen kabel: menggambar silinder 3D yang terorientasi dari titik a ke b.
   * Menggunakan Gram-Schmidt untuk membangun frame lokal sehingga sumbu-Y
   * silinder sejajar dengan arah kabel.
   */
  function cableSegment(a: V3, b: V3, r: number, col: V3) {
    const dx = b[0]-a[0], dy = b[1]-a[1], dz = b[2]-a[2];
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.001) return;
    // Arah kabel = sumbu-Y lokal
    const ly: V3 = [dx/len, dy/len, dz/len];
    // Pilih vektor "atas" yang tidak sejajar dengan ly
    const up: V3 = Math.abs(ly[1]) < 0.85 ? [0, 1, 0] : [1, 0, 0];
    // Sumbu-X lokal = cross(ly, up), dinormalisasi
    const lxr: V3 = [
      ly[1]*up[2] - ly[2]*up[1],
      ly[2]*up[0] - ly[0]*up[2],
      ly[0]*up[1] - ly[1]*up[0],
    ];
    const lxl = Math.hypot(lxr[0], lxr[1], lxr[2]) || 1;
    const lx: V3 = [lxr[0]/lxl, lxr[1]/lxl, lxr[2]/lxl];
    // Sumbu-Z lokal = cross(lx, ly)
    const lz: V3 = [
      lx[1]*ly[2] - lx[2]*ly[1],
      lx[2]*ly[0] - lx[0]*ly[2],
      lx[0]*ly[1] - lx[1]*ly[0],
    ];
    const mx = (a[0]+b[0])/2, my = (a[1]+b[1])/2, mz = (a[2]+b[2])/2;
    draw('cyl', mul(mul(T(mx,my,mz), mkRot(lx,ly,lz)), S(r*2, len, r*2)), col);
  }

  /** Kabel catenary 3D: rangkaian silinder terorientasi yang melengkung */
  function cable(a: V3, b: V3, sag: number, col: V3, n = 16) {
    const r = 0.006; // radius kabel
    let prev: V3 = a;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const x = a[0] + (b[0]-a[0]) * t;
      const z = a[2] + (b[2]-a[2]) * t;
      const y = a[1] + (b[1]-a[1]) * t - Math.sin(Math.PI * t) * sag;
      const cur: V3 = [x, y, z];
      cableSegment(prev, cur, r, col);
      prev = cur;
    }
  }

  /* ── Objek furnitur (semua bagian mengikuti rotasi induk) ── */
  function item(it: FurnitureItem, ghost = false) {
    const p = it.position, sc = it.scale;
    const r = (it.rotation.y||0) * Math.PI/180;
    const c = ghost ? [0.25,0.95,0.55] as V3 : hex(it.color);
    const P = (lx: number, ly: number, lz: number, sx: number, sy: number, sz: number) =>
      part(p.x, p.y, p.z, r, lx, ly, lz, sx, sy, sz);

    switch (it.type) {
      case 'desk': {
        // ── Full GLTF Low-Poly Gaming Desk Setup ─────────────────────────────
        const surf   = p.y + sc.y / 2;          // deskSurfaceY in game coords
        const dsx    = sc.x / DESK_WIDTH;        // x scale to match item width
        const dsz    = sc.z / DESK_DEPTH;        // z scale to match item depth
        const dsy    = surf / DESK_HEIGHT;       // y scale so surface = surf
        const normT  = T(DESK_NORM_OFFSET[0], DESK_NORM_OFFSET[1], DESK_NORM_OFFSET[2]);
        const deskM  = mul(mul(mul(T(p.x, 0, p.z), RY(r)), S(dsx, dsy, dsz)), normT);
        for (const part of deskPartBufs) {
          const partCol = ghost
            ? ([0.25, 0.95, 0.55] as V3)
            : (part.id === 'desk_top' ? (it.color === '#282A36' ? part.color : c) : part.color);
          const emis = ghost ? 0 : part.emissive;
          drawBuf(part, deskM, partCol, emis);
        }
        break;
      }
      case 'chair': {
        // ── Full GLTF 3D Gaming Chair (Racing Bucket Seat + Lumbar + Base) ──
        const csx    = (sc.x + 0.16) / CHAIR_WIDTH;
        const csy    = (p.y + 0.05) / (CHAIR_HEIGHT * 0.40);
        const csz    = (sc.z + 0.16) / CHAIR_DEPTH;
        const normT  = T(CHAIR_NORM_OFFSET[0], CHAIR_NORM_OFFSET[1], CHAIR_NORM_OFFSET[2]);
        const chairM = mul(mul(mul(T(p.x, 0, p.z), RY(r)), S(csx, csy, csz)), normT);
        for (const part of chairPartBufs) {
          const partCol = ghost
            ? ([0.25, 0.95, 0.55] as V3)
            : (part.id === 'chair_accents' ? ([0.05, 0.65, 1.00] as V3) : part.color);
          const emis = ghost ? 0 : part.emissive;
          drawBuf(part, chairM, partCol, emis);
        }
        break;
      }
      case 'monitor': {
        // ── GLTF 3D Gaming Monitor (curved screen + stand + RGB accents) ──
        const msx    = sc.x / MONITOR_WIDTH;
        const msy    = (sc.y + 0.16) / MONITOR_HEIGHT;
        const msz    = (sc.z + 0.12) / MONITOR_DEPTH;
        const normT  = T(MONITOR_NORM_OFFSET[0], MONITOR_NORM_OFFSET[1], MONITOR_NORM_OFFSET[2]);
        const monM   = mul(mul(mul(T(p.x, p.y - sc.y/2 - 0.08, p.z), RY(r)), S(msx, msy, msz)), normT);
        for (const part of monitorPartBufs) {
          const partCol = ghost ? ([0.25, 0.95, 0.55] as V3) : part.color;
          const emis = ghost ? 0 : part.emissive;
          drawBuf(part, monM, partCol, emis);
        }
        // Penyangga (buku/riser) bila dinaikkan jauh di atas meja
        if (!ghost) {
          const standBottom = p.y - sc.y/2 - 0.08;
          const gap = standBottom - deskSurf;
          if (gap > 0.02) {
            const n = Math.max(1, Math.round(gap / 0.045));
            const hEach = gap / n;
            for (let i = 0; i < n; i++) {
              const cy = deskSurf + hEach * (i + 0.5) - p.y;
              const tone: V3 = [[0.62,0.30,0.26],[0.24,0.40,0.30],[0.28,0.34,0.52],[0.58,0.46,0.22]][i % 4] as V3;
              draw('cube', P(0, cy, 0.02, 0.32 - (i % 2) * 0.02, hEach * 0.88, 0.22 - (i % 2) * 0.015), tone);
            }
          }
        }
        break;
      }
      case 'keyboard': {
        // ── GLTF 3D Gaming Keyboard (mechanical keys + RGB backlighting) ──
        const ksx    = sc.x / KEYBOARD_WIDTH;
        const ksy    = (sc.y + 0.02) / KEYBOARD_HEIGHT;
        const ksz    = sc.z / KEYBOARD_DEPTH;
        const normT  = T(KEYBOARD_NORM_OFFSET[0], KEYBOARD_NORM_OFFSET[1], KEYBOARD_NORM_OFFSET[2]);
        const kbM    = mul(mul(mul(T(p.x, p.y - sc.y/2, p.z), RY(r)), S(ksx, ksy, ksz)), normT);
        for (const part of keyboardPartBufs) {
          const partCol = ghost ? ([0.25, 0.95, 0.55] as V3) : part.color;
          const emis = ghost ? 0 : part.emissive;
          drawBuf(part, kbM, partCol, emis);
        }
        break;
      }
      case 'mouse': {
        // ── GLTF 3D Gaming Mouse (ergonomic body + RGB lighting) ──
        const msx    = sc.x / MOUSE_WIDTH;
        const msy    = (sc.y + 0.01) / MOUSE_HEIGHT;
        const msz    = sc.z / MOUSE_DEPTH;
        const normT  = T(MOUSE_NORM_OFFSET[0], MOUSE_NORM_OFFSET[1], MOUSE_NORM_OFFSET[2]);
        const mouseM = mul(mul(mul(T(p.x, p.y - sc.y/2, p.z), RY(r)), S(msx, msy, msz)), normT);
        for (const part of mousePartBufs) {
          const partCol = ghost ? ([0.25, 0.95, 0.55] as V3) : part.color;
          const emis = ghost ? 0 : part.emissive;
          drawBuf(part, mouseM, partCol, emis);
        }
        break;
      }
      case 'lamp': {
        // ── Full GLTF 3D Articulated Desk Lamp (Matte finish + springs + glowing bulb) ──
        const lsx    = (sc.x + 0.18) / LAMP_WIDTH;
        const lsy    = (sc.y + 0.12) / LAMP_HEIGHT;
        const lsz    = (sc.z + 0.18) / LAMP_DEPTH;
        const normT  = T(LAMP_NORM_OFFSET[0], LAMP_NORM_OFFSET[1], LAMP_NORM_OFFSET[2]);
        const lampM  = mul(mul(mul(T(p.x, p.y - sc.y/2, p.z), RY(r)), S(lsx, lsy, lsz)), normT);
        for (const part of lampPartBufs) {
          const partCol = ghost
            ? ([0.25, 0.95, 0.55] as V3)
            : (part.id === 'lamp_body' ? (it.color === '#E9B949' ? [0.20, 0.20, 0.24] as V3 : c) : part.color);
          const emis = ghost ? 0 : part.emissive;
          drawBuf(part, lampM, partCol, emis);
        }
        break;
      }
    }
  }

  /* ── Ruangan ── */
  function room(dark: boolean) {
    const wall: V3  = dark ? [0.20,0.21,0.26] : [0.88,0.86,0.82];
    const wall2: V3 = dark ? [0.17,0.18,0.23] : [0.84,0.82,0.79];
    const wallB: V3 = dark ? [0.18,0.19,0.24] : [0.85,0.83,0.80]; // dinding belakang (z=+4)
    const floor: V3 = dark ? [0.16,0.16,0.19] : [0.42,0.36,0.31];
    const trim: V3  = dark ? [0.28,0.29,0.34] : [0.96,0.94,0.92];
    const moldC: V3 = dark ? [0.24,0.25,0.30] : [0.78,0.76,0.73];

    // ── Lantai dengan ubin ──
    draw('cube', mul(T(0,-0.01,0), S(10,0.02,10)), floor);
    for (let x = -4; x <= 4; x++) draw('cube', mul(T(x,0.002,0), S(0.012,0.004,10)), shade(floor,0.82));
    for (let z = -4; z <= 4; z++) draw('cube', mul(T(0,0.002,z), S(10,0.004,0.012)), shade(floor,0.82));

    // ── 4 Dinding Penuh ──
    // Depan (z = -4)
    draw('cube', mul(T(0,1.5,-4), S(10,3,0.1)), wall);
    // Belakang (z = +4)  ← dulunya kosong/terlihat seperti langit
    draw('cube', mul(T(0,1.5, 4), S(10,3,0.1)), wallB);
    // Kiri (x = -4)
    draw('cube', mul(T(-4,1.5,0), S(0.1,3,10)), wall2);
    // Kanan (x = +4)
    draw('cube', mul(T( 4,1.5,0), S(0.1,3,10)), wall2);
    // Plafon
    draw('cube', mul(T(0,3.0,0), S(10,0.06,10)), dark ? [0.14,0.15,0.19] : [0.93,0.92,0.90]);

    // ── Lis / Skirting Board (semua sisi) ──
    draw('cube', mul(T(0,  0.05,-3.94), S(10,0.10,0.03)), shade(wall,0.75));  // depan
    draw('cube', mul(T(0,  0.05, 3.94), S(10,0.10,0.03)), shade(wallB,0.75)); // belakang
    draw('cube', mul(T(-3.94,0.05,0), S(0.03,0.10,10)), shade(wall2,0.75));   // kiri
    draw('cube', mul(T( 3.94,0.05,0), S(0.03,0.10,10)), shade(wall2,0.75));   // kanan

    // ── Crown Molding / Lis Plafon (semua sisi) ──
    draw('cube', mul(T(0,  2.94,-3.94), S(10,0.06,0.04)), moldC); // depan
    draw('cube', mul(T(0,  2.94, 3.94), S(10,0.06,0.04)), moldC); // belakang
    draw('cube', mul(T(-3.94,2.94,0), S(0.04,0.06,10)), moldC);   // kiri
    draw('cube', mul(T( 3.94,2.94,0), S(0.04,0.06,10)), moldC);   // kanan

    // ── Panel Chair Rail / List Tengah Dinding (semua sisi) ──
    // Depan
    draw('cube', mul(T(0,1.0,-3.94), S(10,0.04,0.025)), shade(wall,0.80));
    // Belakang
    draw('cube', mul(T(0,1.0, 3.94), S(10,0.04,0.025)), shade(wallB,0.80));
    // Kiri
    draw('cube', mul(T(-3.94,1.0,0), S(0.025,0.04,10)), shade(wall2,0.80));
    // Kanan
    draw('cube', mul(T( 3.94,1.0,0), S(0.025,0.04,10)), shade(wall2,0.80));

    // ══════════════════════════════════════════
    // ── JENDELA KIRI (dinding x = -4) ──
    // ══════════════════════════════════════════
    const winGlassL: V3 = dark ? [0.10,0.18,0.35] : [0.60,0.82,0.96];
    // Kaca jendela
    draw('cube', mul(T(-3.94,1.78,-0.5), S(0.04,1.10,1.40)), winGlassL, dark?0.35:0.60);
    // Bingkai luar jendela
    draw('cube', mul(T(-3.93,1.78,-0.5), S(0.03,1.22,1.52)), trim);
    // Pembagi tengah (vertikal & horizontal)
    draw('cube', mul(T(-3.945,1.78,-0.5), S(0.025,1.10,0.025)), [0.92,0.90,0.88]); // vertikal tengah
    draw('cube', mul(T(-3.945,1.78,-0.5), S(0.025,0.025,1.40)), [0.92,0.90,0.88]); // horizontal tengah
    // Ambang bawah jendela (windowsill)
    draw('cube', mul(T(-3.92,1.20,-0.5), S(0.07,0.04,1.60)), trim);
    // Ambang atas
    draw('cube', mul(T(-3.92,2.36,-0.5), S(0.05,0.04,1.56)), trim);
    // Kusen kiri-kanan
    draw('cube', mul(T(-3.92,1.78,-1.30), S(0.05,1.18,0.04)), trim);
    draw('cube', mul(T(-3.92,1.78, 0.30), S(0.05,1.18,0.04)), trim);
    // Tirai kiri (gorden)
    for (let i = 0; i < 5; i++) {
      const tz = -1.32 + i*0.04;
      draw('cube', mul(T(-3.92,1.9, tz), S(0.03,1.6,0.028)), dark ? [0.28,0.22,0.38] : [0.72,0.58,0.82]);
    }
    // Tirai kanan (gorden)
    for (let i = 0; i < 5; i++) {
      const tz = 0.32 + i*0.04;
      draw('cube', mul(T(-3.92,1.9, tz), S(0.03,1.6,0.028)), dark ? [0.28,0.22,0.38] : [0.72,0.58,0.82]);
    }
    // Rel tirai
    draw('cube', mul(T(-3.92,2.70,-0.5), S(0.04,0.04,1.80)), [0.55,0.45,0.38]);

    // ══════════════════════════════════════════
    // ── JENDELA KANAN (dinding x = +4) ──
    // ══════════════════════════════════════════
    const winGlassR: V3 = dark ? [0.10,0.18,0.35] : [0.60,0.82,0.96];
    // Kaca jendela
    draw('cube', mul(T( 3.94,1.78, 0.5), S(0.04,1.10,1.40)), winGlassR, dark?0.35:0.60);
    // Bingkai luar
    draw('cube', mul(T( 3.93,1.78, 0.5), S(0.03,1.22,1.52)), trim);
    // Pembagi tengah
    draw('cube', mul(T( 3.945,1.78, 0.5), S(0.025,1.10,0.025)), [0.92,0.90,0.88]);
    draw('cube', mul(T( 3.945,1.78, 0.5), S(0.025,0.025,1.40)), [0.92,0.90,0.88]);
    // Ambang bawah
    draw('cube', mul(T( 3.92,1.20, 0.5), S(0.07,0.04,1.60)), trim);
    // Ambang atas
    draw('cube', mul(T( 3.92,2.36, 0.5), S(0.05,0.04,1.56)), trim);
    // Kusen kiri-kanan
    draw('cube', mul(T( 3.92,1.78,-0.30), S(0.05,1.18,0.04)), trim);
    draw('cube', mul(T( 3.92,1.78, 1.30), S(0.05,1.18,0.04)), trim);
    // Tirai kiri
    for (let i = 0; i < 5; i++) {
      const tz = -0.32 - i*0.04;
      draw('cube', mul(T( 3.92,1.9, tz), S(0.03,1.6,0.028)), dark ? [0.28,0.22,0.38] : [0.72,0.58,0.82]);
    }
    // Tirai kanan
    for (let i = 0; i < 5; i++) {
      const tz = 1.32 + i*0.04;
      draw('cube', mul(T( 3.92,1.9, tz), S(0.03,1.6,0.028)), dark ? [0.28,0.22,0.38] : [0.72,0.58,0.82]);
    }
    // Rel tirai
    draw('cube', mul(T( 3.92,2.70, 0.5), S(0.04,0.04,1.80)), [0.55,0.45,0.38]);

    // ══════════════════════════════════════════
    // ── HIASAN DINDING DEPAN (z = -4) ──
    // ══════════════════════════════════════════
    // Dinding depan: bidang XY → elemen tipis di Z, lebar di X & Y.

    // ── Lukisan 1: Mondrian (canvas inner x[-2.47,-0.73] y[1.28,2.32]) ──
    draw('cube', mul(T(-1.60,1.80,-3.940), S(1.80,1.10,0.025)), [0.15,0.12,0.10]); // bingkai
    draw('cube', mul(T(-1.60,1.80,-3.930), S(1.74,1.04,0.010)), dark?[0.18,0.16,0.14]:[0.95,0.93,0.90]); // kanvas
    // Blok warna — semua dalam batas x[-2.45,-0.75] y[1.30,2.30] z=-3.924
    draw('cube', mul(T(-2.035,2.115,-3.924), S(0.83,0.33,0.007)), [0.88,0.18,0.12], 0.3); // A merah
    draw('cube', mul(T(-1.165,2.115,-3.924), S(0.83,0.33,0.007)), [0.15,0.28,0.72], 0.3); // B biru
    draw('cube', mul(T(-2.035,1.755,-3.924), S(0.83,0.31,0.007)), [0.92,0.82,0.10], 0.3); // C kuning
    draw('cube', mul(T(-1.165,1.755,-3.924), S(0.83,0.31,0.007)), [0.20,0.55,0.35], 0.3); // D hijau
    draw('cube', mul(T(-2.230,1.440,-3.924), S(0.44,0.24,0.007)), [0.92,0.48,0.08], 0.3); // E oranye
    draw('cube', mul(T(-1.805,1.440,-3.924), S(0.37,0.24,0.007)), [0.55,0.18,0.62], 0.3); // F ungu
    draw('cube', mul(T(-1.165,1.440,-3.924), S(0.83,0.24,0.007)), [0.90,0.88,0.85], 0.2); // G putih
    // Garis hitam Mondrian (dalam batas kanvas)
    draw('cube', mul(T(-1.600,1.930,-3.921), S(1.74,0.020,0.005)), [0.06,0.06,0.06]);
    draw('cube', mul(T(-1.600,1.580,-3.921), S(1.74,0.020,0.005)), [0.06,0.06,0.06]);
    draw('cube', mul(T(-1.600,1.800,-3.921), S(0.020,1.04,0.005)), [0.06,0.06,0.06]);
    draw('cube', mul(T(-2.000,1.440,-3.921), S(0.020,0.24,0.005)), [0.06,0.06,0.06]);

    // ── Lukisan 2: Ekspresionisme (canvas inner x[-0.695,-0.205] y[1.28,1.92]) ──
    draw('cube', mul(T(-0.45,1.60,-3.940), S(0.55,0.70,0.025)), [0.12,0.10,0.08]); // bingkai
    draw('cube', mul(T(-0.45,1.60,-3.930), S(0.49,0.64,0.010)), dark?[0.12,0.10,0.10]:[0.92,0.88,0.85]); // kanvas
    // Sapuan horizontal — dalam batas x[-0.675,-0.225] y[1.30,1.90]
    draw('cube', mul(T(-0.45,1.76,-3.924), S(0.40,0.22,0.007)), [0.18,0.38,0.72], 0.4);
    draw('cube', mul(T(-0.45,1.53,-3.924), S(0.36,0.18,0.007)), [0.88,0.42,0.12], 0.4);
    draw('cube', mul(T(-0.45,1.36,-3.924), S(0.30,0.12,0.007)), [0.92,0.82,0.10], 0.4);
    draw('cube', mul(T(-0.37,1.60,-3.923), S(0.10,0.56,0.006)), [0.55,0.18,0.62], 0.4);

    // ── Lukisan 3: Minimalis Vertikal (canvas inner x[-2.82,-2.28] y[1.29,1.95]) ──
    draw('cube', mul(T(-2.55,1.62,-3.940), S(0.60,0.72,0.025)), [0.10,0.12,0.14]); // bingkai
    draw('cube', mul(T(-2.55,1.62,-3.930), S(0.54,0.66,0.010)), dark?[0.08,0.10,0.14]:[0.10,0.12,0.18]); // kanvas
    // Tiga balok vertikal — dalam batas x[-2.80,-2.30] y[1.31,1.93]
    draw('cube', mul(T(-2.73,1.62,-3.924), S(0.10,0.58,0.007)), [0.95,0.85,0.20], 0.55);
    draw('cube', mul(T(-2.55,1.62,-3.924), S(0.10,0.58,0.007)), [0.20,0.80,0.85], 0.55);
    draw('cube', mul(T(-2.37,1.62,-3.924), S(0.10,0.58,0.007)), [0.90,0.35,0.20], 0.55);
    draw('cube', mul(T(-2.55,1.33,-3.923), S(0.50,0.012,0.005)), [0.60,0.60,0.65], 0.4);

    // Jam dinding
    draw('cyl', mul(T(0.8,2.10,-3.93), S(0.38,0.03,0.38)), [0.94,0.92,0.90]);
    draw('cyl', mul(T(0.8,2.11,-3.92), S(0.32,0.02,0.32)), dark ? [0.15,0.15,0.18] : [0.98,0.97,0.95]);
    draw('cube', mul(T(0.8,2.11,-3.915), S(0.016,0.12,0.007)), [0.25,0.25,0.30]); // jarum menit
    draw('cube', mul(T(0.806,2.135,-3.915), S(0.012,0.09,0.007)), [0.80,0.20,0.20]); // jarum jam
    draw('cyl', mul(T(0.8,2.11,-3.914), S(0.028,0.02,0.028)), [0.40,0.40,0.45]); // poros
    // Stopkontak dinding
    draw('cube', mul(T(1.15,0.28,-3.93), S(0.11,0.14,0.02)), [0.92,0.92,0.90]);
    draw('cube', mul(T(1.15,0.28,-3.92), S(0.05,0.06,0.01)), [0.35,0.35,0.38]);

    // ══════════════════════════════════════════
    // ── HIASAN DINDING KIRI (x = -4) ──
    // ══════════════════════════════════════════
    // Rak buku (sudah ada, dipercantik)
    draw('cube', mul(T(-3.86,1.15,-2), S(0.06,1.9,0.75)), [0.42,0.28,0.19]);
    for (let s = 0; s < 4; s++) {
      draw('cube', mul(T(-3.72,0.45+s*0.44,-2), S(0.26,0.025,0.75)), [0.50,0.34,0.22]);
      for (let b = 0; b < 5; b++) {
        const bc: V3 = [[0.68,0.24,0.22],[0.22,0.46,0.30],[0.24,0.32,0.62],[0.72,0.56,0.20],[0.45,0.28,0.55]][b] as V3;
        draw('cube', mul(T(-3.70,0.55+s*0.44,-2.28+b*0.13), S(0.14,0.18,0.055)), bc);
      }
    }
    // ── Lukisan Kiri 1: Pita Warna (canvas inner y[1.96,2.44] z[1.16,1.84]) ──
    // Dinding kiri: bidang YZ → elemen tipis di X, lebar di Y & Z.
    draw('cube', mul(T(-3.945,2.20, 1.5), S(0.025,0.52,0.72)), [0.10,0.08,0.06]); // bingkai
    draw('cube', mul(T(-3.935,2.20, 1.5), S(0.015,0.48,0.68)), dark?[0.08,0.06,0.12]:[0.88,0.78,0.62]); // kanvas
    // 4 pita vertikal — dalam batas y[1.98,2.42] z[1.18,1.82] x≈-3.928
    draw('cube', mul(T(-3.928,2.20,1.255), S(0.008,0.44,0.15)), [0.90,0.22,0.18], 0.4); // merah
    draw('cube', mul(T(-3.928,2.20,1.420), S(0.008,0.44,0.14)), [0.95,0.80,0.10], 0.4); // kuning
    draw('cube', mul(T(-3.928,2.20,1.590), S(0.008,0.44,0.16)), [0.15,0.45,0.85], 0.4); // biru
    draw('cube', mul(T(-3.928,2.20,1.755), S(0.008,0.44,0.13)), [0.18,0.68,0.42], 0.4); // hijau

    // ── Lukisan Kiri 2: Kotak Konsentrik (canvas inner y[1.21,1.75] z[1.99,2.41]) ──
    draw('cube', mul(T(-3.945,1.48, 2.2), S(0.025,0.58,0.46)), [0.10,0.08,0.06]); // bingkai
    draw('cube', mul(T(-3.935,1.48, 2.2), S(0.015,0.54,0.42)), dark?[0.06,0.08,0.10]:[0.12,0.14,0.20]); // kanvas
    // Kotak konsentrik — dalam batas y[1.25,1.71] z[2.03,2.37]
    draw('cube', mul(T(-3.927,1.48,2.20), S(0.008,0.46,0.34)), [0.22,0.65,0.72], 0.5); // teal luar
    draw('cube', mul(T(-3.926,1.48,2.20), S(0.008,0.36,0.26)), [0.92,0.78,0.18], 0.5); // emas tengah
    draw('cube', mul(T(-3.925,1.48,2.20), S(0.008,0.24,0.16)), [0.88,0.25,0.22], 0.5); // merah dalam
    draw('cube', mul(T(-3.924,1.48,2.20), S(0.008,0.12,0.08)), [0.95,0.90,0.85], 0.6); // putih inti

    // Rak kecil dekoratif di kiri atas
    draw('cube', mul(T(-3.87,2.40, 2.8), S(0.05,0.04,0.60)), [0.48,0.32,0.22]);
    draw('cube', mul(T(-3.87,2.20, 2.8), S(0.05,0.36,0.04)), [0.48,0.32,0.22]);
    // Dekorasi di atas rak kecil
    draw('cyl', mul(T(-3.85,2.46, 2.65), S(0.08,0.12,0.08)), [0.55,0.33,0.22]); // pot kecil
    draw('cyl', mul(T(-3.85,2.54, 2.65), S(0.09,0.04,0.09)), [0.28,0.20,0.14]);
    draw('cyl', mul(T(-3.85,2.60, 2.65), S(0.06,0.10,0.06)), [0.22,0.52,0.28]); // tanaman kecil
    draw('cube', mul(T(-3.85,2.46, 3.00), S(0.06,0.14,0.06)), [0.35,0.28,0.22]); // buku kecil
    draw('cube', mul(T(-3.85,2.46, 3.06), S(0.06,0.16,0.06)), [0.55,0.42,0.25]);

    // ══════════════════════════════════════════
    // ── HIASAN DINDING KANAN (x = +4) ──
    // ══════════════════════════════════════════
    // ── Lukisan Kanan 1: Grid Warna (canvas inner y[1.47,2.23] z[-3.03,-1.97]) ──
    // Dinding kanan: bidang YZ → elemen tipis di X, lebar di Y & Z.
    draw('cube', mul(T( 3.945,1.85,-2.5), S(0.025,0.80,1.10)), [0.08,0.06,0.05]); // bingkai
    draw('cube', mul(T( 3.935,1.85,-2.5), S(0.015,0.76,1.06)), dark?[0.06,0.05,0.08]:[0.94,0.92,0.90]); // kanvas
    // Grid 3x4 — row y[1.61,1.85,2.09] col z[-2.89,-2.64,-2.39,-2.14], tiap sel S(0.010,0.22,0.20)
    { const gColors: V3[] = [[0.90,0.22,0.18],[0.18,0.45,0.88],[0.92,0.78,0.08],[0.18,0.72,0.45],[0.72,0.18,0.62],[0.92,0.52,0.12],[0.12,0.55,0.80],[0.85,0.30,0.42],[0.28,0.88,0.55],[0.55,0.20,0.88],[0.88,0.88,0.22],[0.18,0.62,0.72]];
      const gy = [1.61,1.85,2.09], gz = [-2.89,-2.64,-2.39,-2.14];
      for (let gi = 0; gi < 3; gi++) for (let gj = 0; gj < 4; gj++)
        draw('cube', mul(T(3.928,gy[gi],gz[gj]), S(0.010,0.22,0.20)), gColors[gi*4+gj], 0.35);
    }
    // Garis pemisah — sepenuhnya dalam batas canvas
    draw('cube', mul(T(3.929,1.73,-2.50), S(0.011,0.010,1.00)), [0.10,0.10,0.10]); // horiz bawah
    draw('cube', mul(T(3.929,1.97,-2.50), S(0.011,0.010,1.00)), [0.10,0.10,0.10]); // horiz atas
    draw('cube', mul(T(3.929,1.85,-2.765), S(0.011,0.72,0.010)), [0.10,0.10,0.10]); // vert 1
    draw('cube', mul(T(3.929,1.85,-2.515), S(0.011,0.72,0.010)), [0.10,0.10,0.10]); // vert 2
    draw('cube', mul(T(3.929,1.85,-2.265), S(0.011,0.72,0.010)), [0.10,0.10,0.10]); // vert 3

    // Rak apung kecil kanan atas
    draw('cube', mul(T( 3.87,2.25,-0.8), S(0.05,0.04,0.70)), [0.48,0.32,0.22]);
    draw('cube', mul(T( 3.87,2.05,-0.8), S(0.05,0.36,0.04)), [0.48,0.32,0.22]);
    // Dekorasi rak kanan
    draw('cyl', mul(T( 3.85,2.31,-0.65), S(0.09,0.14,0.09)), [0.62,0.38,0.25]); // vas
    draw('cyl', mul(T( 3.85,2.39,-0.65), S(0.05,0.08,0.05)), [0.55,0.22,0.18]);
    for (let i = 0; i < 4; i++) { // bunga kecil
      const a = i/4*Math.PI*2;
      draw('cube', mul(mul(T(3.85+Math.cos(a)*0.04, 2.46+((i%2)*0.03), -0.65+Math.sin(a)*0.04), RY(a)), S(0.05,0.10,0.03)), [0.82+((i%2)*0.1), 0.42, 0.55]);
    }
    draw('cube', mul(T( 3.85,2.30,-1.10), S(0.06,0.18,0.06)), [0.22,0.36,0.62]); // buku
    draw('cube', mul(T( 3.85,2.30,-1.18), S(0.06,0.20,0.06)), [0.62,0.28,0.22]);
    draw('cube', mul(T( 3.85,2.30,-1.26), S(0.06,0.15,0.06)), [0.30,0.55,0.38]);

    // ── Lukisan Kanan 3: Lansekap Malam (canvas inner y[1.46,2.14] z[2.23,2.77]) ──
    draw('cube', mul(T( 3.945,1.80,2.50), S(0.025,0.72,0.58)), [0.10,0.08,0.06]); // bingkai
    draw('cube', mul(T( 3.935,1.80,2.50), S(0.015,0.68,0.54)), dark?[0.05,0.08,0.14]:[0.12,0.16,0.28]); // kanvas
    // Layer lansekap — dalam batas y[1.48,2.12] z[2.25,2.75]
    draw('cube', mul(T(3.928,2.05,2.50), S(0.010,0.14,0.50)), [0.12,0.12,0.28], 0.3); // langit gelap
    draw('cube', mul(T(3.928,1.90,2.50), S(0.010,0.12,0.50)), [0.45,0.20,0.55], 0.3); // ungu senja
    draw('cube', mul(T(3.928,1.77,2.50), S(0.010,0.10,0.50)), [0.85,0.62,0.08], 0.3); // kuning cakrawala
    draw('cube', mul(T(3.928,1.65,2.50), S(0.010,0.10,0.50)), [0.62,0.35,0.18], 0.3); // oranye
    draw('cube', mul(T(3.928,1.53,2.50), S(0.010,0.10,0.50)), [0.18,0.25,0.18], 0.3); // tanah
    draw('cube', mul(T(3.927,1.99,2.30), S(0.011,0.10,0.10)), [0.98,0.95,0.80], 0.6); // bulan
    draw('cube', mul(T(3.927,1.60,2.67), S(0.011,0.24,0.04)), [0.06,0.08,0.06], 0.4); // pohon batang
    draw('cube', mul(T(3.927,1.72,2.67), S(0.011,0.04,0.12)), [0.06,0.08,0.06], 0.4); // pohon mahkota

    // ══════════════════════════════════════════
    // ── HIASAN DINDING BELAKANG (z = +4) ──
    // ══════════════════════════════════════════
    // Panel wainscoting / bingkai besar
    draw('cube', mul(T(0,0.52, 3.93), S(9.6,0.92,0.04)), shade(wallB, 0.93));
    // Vertical divider panel
    for (let pi = -3; pi <= 3; pi++) {
      if (pi === 0) continue;
      draw('cube', mul(T(pi*1.2,0.52, 3.935), S(0.04,0.92,0.02)), shade(wallB, 0.82));
    }
    // Lis horizontal panel
    draw('cube', mul(T(0,1.0, 3.94), S(9.6,0.04,0.025)), shade(wallB,0.80));
    // ── Lukisan Tengah: Kotak Konsentrik Kandinsky (canvas inner x[-0.72,0.72] y[1.48,2.42]) ──
    // Dinding belakang: bidang XY → elemen tipis di Z, lebar di X & Y.
    draw('cube', mul(T(0,1.95,3.940), S(1.50,1.00,0.030)), [0.12,0.10,0.08]); // bingkai
    draw('cube', mul(T(0,1.95,3.930), S(1.44,0.94,0.015)), dark?[0.06,0.05,0.10]:[0.08,0.08,0.12]); // kanvas
    // Kotak konsentrik — dalam batas x[-0.70,0.70] y[1.50,2.40]
    draw('cube', mul(T(0.00,1.95,3.923), S(1.30,0.84,0.007)), [0.88,0.65,0.12], 0.35); // emas luar
    draw('cube', mul(T(0.00,1.95,3.922), S(0.96,0.62,0.007)), [0.22,0.55,0.88], 0.40); // biru
    draw('cube', mul(T(0.00,1.95,3.921), S(0.62,0.40,0.007)), [0.88,0.22,0.35], 0.45); // merah
    draw('cube', mul(T(0.00,1.95,3.920), S(0.28,0.20,0.007)), [0.95,0.90,0.80], 0.55); // putih inti
    // Aksen bar — dalam batas canvas
    draw('cube', mul(T(-0.42,2.22,3.919), S(0.08,0.30,0.006)), [0.92,0.42,0.10], 0.5);
    draw('cube', mul(T( 0.42,1.68,3.919), S(0.08,0.28,0.006)), [0.22,0.82,0.55], 0.5);
    // Titik aksen kecil — dalam batas x[-0.70,0.70] y[1.50,2.40]
    draw('cube', mul(T(-0.58,2.28,3.918), S(0.08,0.08,0.006)), [0.95,0.85,0.15], 0.6);
    draw('cube', mul(T( 0.55,2.28,3.918), S(0.08,0.08,0.006)), [0.15,0.88,0.72], 0.6);
    draw('cube', mul(T(-0.58,1.62,3.918), S(0.06,0.06,0.006)), [0.88,0.35,0.15], 0.6);
    draw('cube', mul(T( 0.58,1.62,3.918), S(0.06,0.06,0.006)), [0.55,0.15,0.88], 0.6);

    // ── Lukisan Kiri Belakang: Ekspresionisme (canvas inner x[-2.56,-1.84] y[1.60,2.16]) ──
    draw('cube', mul(T(-2.2,1.88,3.940), S(0.78,0.62,0.030)), [0.12,0.10,0.08]); // bingkai
    draw('cube', mul(T(-2.2,1.88,3.930), S(0.72,0.56,0.015)), dark?[0.10,0.08,0.06]:[0.92,0.88,0.84]); // kanvas
    // Sapuan horizontal lebar — dalam batas x[-2.54,-1.86] y[1.62,2.14]
    draw('cube', mul(T(-2.20,2.05,3.924), S(0.60,0.16,0.007)), [0.18,0.42,0.80], 0.4);
    draw('cube', mul(T(-2.20,1.88,3.924), S(0.58,0.14,0.007)), [0.88,0.35,0.18], 0.4);
    draw('cube', mul(T(-2.20,1.73,3.924), S(0.54,0.12,0.007)), [0.88,0.78,0.10], 0.4);
    draw('cube', mul(T(-2.10,1.88,3.923), S(0.06,0.48,0.006)), [0.50,0.15,0.60], 0.5); // aksen vertikal

    // ── Lukisan Kanan Belakang: Pop Art 2×2 (canvas inner x[1.84,2.56] y[1.60,2.16]) ──
    draw('cube', mul(T( 2.2,1.88,3.940), S(0.78,0.62,0.030)), [0.12,0.10,0.08]); // bingkai
    draw('cube', mul(T( 2.2,1.88,3.930), S(0.72,0.56,0.015)), dark?[0.10,0.08,0.06]:[0.92,0.88,0.84]); // kanvas
    // Blok 2×2 — dalam batas x[1.86,2.54] y[1.62,2.14]
    draw('cube', mul(T( 2.02,2.03,3.924), S(0.32,0.22,0.007)), [0.92,0.18,0.28], 0.4); // merah kiri atas
    draw('cube', mul(T( 2.38,2.03,3.924), S(0.32,0.22,0.007)), [0.10,0.35,0.88], 0.4); // biru kanan atas
    draw('cube', mul(T( 2.02,1.73,3.924), S(0.32,0.22,0.007)), [0.92,0.82,0.10], 0.4); // kuning kiri bawah
    draw('cube', mul(T( 2.38,1.73,3.924), S(0.32,0.22,0.007)), [0.18,0.72,0.38], 0.4); // hijau kanan bawah
    // Garis pemisah
    draw('cube', mul(T( 2.20,1.88,3.922), S(0.015,0.50,0.006)), [0.08,0.08,0.08]);
    draw('cube', mul(T( 2.20,1.88,3.922), S(0.64,0.015,0.006)), [0.08,0.08,0.08]);
    // Meja konsol di dinding belakang
    draw('cube', mul(T(0,0.44, 3.78), S(1.20,0.04,0.40)), [0.48,0.34,0.22]);
    draw('cube', mul(T(0,0.22, 3.78), S(1.16,0.40,0.36)), shade([0.48,0.34,0.22], 0.80));
    // Dekorasi di meja konsol
    draw('cyl', mul(T(-0.35,0.50, 3.76), S(0.12,0.22,0.12)), [0.55,0.33,0.22]);  // vas
    draw('cyl', mul(T(-0.35,0.61, 3.76), S(0.09,0.02,0.09)), [0.28,0.20,0.14]);
    for (let i = 0; i < 5; i++) {  // bunga
      const a = i/5*Math.PI*2;
      draw('cube', mul(mul(T(-0.35+Math.cos(a)*0.06, 0.66+((i%3)*0.04), 3.76+Math.sin(a)*0.06), RY(a)), S(0.05,0.14,0.03)), [0.85,0.45,0.55]);
    }
    draw('cube', mul(T( 0.20,0.50, 3.75), S(0.06,0.20,0.06)), [0.22,0.35,0.62]); // buku kecil
    draw('cube', mul(T( 0.28,0.50, 3.75), S(0.06,0.18,0.06)), [0.62,0.25,0.22]);
    draw('cyl', mul(T( 0.45,0.52, 3.75), S(0.08,0.16,0.08)), [0.38,0.38,0.42]);  // lilin
    draw('cyl', mul(T( 0.45,0.60, 3.75), S(0.02,0.02,0.02)), [1.0,0.85,0.40], 0.9); // nyala lilin

    // ── Lampu Plafon ──
    draw('cube', mul(T(0,2.93,-1.2), S(1.1,0.06,0.28)), [1,0.98,0.92], 0.9);
    draw('cube', mul(T(0,2.97,-1.2), S(1.2,0.04,0.34)), [0.8,0.8,0.84]);

    // ── Tanaman sudut ──
    draw('cyl', mul(T(3.4,0.16,-3.4), S(0.30,0.32,0.30)), [0.55,0.33,0.22]);
    draw('cyl', mul(T(3.4,0.33,-3.4), S(0.31,0.04,0.31)), [0.30,0.22,0.16]);
    for (let i = 0; i < 7; i++) {
      const a = i/7*Math.PI*2;
      draw('cube', mul(mul(T(3.4+Math.cos(a)*0.13, 0.52+((i%3)*0.09), -3.4+Math.sin(a)*0.13), RY(a)), S(0.10,0.34,0.05)), [0.20,0.55+((i%3)*0.06),0.24]);
    }
    // Tanaman sudut kiri-belakang
    draw('cyl', mul(T(-3.4,0.16, 3.4), S(0.28,0.30,0.28)), [0.48,0.30,0.20]);
    draw('cyl', mul(T(-3.4,0.32, 3.4), S(0.29,0.04,0.29)), [0.28,0.20,0.14]);
    for (let i = 0; i < 6; i++) {
      const a = i/6*Math.PI*2;
      draw('cube', mul(mul(T(-3.4+Math.cos(a)*0.11, 0.48+((i%3)*0.08), 3.4+Math.sin(a)*0.11), RY(a)), S(0.09,0.30,0.04)), [0.18,0.50+((i%3)*0.05),0.22]);
    }

    // ── Karpet ──
    draw('cube', mul(T(0,0.006,-1.1), S(2.6,0.012,2.0)), dark ? [0.22,0.24,0.30] : [0.55,0.58,0.66]);
    draw('cube', mul(T(0,0.010,-1.1), S(2.4,0.012,1.8)), dark ? [0.25,0.27,0.34] : [0.62,0.65,0.72]);
    // Motif karpet
    draw('cube', mul(T(0,0.013,-1.1), S(2.2,0.006,0.020)), dark ? [0.30,0.32,0.40] : [0.70,0.72,0.80]);
    draw('cube', mul(T(0,0.013,-1.1), S(0.020,0.006,1.6)), dark ? [0.30,0.32,0.40] : [0.70,0.72,0.80]);
  }

  /* ── PC + kabel (mengikuti posisi objek secara dinamis) ── */
  function desktopSetup(f: FurnitureItem[]) {
    const desk = f.find(i => i.type === 'desk')!;
    const mon = f.find(i => i.type === 'monitor')!;
    const kb = f.find(i => i.type === 'keyboard')!;
    const ms = f.find(i => i.type === 'mouse')!;
    const surf = deskSurfaceY(desk);
    const dsx = desk.scale.x / DESK_WIDTH;

    // Lokasi Gaming PC Tower di atas meja
    const pcTop: V3 = [desk.position.x - 0.57 * dsx, surf + 0.55, desk.position.z - 0.05];
    const pcBack: V3 = [desk.position.x - 0.57 * dsx, surf + 0.20, desk.position.z - 0.22];

    const cc: V3 = [0.10,0.10,0.12];
    // kabel monitor → belakang meja → CPU
    const monBase: V3 = [mon.position.x, mon.position.y - mon.scale.y/2 - 0.16, mon.position.z + 0.02];
    const deskBack: V3 = [mon.position.x, surf - 0.02, desk.position.z - desk.scale.z/2 + 0.04];
    cable(monBase, deskBack, 0.02, cc, 8);
    cable(deskBack, pcTop, 0.10, cc, 18);
    // kabel keyboard → CPU
    cable([kb.position.x, kb.position.y, kb.position.z - kb.scale.z/2], [deskBack[0]-0.06, deskBack[1], deskBack[2]], 0.05, cc, 16);
    // kabel mouse → CPU
    cable([ms.position.x, ms.position.y, ms.position.z - ms.scale.z/2], [deskBack[0]+0.06, deskBack[1], deskBack[2]], 0.05, cc, 16);
    // kabel listrik CPU → stopkontak
    cable(pcBack, [1.15, 0.24, -3.90], 0.08, [0.09,0.09,0.11], 20);
    // kabel lampu → stopkontak
    const lamp = f.find(i => i.type === 'lamp')!;
    cable([lamp.position.x, surf + 0.01, lamp.position.z], [1.15, 0.24, -3.90], 0.12, [0.55,0.45,0.30], 22);
  }

  /* ── Penggaris tinggi pada dinding ── */
  function ruler() {
    for (let h = 0; h <= 18; h++) {
      const y = h*0.1;
      const major = h % 5 === 0;
      draw('cube', mul(T(-3.94, y, -0.6), S(0.02, major?0.012:0.005, major?0.22:0.12)), major ? [0.95,0.75,0.25] : [0.62,0.62,0.66]);
    }
  }

  return {
    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      gl.viewport(0, 0, canvas.width, canvas.height);
    },

    pick(): string | null {
      const w = getWorld();
      const cp = Math.cos(w.pitch);
      const d: V3 = [Math.sin(w.yaw)*cp, Math.sin(w.pitch), Math.cos(w.yaw)*cp];
      const o: V3 = [w.camX, w.camY, w.camZ];
      let best = Infinity, id: string | null = null;
      for (const it of w.furniture) {
        const b = pickBox(it);
        const t = rayHit(o, d, b.p, b.h);
        if (t !== null && t > 0.15 && t < 4.5 && t < best) { best = t; id = it.id; }
      }
      return id;
    },

    frame(time: number) {
      const w = getWorld();
      now = time;
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.CULL_FACE);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      const d = w.darkMode;
      gl.clearColor(d?0.05:0.55, d?0.06:0.68, d?0.09:0.82, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(prog);

      vpM = mul(persp(68*Math.PI/180, canvas.width/canvas.height, 0.04, 60), lookDir(w.camX,w.camY,w.camZ,w.yaw,w.pitch));
      camP = [w.camX, w.camY, w.camZ];
      curSel = false; curHov = false; curGhost = false; curHeld = false;

      const deskItem = w.furniture.find(i => i.type === 'desk');
      if (deskItem) deskSurf = deskSurfaceY(deskItem);

      room(d);
      ruler();
      desktopSetup(w.furniture);

      for (const it of w.furniture) {
        curSel = it.id === w.selectedId;
        curHov = it.id === w.hoveredId && !curSel;
        curHeld = it.id === w.heldId;
        item(it);
      }
      curSel = false; curHov = false; curHeld = false;

      // panduan hantu posisi ideal
      if (w.showGuide && w.selectedId) {
        const sel = w.furniture.find(i => i.id === w.selectedId);
        if (sel) {
          const g: FurnitureItem = { ...sel, position: { ...sel.idealPosition }, rotation: { ...sel.idealRotation } };
          curGhost = true;
          gl.depthMask(false);
          item(g, true);
          gl.depthMask(true);
          curGhost = false;
        }
      }

      // garis ukur objek terpilih — ujung atas garis = permukaan objek
      if (w.selectedId) {
        const s = w.furniture.find(i => i.id === w.selectedId);
        if (s) {
          // Untuk kursi & meja: ukur sampai permukaan atas (position.y adalah pusat geometri)
          // Untuk monitor: ukur sampai pusat layar (position.y sudah merupakan titik tengah)
          const topY = (s.type === 'chair' || s.type === 'desk')
            ? s.position.y + s.scale.y / 2
            : s.position.y;
          const x = s.position.x + 0.42, z = s.position.z;
          draw('cube', mul(T(x, topY / 2, z), S(0.006, topY, 0.006)), [0.98, 0.82, 0.20], 0.85);
          draw('cube', mul(T(x, topY, z), S(0.09, 0.007, 0.007)), [0.98, 0.82, 0.20], 0.85);
          draw('cube', mul(T(x, 0.006, z), S(0.09, 0.007, 0.007)), [0.98, 0.82, 0.20], 0.85);
        }
      }
    },
  };
}
