"""
Generates the original rigged runner characters as binary glTF (.glb).

Street Sprinter and Jungle Explorer are built here from primitive body
parts. Each part is a box skinned to one bone (weight 1), so the parts move
rigidly with their joints. There is no smooth skin deformation at the joints.
The clips are procedural keyframes, sampled at 24 fps.

Output:
    street-sprinter.glb
    jungle-explorer.glb

Usage (from the project root):
    python assets/models/characters/generate_characters.py

Standard library only. Conventions match the game:
- glTF axes: +Y up, character faces +Z.
- Feet on y = 0 in the bind pose.
- Bone names use the mixamorig: prefix, like the existing Soldier rig.
- Root translation is never used horizontally, so lanes are not affected.
"""

import json
import math
import os
import struct
import sys
from array import array

HERE = os.path.dirname(os.path.abspath(__file__))

FPS = 24

# ============================================
# SKELETON (bind-pose world positions)
# ============================================

# (name, parent, world position)
BONES = [
    ("mixamorig:Hips", None, (0.0, 0.95, 0.0)),
    ("mixamorig:Spine", "mixamorig:Hips", (0.0, 1.10, 0.0)),
    ("mixamorig:Head", "mixamorig:Spine", (0.0, 1.45, 0.0)),
    ("mixamorig:LeftArm", "mixamorig:Spine", (0.25, 1.38, 0.0)),
    ("mixamorig:LeftForeArm", "mixamorig:LeftArm", (0.27, 1.08, 0.0)),
    ("mixamorig:LeftHand", "mixamorig:LeftForeArm", (0.27, 0.80, 0.0)),
    ("mixamorig:RightArm", "mixamorig:Spine", (-0.25, 1.38, 0.0)),
    ("mixamorig:RightForeArm", "mixamorig:RightArm", (-0.27, 1.08, 0.0)),
    ("mixamorig:RightHand", "mixamorig:RightForeArm", (-0.27, 0.80, 0.0)),
    ("mixamorig:LeftUpLeg", "mixamorig:Hips", (0.12, 0.95, 0.0)),
    ("mixamorig:LeftLeg", "mixamorig:LeftUpLeg", (0.12, 0.50, 0.0)),
    ("mixamorig:LeftFoot", "mixamorig:LeftLeg", (0.12, 0.08, 0.0)),
    ("mixamorig:RightUpLeg", "mixamorig:Hips", (-0.12, 0.95, 0.0)),
    ("mixamorig:RightLeg", "mixamorig:RightUpLeg", (-0.12, 0.50, 0.0)),
    ("mixamorig:RightFoot", "mixamorig:RightLeg", (-0.12, 0.08, 0.0)),
]

BONE_INDEX = {name: i for i, (name, _, _) in enumerate(BONES)}


def bone_parent(name):
    for n, p, _ in BONES:
        if n == name:
            return p
    return None


# ============================================
# CHARACTER DEFINITIONS
# ============================================

