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
 * - при прокрутке диск сплющивается до тонкой полосы — «орбита ложится в линию» (hero-scroll.ts),
 *   на подлёте к надписи VANTEGRA линия стягивается в плотное скопление, а когда надпись встаёт
 *   в центр — взрыв: пыль разлетается вокруг надписи, осколки гаснут, часть пылинок остаётся
 *   кружить рядом с надписью и уходит вместе с ней;
 *   при prefers-reduced-motion — неподвижный кадр.
 */
import { fadeOf, heroProgress, landingScroll, resetTarget, smooth, squashOf, straightOf, targetCenter } from './hero-scroll.ts';
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
uniform float uStraight;     // 0 — наклон −12°, 1 — горизонталь (выпрямляется раньше, чем сплющивается)
uniform float uGather;       // 0…1 — на подлёте линия стягивается в плотное скопление в центре надписи
uniform float uCloud;        // 0 — пыль первого экрана, 1 — облако у надписи (надпись остановилась)
uniform float uBurst;        // 0…1 — взрыв: из скопления наружу и на орбиту облака
uniform vec2 uCloudCenter;   // центр надписи, NDC
uniform vec2 uCloudSize;     // полуоси облака, NDC
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
const float KEEP = 0.16;     // доля пылинок, которые остаются кружить у надписи; остальные — осколки взрыва

