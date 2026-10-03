# Packs rendered facade tiles into WebP for the game (system Python with Pillow):
#   python3 pack_facades.py <render_dir> <out_dir>
import os, sys
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
for f in sorted(os.listdir(src)):
    if not f.endswith('_col.png'):
        continue
    name = f[:-8]
    # colour and glass mask stay separate: canvas readback would lose colour under zero alpha
    Image.open(os.path.join(src, f)).convert('RGB').save(os.path.join(out, name + '.webp'), 'WEBP', quality=86, method=6)
    Image.open(os.path.join(src, name + '_msk.png')).convert('L').save(os.path.join(out, name + '_m.png'), 'PNG', optimize=True)
    Image.open(os.path.join(src, name + '_nrm.png')).convert('RGB').save(os.path.join(out, name + '_n.webp'), 'WEBP', quality=90, method=6)
    print(name)
