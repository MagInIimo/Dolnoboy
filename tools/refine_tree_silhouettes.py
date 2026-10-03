from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'game/src/scenery.js'
source = path.read_text(encoding='utf-8')
replacements = {
    "leaf:leafMaterial(assets.foliage,0x6f8963)": "leaf:leafMaterial(assets.spruce,0xacc3a6)",
    "batch.add(t.wood,t.bark,x,groundY,z,size,size,size,yaw);batch.add(t.leaves,t.leaf,x,groundY,z,size,size,size,yaw);return true;": "const width=size*(pine?.90:.64);batch.add(t.wood,t.bark,x,groundY,z,width,size,width,yaw);batch.add(t.leaves,t.leaf,x,groundY,z,width,size,width,yaw);return true;"
}
for before, after in replacements.items():
    assert source.count(before) == 1, before
    source = source.replace(before, after)
path.write_text(source, encoding='utf-8')
print('Separate needle boughs and narrower vertical tree silhouettes.')