def box_segments(spec):
    """
    Each segment: (bone, centre (x,y,z), size (w,h,d), material name).
    Parts are placed in bind-pose world space, relative to their bone.
    """
    segs = []
    # Segments reference material NAMES, so map each name to itself.
    m = {name: name for name in spec["mat"]}

    # Torso and pelvis
    segs.append(("mixamorig:Spine", (0.0, 1.28, 0.0), spec["torso_size"], m["torso"]))
    segs.append(("mixamorig:Hips", (0.0, 0.98, 0.0), spec["pelvis_size"], m["legs"]))

    # Head and neck
    segs.append(("mixamorig:Head", (0.0, 1.60, 0.0), (0.26, 0.28, 0.26), m["skin"]))
    segs.append(("mixamorig:Head", (0.0, 1.44, 0.0), (0.12, 0.08, 0.12), m["skin"]))
    if spec.get("hair"):
        segs.append(("mixamorig:Head", (0.0, 1.75, -0.01), spec["hair_size"], m["hair"]))
    for extra in spec.get("head_extras", []):
        segs.append(("mixamorig:Head", extra[0], extra[1], m[extra[2]]))

    # Arms (sleeves use the torso material unless overridden)
    for side, sx in (("Left", 1.0), ("Right", -1.0)):
        arm = m.get("sleeve", m["torso"])
        segs.append((f"mixamorig:{side}Arm", (0.27 * sx, 1.23, 0.0), (0.13, 0.30, 0.13), arm))
        segs.append((f"mixamorig:{side}ForeArm", (0.27 * sx, 0.94, 0.0), (0.12, 0.28, 0.12), arm))
        segs.append((f"mixamorig:{side}Hand", (0.27 * sx, 0.72, 0.0), (0.13, 0.14, 0.13), m["skin"]))

    # Legs (trousers / joggers)
    for side, sx in (("Left", 1.0), ("Right", -1.0)):
        segs.append((f"mixamorig:{side}UpLeg", (0.12 * sx, 0.73, 0.0), spec["thigh_size"], m["legs"]))
        segs.append((f"mixamorig:{side}Leg", (0.12 * sx, 0.29, 0.0), spec["shin_size"], m["legs"]))
        segs.append((f"mixamorig:{side}Foot", (0.12 * sx, spec["foot_centre_y"], spec["foot_centre_z"]),
                     spec["foot_size"], m["shoe"]))
        if spec.get("sole"):
            segs.append((f"mixamorig:{side}Foot", (0.12 * sx, 0.015, spec["foot_centre_z"]),
                         (spec["foot_size"][0] + 0.02, 0.03, spec["foot_size"][2] + 0.02), m["sole"]))

    for extra in spec.get("body_extras", []):
        segs.append((extra[0], extra[1], extra[2], m[extra[3]]))

    return segs


STREET_SPRINTER = {
    "name": "Street Sprinter",
    "file": "street-sprinter.glb",
    "mat": {
        "torso": (0.17, 0.44, 0.84),   # hoodie, blue
        "sleeve": (0.17, 0.44, 0.84),
        "legs": (0.23, 0.25, 0.30),    # joggers, charcoal
        "skin": (0.88, 0.66, 0.49),
        "hair": (0.10, 0.09, 0.10),
        "shoe": (1.00, 0.48, 0.10),    # bright sneakers
        "sole": (0.96, 0.96, 0.94),
        "hood": (0.14, 0.36, 0.72),
    },
    "torso_size": (0.58, 0.46, 0.32),
    "pelvis_size": (0.46, 0.22, 0.30),
    "thigh_size": (0.18, 0.46, 0.18),
    "shin_size": (0.16, 0.42, 0.16),
    "foot_size": (0.17, 0.12, 0.30),
    "foot_centre_y": 0.07,
    "foot_centre_z": 0.07,
    "sole": True,
    "hair": True,
    "hair_size": (0.27, 0.07, 0.27),
    "head_extras": [((0.0, 1.55, -0.13), (0.26, 0.17, 0.10), "hood")],
    "body_extras": [],
}

JUNGLE_EXPLORER = {
    "name": "Jungle Explorer",
    "file": "jungle-explorer.glb",
    "mat": {
        "torso": (0.42, 0.50, 0.23),   # khaki-green shirt
        "sleeve": (0.42, 0.50, 0.23),
        "legs": (0.60, 0.52, 0.34),    # cargo trousers
        "skin": (0.76, 0.52, 0.34),
        "hair": (0.08, 0.06, 0.05),
        "shoe": (0.29, 0.19, 0.11),    # hiking boots
        "sole": (0.16, 0.12, 0.09),
        "hat": (0.72, 0.64, 0.42),
        "pack": (0.18, 0.35, 0.23),
        "pocket": (0.48, 0.40, 0.25),
    },
    "torso_size": (0.52, 0.44, 0.30),
    "pelvis_size": (0.48, 0.22, 0.30),
    "thigh_size": (0.20, 0.46, 0.20),
    "shin_size": (0.18, 0.42, 0.18),
    "foot_size": (0.17, 0.17, 0.34),
    "foot_centre_y": 0.085,
    "foot_centre_z": 0.09,
    "sole": True,
    "hair": True,
    "hair_size": (0.25, 0.06, 0.25),
    "head_extras": [
        ((0.0, 1.80, 0.0), (0.36, 0.04, 0.36), "hat"),
        ((0.0, 1.87, 0.0), (0.20, 0.10, 0.20), "hat"),
    ],
    "body_extras": [
        # Compact explorer backpack on the back of the torso
        ("mixamorig:Spine", (0.0, 1.26, -0.25), (0.40, 0.46, 0.16), "pack"),
        # Cargo pockets on the thighs
        ("mixamorig:Hips", (0.19, 0.80, 0.11), (0.07, 0.09, 0.04), "pocket"),
        ("mixamorig:Hips", (-0.19, 0.80, 0.11), (0.07, 0.09, 0.04), "pocket"),
    ],
}


