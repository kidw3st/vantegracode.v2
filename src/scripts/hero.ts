/**
 * Вращающийся знак на первом экране (правки владельца 03.10.2026).
 * Модель из Blender (tools/hero-mark.py → public/media/hero-mark.bin) рисуется в реальном времени:
 * прозрачный фон, все грани — мел #F4F2EE, оборот за 10 с вокруг вертикальной оси,
 * плавно на частоте экрана и без остановок, пока первый экран виден.
 * До первого кадра и без WebGL / при reduced motion стоит плоский SVG-знак — в анфас они совпадают.
 */
import { onPage, prefersReducedMotion } from './lifecycle.ts';

/** Оборот за 10 секунд */
const SPEED = (2 * Math.PI) / 10;
/** Камера как в Blender: фокус 135 мм, кадр 36 мм, видимая ширина 2,25 ед. (знак — 2,0) */
const FOCAL = 135;
const SENSOR = 36;
const VIEW_W = 2.25;
const DISTANCE = (VIEW_W * FOCAL) / SENSOR;
/** Мел #F4F2EE */
const CHALK: [number, number, number] = [244 / 255, 242 / 255, 238 / 255];

/** Угол сохраняется между кадрами и паузами — вращение продолжается с того же места */
let angle = 0;

const VERTEX = `
attribute vec3 a_position;
uniform mat4 u_matrix;
void main() { gl_Position = u_matrix * vec4(a_position, 1.0); }`;

const FRAGMENT = `
precision mediump float;
uniform vec3 u_color;
void main() { gl_FragColor = vec4(u_color, 1.0); }`;

interface Mesh {
  positions: Float32Array;
  indices: Uint16Array;
}

function parseMesh(buffer: ArrayBuffer): Mesh {
  const view = new DataView(buffer);
  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (magic !== 'VMK1') throw new Error('hero-mark.bin: неизвестный формат');
  const vertexCount = view.getUint32(4, true);
  const indexCount = view.getUint32(8, true);
  const positions = new Float32Array(buffer, 12, vertexCount * 3);
  const indices = new Uint16Array(buffer, 12 + vertexCount * 12, indexCount);
  return { positions, indices };
}

/** Перспектива × камера × поворот вокруг вертикальной оси (матрица по столбцам) */
function matrix(aspect: number, rotation: number): Float32Array {
  const fx = (2 * FOCAL) / SENSOR;
  const fy = fx * aspect;
  const near = 0.1;
  const far = DISTANCE * 4;
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  const a = (far + near) / (near - far);
  const b = (2 * far * near) / (near - far);
  // P · T(0, 0, −DISTANCE) · Ry(rotation)
  return new Float32Array([
    fx * c, 0, -a * s, s,
    0, fy, 0, 0,
    fx * s, 0, a * c, -c,
    0, 0, -a * DISTANCE + b, DISTANCE,
  ]);
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
  const canvas = document.querySelector<HTMLCanvasElement>('[data-hero-canvas]');
  const art = canvas?.closest<HTMLElement>('.hero__art');
  if (!canvas || !art || prefersReducedMotion()) return;

  const gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: 'low-power' });
  if (!gl) return;

  let raf = 0;
  let last = 0;
  let visible = false;
  let disposed = false;
  let count = 0;
  let matrixLocation: WebGLUniformLocation | null = null;

  const resize = () => {
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.round(canvas.clientWidth * ratio);
    const height = Math.round(canvas.clientHeight * ratio);
    if (width && height && (canvas.width !== width || canvas.height !== height)) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
  };

  const draw = () => {
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(matrixLocation, false, matrix(canvas.width / canvas.height, angle));
    gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, 0);
  };

  const frame = (now: number) => {
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    angle = (angle + dt * SPEED) % (2 * Math.PI);
    draw();
    raf = requestAnimationFrame(frame);
  };

  const start = () => {
    if (raf || disposed || !count) return;
    last = 0;
    raf = requestAnimationFrame(frame);
  };
  const stop = () => {
    cancelAnimationFrame(raf);
    raf = 0;
  };

  const observer = new IntersectionObserver(([entry]) => {
    visible = Boolean(entry?.isIntersecting);
    if (visible) start();
    else stop();
  });
  const resizeObserver = new ResizeObserver(() => {
    resize();
    if (!raf && count) draw();
  });

  const setup = async () => {
    const response = await fetch(canvas.dataset.src ?? '/media/hero-mark.bin');
    if (!response.ok || disposed) return;
    const mesh = parseMesh(await response.arrayBuffer());
    if (disposed) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
    const location = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 3, gl.FLOAT, false, 0, 0);

    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    count = mesh.indices.length;

    matrixLocation = gl.getUniformLocation(program, 'u_matrix');
    gl.uniform3fv(gl.getUniformLocation(program, 'u_color'), CHALK);
    gl.enable(gl.DEPTH_TEST);

    resize();
    draw();
    // первый кадр совпадает с плоским знаком — подменяем без «вспышки»
    art.classList.add('is-3d');
    resizeObserver.observe(canvas);
    observer.observe(canvas);
  };

  const onLost = (event: Event) => {
    event.preventDefault();
    stop();
    art.classList.remove('is-3d');
  };
  canvas.addEventListener('webglcontextlost', onLost);

  setup().catch(() => art.classList.remove('is-3d'));

  return () => {
    disposed = true;
    stop();
    observer.disconnect();
    resizeObserver.disconnect();
    canvas.removeEventListener('webglcontextlost', onLost);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  };
});