void main() {
  float r = 1.0 + (uRout - 1.0) * pow(aSeed.x, 1.25);
  float f = (r - 1.0) / (uRout - 1.0);
  float th = aSeed.y + ORBIT * pow(r, -1.5) * uTime;
  float armAngle = ARMS * (th - WIND * log(r)) - SPIN * uTime;
  th -= PULL * sin(armAngle) / ARMS;
  float arm = pow(0.5 + 0.5 * cos(armAngle), SHARP);
  // сплющиваясь, рукава выравниваются по яркости: линия ровная, без отдельных полос
  arm = mix(arm, 0.55, uFlat);

  vec2 disc = vec2(r * cos(th), r * sin(th) * TILT * (1.0 - 0.96 * uFlat));
  // сплющиваясь, полоса выпрямляется из −12° в горизонталь — и ложится ровно на линию блока
  float roll = ROLL * (1.0 - uStraight);
  float c = cos(roll);
  float s = sin(roll);
  vec2 screen = vec2(c * disc.x - s * disc.y, s * disc.x + c * disc.y);
  // на подлёте линия стягивается к центру в плотное скопление: взрыв начнётся из одной точки
  screen *= vec2(mix(1.0, 0.03, uGather), mix(1.0, 0.4, uGather));
  vec2 ndc = uCenter + screen * uScale;

  // облако у надписи: пылинки кружат по эллипсу вокруг неё, осколки разлетаются дальше и гаснут
  float keep = step(aSeed.z, KEEP);
  float e = uBurst;
  if (uCloud > 0.0) {
    float turn = (0.05 + 0.06 * aSeed.w) * (aSeed.x > 0.5 ? 1.0 : -1.0);
    float phi = aSeed.y + uTime * turn;
    // облако неровное: разный радиус и высота у каждой пылинки, лёгкое «дыхание»
    float rho = mix(0.28, 1.1, pow(aSeed.w, 0.7)) * mix(2.5, 1.0, keep);
    rho *= 1.0 + 0.07 * sin(uTime * 0.5 + aSeed.z * 23.0);
    vec2 dir = vec2(cos(phi), sin(phi) * mix(0.7, 1.2, fract(aSeed.x * 7.13)));
    vec2 drift = vec2(sin(uTime * 0.6 + aSeed.x * 37.0), cos(uTime * 0.45 + aSeed.z * 53.0)) * 0.05;
    vec2 cloud = uCloudCenter + (dir * rho + drift) * uCloudSize;
    // выброс наружу с перелётом и мягким возвратом на орбиту облака
    vec2 puff = dir * uCloudSize * 0.7 * sin(3.14159265 * min(e * 1.15, 1.0));
    ndc = mix(ndc, mix(ndc, cloud, e) + puff * (1.0 - 0.35 * e), uCloud);
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
  float discAlpha = radial * (0.25 + 0.75 * arm) * mix(0.78, 1.0, far) * (0.55 + 0.45 * aSeed.z) * 0.95 * clearFade
    * (1.0 - 0.45 * uFlat) * mix(1.0, 0.5, uGather);
  float debris = 1.0 - smoothstep(0.35, 0.95, e);
  float mote = (0.3 + 0.45 * aSeed.w) * clearFade;
  float cloudAlpha = mix(discAlpha * debris, mix(discAlpha, mote, smoothstep(0.2, 0.8, e)), keep);
  vAlpha = mix(discAlpha, cloudAlpha, uCloud);
  vMix = clamp(arm * 0.9 + (1.0 - f) * 0.25, 0.0, 1.0);
  gl_PointSize = uDot * (0.65 + 0.7 * aSeed.w) * mix(1.15, 0.9, far)
    * (1.0 + 0.3 * uCloud * (1.0 - keep) * sin(3.14159265 * e));
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
    straight: gl.getUniformLocation(program, 'uStraight'),
    gather: gl.getUniformLocation(program, 'uGather'),
    cloud: gl.getUniformLocation(program, 'uCloud'),
    burst: gl.getUniformLocation(program, 'uBurst'),
    cloudCenter: gl.getUniformLocation(program, 'uCloudCenter'),
    cloudSize: gl.getUniformLocation(program, 'uCloudSize'),
  };
  gl.uniform1f(gl.getUniformLocation(program, 'uRout'), narrow ? ROUT_MOBILE : ROUT_DESKTOP);
  gl.uniform3fv(gl.getUniformLocation(program, 'uBase'), ASH);
  gl.uniform3fv(gl.getUniformLocation(program, 'uAccent'), CHALK);
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  const hero = canvas.closest<HTMLElement>('.hero');
  /** Надпись VANTEGRA: сцена (останавливается в центре), SVG и рамка букв в единицах viewBox */
  const track = document.querySelector<HTMLElement>('[data-brand-track]');
  const stage = track?.querySelector<HTMLElement>('[data-brand-stage]') ?? null;
  const wordmark = stage?.querySelector<SVGSVGElement>('svg') ?? null;
  const lettersBox = (wordmark?.dataset.letters ?? '').split(' ').map(Number);
  const viewWidth = Number(wordmark?.viewBox.baseVal.width) || 1;
  const viewHeight = Number(wordmark?.viewBox.baseVal.height) || 1;
  const still = prefersReducedMotion();
  // Переход к блокам: холст закреплён на экране, диск ведём к линии сами (без reduced motion)
  const follow = Boolean(hero) && !still;
  if (follow) canvas.classList.add('is-fixed');

  /** Положение на странице, px: центр знака и средняя линия надписи (без учёта прокрутки) */
  let originX = 0;
  let originY = 0;
  let ruleY = 0;
  let boxW = 1;
  let boxH = 1;
  let ratio = 1;
  /** Длина остановки надписи, px — на неё приходится взрыв */
  let pin = 1;

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
    // центр надписи VANTEGRA в момент, когда она останавливается в центре экрана
    resetTarget();
    ruleY = (follow && targetCenter()) || originY;
    const unit = rimInLogoWidths * logo.offsetWidth;
    gl.uniform2f(uniforms.scale, (unit * 2) / boxW, (unit * 2) / boxH);
    gl.uniform1f(uniforms.dot, DOT * ratio);
    gl.uniform2f(uniforms.viewport, boxW, boxH);
    gl.uniform1f(uniforms.clearRadius, narrow ? 40 : 72);
    gl.uniform1f(uniforms.feather, narrow ? 64 : 110);
    pin = track ? Math.max(1, parseFloat(getComputedStyle(track, '::after').height) || 1) : 1;
  };

  /** Облако у надписи: центр и полуоси в NDC, чистая зона — над буквами (пылинки там реже) */
  let cloudVisible = false;
  const placeCloud = (scroll: number) => {
    if (!stage || !wordmark) {
      gl.uniform1f(uniforms.cloud, 0);
      return;
    }
    const landing = landingScroll();
    const q = Math.min(1, Math.max(0, (scroll - landing) / pin));
    const inCloud = scroll >= landing ? 1 : 0;
    const svgBox = wordmark.getBoundingClientRect();
    const box = canvas.getBoundingClientRect();
    const cx = svgBox.left + svgBox.width / 2 - box.left;
    const cy = svgBox.top + svgBox.height / 2 - box.top;
    const halfW = svgBox.width * 0.62;
    const halfH = Math.max(svgBox.height * 0.78, narrow ? 70 : 110);
    cloudVisible = cy + halfH * 2.2 > 0 && cy - halfH * 2.2 < boxH;
    gl.uniform1f(uniforms.cloud, inCloud);
    // взрыв — в первой трети остановки: резкий старт, мягкое торможение
    const burst = Math.min(1, q / 0.32);
    gl.uniform1f(uniforms.burst, 1 - Math.pow(1 - burst, 3));
    gl.uniform2f(uniforms.cloudCenter, (cx / boxW) * 2 - 1, 1 - (cy / boxH) * 2);
    gl.uniform2f(uniforms.cloudSize, (halfW / boxW) * 2, (halfH / boxH) * 2);
    if (inCloud && lettersBox.length === 4) {
      const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = lettersBox;
      const sx = svgBox.width / viewWidth;
      const sy = svgBox.height / viewHeight;
      gl.uniform4f(
        uniforms.clear,
        svgBox.left - box.left + ((x0 + x1) / 2) * sx,
        svgBox.top - box.top + ((y0 + y1) / 2) * sy,
        ((x1 - x0) / 2) * sx + 8,
        ((y1 - y0) / 2) * sy + 8,
      );
      gl.uniform1f(uniforms.clearMix, 0.85);
      gl.uniform1f(uniforms.clearRadius, 16);
      gl.uniform1f(uniforms.feather, 36);
    }
  };

  /** Доля перехода 0…1 и сглаженная доля */
  let progress = 0;
  const place = () => {
    progress = follow ? heroProgress() : 0;
    const eased = smooth(progress);
    const scroll = follow ? window.scrollY : 0;
    // центр: сначала вместе со знаком, к концу перехода — на линии следующего блока
    const centerY = originY - scroll + (ruleY - originY) * eased;
    gl.uniform2f(uniforms.center, (originX / boxW) * 2 - 1, 1 - (centerY / boxH) * 2);
    // сплющивается раньше, чем доезжает: последние доли перехода на линию скользит уже тонкая полоса
    gl.uniform1f(uniforms.flat, squashOf(progress));
    gl.uniform1f(uniforms.straight, straightOf(progress));
    // на подлёте к надписи линия стягивается в плотное скопление
    gl.uniform1f(uniforms.gather, smooth(Math.min(1, Math.max(0, (progress - 0.62) / 0.38))));
    // чистая зона гаснет вместе с текстом первого экрана
    gl.uniform1f(uniforms.clearMix, fadeOf(eased));
    gl.uniform1f(uniforms.clearRadius, narrow ? 40 : 72);
    gl.uniform1f(uniforms.feather, narrow ? 64 : 110);
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
    // после остановки надписи — облако вокруг неё (чистая зона переезжает на буквы)
    if (follow) placeCloud(scroll);
    else gl.uniform1f(uniforms.cloud, 0);
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
    // облако ушло за край экрана вместе с надписью — не рисуем, пока не вернутся
    if (follow && progress >= 1 && !cloudVisible) {
      raf = 0;
      gl.clear(gl.COLOR_BUFFER_BIT);
      return;
    }
    raf = requestAnimationFrame(frame);
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
  resizeObserver.observe(document.body);

  let cleanupVisibility: () => void;
  if (follow && hero) {
    // закреплённый холст всегда «на экране»: рисуем, пока виден первый экран или облако у надписи
    const onScroll = () => {
      if (raf) return;
      draw();
      if (heroProgress() < 1 || cloudVisible) run();
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
