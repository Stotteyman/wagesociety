import json
import os
import struct
import base64

ASSET_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'wageworld')
NAMES = [
    'bed',
    'computer',
    'wardrobe',
    'door',
    'house',
    'stall',
    'stage',
    'tower',
    'reward-machine',
    'bench',
    'street-lamp',
    'planter',
    'tree',
    'fence',
    'pickup',
    'guide-npc',
    'cloud',
    'player-avatar',
]

POSITIONS = [
    # front face
    -0.5, -0.5,  0.5,  0.5, -0.5,  0.5,  0.5,  0.5,  0.5,
    -0.5, -0.5,  0.5,  0.5,  0.5,  0.5, -0.5,  0.5,  0.5,
    # back face
     0.5, -0.5, -0.5, -0.5, -0.5, -0.5, -0.5,  0.5, -0.5,
     0.5, -0.5, -0.5, -0.5,  0.5, -0.5,  0.5,  0.5, -0.5,
    # left face
    -0.5, -0.5, -0.5, -0.5, -0.5,  0.5, -0.5,  0.5,  0.5,
    -0.5, -0.5, -0.5, -0.5,  0.5,  0.5, -0.5,  0.5, -0.5,
    # right face
     0.5, -0.5,  0.5,  0.5, -0.5, -0.5,  0.5,  0.5, -0.5,
     0.5, -0.5,  0.5,  0.5,  0.5, -0.5,  0.5,  0.5,  0.5,
    # top face
    -0.5,  0.5,  0.5,  0.5,  0.5,  0.5,  0.5,  0.5, -0.5,
    -0.5,  0.5,  0.5,  0.5,  0.5, -0.5, -0.5,  0.5, -0.5,
    # bottom face
    -0.5, -0.5, -0.5,  0.5, -0.5, -0.5,  0.5, -0.5,  0.5,
    -0.5, -0.5, -0.5,  0.5, -0.5,  0.5, -0.5, -0.5,  0.5,
]
NORMALS = [
    # front
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
    # back
    0, 0,-1, 0, 0,-1, 0, 0,-1, 0, 0,-1, 0, 0,-1, 0, 0,-1,
    # left
   -1, 0, 0,-1, 0, 0,-1, 0, 0,-1, 0, 0,-1, 0, 0,-1, 0, 0,
    # right
    1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
    # top
    0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
    # bottom
    0,-1, 0, 0,-1, 0, 0,-1, 0, 0,-1, 0, 0,-1, 0, 0,-1, 0,
]


def build_gltf(asset_name):
    positions_bytes = b''.join(struct.pack('<f', v) for v in POSITIONS)
    normals_bytes = b''.join(struct.pack('<f', n) for n in NORMALS)
    buffer_data = positions_bytes + normals_bytes
    buffer_uri = 'data:application/octet-stream;base64,' + base64.b64encode(buffer_data).decode('ascii')
    gltf = {
        'asset': {'version': '2.0', 'generator': 'wageworld-placeholder-generator'},
        'scene': 0,
        'scenes': [{'nodes': [0]}],
        'nodes': [{'mesh': 0, 'name': asset_name}],
        'meshes': [{'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1}, 'mode': 4, 'material': 0}]}],
        'materials': [{'pbrMetallicRoughness': {'baseColorFactor': [0.75, 0.75, 0.75, 1], 'metallicFactor': 0.0, 'roughnessFactor': 0.9}}],
        'buffers': [{'uri': buffer_uri, 'byteLength': len(buffer_data)}],
        'bufferViews': [
            {'buffer': 0, 'byteOffset': 0, 'byteLength': len(positions_bytes), 'target': 34962},
            {'buffer': 0, 'byteOffset': len(positions_bytes), 'byteLength': len(normals_bytes), 'target': 34962},
        ],
        'accessors': [
            {'bufferView': 0, 'byteOffset': 0, 'componentType': 5126, 'count': 36, 'type': 'VEC3', 'min': [-0.5, -0.5, -0.5], 'max': [0.5, 0.5, 0.5]},
            {'bufferView': 1, 'byteOffset': 0, 'componentType': 5126, 'count': 36, 'type': 'VEC3'},
        ],
    }
    return gltf


def main():
    os.makedirs(ASSET_DIR, exist_ok=True)
    manifest = {'assets': []}
    placeholder_path = os.path.join(ASSET_DIR, 'placeholder-box.gltf')
    with open(placeholder_path, 'w', encoding='utf-8') as f:
        json.dump(build_gltf('placeholder-box'), f, indent=2)

    for name in NAMES:
        asset_path = os.path.join(ASSET_DIR, f'{name}.gltf')
        with open(asset_path, 'w', encoding='utf-8') as f:
            json.dump(build_gltf(name), f, indent=2)
        manifest['assets'].append({'name': name, 'file': f'assets/wageworld/{name}.gltf', 'format': 'gltf'})

    manifest_path = os.path.join(ASSET_DIR, '..', '..', 'docs', 'wageworld-asset-manifest.json')
    os.makedirs(os.path.dirname(manifest_path), exist_ok=True)
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)
    print('Created', len(NAMES) + 1, 'gltf assets and manifest at', manifest_path)

if __name__ == '__main__':
    main()
