#!/usr/bin/env python3
"""
Batch optimise all .glb files in assets/3d/furniture/
Uses Blender's Python API to apply Draco compression.
Run: python3 scripts/optimise_glb.py
"""
import subprocess
import os
import glob
import sys

FURNITURE_DIR = os.path.join(
    os.path.dirname(__file__), "..", "assets", "3d", "furniture"
)
# Also check ready/ subfolder where the 43 models live
READY_DIR = os.path.join(FURNITURE_DIR, "ready")
TARGET_SIZE_MB = 2.0


def optimise_glb(input_path: str) -> None:
    output_path = input_path  # overwrite in place
    size_mb = os.path.getsize(input_path) / (1024 * 1024)

    if size_mb <= TARGET_SIZE_MB:
        print(f" ✓ {os.path.basename(input_path)} ({size_mb:.1f}MB) — already optimised")
        return

    print(f" ↓ {os.path.basename(input_path)} ({size_mb:.1f}MB) — compressing...")
    input_path_esc = input_path.replace("\\", "\\\\")
    output_path_esc = output_path.replace("\\", "\\\\")
    blender_script = f"""
import bpy
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=r'{input_path_esc}')
bpy.ops.export_scene.gltf(
    filepath=r'{output_path_esc}',
    export_format='GLB',
    export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=6,
    export_image_format='JPEG',
)
"""
    result = subprocess.run(
        ["blender", "--background", "--python-expr", blender_script],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(f"   Error: {result.stderr or result.stdout}")
        return
    new_size = os.path.getsize(output_path) / (1024 * 1024)
    print(f"   ✓ Compressed to {new_size:.1f}MB")


if __name__ == "__main__":
    models = glob.glob(os.path.join(FURNITURE_DIR, "*.glb"))
    if os.path.isdir(READY_DIR):
        models += glob.glob(os.path.join(READY_DIR, "*.glb"))
    if not models:
        print("No .glb files found in", FURNITURE_DIR, "or", READY_DIR)
        sys.exit(1)
    print(f"Optimising {len(models)} models...")
    for path in models:
        optimise_glb(path)
    print("Done!")
