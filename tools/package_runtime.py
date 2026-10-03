import hashlib
import json
import os
import re
import shutil
import struct
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
game = root / 'game'
manifest = json.loads((game / 'assets/manifest.json').read_text(encoding='utf-8'))
names = ['index.html', 'style.css', 'app.js', 'icon.svg', 'licenses.txt',
         'assets/manifest.json', 'assets/foliage.png', 'assets/spruce-bough.png', 'assets/grass-tuft.png', 'assets/grass-ground.png', 'assets/sky-cumulus.png', 'assets/models/tractor.glb', 'assets/models/apartment.glb', 'assets/models/apartment-lod.glb']
names += ['assets/' + manifest['environment']]
names += ['assets/' + name for material in manifest['materials'].values() for name in material.values()]
names = sorted(set(names))
pattern = re.compile(r'ChatGPT|Codex|Claude|нейро|OpenAI|Anthropic|Midjourney|Stable[ _-]*Diffusion|DALL.?E|Gemini|\bprompts?\b|\bpromt\b|\bGPT[-_]\d|__qaGame|qa-bundle', re.I)
report = {'date': datetime.now(timezone.utc).isoformat(), 'version': '1.0.0',
          'files': [], 'markerHits': [], 'commentCandidates': [], 'commentWaivers': [], 'metadata': {}}

for name in names:
    p = (game / name).resolve()
    assert p.is_relative_to(game.resolve()) and p.is_file(), name
    assert re.fullmatch(r'[A-Za-z0-9_./-]+', name), name
    data = p.read_bytes()
    report['files'].append({'path': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
    if p.suffix in ['.html', '.css', '.js', '.json', '.svg', '.txt']:
        text = data.decode('utf-8')
        embedded_binary = [(m.start(), m.end()) for m in re.finditer(r'"[A-Za-z0-9+/=]{4096,}"', text)] if p.suffix == '.js' else []
        for match in pattern.finditer(text):
            if any(a < match.start() < b for a, b in embedded_binary):
                continue
            report['markerHits'].append({'path': name, 'match': match.group(), 'context': text[max(0, match.start()-45):match.end()+45]})
        if p.suffix in ['.html', '.css', '.js', '.svg']:
            for match in re.finditer(r'/\*|\*/|<!--|//', text):
                if any(a < match.start() < b for a, b in embedded_binary):
                    continue
                if match.group() == '//' and text[max(0,match.start()-7):match.start()].endswith(('https:', 'http:')):
                    continue
                if p.suffix == '.js' and (match.group() == '//' and text[match.start()-1:match.start()] == '\\' or match.group() == '*/' and text[match.start()-1:match.start()+3] == '.*/i'):
                    report['commentWaivers'].append({'path': name, 'offset': match.start(), 'reason': 'Manually checked escaped URL / dot-star regular expression in Three LoaderUtils.resolveURL', 'context': text[max(0,match.start()-65):match.end()+55]})
                    continue
                report['commentCandidates'].append({'path': name, 'match': match.group(), 'offset': match.start(), 'context': text[max(0,match.start()-75):match.end()+100]})
    elif p.suffix in ['.jpg', '.png']:
        with Image.open(p) as img:
            img.load()
            meta = str(img.info)
            report['metadata'][name] = {'size': list(img.size), 'mode': img.mode, 'keys': list(img.info.keys())}
            if pattern.search(meta):
                report['markerHits'].append({'path': name, 'metadata': meta})
    elif p.suffix == '.glb':
        assert data[:4] == b'glTF' and struct.unpack_from('<I', data, 8)[0] == len(data)
        length, chunk_type = struct.unpack_from('<II', data, 12)
        assert chunk_type == 0x4E4F534A
        text = data[20:20+length].decode('utf-8')
        gltf = json.loads(text)
        report['metadata'][name] = gltf['asset']
        assert not any('uri' in b for b in gltf['buffers'])
        assert not pattern.search(text), 'GLB contains forbidden metadata'
    elif p.suffix == '.hdr':
        head = data[:256].decode('ascii', errors='ignore')
        report['metadata'][name] = head
        assert not pattern.search(head)

report['unpackedBytes'] = sum(item['bytes'] for item in report['files'])
assert report['unpackedBytes'] < 100*1024*1024
qa = root / 'tmp/qa'
qa.mkdir(parents=True, exist_ok=True)
(qa / 'runtime-audit.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
assert not report['markerHits'], 'Review runtime-audit.json markerHits before packaging'
assert not report['commentCandidates'], 'Review runtime-audit.json commentCandidates before packaging'

ready = root / 'ready'
ready.mkdir(exist_ok=True)
candidate = root / 'tmp/dalnoboy-po-rossii-1.0.0.candidate.zip'
final = ready / 'dalnoboy-po-rossii-1.0.0.zip'
legacy = ready / 'volga-haul-1.0.0.zip'
with zipfile.ZipFile(candidate, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name in names:
        archive.write(game / name, name)
with zipfile.ZipFile(candidate) as archive:
    assert archive.testzip() is None
    assert archive.namelist() == names
    report['zipSha256'] = hashlib.sha256(candidate.read_bytes()).hexdigest()
    target = root / ('tmp/exact-zip-' + report['zipSha256'][:12])
    target.mkdir(parents=True, exist_ok=True)
    archive.extractall(target)
assert sorted(str(p.relative_to(target)).replace('\\', '/') for p in target.rglob('*') if p.is_file()) == names
for item in report['files']:
    assert hashlib.sha256((target / item['path']).read_bytes()).hexdigest() == item['sha256']
report['extractedPath'] = str(target)
report['fileCount'] = len(names)
report['zipBytes'] = candidate.stat().st_size
report['crc'] = 'PASS'
report['previous'] = []
for earlier in (final, legacy):
    if not earlier.exists():
        continue
    assert earlier.resolve().is_relative_to(ready.resolve())
    previous = root / ('store/' + earlier.stem + '-local-' + datetime.now().strftime('%Y%m%d-%H%M%S-%f') + '.zip')
    shutil.copy2(earlier, previous)
    old_hash = hashlib.sha256(earlier.read_bytes()).hexdigest()
    assert old_hash == hashlib.sha256(previous.read_bytes()).hexdigest()
    report['previous'].append({'original': str(earlier), 'file': str(previous), 'sha256': old_hash, 'consoleStatus': 'not uploaded by this task'})
os.replace(candidate, final)
if legacy.exists():
    old = next(item for item in report['previous'] if item['original'] == str(legacy))
    assert legacy.resolve().is_relative_to(ready.resolve()) and legacy.name == 'volga-haul-1.0.0.zip'
    assert hashlib.sha256(legacy.read_bytes()).hexdigest() == old['sha256']
    legacy.unlink()
report['zipPath'] = str(final)
(qa / 'runtime-audit.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({k:report[k] for k in ['version', 'fileCount', 'unpackedBytes', 'zipBytes', 'zipSha256', 'crc', 'zipPath', 'extractedPath']}))
