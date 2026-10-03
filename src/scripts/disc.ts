/**
 * Пылевой диск вокруг знака на первом экране (правка владельца 03.10.2026,
 * по мотивам «Accretion Disc 3»): частицы на кеплеровских орбитах со спиральными рукавами.
 * Под стиль Vantegra:
 * - геометрия эхо-орбит: окружность диска видна эллипсом ry / rx = 0,306, наклон −12°;
 *   центр — центр логотипа, внутренний край — первая эхо-орбита: пыль не заходит на знак;
 * - мел и пепел, наложение без «перекала», без свечения; диск заполняет первый экран сверху и снизу;
 * - 15 000 частиц (7500 на телефоне), вся анимация в вершинном шейдере, плотность пикселей ≤ 1,5;
 * - ровное медленное вращение без реакции на курсор; вне экрана — пауза;
 *   при prefers-reduced-motion — неподвижный кадр.
 */
import { onPage, prefersReducedMotion } from './lifecycle.ts';

const DPR_CAP = 1.5;
const COUNT_DESKTOP = 15000;
const COUNT_MOBILE = 7500;
/** Внешний радиус диска: на узком экране диск — полоса, шире радиус, чтобы пыль дошла до кнопок */
const ROUT_DESKTOP = 3.1;
const ROUT_MOBILE = 4.2;
/** Размер точки, CSS px */
const DOT = 2.4;
/** Время для неподвижного кадра (reduced motion) — рукава уже красиво закручены */
const STILL_TIME = 40;

/** Мел #F4F2EE и пепел #8C8984 */
const CHALK: [number, number, number] = [244 / 255, 242 / 255, 238 / 255];
const ASH: [number, number, number] = [140 / 255, 137 / 255, 132 / 255];

const VERTEX = `
precision highp float;
attribute vec4 aSeed;
uniform float uTime;
uniform vec2 uCenter;
uniform vec2 uScale;
uniform float uDot;
uniform float uRout;         // внешний радиус в радиусах внутренней орбиты
varying float vAlpha;
varying float vMix;

const float TILT = 0.306;    // ry / rx эхо-орбит
const float ROLL = 0.2094395;// наклон −12° (в координатах с осью y вверх — против часовой)
const float ARMS = 4.0;
const float WIND = 2.4;
const float SHARP = 2.6;
const float PULL = 0.42;
const float ORBIT = 0.15;    // рад/с у внутреннего края; дальше — медленнее (r^-1.5)
const float SPIN = 0.012;    // скорость узора рукавов

void main() {
  float r = 1.0 + (uRout - 1.0) * pow(aSeed.x, 1.25);
  float f = (r - 1.0) / (uRout - 1.0);
  float th = aSeed.y + ORBIT * pow(r, -1.5) * uTime;
  float armAngle = ARMS * (th - WIND * log(r)) - SPIN * uTime;
  th -= PULL * sin(armAngle) / ARMS;
  float arm = pow(0.5 + 0.5 * cos(armAngle), SHARP);

  vec2 disc = vec2(r * cos(th), r * sin(th) * TILT);
  float c = cos(ROLL);
  float s = sin(ROLL);
  vec2 screen = vec2(c * disc.x - s * disc.y, s * disc.x + c * disc.y);
  gl_Position = vec4(uCenter + screen * uScale, 0.0, 1.0);

  // дальняя сторона диска — сверху, ближняя — снизу: лёгкая разница яркости только для глубины
  float far = 0.5 + 0.5 * sin(th);
  float rim = smoothstep(0.0, 0.03, f);
  float radial = rim * exp(-f * 1.5);
  vAlpha = radial * (0.25 + 0.75 * arm) * mix(0.78, 1.0, far) * (0.55 + 0.45 * aSeed.z) * 0.95;
  vMix = clamp(arm * 0.9 + (1.0 - f) * 0.25, 0.0, 1.0);
  gl_PointSize = uDot * (0.65 + 0.7 * aSeed.w) * mix(1.15, 0.9, far);
}`;

