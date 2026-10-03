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
 * - ровное медленное вращение без реакции на курсор.
 *
 * Переход к надписи VANTEGRA (hero-scroll.ts, brand.ts): при прокрутке диск закручивается
 * и стягивается в плотный светящийся вихрь, который съезжает в центр экрана — туда, где
 * остановится надпись. Когда надпись встаёт, вихрь взрывается: пыль разлетается во все стороны
 * и гаснет на лету, после взрыва пыли не остаётся. Взрыв идёт по времени (1,3 с), не по прокрутке.
 * При prefers-reduced-motion — неподвижный кадр без перехода.
 *
 * Дневная тема: тёмная пыль на меле. Тёмная точка на светлом читается слабее светлой на тёмном,
 * поэтому днём частицы плотнее и крупнее (uInk); в стянутом вихре прибавка меньше — без чёрного пятна.
 */
import { collapseOf, fadeOf, heroProgress, landingScroll, resetTarget, smooth, targetCenter } from './hero-scroll.ts';
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
/** Длительность взрыва, мс */
const BURST_MS = 1300;
/** Дневная тема: плотность частиц (в диске и в стянутом вихре) и размер точки */
const INK_GAIN = 2.0;
const INK_GAIN_CORE = 1.25;
const INK_SIZE = 1.3;

/** Тёмная тема: мел #F4F2EE и пепел #8C8984; дневная: сажа #111111 и пепел на меле #6E6B66 */
const CHALK: [number, number, number] = [244 / 255, 242 / 255, 238 / 255];
const ASH: [number, number, number] = [140 / 255, 137 / 255, 132 / 255];
const SOOT: [number, number, number] = [17 / 255, 17 / 255, 17 / 255];
const ASH_ON_CHALK: [number, number, number] = [110 / 255, 107 / 255, 102 / 255];
const isLight = () => document.documentElement.dataset.theme === 'light';
const dustColors = () => (isLight() ? { base: ASH_ON_CHALK, accent: SOOT } : { base: ASH, accent: CHALK });

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
uniform float uClearMix;     // сила чистой зоны: гаснет вместе с текстом первого экрана
uniform float uCollapse;     // 0 — диск первого экрана, 1 — стянут в плотный вихрь
uniform float uSpin;         // докрутка вихря при стягивании, рад
uniform float uBurst;        // 0…1 — разлёт (резкий старт, торможение)
uniform float uBurstT;       // 0…1 — время взрыва линейно: вспышка и угасание
uniform vec2 uBurstSize;     // радиус разлёта, NDC (полуоси)
uniform mediump float uInk;  // 0 — светлая пыль на тёмном, 1 — тёмная на светлом; точность как во фрагментном
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
const float PI = 3.14159265;

