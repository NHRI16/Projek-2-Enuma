import { FurnitureItem } from './types';
import { deskSurfaceY } from './ergonomics';
import {
  DESK_NORM_OFFSET, DESK_WIDTH, DESK_DEPTH, DESK_PARTS,
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
import {
  BOOKS_NORM_OFFSET, BOOKS_WIDTH, BOOKS_HEIGHT, BOOKS_DEPTH, BOOKS_PARTS,
} from './booksModel';
import {
  ROOM_OFFSET, ROOM_SCALE, ROOM_PARTS,
} from './roomModel';

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




/* ── Rotation-aware AABB untuk seleksi ── */
export function pickBox(it: FurnitureItem): { p: V3; h: V3 } {
  const r = (it.rotation.y||0) * Math.PI/180;
  const ac = Math.abs(Math.cos(r)), as = Math.abs(Math.sin(r));
  let sx = it.scale.x, sy = it.scale.y, sz = it.scale.z;
  let cy = it.position.y;
  switch (it.type) {
    case 'chair':    sy = 1.12 * ((it.position.y + it.scale.y / 2) / (CHAIR_HEIGHT * 0.40)); cy = sy / 2; sx = it.scale.x; sz = it.scale.z; break;
    case 'monitor':  sy = it.scale.y + 0.28; cy = it.position.y - 0.08; sz = 0.18; break;
    case 'keyboard': sy = 0.07; sx += 0.06; sz += 0.06; break;
    case 'mouse':    sy = 0.07; sx = 0.28; sz = 0.28; break;
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
  const glCtx = (canvas.getContext('webgl2') || canvas.getContext('webgl')) as WebGLRenderingContext | null;
  if (!glCtx) throw new Error('WebGL tidak didukung');
  const gl = glCtx;

  const vs = `attribute vec4 aPos; attribute vec3 aNorm; attribute vec2 aUV;
    uniform mat4 uMVP, uModel; uniform mat3 uNMat;
    varying vec3 vN, vW; varying vec2 vUV;
    void main(){ gl_Position=uMVP*aPos; vN=uNMat*aNorm; vW=(uModel*aPos).xyz; vUV=aUV; }`;
  const fs = `precision mediump float;
    varying vec3 vN, vW; varying vec2 vUV;
    uniform vec3 uCol, uCam, uL1, uL2;
    uniform float uSel, uHov, uTime, uGhost, uEmis, uHeld, uUseTex;
    uniform sampler2D uTex;
    void main(){
      vec3 n = normalize(vN);
      vec3 v = normalize(uCam - vW);
      vec3 l1 = normalize(uL1 - vW);
      vec3 l2 = normalize(uL2 - vW);
      float d1 = max(dot(n,l1),0.0), d2 = max(dot(n,l2),0.0);
      float sp = pow(max(dot(n, normalize(l1+v)),0.0), 40.0);
      vec3 baseCol = uCol;
      if(uUseTex > 0.5){
        vec4 tCol = texture2D(uTex, vUV);
        baseCol = tCol.rgb * uCol;
      }
      vec3 c = baseCol*0.34 + baseCol*d1*0.55 + baseCol*d2*0.22 + vec3(0.22)*sp;
      c = mix(c, baseCol, uEmis);
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

  const A = {
    pos: gl.getAttribLocation(prog,'aPos'),
    norm: gl.getAttribLocation(prog,'aNorm'),
    uv: gl.getAttribLocation(prog,'aUV'),
  };
  const U = {
    mvp: gl.getUniformLocation(prog,'uMVP'), model: gl.getUniformLocation(prog,'uModel'),
    nmat: gl.getUniformLocation(prog,'uNMat'), col: gl.getUniformLocation(prog,'uCol'),
    cam: gl.getUniformLocation(prog,'uCam'), l1: gl.getUniformLocation(prog,'uL1'),
    l2: gl.getUniformLocation(prog,'uL2'), sel: gl.getUniformLocation(prog,'uSel'),
    hov: gl.getUniformLocation(prog,'uHov'), time: gl.getUniformLocation(prog,'uTime'),
    ghost: gl.getUniformLocation(prog,'uGhost'), emis: gl.getUniformLocation(prog,'uEmis'),
    held: gl.getUniformLocation(prog,'uHeld'),
    useTex: gl.getUniformLocation(prog,'uUseTex'),
    tex: gl.getUniformLocation(prog,'uTex'),
  };

  const whiteTex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, whiteTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));

  const texCache = new Map<string, WebGLTexture>();
  function getTexture(url?: string): WebGLTexture | null {
    if (!url) return null;
    if (texCache.has(url)) return texCache.get(url)!;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([220, 220, 220, 255]));
    texCache.set(url, tex);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      const isPo2 = (v: number) => (v & (v - 1)) === 0;
      if (isPo2(img.width) && isPo2(img.height)) {
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      } else {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      }
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    };
    img.src = url;
    return tex;
  }

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
  const booksPartBufs = makePartBufs(BOOKS_PARTS);
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

  // ── Pre-baked GLTF 3D Model Buffers from Room & Furniture ──
  type RoomPartBuf = {
    id: string;
    vb: WebGLBuffer;
    ib: WebGLBuffer;
    n: number;
    color: V3;
    emissive: number;
    tex: WebGLTexture | null;
  };
  const roomPartBufs: RoomPartBuf[] = ROOM_PARTS.map(p => ({
    id: p.id,
    vb: (() => { const b = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, p.verts, gl.STATIC_DRAW); return b; })(),
    ib: (() => { const b = gl.createBuffer()!; gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, p.indices, gl.STATIC_DRAW); return b; })(),
    n: p.indices.length,
    color: p.color as V3,
    emissive: p.emissive,
    tex: getTexture(p.textureUrl),
  }));

  function draw(t: MeshT, m: Float32Array, c: V3, emis = 0) {
    const b = t === 'cube' ? cube : cyl;
    gl!.bindBuffer(gl!.ARRAY_BUFFER, b.vb);
    gl!.bindBuffer(gl!.ELEMENT_ARRAY_BUFFER, b.ib);
    gl!.enableVertexAttribArray(A.pos); gl!.vertexAttribPointer(A.pos,3,gl!.FLOAT,false,24,0);
    gl!.enableVertexAttribArray(A.norm); gl!.vertexAttribPointer(A.norm,3,gl!.FLOAT,false,24,12);
    if (A.uv >= 0) { gl!.disableVertexAttribArray(A.uv); gl!.vertexAttrib2f(A.uv, 0, 0); }
    gl!.uniform1f(U.useTex, 0);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, whiteTex);
    gl!.uniform1i(U.tex, 0);
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
    if (A.uv >= 0) { gl!.disableVertexAttribArray(A.uv); gl!.vertexAttrib2f(A.uv, 0, 0); }
    gl!.uniform1f(U.useTex, 0);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, whiteTex);
    gl!.uniform1i(U.tex, 0);
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

  /** Draw a 3D room part buffer with stride 32 (pos 3, norm 3, uv 2) and optional texture. */
  function drawRoomPart(part: RoomPartBuf, m: Float32Array, dark: boolean) {
    gl!.bindBuffer(gl!.ARRAY_BUFFER, part.vb);
    gl!.bindBuffer(gl!.ELEMENT_ARRAY_BUFFER, part.ib);
    gl!.enableVertexAttribArray(A.pos); gl!.vertexAttribPointer(A.pos,3,gl!.FLOAT,false,32,0);
    gl!.enableVertexAttribArray(A.norm); gl!.vertexAttribPointer(A.norm,3,gl!.FLOAT,false,32,12);
    if (A.uv >= 0) {
      gl!.enableVertexAttribArray(A.uv);
      gl!.vertexAttribPointer(A.uv,2,gl!.FLOAT,false,32,24);
    }
    gl!.uniformMatrix4fv(U.mvp,false,mul(vpM,m));
    gl!.uniformMatrix4fv(U.model,false,m);
    gl!.uniformMatrix3fv(U.nmat,false,nMat(m));
    const c = dark ? ([part.color[0]*0.72, part.color[1]*0.72, part.color[2]*0.80] as V3) : part.color;
    gl!.uniform3fv(U.col,c); gl!.uniform3fv(U.cam,camP);
    gl!.uniform3f(U.l1,1.6,2.7,0.6); gl!.uniform3f(U.l2,-2.2,2.4,-2.0);
    gl!.uniform1f(U.sel,0); gl!.uniform1f(U.hov,0);
    gl!.uniform1f(U.time,now); gl!.uniform1f(U.ghost,0);
    gl!.uniform1f(U.emis,part.emissive); gl!.uniform1f(U.held,0);
    if (part.tex) {
      gl!.uniform1f(U.useTex, 1);
      gl!.activeTexture(gl!.TEXTURE0);
      gl!.bindTexture(gl!.TEXTURE_2D, part.tex);
      gl!.uniform1i(U.tex, 0);
    } else {
      gl!.uniform1f(U.useTex, 0);
      gl!.activeTexture(gl!.TEXTURE0);
      gl!.bindTexture(gl!.TEXTURE_2D, whiteTex);
      gl!.uniform1i(U.tex, 0);
    }
    gl!.drawElements(gl!.TRIANGLES,part.n,gl!.UNSIGNED_SHORT,0);
  }



  /* ── Objek furnitur (semua bagian mengikuti rotasi induk) ── */
  function item(it: FurnitureItem, ghost = false) {
    const p = it.position, sc = it.scale;
    const r = (it.rotation.y||0) * Math.PI/180;
    const c = ghost ? [0.25,0.95,0.55] as V3 : hex(it.color);


    switch (it.type) {
      case 'desk': {
        // ── Full GLTF Low-Poly Gaming Desk Setup ─────────────────────────────
        const surf   = p.y + sc.y / 2;          // deskSurfaceY in game coords
        const dsx    = sc.x / DESK_WIDTH;        // x scale to match item width
        const dsz    = sc.z / DESK_DEPTH;        // z scale to match item depth
        // DESK_TABLETOP_HEIGHT = 0.899m (tinggi permukaan tabletop dalam GLTF model)
        // Bukan DESK_HEIGHT (1.529m) yg termasuk semua aksesori di atas meja
        const DESK_TABLETOP_HEIGHT = 0.899;
        const dsy    = surf / DESK_TABLETOP_HEIGHT; // y scale so surface = surf
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
        const csx    = sc.x / CHAIR_WIDTH;
        const csy    = (p.y + sc.y / 2) / (CHAIR_HEIGHT * 0.40);
        const csz    = sc.z / CHAIR_DEPTH;
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
        // ── 3D Harry Potter Book Stack (Riser bila monitor dinaikkan di atas meja) ──
        if (!ghost) {
          const standBottom = p.y - sc.y/2 - 0.08;
          const gap = standBottom - deskSurf;
          if (gap > 0.02) {
            const numStacks = Math.max(1, Math.round(gap / 0.12));
            const stackH = gap / numStacks;
            const sx = 0.28 / BOOKS_WIDTH;
            const sy = stackH / BOOKS_HEIGHT;
            const sz = 0.22 / BOOKS_DEPTH;
            const normT = T(BOOKS_NORM_OFFSET[0], BOOKS_NORM_OFFSET[1], BOOKS_NORM_OFFSET[2]);
            for (let i = 0; i < numStacks; i++) {
              const stackY = deskSurf + i * stackH;
              const stackRot = r + (i % 2 === 1 ? 0.04 : -0.02);
              const stackM = mul(mul(mul(T(p.x, stackY, p.z + 0.02), RY(stackRot)), S(sx, sy, sz)), normT);
              for (const part of booksPartBufs) {
                drawBuf(part, stackM, part.color, part.emissive);
              }
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

  /* ── Ruangan 3D Gaming Room ── */
  function room(dark: boolean) {
    const roomM = mul(T(ROOM_OFFSET[0], ROOM_OFFSET[1], ROOM_OFFSET[2]), S(ROOM_SCALE[0], ROOM_SCALE[1], ROOM_SCALE[2]));
    for (const part of roomPartBufs) {
      drawRoomPart(part, roomM, dark);
    }
    // Karpet gaming elegan di bawah area meja & kursi kerja
    draw('cube', mul(T(0,0.006,-1.15), S(2.3,0.010,2.0)), dark ? [0.10,0.11,0.14] : [0.15,0.16,0.20]);
    draw('cube', mul(T(0,0.010,-1.15), S(2.1,0.010,1.8)), dark ? [0.14,0.15,0.19] : [0.20,0.22,0.28]);

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
