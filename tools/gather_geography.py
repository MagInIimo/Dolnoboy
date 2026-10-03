import json
import pathlib
import urllib.request

root = pathlib.Path(__file__).resolve().parents[1]
ids = ['Q649', 'Q2684', 'Q891', 'Q5470', 'Q900', 'Q5627', 'Q894', 'Q5332', 'Q914', 'Q908']
url = 'https://www.wikidata.org/w/api.php?action=wbgetentities&ids=' + '%7C'.join(ids) + '&props=labels%7Cclaims&languages=ru%7Cen&format=json'
req = urllib.request.Request(url, headers={'User-Agent': 'VolgaHaulGeography/1.0 (independent browser game geography validation)'})
with urllib.request.urlopen(req, timeout=45) as response:
    data = json.load(response)
cities = []
for eid in ids:
    entity = data['entities'][eid]
    coords = entity['claims']['P625'][0]['mainsnak']['datavalue']['value']
    cities.append({'id': eid, 'ru': entity['labels']['ru']['value'], 'en': entity['labels']['en']['value'], 'lat': coords['latitude'], 'lon': coords['longitude'], 'source': 'https://www.wikidata.org/wiki/' + eid})
out = root / 'tmp' / 'sources'
out.mkdir(parents=True, exist_ok=True)
(out / 'city-coordinates.json').write_text(json.dumps(cities, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(cities, ensure_ascii=False, indent=2))