void main() {
  float r = 1.0 + (uRout - 1.0) * pow(aSeed.x, 1.25);
  float f = (r - 1.0) / (uRout - 1.0);
  // стягиваясь, вихрь закручивается: внутренние кольца обгоняют внешние, рукава становятся спиралью
  float th = aSeed.y + ORBIT * pow(r, -1.5) * uTime + uSpin * pow(r, -1.2);
  float armAngle = ARMS * (th - WIND * log(r)) - SPIN * uTime;
  th -= PULL * sin(armAngle) / ARMS;
  float arm = pow(0.5 + 0.5 * cos(armAngle), SHARP);

  // радиус сжимается к плотному ядру: внутренние частицы — к центру, внешние — к краю ядра
  float radius = mix(r, 0.05 + 0.09 * f, uCollapse);
  vec2 disc = vec2(radius * cos(th), radius * sin(th) * TILT);
  float c = cos(ROLL);
  float s = sin(ROLL);
  vec2 screen = vec2(c * disc.x - s * disc.y, s * disc.x + c * disc.y);
  vec2 ndc = uCenter + screen * uScale;

  // взрыв: каждая частица летит от ядра по своему лучу, быстро в начале и медленнее к концу
  float e = uBurst;
  if (e > 0.0) {
    vec2 away = normalize(screen + vec2(1e-5, 0.0));
    vec2 scatter = vec2(cos(aSeed.w * 6.2831853), sin(aSeed.w * 6.2831853));
    vec2 dir = normalize(mix(away, scatter, 0.45));
    float reach = mix(0.22, 1.0, pow(aSeed.z, 0.55));
    ndc += dir * uBurstSize * reach * e;
  }
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
  // в вихре внешние частицы не тускнеют: видно всю спираль, а не одно пятно
  radial = mix(radial, rim * 0.55, uCollapse);
  float alpha = radial * (0.25 + 0.75 * arm) * mix(0.78, 1.0, far) * (0.55 + 0.45 * aSeed.z) * 0.95 * clearFade;
  // плотное ядро не превращается в белое пятно
  alpha *= mix(1.0, 0.42, uCollapse);
  // вспышка в начале взрыва, к концу всё гаснет — пыли после взрыва не остаётся
  float t = uBurstT;
  alpha *= (1.0 + 1.6 * sin(PI * min(t * 4.0, 1.0))) * mix(1.0, 1.8, min(t * 6.0, 1.0)) * (1.0 - smoothstep(0.4, 1.0, t));
  // днём плотнее: тёмная точка на светлом теряется сильнее светлой на тёмном
  alpha *= mix(1.0, mix(${INK_GAIN.toFixed(2)}, ${INK_GAIN_CORE.toFixed(2)}, uCollapse), uInk);
  vAlpha = alpha;
  vMix = clamp(arm * 0.9 + (1.0 - f) * 0.25 + 0.4 * uCollapse, 0.0, 1.0);
  gl_PointSize = uDot * (0.65 + 0.7 * aSeed.w) * mix(1.15, 0.9, far) * mix(1.0, 0.8, uCollapse)
    * (1.0 + 0.5 * sin(PI * uBurstT)) * mix(1.0, ${INK_SIZE.toFixed(2)}, uInk);
}`;

const FRAGMENT = `
precision mediump float;
uniform vec3 uBase;
uniform vec3 uAccent;
uniform mediump float uInk;
varying float vAlpha;
varying float vMix;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r2 = dot(d, d) * 4.0;
  if (r2 > 1.0) discard;
  float a = exp(-r2 * 4.5) * vAlpha;
  // днём плотность не выше 1: тёмная вспышка взрыва не выжигает фон в чёрное
  a = mix(a, min(a, 1.0), uInk);
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
    clearMix: gl.getUniformLocation(program, 'uClearMix'),
    collapse: gl.getUniformLocation(program, 'uCollapse'),
    spin: gl.getUniformLocation(program, 'uSpin'),
    burst: gl.getUniformLocation(program, 'uBurst'),
    burstT: gl.getUniformLocation(program, 'uBurstT'),
    burstSize: gl.getUniformLocation(program, 'uBurstSize'),
  };
  gl.uniform1f(gl.getUniformLocation(program, 'uRout'), narrow ? ROUT_MOBILE : ROUT_DESKTOP);
  const baseLocation = gl.getUniformLocation(program, 'uBase');
  const accentLocation = gl.getUniformLocation(program, 'uAccent');
  const inkLocation = gl.getUniformLocation(program, 'uInk');
  const paint = () => {
    const colors = dustColors();
    gl.uniform3fv(baseLocation, colors.base);
    gl.uniform3fv(accentLocation, colors.accent);
    gl.uniform1f(inkLocation, isLight() ? 1 : 0);
  };
  paint();
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  const hero = canvas.closest<HTMLElement>('.hero');
  /** Надпись VANTEGRA: в её центре взрывается вихрь */
  const wordmark = document.querySelector<SVGSVGElement>('[data-brand-stage] svg');
  const still = prefersReducedMotion();
  // Переход к надписи: холст закреплён на экране, вихрь ведём сами (без reduced motion)
  const follow = Boolean(hero) && !still;
  if (follow) canvas.classList.add('is-fixed');

  /** Положение на странице, px: центр знака и центр надписи в момент остановки (без учёта прокрутки) */
  let originX = 0;
  let originY = 0;
  let targetY = 0;
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
    resetTarget();
    targetY = (follow && targetCenter()) || originY;
    const unit = rimInLogoWidths * logo.offsetWidth;
    gl.uniform2f(uniforms.scale, (unit * 2) / boxW, (unit * 2) / boxH);
    gl.uniform1f(uniforms.dot, DOT * ratio);
    gl.uniform2f(uniforms.viewport, boxW, boxH);
    gl.uniform1f(uniforms.clearRadius, narrow ? 40 : 72);
    gl.uniform1f(uniforms.feather, narrow ? 64 : 110);
  };

  /** Взрыв: момент начала (performance.now) и доля 0…1; сбрасывается, если вернуться выше остановки */
  let burstStart: number | null = null;
  let burst = 0;
  let burstT = 0;
  let progress = 0;

  const place = (now: number) => {
    const scroll = follow ? window.scrollY : 0;
    progress = follow ? heroProgress() : 0;
    const eased = smooth(progress);
    const collapse = follow ? collapseOf(progress) : 0;
    gl.uniform1f(uniforms.collapse, collapse);
    gl.uniform1f(uniforms.spin, 9 * collapse * collapse);

    // центр вихря: сначала вместе со знаком, к остановке — в центре надписи
    let centerX = originX;
    let centerY = originY - scroll + (targetY - originY) * eased;
    const landed = follow && wordmark && scroll >= landingScroll();
    if (landed && wordmark) {
      // надпись остановилась (а потом уходит вверх) — взрыв в её центре
      const box = canvas.getBoundingClientRect();
      const svg = wordmark.getBoundingClientRect();
      centerX = svg.left + svg.width / 2 - box.left;
      centerY = svg.top + svg.height / 2 - box.top;
      if (burstStart === null) burstStart = now;
      burstT = Math.min(1, (now - burstStart) / BURST_MS);
      burst = 1 - Math.pow(1 - burstT, 3);
      const halfW = Math.max(svg.width * 0.8, boxW * 0.42);
      const halfH = boxH * 0.36;
      gl.uniform2f(uniforms.burstSize, (halfW / boxW) * 2, (halfH / boxH) * 2);
    } else {
      burstStart = null;
      burst = 0;
      burstT = 0;
    }
    gl.uniform1f(uniforms.burst, burst);
    gl.uniform1f(uniforms.burstT, burstT);
    gl.uniform2f(uniforms.center, (centerX / boxW) * 2 - 1, 1 - (centerY / boxH) * 2);

    // чистая зона за текстом первого экрана гаснет вместе с текстом
    gl.uniform1f(uniforms.clearMix, fadeOf(eased));
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
  };

  let time = 0;
  let last = 0;
  let raf = 0;
  /** Рисовать есть что: первый экран ещё виден или взрыв не догорел */
  const alive = () => !follow || progress < 1 || (burstStart !== null && burstT < 1);
  const draw = (now = performance.now()) => {
    place(now);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!alive()) return;
    gl.uniform1f(uniforms.time, time);
    gl.drawArrays(gl.POINTS, 0, count);
  };
  const frame = (now: number) => {
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    time += dt;
    draw(now);
    raf = alive() ? requestAnimationFrame(frame) : 0;
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
  // открыли страницу уже ниже надписи — взрыв не показываем
  if (follow && window.scrollY > landingScroll() + window.innerHeight) {
    burstStart = -Infinity;
  }
  draw();
  canvas.classList.add('is-ready');

  const resizeObserver = new ResizeObserver(() => {
    layout();
    if (!raf) draw();
  });
  // смена темы — перекрасить пыль сразу
  const onTheme = () => {
    paint();
    if (!raf) draw();
  };
  window.addEventListener('vantegra:theme', onTheme);
  resizeObserver.observe(canvas);
  resizeObserver.observe(document.body);

  let cleanupVisibility: () => void;
  if (follow && hero) {
    // закреплённый холст всегда «на экране»: рисуем, пока виден первый экран или идёт взрыв
    const onScroll = () => {
      if (raf) return;
      draw();
      if (alive()) run();
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
    cleanupVisibility();
    resizeObserver.disconnect();
    window.removeEventListener('vantegra:theme', onTheme);
    canvas.classList.remove('is-fixed');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  };
});
