from pathlib import Path

root = Path(__file__).resolve().parents[1]
p = root / 'game/src/view.js'
t = p.read_text(encoding='utf-8')
old = 'desired.set(t.x-cos*17-sin*12,6,t.z+sin*17-cos*12);target.set(t.x+sin*7,1.7,t.z+cos*7);'
new = 'desired.set(t.x-cos*18+sin*12,5.6,t.z+sin*18+cos*12);target.set(t.x-sin*3,1.7,t.z-cos*3);'
assert t.count(old) == 1
p.write_text(t.replace(old,new),encoding='utf-8')
p = root / 'game/style.css'
t = p.read_text(encoding='utf-8')
old = '@media(max-height:500px) and (orientation:portrait){'
assert t.count(old) == 1
p.write_text(t.replace(old,old+'.brand-mark{display:none}'),encoding='utf-8')
print('Front three-quarter camera and compact portrait menu updated.')
