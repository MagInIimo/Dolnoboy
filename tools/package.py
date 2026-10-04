# Builds the release archive for Yandex Games: python3 tools/package.py [version]
# Runtime files only (no sources, tools or instructions). Writes ready/dalnoboy-po-rossii-<version>.zip
# and a report with sizes, hashes and checks to store/.
import hashlib
import json
import re
import subprocess
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

root = Path(__file__).resolve().parents[1]
game = root / 'game'
version = sys.argv[1] if len(sys.argv) > 1 else '2.0.0'

subprocess.run(['node', str(root / 'tools' / 'build.mjs')], check=True)

# licences shipped with the game
three = (root / 'licenses' / 'three-MIT.txt').read_text(encoding='utf-8').strip()
font = (game / 'fonts' / 'source-sans-license.txt').read_text(encoding='utf-8').strip()
POLY = [
    ('Asphalt 02', 'Rob Tuytel', 'asphalt_02'),
    ('Brick Wall 001', 'Rob Tuytel, Dimitrios Savva', 'brick_wall_001'),
    ('Concrete Floor 02', 'Rob Tuytel', 'concrete_floor_02'),
    ('Gravel Ground 01', 'Rob Tuytel', 'gravel_ground_01'),
    ('Leafy Grass', 'Charlotte Baglioni', 'leafy_grass'),
    ('Plastered Wall', 'Amal Kumar', 'plastered_wall'),
    ('Withered Grass', 'Charlotte Baglioni', 'withered_grass'),
]
poly = '\n\n'.join(f'{t} — {a}\nhttps://polyhaven.com/a/{s}\nCC0 1.0 Universal' for t, a, s in POLY)
licences = f"""Trucking Across Russia — third-party licences

Three.js 0.160 (including GLTFLoader and the meshopt decoder from its examples)
{three}


Source Sans 3 font
{font}


Surface materials from Poly Haven
CC0 1.0 Universal
https://creativecommons.org/publicdomain/zero/1.0/
https://polyhaven.com/license

{poly}


Everything else — the tractor, trailers, traffic vehicles, buildings, facade tiles, landmarks, foliage, grass,
asphalt and cloud photographs, interface and synthesized sounds — are original works created for
Trucking Across Russia. Landmarks are simplified original models; religious buildings are shown as similar
shapes without any symbols. No assets from other games are included.
"""
(game / 'licenses.txt').write_text(licences, encoding='utf-8')

files = ['index.html', 'style.css', 'app.js', 'icon.svg', 'licenses.txt', 'fonts/source-sans.woff']
for p in sorted((game / 'assets').rglob('*')):
    if p.is_file() and not p.name.endswith('_rough_1k.jpg'):
        files.append(p.relative_to(game).as_posix())

markers = re.compile(r'ChatGPT|Codex|Claude|Anthropic|OpenAI|нейросет|Midjourney|Stable[ _-]*Diffusion|DALL.?E|Gemini|\bprompts?\b|\bGPT[-_]\d', re.I)
report = {'date': datetime.now(timezone.utc).isoformat(), 'version': version, 'files': [], 'markerHits': [], 'externalUrls': [], 'checks': {}}
total = 0
for name in files:
    p = game / name
    assert p.is_file(), name
    assert re.fullmatch(r'[A-Za-z0-9_./-]+', name), name
    data = p.read_bytes()
    total += len(data)
    report['files'].append({'path': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
    if p.suffix in ('.html', '.css', '.js', '.json', '.svg', '.txt'):
        text = data.decode('utf-8')
        for m in markers.finditer(text):
            report['markerHits'].append({'path': name, 'match': m.group(), 'context': text[max(0, m.start() - 40):m.end() + 40]})
        if p.suffix in ('.html', '.js', '.css'):
            for m in re.finditer(r'https?://[^\s"\'`)]+', text):
                url = m.group()
                # three.js keeps a couple of spec/namespace URLs in strings; nothing is fetched from them
                if re.match(r'https?://(www\.w3\.org|github\.com/mrdoob|github\.com/KhronosGroup|threejs\.org|discourse\.threejs\.org)', url):
                    continue
                report['externalUrls'].append({'path': name, 'url': url})
    elif p.suffix == '.glb':
        assert data[:4] == b'glTF', name

index = (game / 'index.html').read_text(encoding='utf-8')
report['checks'] = {
    'sdkScript': '/sdk.js' in index,
    'noSourceMaps': 'sourceMappingURL' not in (game / 'app.js').read_text(encoding='utf-8'),
    'totalBytes': total,
    'fileCount': len(files),
}
assert report['checks']['sdkScript'], 'index.html must load /sdk.js'
assert report['checks']['noSourceMaps'], 'production bundle expected'
assert not report['markerHits'], report['markerHits'][:3]

(root / 'ready').mkdir(exist_ok=True)
for old in (root / 'ready').glob('dalnoboy-po-rossii-*.zip'):
    old.unlink()
out = root / 'ready' / f'dalnoboy-po-rossii-{version}.zip'
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for name in files:
        info = zipfile.ZipInfo(name, date_time=(2026, 10, 3, 12, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        z.writestr(info, (game / name).read_bytes())
report['archive'] = {'path': out.relative_to(root).as_posix(), 'bytes': out.stat().st_size, 'sha256': hashlib.sha256(out.read_bytes()).hexdigest()}
(root / 'store' / f'release-{version}.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'archive': report['archive'], 'files': len(files), 'unpacked': total, 'externalUrls': report['externalUrls'][:5]}, ensure_ascii=False))
