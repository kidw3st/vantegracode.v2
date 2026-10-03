/**
 * Пылевой диск вокруг знака на первом экране (правка владельца 03.10.2026,
 * по мотивам «Accretion Disc 3»): частицы на кеплеровских орбитах со спиральными рукавами.
 * Под стиль Vantegra:
 * - геометрия эхо-орбит: окружность диска видна эллипсом ry / rx = 0,306, наклон −12°;
 *   центр — центр логотипа, внутренний край — первая эхо-орбита: пыль не заходит на знак;
 * - мел и пепел, наложение без «перекала», без свечения; диск заполняет первый экран сверху и снизу;
 * - за текстом первого экрана — чистая зона: частицы плавно растворяются у блока с заголовком,
 *   текст стоит на ровной саже и не сливается с пылью;
 * - 15 000 частиц (7500 на телефоне), вся анимация в вершинном шейдере, плотность пикселей ≤ 1,5;
 * - ровное медленное вращение без реакции на курсор; вне экрана — пауза;
 * - при прокрутке диск сплющивается до тонкой полосы — «орбита ложится в линию» (hero-scroll.ts);
 *   при prefers-reduced-motion — неподвижный кадр.
 */
import { heroProgress } from './hero-scroll.ts';
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
uniform vec2 uViewport;      // размер холста, CSS px
uniform vec4 uClear;         // чистая зона за текстом: центр и полуразмеры, CSS px
uniform float uClearRadius;  // скругление чистой зоны, px
uniform float uFeather;      // ширина растворения, px
uniform float uFlat;         // 0 — диск как есть, 1 — сплющен в линию (прокрутка первого экрана)
uniform float uClearMix;     // сила чистой зоны: гаснет вместе с текстом первого экрана
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

  vec2 disc = vec2(r * cos(th), r * sin(th) * TILT * (1.0 - 0.96 * uFlat));
  // сплющиваясь, полоса выпрямляется из −12° в горизонталь — и ложится ровно на линию блока
  float roll = ROLL * (1.0 - uFlat);
  float c = cos(roll);
  float s = sin(roll);
  vec2 screen = vec2(c * disc.x - s * disc.y, s * disc.x + c * disc.y);
  vec2 ndc = uCenter + screen * uScale;
  gl_Position = vec4(ndc, 0.0, 1.0);

  // расстояние до скруглённого прямоугольника текста (SDF): внутри — 0, дальше плавно до 1
  float clearFade = 1.0;
  if (uClear.z > 0.0) {
    vec2 px = vec2((ndc.x * 0.5 + 0.5) * uViewport.x, (0.5 - ndc.y * 0.5) * uViewport.y);
    vec2 q = abs(px - uClear.xy) - uClear.zw + uClearRadius;
    float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uClearRadius;
    clearFade = mix(1.0, smoothstep(0.0, uFeather, sd), uClearMix);
  }

  // дальняя сторона диска — сверху, ближняя — снизу: лёгкая разница яркости только для глубины
  float far = 0.5 + 0.5 * sin(th);
  float rim = smoothstep(0.0, 0.03, f);
  float radial = rim * exp(-f * 1.5);
  vAlpha = radial * (0.25 + 0.75 * arm) * mix(0.78, 1.0, far) * (0.55 + 0.45 * aSeed.z) * 0.95 * clearFade * (1.0 - 0.45 * uFlat);
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
  const copy = document.querySelector<HTMLElement>('.hero__copy');
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
    viewport: gl.getUniformLocation(program, 'uViewport'),
    clear: gl.getUniformLocation(program, 'uClear'),
    clearRadius: gl.getUniformLocation(program, 'uClearRadius'),
    feather: gl.getUniformLocation(program, 'uFeather'),
    flat: gl.getUniformLocation(program, 'uFlat'),
    clearMix: gl.getUniformLocation(program, 'uClearMix'),
  };
  gl.uniform1f(gl.getUniformLocation(program, 'uRout'), narrow ? ROUT_MOBILE : ROUT_DESKTOP);
  gl.uniform3fv(gl.getUniformLocation(program, 'uBase'), ASH);
  gl.uniform3fv(gl.getUniformLocation(program, 'uAccent'), CHALK);
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  const hero = canvas.closest<HTMLElement>('.hero');
  /** Линия-разделитель следующего блока: на неё ложится сплющенный диск */
  const rule = hero?.nextElementSibling?.querySelector<HTMLElement>('.sh') ?? null;
  const still = prefersReducedMotion();
  // Переход к блокам: холст закреплён на экране, диск ведём к линии сами (без reduced motion)
  const follow = Boolean(hero) && !still;
  if (follow) canvas.classList.add('is-fixed');

  /** Положение на странице, px: центр знака и линия следующего блока (без учёта прокрутки) */
  let originX = 0;
  let originY = 0;
  let ruleY = 0;
  let boxW = 1;
  let boxH = 1;
  let ratio = 1;

  /** Центр диска — центр логотипа, единица длины — радиус внутренней эхо-орбиты */
  const layout = () => {
    ratio = Math.min(DPR_CAP, window.devicePixelRatio || 1);
    const box = canvas.getBoundingClientRect();
    boxW = Math.max(1, box.width);
    boxH = Math.max(1, box.height);
    const width = Math.max(1, Math.round(boxW * ratio));
    const height = Math.max(1, Math.round(boxH * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    const logoBox = logo.getBoundingClientRect();
    const scroll = follow ? window.scrollY : 0;
    originX = logoBox.left + logoBox.width / 2 - box.left;
    originY = logoBox.top + logoBox.height / 2 + scroll - (follow ? 0 : box.top);
    ruleY = rule ? rule.getBoundingClientRect().top + scroll : originY;
    const unit = rimInLogoWidths * logo.offsetWidth;
    gl.uniform2f(uniforms.scale, (unit * 2) / boxW, (unit * 2) / boxH);
    gl.uniform1f(uniforms.dot, DOT * ratio);
    gl.uniform2f(uniforms.viewport, boxW, boxH);
    gl.uniform1f(uniforms.clearRadius, narrow ? 40 : 72);
    gl.uniform1f(uniforms.feather, narrow ? 64 : 110);
  };

  /** Доля перехода 0…1 и сглаженная доля */
  let progress = 0;
  const place = () => {
    progress = follow && hero ? heroProgress(hero) : 0;
    const eased = progress * progress * (3 - 2 * progress);
    // сплющивается раньше, чем доезжает: последние доли перехода на линию скользит уже тонкая полоса
    const squash = Math.min(1, progress / 0.7);
    const scroll = follow ? window.scrollY : 0;
    // центр: сначала вместе со знаком, к концу перехода — на линии следующего блока
    const centerY = originY - scroll + (ruleY - originY) * eased;
    gl.uniform2f(uniforms.center, (originX / boxW) * 2 - 1, 1 - (centerY / boxH) * 2);
    gl.uniform1f(uniforms.flat, squash * squash * (3 - 2 * squash));
    // текст гаснет так же, как в hero-scroll.ts: 1 − 1,3 × доля
    gl.uniform1f(uniforms.clearMix, Math.max(0, 1 - 1.3 * eased));
    // чистая зона за текстом идёт за текстом (он уходит с параллаксом)
    if (copy) {
      const text = copy.getBoundingClientRect();
      const box = canvas.getBoundingClientRect();
      const pad = narrow ? 12 : 28;
      gl.uniform4f(
        uniforms.clear,
        text.left + text.width / 2 - box.left,
        text.top + text.height / 2 - box.top,
        text.width / 2 + pad,
        text.height / 2 + pad,
      );
    } else {
      gl.uniform4f(uniforms.clear, 0, 0, 0, 0);
    }
    // у линии диск растворяется
    if (follow && canvas.classList.contains('is-ready')) {
      const fade = Math.min(1, Math.max(0, (progress - 0.84) / 0.16));
      canvas.style.opacity = progress > 0 ? (1 - fade * fade * (3 - 2 * fade)).toFixed(3) : '';
    }
  };

  let time = 0;
  let last = 0;
  let raf = 0;
  const draw = () => {
    place();
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
    // диск лёг в линию и погас — дальше не рисуем, пока не вернутся наверх
    raf = follow && progress >= 1 ? 0 : requestAnimationFrame(frame);
  };
  const run = () => {
    if (still || raf) return;
    last = 0;
    raf = requestAnimationFrame(frame);
  };
  const stop = () => {
    cancelAnimationFrame(raf);
    raf = 0;
  };

  if (still) time = STILL_TIME;

  layout();
  draw();
  canvas.classList.add('is-ready');
  // плавное появление — только при загрузке; дальше прозрачность ведёт прокрутка без задержки
  const settle = window.setTimeout(() => {
    if (follow) canvas.style.transition = 'none';
  }, 1600);

  const resizeObserver = new ResizeObserver(() => {
    layout();
    if (!raf) draw();
  });
  resizeObserver.observe(canvas);
  if (rule) resizeObserver.observe(rule);

  let cleanupVisibility: () => void;
  if (follow && hero) {
    // закреплённый холст всегда «на экране»: паузу даёт доля прокрутки первого экрана
    const onScroll = () => {
      if (heroProgress(hero) < 1) run();
      else if (!raf) draw();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    run();
    cleanupVisibility = () => window.removeEventListener('scroll', onScroll);
  } else {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) run();
      else stop();
    });
    observer.observe(canvas);
    cleanupVisibility = () => observer.disconnect();
  }

  return () => {
    stop();
    window.clearTimeout(settle);
    cleanupVisibility();
    resizeObserver.disconnect();
    canvas.classList.remove('is-fixed');
    canvas.style.opacity = '';
    canvas.style.transition = '';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  };
});
