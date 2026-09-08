"""
Bake swordsman GLB animation clips from the existing ooxx pivot hierarchy.

Usage (from repo root):
  blender --background --python apps/web/scripts/blender/rig_swordsman.py

Or with explicit paths:
  blender --background --python apps/web/scripts/blender/rig_swordsman.py -- \\
    apps/web/public/units/swordsman.glb apps/web/public/units/swordsman.glb
"""

from __future__ import annotations

import math
import os
import sys

import bpy
from mathutils import Euler, Vector

FPS = 30
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..'))
DEFAULT_INPUT = os.path.join(REPO_ROOT, 'apps/web/public/units/swordsman.glb')
DEFAULT_OUTPUT = DEFAULT_INPUT

ANIMATED_NODES = (
    'ooxx:Torso',
    'ooxx:Head',
    'ooxx:ArmL',
    'ooxx:ArmR',
    'ooxx:Weapon',
    'ooxx:LegL_Hip',
    'ooxx:LegL_Knee',
    'ooxx:LegR_Hip',
    'ooxx:LegR_Knee',
    'ooxx:Body',
    'ooxx:Rig',
)

REST_ARM = {
    'ooxx:ArmL': Euler((0.1, 0.0, -0.12)),
    'ooxx:ArmR': Euler((-0.36, 0.0, 0.28)),
    'ooxx:Weapon': Euler((-0.24, 0.0, 0.34)),
}


def parse_args():
    argv = sys.argv
    if '--' in argv:
        argv = argv[argv.index('--') + 1:]
    else:
        argv = []
    input_path = os.path.abspath(argv[0] if len(argv) > 0 else DEFAULT_INPUT)
    output_path = os.path.abspath(argv[1] if len(argv) > 1 else DEFAULT_OUTPUT)
    return input_path, output_path


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_glb(path: str):
    bpy.ops.import_scene.gltf(filepath=path)


def get_obj(name: str):
    return bpy.data.objects.get(name)


class RestPose:
    def __init__(self):
        self.rot = {}
        self.loc = {}
        self.scale = {}

    def capture(self):
        for name in ANIMATED_NODES:
            obj = get_obj(name)
            if not obj:
                continue
            self.rot[name] = obj.rotation_euler.copy()
            self.loc[name] = obj.location.copy()
            self.scale[name] = obj.scale.copy()

    def apply_defaults(self):
        for name, euler in REST_ARM.items():
            obj = get_obj(name)
            if not obj:
                continue
            obj.rotation_euler = euler.copy()
            self.rot[name] = obj.rotation_euler.copy()


REST = RestPose()


def bind_action(name: str):
    action = bpy.data.actions.new(name)
    for node_name in ANIMATED_NODES:
        obj = get_obj(node_name)
        if not obj:
            continue
        if obj.animation_data is None:
            obj.animation_data_create()
        obj.animation_data.action = action
    return action


def set_rot(name: str, frame: int, euler: Euler):
    obj = get_obj(name)
    if not obj:
        return
    obj.rotation_euler = euler
    obj.keyframe_insert(data_path='rotation_euler', frame=frame)


def add_rot(name: str, frame: int, offset: Euler):
    base = REST.rot.get(name, Euler()).copy()
    set_rot(name, frame, Euler((
        base.x + offset.x,
        base.y + offset.y,
        base.z + offset.z,
    )))


def set_loc(name: str, frame: int, location: Vector):
    obj = get_obj(name)
    if not obj:
        return
    obj.location = location
    obj.keyframe_insert(data_path='location', frame=frame)


def add_loc(name: str, frame: int, offset: Vector):
    base = REST.loc.get(name, Vector()).copy()
    set_loc(name, frame, base + offset)


def set_scale(name: str, frame: int, scale: Vector):
    obj = get_obj(name)
    if not obj:
        return
    obj.scale = scale
    obj.keyframe_insert(data_path='scale', frame=frame)


