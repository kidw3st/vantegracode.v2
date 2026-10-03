"""
Рендер вращающегося знака Vantegra для первого экрана (правка владельца 03.10.2026).

Знак строится прямо из контуров SVG владельца (src/assets/brand/logo/vantegra-mark-chalk.svg):
тонкое тиснение с фаской, без хрома — в анфас совпадает с плоским знаком мелом.
Шейдер — по углу к камере: лицом к камере мел #F4F2EE, при повороте — к пеплу и графиту.
Фон кадра — ровно #111111. Один оборот вокруг вертикальной оси, бесшовная петля.

Запуск (Blender 5.2):
  blender -b --factory-startup --python tools/hero-mark.py
  blender -b --factory-startup --python tools/hero-mark.py -- --preview <папка>   # кадры 0°, 30°, 70°, 110°, 180°

Результат:
  public/media/hero-mark.webm, public/media/hero-mark.mp4 — видео для первого экрана
  src/assets/hero/hero-mark-poster.png — первый кадр (анфас): заставка и кадр для reduced motion
"""

import math
import os
import re
import shutil
import sys
import tempfile

import bpy

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SVG = os.path.join(ROOT, "src", "assets", "brand", "logo", "vantegra-mark-chalk.svg")
OUT_MEDIA = os.path.join(ROOT, "public", "media")
OUT_POSTER = os.path.join(ROOT, "src", "assets", "hero", "hero-mark-poster.png")

WIDTH, HEIGHT = 720, 560      # кадр; знак шириной 640 px
VIEW_W = 2.25                 # видимая ширина кадра в единицах сцены; знак — 2.0
FPS = 30
SECONDS = 6                   # один оборот
FRAMES = FPS * SECONDS
FOCAL = 135                   # длинный фокус: в анфас почти без перспективных искажений
SENSOR = 36
DEPTH = 0.025                 # половина толщины тиснения (знак шириной 2.0)
BEVEL = 0.005

SOOT = "#111111"
CHALK = "#F4F2EE"
ASH = "#8C8984"
GRAPHITE = "#2A2A2A"


