"""
Модель вращающегося знака Vantegra для первого экрана (правки владельца 03.10.2026).

Знак (V и орбита) строится в Blender прямо из контуров SVG владельца
(src/assets/brand/logo/vantegra-mark-chalk.svg): тонкое тиснение, все грани одного цвета — мел.
Blender моделирует, а вращение рисуется на странице в реальном времени (src/scripts/mark-3d.ts):
прозрачный фон без «квадрата», плавно на частоте экрана, без стыков петли.

Запуск (Blender 5.2):
  blender -b --factory-startup --python tools/hero-mark.py
  blender -b --factory-startup --python tools/hero-mark.py -- --preview <папка>   # контрольные кадры

Результат:
  public/media/hero-mark.bin — меш: заголовок «VMK1», число вершин и индексов,
  координаты Float32 (x вправо, y вверх, z к зрителю; ширина viewBox знака = 2,0), индексы Uint16.
"""

import math
import os
import re
import struct
import sys

import bmesh
import bpy

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SVG = os.path.join(ROOT, "src", "assets", "brand", "logo", "vantegra-mark-chalk.svg")
OUT_MESH = os.path.join(ROOT, "public", "media", "hero-mark.bin")

DEPTH = 0.025        # половина толщины тиснения (ширина viewBox знака = 2,0)
TOLERANCE = 0.2      # упрощение контура в единицах SVG: глазу не видно, меш в десятки раз легче

# Контрольные кадры: та же камера, что и на странице
WIDTH, HEIGHT = 720, 560
VIEW_W = 2.25
FOCAL = 135
SENSOR = 36
CHALK = "#F4F2EE"
SOOT = "#111111"


def srgb_to_linear(value: float) -> float:
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def linear(hex_color: str) -> tuple:
    channels = [int(hex_color[i : i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(srgb_to_linear(c) for c in channels) + (1.0,)


def simplify(points: list, tolerance: float) -> list:
    """Дуглас — Пекер для замкнутого контура: делим на две половины по самой дальней точке."""

    def segment_distance(p, a, b):
        ax, ay = a
        bx, by = b
        px, py = p
        dx, dy = bx - ax, by - ay
        length = dx * dx + dy * dy
        if length == 0:
            return math.hypot(px - ax, py - ay)
        t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length))
        return math.hypot(px - (ax + t * dx), py - (ay + t * dy))

    def open_dp(chain: list) -> list:
        keep = [False] * len(chain)
        keep[0] = keep[-1] = True
        stack = [(0, len(chain) - 1)]
        while stack:
            start, end = stack.pop()
            best, index = 0.0, -1
            for i in range(start + 1, end):
                d = segment_distance(chain[i], chain[start], chain[end])
                if d > best:
                    best, index = d, i
            if best > tolerance and index > 0:
                keep[index] = True
                stack.append((start, index))
                stack.append((index, end))
        return [p for p, k in zip(chain, keep) if k]

    far = max(range(len(points)), key=lambda i: math.hypot(points[i][0] - points[0][0], points[i][1] - points[0][1]))
    first = open_dp(points[: far + 1])
    second = open_dp(points[far:] + [points[0]])
    return first[:-1] + second[:-1]


def build_mark() -> bpy.types.Object:
    svg = open(SVG, encoding="utf-8").read()
    view_box = [float(v) for v in re.search(r'viewBox="([^"]+)"', svg).group(1).split()]
    scale = 2.0 / view_box[2]
    cx, cy = view_box[2] / 2, view_box[3] / 2

    curve = bpy.data.curves.new("mark", "CURVE")
    curve.dimensions = "2D"
    curve.fill_mode = "BOTH"
    curve.extrude = DEPTH
    curve.bevel_depth = 0.0

    total_in, total_out = 0, 0
    for path in re.findall(r'<path[^>]* d="([^"]+)"', svg):
        for sub in re.findall(r"M[^M]*", path):
            numbers = [float(n) for n in re.findall(r"-?\d+(?:\.\d+)?", sub)]
            points = list(zip(numbers[0::2], numbers[1::2]))
            if len(points) > 1 and points[0] == points[-1]:
                points = points[:-1]
            if len(points) < 3:
                continue
            total_in += len(points)
            points = simplify(points, TOLERANCE)
            total_out += len(points)
            spline = curve.splines.new("POLY")
            spline.points.add(len(points) - 1)
            for point, (x, y) in zip(spline.points, points):
                point.co = ((x - cx) * scale, (cy - y) * scale, 0.0, 1.0)
            spline.use_cyclic_u = True
    print(f"[hero-mark] контур: {total_in} → {total_out} точек")

    mark = bpy.data.objects.new("mark", curve)
    bpy.context.scene.collection.objects.link(mark)
    return mark


def export_mesh(mark: bpy.types.Object) -> None:
    """Кривая → треугольный меш → бинарный файл для WebGL."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(mark.evaluated_get(depsgraph))
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.verts.index_update()
    positions = [c for v in bm.verts for c in (v.co.x, v.co.y, v.co.z)]
    indices = [v.index for f in bm.faces for v in f.verts]
    vertex_count, index_count = len(bm.verts), len(indices)
    bm.free()
    if vertex_count >= 65536:
        raise RuntimeError("Слишком много вершин для Uint16")

    os.makedirs(os.path.dirname(OUT_MESH), exist_ok=True)
    with open(OUT_MESH, "wb") as file:
        file.write(b"VMK1")
        file.write(struct.pack("<II", vertex_count, index_count))
        file.write(struct.pack(f"<{len(positions)}f", *positions))
        file.write(struct.pack(f"<{index_count}H", *indices))
        if index_count % 2:
            file.write(b"\0\0")
    print(f"[hero-mark] меш: {vertex_count} вершин, {index_count // 3} треугольников, {os.path.getsize(OUT_MESH) // 1024} КБ")


def render_preview(mark: bpy.types.Object, folder: str) -> None:
    """Контрольные кадры: мел на саже, камера как на странице."""
    scene = bpy.context.scene
    material = bpy.data.materials.new("chalk")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Color"].default_value = linear(CHALK)
    output = nodes.new("ShaderNodeOutputMaterial")
    material.node_tree.links.new(emission.outputs["Emission"], output.inputs["Surface"])
    mark.data.materials.append(material)

    world = bpy.data.worlds.new("soot")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = linear(SOOT)

    camera_data = bpy.data.cameras.new("camera")
    camera_data.lens = FOCAL
    camera_data.sensor_width = SENSOR
    camera_data.sensor_fit = "HORIZONTAL"
    camera = bpy.data.objects.new("camera", camera_data)
    camera.location = (0.0, 0.0, VIEW_W * FOCAL / SENSOR)
    scene.collection.objects.link(camera)
    scene.camera = camera

    render = scene.render
    render.engine = "BLENDER_EEVEE"
    render.resolution_x, render.resolution_y = WIDTH, HEIGHT
    render.image_settings.media_type = "IMAGE"
    render.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"

    os.makedirs(folder, exist_ok=True)
    for degrees in (0, 35, 75, 110, 180):
        mark.rotation_euler = (0.0, math.radians(-degrees), 0.0)
        render.filepath = os.path.join(folder, f"angle-{degrees:03d}.png")
        bpy.ops.render.render(write_still=True)


args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
bpy.ops.wm.read_factory_settings(use_empty=True)
mark_object = build_mark()
export_mesh(mark_object)
if "--preview" in args:
    render_preview(mark_object, args[args.index("--preview") + 1])
print("[hero-mark] готово")
