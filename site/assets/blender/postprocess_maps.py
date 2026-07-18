"""Post-process baked maps for the web: light denoise blur (lightmaps are
low-frequency, so a small separable blur removes Cycles residue at no visual
cost), cap resolution, and re-encode PNG -> lossy WebP (~10x smaller).

Run after build_scene.py:  python3 assets/blender/postprocess_maps.py
"""

import glob
import os

import bpy
import numpy as np

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(ROOT, "..", "..", "public", "assets", "baked"))

MAX_RES = {"lm_floor": 1024, "ao_floor": 1024}
DEFAULT_MAX = 1024
BLUR = {"lm": 2, "ao": 1}  # pixel radius per map kind


def box_blur(rgb, w, h, r):
    """Separable box blur on (h*w, 4) float array, radius r px."""
    img = rgb.reshape(h, w, 4)[:, :, :3]
    for axis in (0, 1):
        acc = np.zeros_like(img)
        n = 2 * r + 1
        for o in range(-r, r + 1):
            acc += np.roll(img, o, axis=axis)
        img = acc / n
    out = rgb.reshape(h, w, 4).copy()
    out[:, :, :3] = img
    return out.reshape(-1)


for path in sorted(glob.glob(os.path.join(OUT, "*.png"))):
    name = os.path.splitext(os.path.basename(path))[0]
    kind = name.split("_")[0]
    img = bpy.data.images.load(path)
    w, h = img.size
    cap = MAX_RES.get(name, DEFAULT_MAX)
    if max(w, h) > cap:
        img.scale(cap, cap)
        w, h = img.size

    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = box_blur(px, w, h, BLUR.get(kind, 1))
    img.pixels.foreach_set(np.clip(px, 0.0, 1.0))

    webp = os.path.join(OUT, f"{name}.webp")
    img.filepath_raw = webp
    img.file_format = "WEBP"
    img.save(quality=88)
    os.remove(path)
    print(f"[maps] {name}: {w}x{h} -> {os.path.getsize(webp) // 1024} KB webp", flush=True)

print("[maps] done.", flush=True)
