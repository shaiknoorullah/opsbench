"""
opsbench — headless Blender scene build + Cycles bake pipeline (set v2).

Builds the evidence-hall set — oversized floor, plinth, paneled monolith,
gate, a colonnade of pilasters with lintels and strip practicals, and
staggered evidence steles — lights it like a film set, then path-traces the
lighting into per-object lightmaps + AO maps and a Radiance-HDR environment
probe, and exports the static set as a glb. Run:

    python3 assets/blender/build_scene.py               # full bake
    FAST_BAKE=1 python3 assets/blender/build_scene.py   # low-sample preview

Outputs land in  site/public/assets/baked/ :
    set.glb        static geometry (uv0 + uv1 lightmap UVs)
    lm_<name>.png  lightmaps (linear, scaled 0.5 -> lightMapIntensity in code)
    ao_<name>.png  ambient occlusion maps
    env_hall.hdr   equirect environment probe (RGBE)

Coordinate map: Blender is Z-up, +Y is "into the scene".
three.js is Y-up, -Z into the scene; the glTF exporter converts.
So three (x, y, z) == blender (x, -z, y).  Gate at three z=-16 -> blender y=+16.
"""

import math
import os

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

BAKE_RES = {
    "Floor": 512 if FAST else 2048,
    "Monolith": 512 if FAST else 1024,
    "Plinth": 256 if FAST else 512,
    "Gate": 256 if FAST else 512,
    "Colonnade": 512 if FAST else 2048,
    "Steles": 256 if FAST else 1024,
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


def uv_setup(obj):
    """uv0 via smart project (materials), uv1 'Lightmap' packed for bakes."""
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")
    lm = obj.data.uv_layers.new(name="Lightmap")
    obj.data.uv_layers.active = lm
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.035)
    bpy.ops.object.mode_set(mode="OBJECT")


def box(name, size, loc, mat=None, bevel=0.04):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    bpy.ops.object.transform_apply(scale=True)
    if bevel:
        add_bevel(o, bevel)
    if mat is not None:
        o.data.materials.append(mat)
    return o


def join(name, objs, mat):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        for m in list(o.modifiers):
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.modifier_apply(modifier=m.name)
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    j = bpy.context.active_object
    j.name = name
    j.data.materials.clear()
    j.data.materials.append(mat)
    return j


# ————————————————————————————————————————————— set build

log("building set v2…")

mat_floor = make_material("floor", base=(0.35, 0.36, 0.40), rough=0.35)
mat_stone = make_material("obsidian", base=(0.30, 0.31, 0.35), rough=0.32)
mat_col = make_material("colonnade", base=(0.26, 0.27, 0.31), rough=0.42)
mat_stele = make_material("stele", base=(0.28, 0.29, 0.33), rough=0.4)

# floor — oversized so its edges never enter frame (three z +30 .. -130)
bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 50, 0))
floor = bpy.context.active_object
floor.name = "Floor"
floor.scale = (120, 160, 1)
bpy.ops.object.transform_apply(scale=True)
floor.data.materials.append(mat_floor)

# plinth + paneled monolith (front face toward camera at -y)
plinth_parts = [
    box("p0", (5.0, 2.8, 0.12), (0, 0, 0.06), bevel=0.02),
    box("p1", (4.2, 2.2, 0.14), (0, 0, 0.19), bevel=0.03),
]
plinth = join("Plinth", plinth_parts, mat_stone)

mono_parts = [box("m0", (2.4, 0.7, 5.2), (0, 0, 2.86), bevel=0.045)]
# raised frame on the front face — panel seams catch the raking key light
for sz, loc in [
    ((0.12, 0.1, 4.6), (-1.02, -0.38, 2.86)),
    ((0.12, 0.1, 4.6), (1.02, -0.38, 2.86)),
    ((2.16, 0.1, 0.12), (0, -0.38, 5.1)),
    ((2.16, 0.1, 0.12), (0, -0.38, 0.62)),
]:
    mono_parts.append(box("mf", sz, loc, bevel=0.015))
monolith = join("Monolith", mono_parts, mat_stone)

# wax seal — emissive disc set into the monolith face (bake light source)
bpy.ops.mesh.primitive_cylinder_add(radius=0.5, depth=0.03,
                                    location=(0, -0.45, 3.05),
                                    rotation=(math.radians(90), 0, 0))
seal = bpy.context.active_object
seal.name = "SealEmit"
seal.data.materials.append(
    make_material("seal", base=(0.05, 0.02, 0.0), emission=AMBER, emission_strength=28.0))

# the gate — standing ring at three z=-16
bpy.ops.mesh.primitive_torus_add(major_radius=2.3, minor_radius=0.16,
                                 major_segments=96, minor_segments=24,
                                 location=(0, 16, 2.3),
                                 rotation=(math.radians(90), 0, 0))
gate_ring = bpy.context.active_object
gate_ring.name = "g0"
gate_base = box("g1", (1.4, 0.9, 0.5), (0, 16, 0.25), bevel=0.03)
gate = join("Gate", [gate_ring, gate_base], make_material("gate_steel", base=(0.4, 0.42, 0.47), rough=0.4))