const FRAGMENT = `
precision mediump float;
uniform vec3 uBase;
uniform vec3 uAccent;
varying float vAlpha;
varying float vMix;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r2 = dot(d, d) * 4.0;
  if (r2 > 1.0) discard;
  float a = exp(-r2 * 4.5) * vAlpha;
  gl_FragColor = vec4(mix(uBase, uAccent, vMix) * a, a);
}`;

/** Детерминированный генератор — диск одинаковый при каждой загрузке */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildSeeds(count: number): Float32Array {
  const random = mulberry32(0x9e3779b9);
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count * 4; i += 4) {
    seeds[i] = random();
    seeds[i + 1] = random() * Math.PI * 2;
    seeds[i + 2] = random();
    seeds[i + 3] = random();
  }
  return seeds;
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('WebGL: шейдер не создан');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'WebGL');
  return shader;
}

onPage(() => {
  const canvas = document.querySelector<HTMLCanvasElement>('[data-hero-disc]');
  const logo = document.querySelector<HTMLElement>('.hero__logo');
  if (!canvas || !logo) return;
  const rimInLogoWidths = Number(canvas.dataset.rim) || 2.6;

  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: 'low-power' });
  if (!gl) return;

  const program = gl.createProgram();
  if (!program) return;
  try {
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
  } catch {
    return;
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
  gl.useProgram(program);

  const narrow = window.matchMedia('(max-width: 767px)').matches;
  const count = narrow ? COUNT_MOBILE : COUNT_DESKTOP;
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, buildSeeds(count), gl.STATIC_DRAW);
  const seedLocation = gl.getAttribLocation(program, 'aSeed');
  gl.enableVertexAttribArray(seedLocation);
  gl.vertexAttribPointer(seedLocation, 4, gl.FLOAT, false, 0, 0);

  const uniforms = {
    time: gl.getUniformLocation(program, 'uTime'),
    center: gl.getUniformLocation(program, 'uCenter'),
    scale: gl.getUniformLocation(program, 'uScale'),
    dot: gl.getUniformLocation(program, 'uDot'),
  };
  gl.uniform1f(gl.getUniformLocation(program, 'uRout'), narrow ? ROUT_MOBILE : ROUT_DESKTOP);
  gl.uniform3fv(gl.getUniformLocation(program, 'uBase'), ASH);
  gl.uniform3fv(gl.getUniformLocation(program, 'uAccent'), CHALK);
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  /** Центр диска — центр логотипа, единица длины — радиус внутренней эхо-орбиты */
  const layout = () => {
    const ratio = Math.min(DPR_CAP, window.devicePixelRatio || 1);
    const box = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(box.width * ratio));
    const height = Math.max(1, Math.round(box.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    const logoBox = logo.getBoundingClientRect();
    const cx = logoBox.left + logoBox.width / 2 - box.left;
    const cy = logoBox.top + logoBox.height / 2 - box.top;
    const unit = rimInLogoWidths * logo.offsetWidth;
    gl.uniform2f(uniforms.center, (cx / box.width) * 2 - 1, 1 - (cy / box.height) * 2);
    gl.uniform2f(uniforms.scale, (unit * 2) / box.width, (unit * 2) / box.height);
    gl.uniform1f(uniforms.dot, DOT * ratio);
  };

  let time = 0;
  let last = 0;
  let raf = 0;
  const draw = () => {
    gl.uniform1f(uniforms.time, time);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.POINTS, 0, count);
  };
  const frame = (now: number) => {
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    time += dt;
    draw();
    raf = requestAnimationFrame(frame);
  };

  const still = prefersReducedMotion();
  if (still) time = STILL_TIME;

  layout();
  draw();
  canvas.classList.add('is-ready');

  const resizeObserver = new ResizeObserver(() => {
    layout();
    if (!raf) draw();
  });
  resizeObserver.observe(canvas);

  const observer = new IntersectionObserver(([entry]) => {
    if (still) return;
    if (entry?.isIntersecting) {
      if (!raf) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    } else {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  });
  observer.observe(canvas);

  return () => {
    cancelAnimationFrame(raf);
    observer.disconnect();
    resizeObserver.disconnect();
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  };
});
