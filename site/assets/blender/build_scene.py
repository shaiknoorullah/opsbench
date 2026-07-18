"""
opsbench — headless Blender scene build + Cycles bake pipeline.

Builds the evidence-hall set (floor, plinth, monolith, gate, flanking slabs),
lights it like a film set, then path-traces the lighting into per-object
lightmaps + AO maps and a Radiance-HDR environment probe, and exports the
static set as a glb. Run:

    python3 assets/blender/build_scene.py            # full bake (slow, CI/local)
    FAST_BAKE=1 python3 assets/blender/build_scene.py  # low-sample preview bake

Outputs land in  site/public/assets/baked/ :
    set.glb                     static geometry (uv0 + uv1 lightmap UVs)
    lm_<name>.png               lightmaps  (linear, scaled 0.5 -> lightMapIntensity 2.0)
    ao_<name>.png               ambient occlusion maps
    env_hall.hdr                equirect environment probe (RGBE)

Coordinate map: Blender is Z-up, +Y is "into the scene".
three.js is Y-up, -Z into the scene; the glTF exporter converts.
So three (x, y, z) == blender (x, -z, y).  Gate at three z=-16 -> blender y=+16.
"""

import math
import os
import sys

import bpy

# ————————————————————————————————————————————— config

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(ROOT, "..", "..", "public", "assets", "baked"))
os.makedirs(OUT, exist_ok=True)

FAST = os.environ.get("FAST_BAKE") == "1"
SAMPLES = 64 if FAST else 256
ENV_SAMPLES = 64 if FAST else 192

AMBER = (1.0, 0.62, 0.28)
WARM = (1.0, 0.83, 0.60)
COOL = (0.58, 0.70, 1.0)

# name -> lightmap resolution
BAKE_RES = {
    "Floor": 512 if FAST else 2048,
    "Monolith": 512 if FAST else 1024,
    "Plinth": 256 if FAST else 512,
    "Gate": 256 if FAST else 512,
    "SlabL": 256 if FAST else 512,
    "SlabR": 256 if FAST else 512,
}


def log(msg):
    print(f"[bake] {msg}", flush=True)


# ————————————————————————————————————————————— scene reset

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = SAMPLES
scene.cycles.use_adaptive_sampling = True
scene.cycles.adaptive_threshold = 0.05
scene.render.bake.margin = 8
scene.render.bake.use_pass_direct = True
scene.render.bake.use_pass_indirect = True
scene.render.bake.use_pass_color = False