# inner ring emissive (bake light source, not exported)
bpy.ops.mesh.primitive_torus_add(major_radius=2.06, minor_radius=0.02,
                                 major_segments=96, minor_segments=12,
                                 location=(0, 16, 2.3),
                                 rotation=(math.radians(90), 0, 0))
ring = bpy.context.active_object
ring.name = "RingEmit"
ring.data.materials.append(
    make_material("ring", base=(0.05, 0.02, 0.0), emission=AMBER, emission_strength=14.0))

# colonnade — pilaster pairs with caps and lintels marching down the hall.
# fills the frame edges and gives every act perspective rhythm.
col_parts = []
strip_parts = []
PILASTER_Y = [-4, 7, 18, 29, 40, 51, 62]  # blender y == three -z
for i, y in enumerate(PILASTER_Y):
    for sx in (-8.6, 8.6):
        col_parts.append(box(f"c{i}{sx}", (0.9, 0.9, 9.0), (sx, y, 4.5), bevel=0.03))
        col_parts.append(box(f"cc{i}{sx}", (1.25, 1.25, 0.4), (sx, y, 9.2), bevel=0.02))
        col_parts.append(box(f"cb{i}{sx}", (1.2, 1.2, 0.3), (sx, y, 0.15), bevel=0.02))
    # lintel spanning the pair
    col_parts.append(box(f"cl{i}", (18.5, 0.7, 0.5), (0, y, 9.65), bevel=0.02))
colonnade = join("Colonnade", col_parts, mat_col)

# strip practicals — warm emissive bars at each pilaster's inner base.
# they light the bake AND ship as runtime emissives for bloom.
for i, y in enumerate(PILASTER_Y):
    for sx in (-8.6, 8.6):
        inner = sx - math.copysign(0.5, sx)
        strip_parts.append(box(f"s{i}{sx}", (0.08, 0.7, 0.06), (inner, y, 0.34), bevel=0))
strips = join("Strips", strip_parts,
              make_material("strip", base=(0.05, 0.02, 0.0), emission=WARM, emission_strength=13.0))

# evidence steles — staggered monument slabs between pilasters
stele_specs = [
    (-6.4, 4, 2.6, 0.12), (6.8, 9, 3.4, -0.08), (-7.0, 13, 4.2, 0.05),
    (6.2, 21, 2.9, -0.15), (-6.6, 26, 3.8, 0.1), (7.1, 33, 3.1, 0.07),
    (-6.9, 38, 4.4, -0.06), (6.5, 46, 3.6, 0.12), (-6.3, 54, 2.8, -0.1),
]
stele_parts = []
for i, (x, y, h, rot) in enumerate(stele_specs):
    s = box(f"st{i}", (1.5, 0.35, h), (x, y, h / 2), bevel=0.025)
    s.rotation_euler = (0, 0, rot)
    stele_parts.append(s)
steles = join("Steles", stele_parts, mat_stele)

BAKED = [floor, plinth, monolith, gate, colonnade, steles]
for o in BAKED:
    uv_setup(o)
uv_setup(strips)  # exported too; needs both UV sets for consistency

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
area_light("Rim", (-9, 20, 6), (math.radians(-60), math.radians(-35), 0), COOL, 580, 6)
# soft top fill, barely there
area_light("Fill", (0, 20, 14), (0, 0, 0), (0.7, 0.75, 0.85), 160, 14)


def pool_spot(name, y, power=260):
    bpy.ops.object.light_add(type="SPOT", location=(0, y, 12.5), rotation=(0, 0, 0))
    s = bpy.context.active_object
    s.name = name
    s.data.color = WARM
    s.data.energy = power
    s.data.spot_size = math.radians(28)
    s.data.spot_blend = 0.6
    return s


pool_spot("Pool0", -0.5, 360)
pool_spot("Pool1", 16, 220)
pool_spot("Pool2", 34, 260)
pool_spot("Pool3", 52, 220)

world = bpy.data.worlds.new("hall")
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs["Color"].default_value = (0.010, 0.012, 0.018, 1.0)
bg.inputs["Strength"].default_value = 1.0

# ————————————————————————————————————————————— bake helpers


def prep_bake_target(obj, img):
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
    import numpy as np
    px = np.empty(len(img.pixels), dtype=np.float32)
    img.pixels.foreach_get(px)
    rgb = px.reshape(-1, 4)
    rgb[:, :3] = np.clip(rgb[:, :3] * scale, 0.0, 1.0)
    rng = np.random.default_rng(7)
    rgb[:, :3] += (rng.random(rgb[:, :3].shape, dtype=np.float32) - 0.5) / 255.0
    rgb[:, :3] = np.clip(rgb[:, :3], 0.0, 1.0)
    img.pixels.foreach_set(rgb.reshape(-1))


def bake_object(obj, kind):
    res = BAKE_RES[obj.name]
    img = bpy.data.images.new(f"{kind}_{obj.name}", res, res, alpha=False, float_buffer=True)
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
    img.filepath_raw = os.path.join(OUT, f"{kind}_{obj.name.lower()}.png")
    img.file_format = "PNG"
    img.save()
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

# ————————————————————————————————————————————— export glb (static set + strips)

log("exporting set.glb…")
bpy.ops.object.select_all(action="DESELECT")
for o in [*BAKED, strips]:
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

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, "opsbench_hall.blend"))
log("done.")
