import json
import pathlib
import shutil
from PIL import Image

root = pathlib.Path(__file__).resolve().parent.parent
sources = json.loads((root / 'tmp/sources/asset-sources.json').read_text(encoding='utf-8-sig'))
aliases = {'road_asphalt': 'asphalt', 'road_shoulder_gravel': 'gravel', 'dry_grass_soil': 'grass', 'red_brick_walls': 'brick', 'neutral_plaster_walls': 'plaster', 'concrete_yards_sidewalks': 'concrete', 'northern_green_grass_forest_floor': 'green'}
channels = {'color': 'map', 'normal_opengl': 'normalMap', 'roughness': 'roughnessMap'}
manifest = {'materials': {}, 'environment': ''}
credits = []
for asset in sources['assets']:
    role = asset['role']
    names = {}
    for item in asset['downloaded_files']:
        source = root / item['path']
        folder = root / 'game/assets' / asset['id']
        folder.mkdir(parents=True, exist_ok=True)
        dest = folder / source.name
        if source.suffix == '.hdr':
            shutil.copyfile(source, dest)
            manifest['environment'] = str(dest.relative_to(root / 'game/assets')).replace('\\', '/')
        else:
            with Image.open(source) as image:
                image.save(dest, quality=88 if item['channel'] == 'color' else 85, optimize=True)
            names[channels[item['channel']]] = str(dest.relative_to(root / 'game/assets')).replace('\\', '/')
    if role in aliases:
        manifest['materials'][aliases[role]] = names
    elif names:
        raise ValueError(f'Unknown role: {role}')
    credits.append({'name': asset['name'], 'url': asset['page_url'], 'license': asset['license'], 'authors': asset['authors']})
manifest['materials']['green']['map'] = 'grass-ground.png'
manifest['materials']['asphalt']['map'] = 'asphalt-fine.png'
manifest_path = root / 'game/assets/manifest.json'
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
(root / 'tmp/assets/credits.json').write_text(json.dumps(credits, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'materials': list(manifest['materials']), 'environment': manifest['environment'], 'bytes': sum(p.stat().st_size for p in (root / 'game/assets').rglob('*') if p.is_file())}))