def make_material(name, base=(0.55, 0.55, 0.55), rough=0.45, metallic=0.0,
                  emission=None, emission_strength=0.0):
    """Bake-side material. Metals are baked as dielectrics on purpose:
    lightmaps carry diffuse GI only; the runtime layers metallic response."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*base, 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metallic
    if emission is not None:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


def add_bevel(obj, width=0.04, segments=3):
    m = obj.modifiers.new("Bevel", "BEVEL")
    m.width = width
    m.segments = segments
    m.limit_method = "ANGLE"
    m.angle_limit = math.radians(40)


def uv_setup(obj, lightmap=True):
    """uv0 via smart project (materials), uv1 'Lightmap' packed for bakes."""
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")
    if lightmap:
        lm = obj.data.uv_layers.new(name="Lightmap")
        obj.data.uv_layers.active = lm
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.035)
        bpy.ops.object.mode_set(mode="OBJECT")


def box(name, size, loc, mat, bevel=0.04):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    bpy.ops.object.transform_apply(scale=True)
    if bevel:
        add_bevel(o, bevel)
    o.data.materials.append(mat)
    return o


# ————————————————————————————————————————————— set build

log("building set…")

# floor — the polished evidence-room slab
bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 22, 0))
floor = bpy.context.active_object
floor.name = "Floor"
floor.scale = (30, 60, 1)
bpy.ops.object.transform_apply(scale=True)
mat_floor = make_material("floor", base=(0.35, 0.36, 0.40), rough=0.35)
floor.data.materials.append(mat_floor)

# plinth + monolith (three: monolith at z~0, front face toward camera at -y)
mat_stone = make_material("obsidian", base=(0.30, 0.31, 0.35), rough=0.32)
plinth = box("Plinth", (4.2, 2.2, 0.14), (0, 0, 0.07), mat_stone, bevel=0.03)
monolith = box("Monolith", (2.4, 0.7, 5.2), (0, 0, 2.74), mat_stone, bevel=0.045)

# wax seal — emissive disc set into the monolith face (bake light source)
bpy.ops.mesh.primitive_cylinder_add(radius=0.5, depth=0.03,
                                    location=(0, -0.37, 2.95),
                                    rotation=(math.radians(90), 0, 0))
seal = bpy.context.active_object
seal.name = "SealEmit"
seal.data.materials.append(
    make_material("seal", base=(0.05, 0.02, 0.0), emission=AMBER, emission_strength=28.0))

# the gate — standing ring at three z=-16 (blender y=+16)
bpy.ops.mesh.primitive_torus_add(major_radius=2.3, minor_radius=0.16,
                                 major_segments=96, minor_segments=24,
                                 location=(0, 16, 2.3),
                                 rotation=(math.radians(90), 0, 0))
gate = bpy.context.active_object
gate.name = "Gate"
gate.data.materials.append(make_material("gate_steel", base=(0.4, 0.42, 0.47), rough=0.4))

# inner ring emissive (bake light source, not exported)
bpy.ops.mesh.primitive_torus_add(major_radius=2.06, minor_radius=0.02,
                                 major_segments=96, minor_segments=12,
                                 location=(0, 16, 2.3),
                                 rotation=(math.radians(90), 0, 0))
ring = bpy.context.active_object
ring.name = "RingEmit"
ring.data.materials.append(
    make_material("ring", base=(0.05, 0.02, 0.0), emission=AMBER, emission_strength=14.0))

# flanking slabs — composition depth, catch the rim light
mat_slab = make_material("slab", base=(0.28, 0.29, 0.33), rough=0.4)
slab_l = box("SlabL", (0.5, 3.4, 7.5), (-7.2, 7.5, 3.75), mat_slab, bevel=0.02)
slab_r = box("SlabR", (0.5, 3.0, 6.5), (7.4, 11.0, 3.25), mat_slab, bevel=0.02)

BAKED = [floor, plinth, monolith, gate, slab_l, slab_r]
for o in BAKED:
    uv_setup(o)

# ————————————————————————————————————————————— film lighting

log("lighting…")


def area_light(name, loc, rot, color, power, size):
    bpy.ops.object.light_add(type="AREA", location=loc, rotation=rot)
    li = bpy.context.active_object
    li.name = name
    li.data.color = color
    li.data.energy = power
    li.data.size = size
    return li


# warm key — high right, raking across the monolith face
area_light("Key", (7, -7, 11), (math.radians(-38), math.radians(28), 0), WARM, 900, 5)
# cool rim — low back left, edges the set from behind the gate
area_light("Rim", (-9, 20, 6), (math.radians(-60), math.radians(-35), 0), COOL, 420, 6)
# soft top fill, barely there
area_light("Fill", (0, 8, 14), (0, 0, 0), (0.7, 0.75, 0.85), 120, 12)


def pool_spot(name, y, power=260):
    bpy.ops.object.light_add(type="SPOT", location=(0, y, 12.5),
                             rotation=(0, 0, 0))
    s = bpy.context.active_object
    s.name = name
    s.data.color = WARM
    s.data.energy = power
    s.data.spot_size = math.radians(28)
    s.data.spot_blend = 0.6
    return s


# practicals — pools of warm light down the hall
pool_spot("Pool0", -0.5, 300)
pool_spot("Pool1", 16, 200)
pool_spot("Pool2", 34, 240)

# world: near-black cold ambient
world = bpy.data.worlds.new("hall")
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs["Color"].default_value = (0.010, 0.012, 0.018, 1.0)
bg.inputs["Strength"].default_value = 1.0

# ————————————————————————————————————————————— bake helpers


def save_image_png(img, path):
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()


def prep_bake_target(obj, img):
    """Give every material on obj an active image-texture node aimed at img."""
    for slot in obj.material_slots:
        nt = slot.material.node_tree
        node = nt.nodes.get("BakeTarget")
        if node is None:
            node = nt.nodes.new("ShaderNodeTexImage")
            node.name = "BakeTarget"
        node.image = img
        nt.nodes.active = node
    obj.data.uv_layers.active = obj.data.uv_layers["Lightmap"]


def select_only(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def compress_to_ldr(img, scale=0.5):
    """Scale float bake into 0..1 for PNG; runtime uses lightMapIntensity=1/scale."""
    import numpy as np
    px = np.empty(len(img.pixels), dtype=np.float32)
    img.pixels.foreach_get(px)
    rgb = px.reshape(-1, 4)
    rgb[:, :3] = np.clip(rgb[:, :3] * scale, 0.0, 1.0)
    # blue-noise-ish dither to kill banding in the deep darks
    rng = np.random.default_rng(7)
    rgb[:, :3] += (rng.random(rgb[:, :3].shape, dtype=np.float32) - 0.5) / 255.0
    rgb[:, :3] = np.clip(rgb[:, :3], 0.0, 1.0)
    img.pixels.foreach_set(rgb.reshape(-1))


def bake_object(obj, kind):
    res = BAKE_RES[obj.name]
    img = bpy.data.images.new(f"{kind}_{obj.name}", res, res,
                              alpha=False, float_buffer=True)
    img.colorspace_settings.name = "Non-Color"
    prep_bake_target(obj, img)
    select_only(obj)
    log(f"baking {kind} {obj.name} @ {res}px …")
    if kind == "lm":
        bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"},
                            margin=8, use_clear=True)
        compress_to_ldr(img, 0.5)
    else:
        bpy.ops.object.bake(type="AO", margin=8, use_clear=True)
    save_image_png(img, os.path.join(OUT, f"{kind}_{obj.name.lower()}.png"))
    log(f"  -> {kind}_{obj.name.lower()}.png")


# ————————————————————————————————————————————— bake

log(f"baking ({SAMPLES} samples, FAST={FAST}) …")
for o in BAKED:
    bake_object(o, "lm")

scene.cycles.samples = max(64, SAMPLES // 2)
for o in BAKED:
    bake_object(o, "ao")

# ————————————————————————————————————————————— environment probe

log("rendering environment probe…")
bpy.ops.object.camera_add(location=(0, -11.5, 2.3),
                          rotation=(math.radians(90), 0, math.radians(180)))
cam = bpy.context.active_object
cam.data.type = "PANO"
cam.data.panorama_type = "EQUIRECTANGULAR"
scene.camera = cam
scene.cycles.samples = ENV_SAMPLES
scene.render.resolution_x = 1024
scene.render.resolution_y = 512
scene.render.image_settings.file_format = "HDR"
scene.view_settings.view_transform = "Raw"
scene.render.filepath = os.path.join(OUT, "env_hall.hdr")
bpy.ops.render.render(write_still=True)
log("  -> env_hall.hdr")

# ————————————————————————————————————————————— export glb (static set only)


log("exporting set.glb…")
bpy.ops.object.select_all(action="DESELECT")
for o in BAKED:
    o.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=os.path.join(OUT, "set.glb"),
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_texcoords=True,
    export_normals=True,
    export_materials="EXPORT",
    export_image_format="NONE",
)
log("  -> set.glb")

# keep the source .blend for future look-dev sessions
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, "opsbench_hall.blend"))
log("done.")
