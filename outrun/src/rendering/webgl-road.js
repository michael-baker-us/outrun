// WebGL2 hybrid road renderer.
// Replaces the Canvas 2D drawRoad() pass with a single batched GPU draw call.
// All other layers (sky, scenery, HUD, particles) remain on Canvas 2D.
//
// Integration (road layer in game.js):
//   drawRoadGL(W, H)                         — batch geometry, one gl.drawArrays()
//   ctx.drawImage(getWebGLCanvas(), 0, 0, W, H) — composite onto 2D back-buffer
//
// The WebGL canvas is transparent above the road (alpha = 0), so the 2D sky
// drawn before this layer shows through correctly.

import { fogAlpha, frameSegs } from './road.js';
import { palette } from './palette.js';

// ---- Shaders -----------------------------------------------------------------

const VERT = `#version 300 es
in vec2 a_pos;
in vec3 a_col;
in float a_fog;
uniform vec2 u_res;
out vec3 v_col;
out float v_fog;
void main() {
  vec2 ndc = (a_pos / u_res) * 2.0 - 1.0;
  ndc.y = -ndc.y;
  gl_Position = vec4(ndc, 0.0, 1.0);
  v_col = a_col;
  v_fog = a_fog;
}`;

const FRAG = `#version 300 es
precision mediump float;
in vec3 v_col;
in float v_fog;
uniform vec3 u_fog_col;
out vec4 out_col;
void main() {
  out_col = vec4(mix(v_col, u_fog_col, v_fog), 1.0);
}`;

// ---- Module state ------------------------------------------------------------

let _canvas = null;
let _gl     = null;
let _prog   = null;
let _vao    = null;
let _vbo    = null;
let _uRes   = null;
let _uFog   = null;
let _buf    = null;

// Vertex layout: [x, y, r, g, b, fog] — 6 floats × 4 bytes = 24 bytes per vertex.
const STRIDE = 6;

// Worst case: DRAW_DISTANCE(120) × 7 quads × 6 verts + 1 base quad × 6 verts
// = 120 × 42 + 6 = 5046. Rounded up to 6144.
const MAX_VERTS = 6144;

// ---- Helpers -----------------------------------------------------------------

function _compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    console.error('WebGL shader error:', gl.getShaderInfoLog(s));
  return s;
}

// '#rrggbb' → [r, g, b] normalized to 0–1.
function _h(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

// Write one vertex into buf at byte-aligned offset; returns incremented offset.
function _vert(buf, off, x, y, r, g, b, fog) {
  buf[off] = x; buf[off + 1] = y;
  buf[off + 2] = r; buf[off + 3] = g; buf[off + 4] = b;
  buf[off + 5] = fog;
  return off + STRIDE;
}

// Push a trapezoid as two triangles.
// Near edge (screen-bottom): x1l..x1r at y1
// Far edge  (screen-top):    x2l..x2r at y2
function _quad(buf, off, x1l, x1r, y1, x2l, x2r, y2, r, g, b, fog) {
  off = _vert(buf, off, x1l, y1, r, g, b, fog);
  off = _vert(buf, off, x1r, y1, r, g, b, fog);
  off = _vert(buf, off, x2r, y2, r, g, b, fog);
  off = _vert(buf, off, x1l, y1, r, g, b, fog);
  off = _vert(buf, off, x2r, y2, r, g, b, fog);
  off = _vert(buf, off, x2l, y2, r, g, b, fog);
  return off;
}

// ---- Public API --------------------------------------------------------------

export function isWebGLSupported() {
  try { return !!document.createElement('canvas').getContext('webgl2'); }
  catch { return false; }
}

// Create the WebGL2 canvas, compile shaders, set up the VAO+VBO.
// Returns true on success; false if WebGL2 is unavailable or link fails.
export function initWebGL(W, H) {
  _canvas        = document.createElement('canvas');
  _canvas.width  = W;
  _canvas.height = H;

  const gl = _canvas.getContext('webgl2', {
    alpha:                 true,
    premultipliedAlpha:    false,
    preserveDrawingBuffer: true,  // needed so ctx.drawImage reads a valid buffer
  });
  if (!gl) return false;
  _gl = gl;

  const vs = _compile(gl, gl.VERTEX_SHADER,   VERT);
  const fs = _compile(gl, gl.FRAGMENT_SHADER, FRAG);
  _prog = gl.createProgram();
  gl.attachShader(_prog, vs); gl.attachShader(_prog, fs);
  gl.linkProgram(_prog);
  if (!gl.getProgramParameter(_prog, gl.LINK_STATUS)) {
    console.error('WebGL link error:', gl.getProgramInfoLog(_prog));
    return false;
  }
  gl.deleteShader(vs); gl.deleteShader(fs);

  _uRes = gl.getUniformLocation(_prog, 'u_res');
  _uFog = gl.getUniformLocation(_prog, 'u_fog_col');

  _buf = new Float32Array(MAX_VERTS * STRIDE);
  _vao = gl.createVertexArray();
  gl.bindVertexArray(_vao);
  _vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, _vbo);
  gl.bufferData(gl.ARRAY_BUFFER, _buf.byteLength, gl.DYNAMIC_DRAW);

  const byteStride = STRIDE * 4;
  const aPos = gl.getAttribLocation(_prog, 'a_pos');
  const aCol = gl.getAttribLocation(_prog, 'a_col');
  const aFog = gl.getAttribLocation(_prog, 'a_fog');
  gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, byteStride,  0);
  gl.enableVertexAttribArray(aCol); gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, byteStride,  8);
  gl.enableVertexAttribArray(aFog); gl.vertexAttribPointer(aFog, 1, gl.FLOAT, false, byteStride, 20);

  gl.bindVertexArray(null);
  gl.clearColor(0, 0, 0, 0);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);   // all road pixels are fully opaque
  gl.viewport(0, 0, W, H);
  return true;
}

