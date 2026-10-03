from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'game/src/scenery.js'
source = path.read_text(encoding='utf-8')
for before, after in {
    'options.color=color===0xb3a76e?0xd0c4a4:0x90977d;': 'options.color=color===0xb3a76e?0xd0c4a4:color===0x7e8a57?0x607553:0x90977d;',
    'for(const c of CITIES)addCityHorizon(batch,physics,c,tree,material,building,concrete);': 'for(const c of CITIES){const terrain=addCityHorizon(batch,physics,c,tree,material,building,concrete);if(terrain)for(const entry of batch.sets.values())if(entry.geo.userData.vegetation)for(const matrix of entry.items){const y=terrain(matrix.elements[12],matrix.elements[14]);if(y!==null)matrix.elements[13]=Math.max(matrix.elements[13],y-.08);}}'
}.items():
    assert source.count(before) == 1, before
    source = source.replace(before, after)
path.write_text(source, encoding='utf-8')
print('All ridge trees follow the actual triangle surface; existing forest roots raised where the new terrain is higher.')