# ============================================
# QUATERNIONS
# ============================================

def quat_axis(axis, angle):
    s = math.sin(angle / 2.0)
    c = math.cos(angle / 2.0)
    if axis == "x":
        return (s, 0.0, 0.0, c)
    if axis == "z":
        return (0.0, 0.0, s, c)
    return (0.0, s, 0.0, c)


def quat_mul(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return (
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz,
    )


def rot(rx=0.0, rz=0.0):
    """Local rotation: X (swing) then Z (lean). Angles in radians."""
    q = (0.0, 0.0, 0.0, 1.0)
    if rx:
        q = quat_mul(quat_axis("x", rx), q)
    if rz:
        q = quat_mul(quat_axis("z", rz), q)
    return q


# ============================================
# ANIMATION CLIPS
# ============================================
# Each clip: (duration seconds, loops, function t -> {bone: (quat, translation or None)})

def clip_idle(t):
    b = 0.5 + 0.5 * math.sin(2 * math.pi * t / 2.0)
    return {
        "mixamorig:Spine": (rot(rx=0.02 * math.sin(2 * math.pi * t / 2.0)), None),
        "mixamorig:Head": (rot(rz=0.03 * math.sin(2 * math.pi * t / 4.0)), None),
        "mixamorig:LeftArm": (rot(rx=0.06 * b), None),
        "mixamorig:RightArm": (rot(rx=0.06 * b), None),
    }


def gait(t, period, amp, bob):
    p = 2 * math.pi * t / period
    s = math.sin(p)
    out = {
        "mixamorig:LeftUpLeg": (rot(rx=amp * s), None),
        "mixamorig:RightUpLeg": (rot(rx=-amp * s), None),
        "mixamorig:LeftLeg": (rot(rx=-0.55 * amp * max(0.0, -s) - 0.1), None),
        "mixamorig:RightLeg": (rot(rx=-0.55 * amp * max(0.0, s) - 0.1), None),
        "mixamorig:LeftArm": (rot(rx=-0.7 * amp * s), None),
        "mixamorig:RightArm": (rot(rx=0.7 * amp * s), None),
        "mixamorig:LeftForeArm": (rot(rx=-0.45), None),
        "mixamorig:RightForeArm": (rot(rx=-0.45), None),
        "mixamorig:Spine": (rot(rz=0.02 * math.sin(p)), None),
        # Translation channels are absolute local values, so the bob is the bind height plus the offset.
        "mixamorig:Hips": (rot(), (0.0, 0.95 + bob * abs(math.sin(2 * p)), 0.0)),
        "mixamorig:Head": (rot(), None),
    }
    return out


def clip_run(t):
    return gait(t, 0.6, 0.75, 0.02)


def clip_walk(t):
    return gait(t, 1.0, 0.40, 0.01)


def ease(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def clip_jump(t):
    e = ease(t / 0.25)
    return {
        "mixamorig:LeftArm": (rot(rx=-2.5 * e), None),
        "mixamorig:RightArm": (rot(rx=-2.5 * e), None),
        "mixamorig:LeftUpLeg": (rot(rx=0.9 * e), None),
        "mixamorig:RightUpLeg": (rot(rx=0.6 * e), None),
        "mixamorig:LeftLeg": (rot(rx=-1.2 * e), None),
        "mixamorig:RightLeg": (rot(rx=-0.9 * e), None),
        "mixamorig:Spine": (rot(rx=-0.15 * e), None),
    }


def clip_fall(t):
    sway = math.sin(2 * math.pi * t / 0.6)
    return {
        "mixamorig:LeftArm": (rot(rz=0.9 + 0.05 * sway), None),
        "mixamorig:RightArm": (rot(rz=-0.9 - 0.05 * sway), None),
        "mixamorig:LeftUpLeg": (rot(rx=0.15), None),
        "mixamorig:RightUpLeg": (rot(rx=-0.15), None),
        "mixamorig:LeftLeg": (rot(rx=-0.1), None),
        "mixamorig:RightLeg": (rot(rx=-0.1), None),
    }


def clip_land(t):
    # Crouch and recover over 0.35 s
    k = math.sin(math.pi * min(1.0, t / 0.35))
    return {
        "mixamorig:LeftUpLeg": (rot(rx=-0.5 * k), None),
        "mixamorig:RightUpLeg": (rot(rx=-0.5 * k), None),
        "mixamorig:LeftLeg": (rot(rx=0.9 * k), None),
        "mixamorig:RightLeg": (rot(rx=0.9 * k), None),
        "mixamorig:Spine": (rot(rx=0.25 * k), None),
    }


def clip_slide(t):
    e = ease(t / 0.15)
    return {
        "mixamorig:Spine": (rot(rx=-0.9 * e), None),
        "mixamorig:Hips": (rot(), (0.0, 0.95 - 0.10 * e, 0.0)),
        "mixamorig:Head": (rot(rx=0.5 * e), None),
        "mixamorig:LeftUpLeg": (rot(rx=-1.25 * e), None),
        "mixamorig:RightUpLeg": (rot(rx=-1.25 * e), None),
        "mixamorig:LeftLeg": (rot(rx=-0.15 * e), None),
        "mixamorig:RightLeg": (rot(rx=-0.15 * e), None),
        "mixamorig:LeftArm": (rot(rx=-1.6 * e), None),
        "mixamorig:RightArm": (rot(rx=-1.6 * e), None),
    }


CLIPS = [
    ("Idle", 2.0, True, clip_idle),
    ("Run", 0.6, True, clip_run),
    ("Walk", 1.0, True, clip_walk),
    ("Jump", 0.8, False, clip_jump),
    ("Fall", 0.6, True, clip_fall),
    ("Land", 0.35, False, clip_land),
    ("Slide", 0.8, False, clip_slide),
]


# ============================================
# GLB WRITER
# ============================================

class GlbBuilder:
    def __init__(self):
        self.bin = bytearray()
        self.buffer_views = []
        self.accessors = []

    def _align(self, n=4):
        while len(self.bin) % n:
            self.bin.append(0)

    def add_view(self, data, target=None):
        self._align(4)
        offset = len(self.bin)
        self.bin.extend(data)
        view = {"buffer": 0, "byteOffset": offset, "byteLength": len(data)}
        if target is not None:
            view["target"] = target
        self.buffer_views.append(view)
        return len(self.buffer_views) - 1

    def add_accessor(self, data, component, count, kind, minmax=None, target=None):
        view = self.add_view(data.tobytes(), target)
        acc = {
            "bufferView": view,
            "byteOffset": 0,
            "componentType": component,
            "count": count,
            "type": kind,
        }
        if minmax is not None:
            acc["min"], acc["max"] = minmax
        self.accessors.append(acc)
        return len(self.accessors) - 1

    def to_bytes(self, doc):
        self._align(4)
        doc["buffers"] = [{"byteLength": len(self.bin)}]
        doc["bufferViews"] = self.buffer_views
        doc["accessors"] = self.accessors

        json_bytes = json.dumps(doc, separators=(",", ":")).encode("utf-8")
        while len(json_bytes) % 4:
            json_bytes += b" "

        bin_bytes = bytes(self.bin)

        total = 12 + 8 + len(json_bytes) + 8 + len(bin_bytes)
        out = bytearray()
        out += struct.pack("<4sII", b"glTF", 2, total)
        out += struct.pack("<I4s", len(json_bytes), b"JSON") + json_bytes
        out += struct.pack("<I4s", len(bin_bytes), b"BIN\x00") + bin_bytes
        return bytes(out)


FLOAT = 5126
UBYTE = 5121
USHORT = 5123
ARRAY_BUFFER = 34962
ELEMENT_ARRAY_BUFFER = 34963


def box_geometry(centre, size):
    """Returns (positions, normals, indices) for an axis-aligned box."""
    cx, cy, cz = centre
    hx, hy, hz = size[0] / 2.0, size[1] / 2.0, size[2] / 2.0
    faces = [
        ((0, 0, 1), [(-hx, -hy, hz), (hx, -hy, hz), (hx, hy, hz), (-hx, hy, hz)]),
        ((0, 0, -1), [(hx, -hy, -hz), (-hx, -hy, -hz), (-hx, hy, -hz), (hx, hy, -hz)]),
        ((1, 0, 0), [(hx, -hy, hz), (hx, -hy, -hz), (hx, hy, -hz), (hx, hy, hz)]),
        ((-1, 0, 0), [(-hx, -hy, -hz), (-hx, -hy, hz), (-hx, hy, hz), (-hx, hy, -hz)]),
        ((0, 1, 0), [(-hx, hy, hz), (hx, hy, hz), (hx, hy, -hz), (-hx, hy, -hz)]),
        ((0, -1, 0), [(-hx, -hy, -hz), (hx, -hy, -hz), (hx, -hy, hz), (-hx, -hy, hz)]),
    ]
    positions, normals, indices = [], [], []
    for n, corners in faces:
        base = len(positions) // 3
        for (x, y, z) in corners:
            positions.extend((x + cx, y + cy, z + cz))
            normals.extend(n)
        indices.extend((base, base + 1, base + 2, base, base + 2, base + 3))
    return positions, normals, indices


def build_character(spec):
    builder = GlbBuilder()

    # Materials and per-material index lists
    mat_names = list(spec["mat"].keys())
    material_index = {name: i for i, name in enumerate(mat_names)}
    materials = [
        {
            "name": f"{spec['name']} {name}",
            "pbrMetallicRoughness": {
                "baseColorFactor": [*spec["mat"][name], 1.0],
                "metallicFactor": 0.0,
                "roughnessFactor": 0.8,
            },
        }
        for name in mat_names
    ]

    positions, normals, joints, weights = [], [], [], []
    per_material = {i: [] for i in range(len(mat_names))}
    vertex_offset = 0

    for bone, centre, size, mat in box_segments(spec):
        p, n, idx = box_geometry(centre, size)
        bone_i = BONE_INDEX[bone]
        count = len(p) // 3
        positions.extend(p)
        normals.extend(n)
        for _ in range(count):
            joints.extend((bone_i, 0, 0, 0))
            weights.extend((1.0, 0.0, 0.0, 0.0))
        per_material[material_index[mat]].extend(i + vertex_offset for i in idx)
        vertex_offset += count

    total_vertices = vertex_offset
    if total_vertices > 65535:
        raise ValueError("too many vertices for u16 indices")

    pos_arr = array("f", positions)
    nor_arr = array("f", normals)
    joint_arr = array("B", joints)
    weight_arr = array("f", weights)

    xs = positions[0::3]
    ys = positions[1::3]
    zs = positions[2::3]
    pos_acc = builder.add_accessor(
        pos_arr, FLOAT, total_vertices, "VEC3",
        minmax=([min(xs), min(ys), min(zs)], [max(xs), max(ys), max(zs)]),
        target=ARRAY_BUFFER,
    )
    nor_acc = builder.add_accessor(nor_arr, FLOAT, total_vertices, "VEC3", target=ARRAY_BUFFER)
    joint_acc = builder.add_accessor(joint_arr, UBYTE, total_vertices, "VEC4", target=ARRAY_BUFFER)
    weight_acc = builder.add_accessor(weight_arr, FLOAT, total_vertices, "VEC4", target=ARRAY_BUFFER)

    primitives = []
    for mi, idx in per_material.items():
        if not idx:
            continue
        idx_arr = array("H", idx)
        idx_acc = builder.add_accessor(idx_arr, USHORT, len(idx), "SCALAR", target=ELEMENT_ARRAY_BUFFER)
        primitives.append({
            "attributes": {
                "POSITION": pos_acc,
                "NORMAL": nor_acc,
                "JOINTS_0": joint_acc,
                "WEIGHTS_0": weight_acc,
            },
            "indices": idx_acc,
            "material": mi,
        })

    # Inverse bind matrices: bind rotations are identity, so each is a translation by -bone position.
    ibm = array("f")
    for _, _, world in BONES:
        x, y, z = -world[0], -world[1], -world[2]
        ibm.extend((
            1.0, 0.0, 0.0, 0.0,
            0.0, 1.0, 0.0, 0.0,
            0.0, 0.0, 1.0, 0.0,
            x, y, z, 1.0,
        ))
    ibm_acc = builder.add_accessor(ibm, FLOAT, len(BONES), "MAT4")

    # Node tree: bone nodes first (so node index == bone index), then the mesh node.
    nodes = []
    children = {i: [] for i in range(len(BONES))}
    for i, (name, parent, world) in enumerate(BONES):
        if parent is not None:
            children[BONE_INDEX[parent]].append(i)
    bind_local = {}
    for i, (name, parent, world) in enumerate(BONES):
        if parent is None:
            local = world
        else:
            pw = next(w for n, _, w in BONES if n == parent)
            local = (world[0] - pw[0], world[1] - pw[1], world[2] - pw[2])
        bind_local[name] = local
        node = {"name": name, "translation": list(local)}
        if children[i]:
            node["children"] = children[i]
        nodes.append(node)

    mesh_node = len(nodes)
    nodes.append({"name": f"{spec['name']} Body", "mesh": 0, "skin": 0})

    skin = {
        "name": f"{spec['name']} Skeleton",
        "inverseBindMatrices": ibm_acc,
        "joints": list(range(len(BONES))),
        "skeleton": 0,
    }

    # Animations
    animations = []
    for clip_name, duration, loops, fn in CLIPS:
        frame_count = int(round(duration * FPS))
        times = [i / FPS for i in range(frame_count + 1)]

        # Looping clips wrap time, so the last key equals the first one.
        # One-shot clips keep their final pose.
        if loops:
            samples = [fn(t % duration) for t in times]
        else:
            samples = [fn(min(t, duration)) for t in times]

        t_arr = array("f", times)
        t_acc = builder.add_accessor(
            t_arr, FLOAT, len(times), "SCALAR",
            minmax=([min(times)], [max(times)]),
        )

        channels, samplers = [], []
        for bone_name, _, _ in BONES:
            bone_i = BONE_INDEX[bone_name]
            q_keys = array("f")
            any_rot = False
            for s in samples:
                q = s.get(bone_name, (None, None))[0]
                if q is None:
                    q = (0.0, 0.0, 0.0, 1.0)
                else:
                    any_rot = True
                q_keys.extend(q)
            if any_rot:
                q_acc = builder.add_accessor(q_keys, FLOAT, len(times), "VEC4")
                samplers.append({"input": t_acc, "output": q_acc, "interpolation": "LINEAR"})
                channels.append({"sampler": len(samplers) - 1, "target": {"node": bone_i, "path": "rotation"}})

            has_t = any(s.get(bone_name, (None, None))[1] is not None for s in samples)
            if bone_name == "mixamorig:Hips" or has_t:
                tr_keys = array("f")
                for s in samples:
                    tr = s.get(bone_name, (None, None))[1]
                    if tr is None:
                        tr = bind_local[bone_name]
                    tr_keys.extend(tr)
                tr_acc = builder.add_accessor(tr_keys, FLOAT, len(times), "VEC3")
                samplers.append({"input": t_acc, "output": tr_acc, "interpolation": "LINEAR"})
                channels.append({"sampler": len(samplers) - 1, "target": {"node": bone_i, "path": "translation"}})

        animations.append({"name": clip_name, "channels": channels, "samplers": samplers})

    doc = {
        "asset": {"version": "2.0", "generator": "endless-runner generate_characters.py (procedural placeholder)"},
        "scene": 0,
        "scenes": [{"name": spec["name"], "nodes": [0, mesh_node]}],
        "nodes": nodes,
        "meshes": [{"name": f"{spec['name']} Body", "primitives": primitives}],
        "skins": [skin],
        "materials": materials,
        "animations": animations,
    }

    return builder.to_bytes(doc)


def main():
    outputs = []
    for spec in (STREET_SPRINTER, JUNGLE_EXPLORER):
        data = build_character(spec)
        path = os.path.join(HERE, spec["file"])
        with open(path, "wb") as f:
            f.write(data)
        outputs.append((path, len(data)))
        print(f"wrote {spec['file']}: {len(data)} bytes")

    for path, size in outputs:
        if size < 1000:
            print(f"FAIL: {path} is suspiciously small", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