def srgb_to_linear(value: float) -> float:
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def linear(hex_color: str) -> tuple:
    channels = [int(hex_color[i : i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(srgb_to_linear(c) for c in channels) + (1.0,)


def build_mark() -> bpy.types.Object:
    svg = open(SVG, encoding="utf-8").read()
    view_box = [float(v) for v in re.search(r'viewBox="([^"]+)"', svg).group(1).split()]
    scale = 2.0 / view_box[2]
    cx, cy = view_box[2] / 2, view_box[3] / 2

    curve = bpy.data.curves.new("mark", "CURVE")
    curve.dimensions = "2D"
    curve.fill_mode = "BOTH"
    curve.extrude = DEPTH
    curve.bevel_depth = BEVEL
    curve.bevel_resolution = 3

    for path in re.findall(r'<path[^>]* d="([^"]+)"', svg):
        for sub in re.findall(r"M[^M]*", path):
            numbers = [float(n) for n in re.findall(r"-?\d+(?:\.\d+)?", sub)]
            points = list(zip(numbers[0::2], numbers[1::2]))
            if len(points) > 1 and points[0] == points[-1]:
                points = points[:-1]
            if len(points) < 3:
                continue
            spline = curve.splines.new("POLY")
            spline.points.add(len(points) - 1)
            for point, (x, y) in zip(spline.points, points):
                point.co = ((x - cx) * scale, (cy - y) * scale, 0.0, 1.0)
            spline.use_cyclic_u = True

    material = bpy.data.materials.new("chalk")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Strength"].default_value = 1.0
    weight = nodes.new("ShaderNodeLayerWeight")
    weight.inputs["Blend"].default_value = 0.5
    ramp = nodes.new("ShaderNodeValToRGB")
    elements = ramp.color_ramp.elements
    elements[0].position = 0.0
    elements[0].color = linear(CHALK)
    elements[1].position = 1.0
    elements[1].color = linear(GRAPHITE)
    keep = elements.new(0.18)
    keep.color = linear(CHALK)
    turn = elements.new(0.72)
    turn.color = linear(ASH)
    links.new(weight.outputs["Facing"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], emission.inputs["Color"])
    links.new(emission.outputs["Emission"], output.inputs["Surface"])
    curve.materials.append(material)

    mark = bpy.data.objects.new("mark", curve)
    bpy.context.scene.collection.objects.link(mark)
    # кривая лежит в XY; ставим знак вертикально, лицом к камере (−Y)
    mark.rotation_euler = (math.radians(90), 0.0, 0.0)
    return mark


def build_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene

    world = bpy.data.worlds.new("soot")
    scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = linear(SOOT)
    background.inputs["Strength"].default_value = 1.0

    mark = build_mark()
    pivot = bpy.data.objects.new("pivot", None)
    scene.collection.objects.link(pivot)
    mark.parent = pivot

    # равномерный оборот 0 → 360° за FRAMES кадров; кадр FRAMES+1 совпадает с первым
    bpy.context.preferences.edit.keyframe_new_interpolation_type = "LINEAR"
    pivot.rotation_euler = (0.0, 0.0, 0.0)
    pivot.keyframe_insert("rotation_euler", index=2, frame=1)
    pivot.rotation_euler = (0.0, 0.0, -2 * math.pi)
    pivot.keyframe_insert("rotation_euler", index=2, frame=FRAMES + 1)

    camera_data = bpy.data.cameras.new("camera")
    camera_data.lens = FOCAL
    camera_data.sensor_width = SENSOR
    camera_data.sensor_fit = "HORIZONTAL"
    distance = VIEW_W * FOCAL / SENSOR
    camera_data.clip_start = 0.1
    camera_data.clip_end = distance * 4
    camera = bpy.data.objects.new("camera", camera_data)
    camera.location = (0.0, -distance, 0.0)
    camera.rotation_euler = (math.radians(90), 0.0, 0.0)
    scene.collection.objects.link(camera)
    scene.camera = camera

    render = scene.render
    render.engine = "BLENDER_EEVEE"
    render.resolution_x = WIDTH
    render.resolution_y = HEIGHT
    render.resolution_percentage = 100
    render.fps = FPS
    render.film_transparent = False
    scene.frame_start = 1
    scene.frame_end = FRAMES
    scene.eevee.taa_render_samples = 32

    # цвета без тонального преобразования: мел и сажа выходят ровно своими значениями
    scene.display_settings.display_device = "sRGB"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0


def render_poster() -> None:
    scene = bpy.context.scene
    scene.frame_set(1)
    settings = scene.render.image_settings
    settings.media_type = "IMAGE"
    settings.file_format = "PNG"
    settings.color_mode = "RGB"
    settings.color_depth = "8"
    os.makedirs(os.path.dirname(OUT_POSTER), exist_ok=True)
    scene.render.filepath = OUT_POSTER
    bpy.ops.render.render(write_still=True)


def render_video(container: str, codec: str, crf: int, name: str) -> None:
    scene = bpy.context.scene
    render = scene.render
    # Blender 5: видео — отдельный тип медиа
    render.image_settings.media_type = "VIDEO"
    render.image_settings.file_format = "FFMPEG"
    render.ffmpeg.format = container
    render.ffmpeg.codec = codec
    render.ffmpeg.constant_rate_factor = "CUSTOM"
    render.ffmpeg.custom_constant_rate_factor = crf
    render.ffmpeg.ffmpeg_preset = "BEST"
    render.ffmpeg.gopsize = FPS
    render.ffmpeg.audio_codec = "NONE"

    temp_dir = tempfile.mkdtemp(prefix="vantegra-")
    render.filepath = os.path.join(temp_dir, "clip_")
    bpy.ops.render.render(animation=True)
    produced = [os.path.join(temp_dir, f) for f in os.listdir(temp_dir)]
    if not produced:
        raise RuntimeError(f"Видео {name} не записано")
    os.makedirs(OUT_MEDIA, exist_ok=True)
    target = os.path.join(OUT_MEDIA, name)
    shutil.move(max(produced, key=os.path.getsize), target)
    shutil.rmtree(temp_dir, ignore_errors=True)
    print(f"[hero-mark] {name}: {os.path.getsize(target) // 1024} КБ")


def render_preview(folder: str) -> None:
    scene = bpy.context.scene
    settings = scene.render.image_settings
    settings.file_format = "PNG"
    settings.color_mode = "RGB"
    os.makedirs(folder, exist_ok=True)
    for degrees in (0, 30, 70, 110, 180):
        scene.frame_set(1 + round(FRAMES * degrees / 360))
        scene.render.filepath = os.path.join(folder, f"angle-{degrees:03d}.png")
        bpy.ops.render.render(write_still=True)


args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
build_scene()
if "--preview" in args:
    render_preview(args[args.index("--preview") + 1])
else:
    render_poster()
    render_video("WEBM", "WEBM", 34, "hero-mark.webm")
    render_video("MPEG4", "H264", 24, "hero-mark.mp4")
print("[hero-mark] готово")