def add_scale(name: str, frame: int, offset: Vector):
    base = REST.scale.get(name, Vector((1.0, 1.0, 1.0))).copy()
    set_scale(name, frame, base + offset)


def reset_pose(frame: int = 1):
    for name in ANIMATED_NODES:
        if name in REST.rot:
            set_rot(name, frame, REST.rot[name].copy())
        if name in REST.loc:
            set_loc(name, frame, REST.loc[name].copy())
        if name in REST.scale:
            set_scale(name, frame, REST.scale[name].copy())


def bake_idle():
    bind_action('idle')
    end = int(2.0 * FPS)
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = end

    for frame in (1, end // 4, end // 2, 3 * end // 4, end):
        t = (frame - 1) / FPS
        breath = math.sin(t * 2.1)
        sway = math.sin(t * 0.85)
        idle_arm = math.sin(t * 1.9) * 0.05

        reset_pose(frame)
        add_scale('ooxx:Torso', frame, Vector((-breath * 0.012, breath * 0.026, -breath * 0.012)))
        add_loc('ooxx:Torso', frame, Vector((0.0, 0.0, breath * 0.006)))
        add_rot('ooxx:Torso', frame, Euler((0.0, -sway * 0.02, 0.0)))
        add_rot('ooxx:Head', frame, Euler((math.sin(t * 1.6) * 0.035, sway * 0.16, 0.0)))
        add_loc('ooxx:Head', frame, Vector((0.0, 0.0, breath * 0.008)))
        add_rot('ooxx:ArmL', frame, Euler((idle_arm, 0.0, -breath * 0.03)))
        add_rot('ooxx:ArmR', frame, Euler((-math.sin(t * 1.9 + 0.6) * 0.05, 0.0, breath * 0.03)))
        add_rot('ooxx:Weapon', frame, Euler((0.0, 0.0, math.sin(t * 1.3) * 0.05)))


def leg_pose(frame: int, phase: float, walk: float = 1.0, crouch: float = 0.0):
    crouch_hip = 0.45 * crouch
    crouch_bend = 0.95 * crouch

    for side, hip_name, knee_name, lead in (
        ('left', 'ooxx:LegL_Hip', 'ooxx:LegL_Knee', True),
        ('right', 'ooxx:LegR_Hip', 'ooxx:LegR_Knee', False),
    ):
        leg_phase = phase + (0.0 if lead else math.pi)
        step_swing = math.sin(leg_phase) * 0.52 * walk
        step_bend = max(0.0, -math.sin(leg_phase + 0.9)) * 0.85 * walk
        hip = crouch_hip + step_swing
        bend = max(0.0, crouch_bend + step_bend)
        add_rot(hip_name, frame, Euler((hip, 0.0, 0.0)))
        add_rot(knee_name, frame, Euler((-bend, 0.0, 0.0)))

    step = math.sin(phase) * walk
    add_rot('ooxx:Torso', frame, Euler((0.0, -step * 0.09, 0.0)))
    add_rot('ooxx:ArmL', frame, Euler((-step * 0.32, 0.0, 0.0)))
    add_rot('ooxx:ArmR', frame, Euler((step * 0.32, 0.0, 0.0)))


def bake_walk():
    bind_action('walk')
    end = max(2, int(0.667 * FPS))
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = end

    for frame in range(1, end + 1):
        phase = ((frame - 1) / end) * math.pi * 2
        reset_pose(frame)
        leg_pose(frame, phase, walk=1.0)


def bake_attack_melee():
    bind_action('attack_melee')
    end = max(2, int(0.42 * FPS))
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = end

    for frame in range(1, end + 1):
        p = (frame - 1) / (end - 1)
        reset_pose(frame)
        windup = max(0.0, 1.0 - p * 2.2)
        swing = math.sin(min(1.0, p * 1.8) * math.pi)
        add_rot('ooxx:Torso', frame, Euler((0.0, 0.0, swing * 0.16 - windup * 0.22)))
        add_rot('ooxx:ArmR', frame, Euler((swing * 0.9 - windup * 0.35, 0.0, 0.0)))
        add_rot('ooxx:Weapon', frame, Euler((swing * 0.55, 0.0, -swing * 0.35)))
        add_rot('ooxx:ArmL', frame, Euler((windup * 0.15, 0.0, 0.0)))


def bake_spawn_drop():
    bind_action('spawn_drop')
    end = max(2, int(0.65 * FPS))
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = end
    height = 1.0

    for frame in range(1, end + 1):
        p = (frame - 1) / (end - 1)
        reset_pose(frame)
        fall = min(1.0, p / 0.55)
        lift = height * (1.0 - fall * fall)
        stretch = (1.0 - fall) * 0.16
        add_loc('ooxx:Body', frame, Vector((0.0, 0.0, lift)))
        add_scale('ooxx:Rig', frame, Vector((stretch * 0.2, -stretch, stretch * 0.2)))
        if p > 0.55:
            land_p = (p - 0.55) / 0.45
            land = math.exp(-3.4 * land_p) * math.cos(land_p * math.pi * 2)
            add_loc('ooxx:Body', frame, Vector((0.0, 0.0, lift + land * 0.04)))


def bake_acted():
    bind_action('acted')
    end = max(2, int(0.35 * FPS))
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = end
    crouch = 1.0

    for frame in range(1, end + 1):
        p = (frame - 1) / (end - 1)
        amount = min(1.0, p * 1.2) * crouch
        reset_pose(frame)
        leg_pose(frame, 0.0, walk=0.0, crouch=amount)
        add_rot('ooxx:Torso', frame, Euler((amount * 0.2, 0.0, 0.0)))
        add_rot('ooxx:Head', frame, Euler((-amount * 0.14, 0.0, 0.0)))
        add_rot('ooxx:ArmL', frame, Euler((amount * 0.22, 0.0, 0.0)))
        add_rot('ooxx:ArmR', frame, Euler((amount * 0.2, 0.0, 0.0)))
        add_rot('ooxx:Weapon', frame, Euler((amount * 0.5, 0.0, -amount * 0.35)))


def stash_actions_on_nla():
    """Push each baked action to NLA strips so every clip exports."""
    animated = [get_obj(name) for name in ANIMATED_NODES]
    animated = [obj for obj in animated if obj is not None]

    for obj in animated:
        if obj.animation_data is None:
            obj.animation_data_create()
        for track in list(obj.animation_data.nla_tracks):
            obj.animation_data.nla_tracks.remove(track)
        obj.animation_data.action = None

    for action in bpy.data.actions:
        action.use_fake_user = True
        start = int(action.frame_range[0]) if action.frame_range[0] < 1e9 else 1

        for obj in animated:
            ad = obj.animation_data
            ad.action = action
            track = ad.nla_tracks.new()
            track.name = action.name
            track.strips.new(action.name, start, action)
            ad.action = None


def export_glb(path: str):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=False,
        export_apply=False,
        export_animations=True,
        export_animation_mode='NLA_TRACKS',
        export_force_sampling=True,
        export_nla_strips=True,
        export_def_bones=False,
        export_morph=False,
        export_lights=False,
        export_cameras=False,
    )


def main():
    input_path, output_path = parse_args()
    if not os.path.isfile(input_path):
        raise FileNotFoundError(input_path)

    clear_scene()
    import_glb(input_path)
    REST.capture()
    REST.apply_defaults()

    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)

    bake_idle()
    bake_walk()
    bake_attack_melee()
    bake_spawn_drop()
    bake_acted()

    stash_actions_on_nla()

    temp_path = output_path + '.tmp.glb'
    export_glb(temp_path)
    os.replace(temp_path, output_path)
    print(f'Exported animated swordsman -> {output_path}')
    print('Clips:', ', '.join(sorted(a.name for a in bpy.data.actions)))


if __name__ == '__main__':
    main()