export function getWebGLCanvas() { return _canvas; }

// Render road geometry for the current frame into the WebGL canvas.
// Must be called after projectRoad() has populated frameSegs for this frame.
export function drawRoadGL(W, H) {
  const gl = _gl;
  gl.clear(gl.COLOR_BUFFER_BIT);
  if (frameSegs.length === 0) return;

  // Read live palette — it mutates every frame via TOD interpolation + stage overrides.
  const grass   = [_h(palette.road.grass[0]),   _h(palette.road.grass[1])];
  const rumble  = [_h(palette.road.rumble[0]),  _h(palette.road.rumble[1])];
  const surface = [_h(palette.road.surface[0]), _h(palette.road.surface[1])];
  const shRgb   = _h(palette.road.shoulder);
  const dash    = [
    palette.road.dash[0] ? _h(palette.road.dash[0]) : null,
    palette.road.dash[1] ? _h(palette.road.dash[1]) : null,
  ];
  const fogRgb = _h(palette.sky.fog);

  const buf = _buf;
  let off = 0;

  // Base grass fill: covers H/2→H behind all segments so there is no gap
  // at the horizon. Fully fogged so it blends into the horizon haze.
  const [bgr, bgg, bgb] = grass[0];
  off = _quad(buf, off, 0, W, H, 0, W, H / 2, bgr, bgg, bgb, 1.0);

  // Segments far-to-near — painter's algorithm, nearer quads overdraw farther ones.
  // frameSegs[0] = nearest, frameSegs[last] = farthest, so iterate in reverse.
  for (let k = frameSegs.length - 1; k >= 0; k--) {
    const { p1, p2, color, dz } = frameSegs[k];
    const fogW = fogAlpha(dz);

    const r1 = p1.w / 6,  r2 = p2.w / 6;    // rumble strip half-width
    const l1 = p1.w / 32, l2 = p2.w / 32;   // lane dash half-width
    const s1 = p1.w / 18, s2 = p2.w / 18;   // shoulder half-width

    const [gr, gg, gb] = grass[color];
    const [rr, rg, rb] = rumble[color];
    const [ar, ag, ab] = surface[color];
    const [shr, shg, shb] = shRgb;
    const dc = dash[color];

    // Full-width grass band for this segment's height range
    off = _quad(buf, off, 0, W, p1.y, 0, W, p2.y, gr, gg, gb, fogW);

    // Left shoulder
    off = _quad(buf, off,
      p1.x - p1.w - r1 - s1, p1.x - p1.w - r1, p1.y,
      p2.x - p2.w - r2 - s2, p2.x - p2.w - r2, p2.y,
      shr, shg, shb, fogW);

    // Right shoulder
    off = _quad(buf, off,
      p1.x + p1.w + r1,       p1.x + p1.w + r1 + s1, p1.y,
      p2.x + p2.w + r2,       p2.x + p2.w + r2 + s2, p2.y,
      shr, shg, shb, fogW);

    // Left rumble strip
    off = _quad(buf, off,
      p1.x - p1.w - r1, p1.x - p1.w, p1.y,
      p2.x - p2.w - r2, p2.x - p2.w, p2.y,
      rr, rg, rb, fogW);

    // Right rumble strip
    off = _quad(buf, off,
      p1.x + p1.w,       p1.x + p1.w + r1, p1.y,
      p2.x + p2.w,       p2.x + p2.w + r2, p2.y,
      rr, rg, rb, fogW);

    // Road surface
    off = _quad(buf, off,
      p1.x - p1.w, p1.x + p1.w, p1.y,
      p2.x - p2.w, p2.x + p2.w, p2.y,
      ar, ag, ab, fogW);

    // Center lane dash (null on alternate stripes to produce the dashed effect)
    if (dc) {
      const [dr, dg, db] = dc;
      off = _quad(buf, off,
        p1.x - l1, p1.x + l1, p1.y,
        p2.x - l2, p2.x + l2, p2.y,
        dr, dg, db, fogW);
    }
  }

  // Upload only the filled portion of the buffer, then issue a single draw call.
  gl.useProgram(_prog);
  gl.bindVertexArray(_vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, _vbo);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, buf, 0, off);
  gl.uniform2f(_uRes, W, H);
  gl.uniform3fv(_uFog, fogRgb);
  gl.drawArrays(gl.TRIANGLES, 0, off / STRIDE);
  gl.bindVertexArray(null);
}
