from pathlib import Path

root = Path(__file__).resolve().parents[1]
p = root / 'game/src/ui.js'
s = p.read_text(encoding='utf-8')
s = s.replace('Модели транспорта, листва, интерфейс и звуки созданы для этой игры. Материалы поверхностей и небо — Poly Haven, CC0.', 'Модели транспорта и домов, листва, трава, асфальт, облака, интерфейс и звуки созданы для этой игры. Остальные материалы и панорама отражений — Poly Haven, CC0.')
s = s.replace('Original vehicles and sounds. Surface materials and sky: Poly Haven, CC0.', 'Vehicles, buildings, foliage, grass, asphalt, clouds, interface and sounds created for this game. Other materials and reflection panorama: Poly Haven, CC0.')
p.write_text(s, encoding='utf-8')
p = root / 'SPEC.md'
s = p.read_text(encoding='utf-8').replace('HDR-панорама неба — Poly Haven, CC0', 'HDR-панорама отражений — Poly Haven, CC0')
s += '\n30.09.2026: добавлены собственные облака, асфальт и трава; детализированные дома из Blender с отдельной дальней геометрией; защита камеры от стен; локальные отражения городского окружения на кузове и стеклянных офисных фасадах. Виды центральных кварталов остаются авторской интерпретацией, не точными копиями реальных улиц.\n'
p.write_text(s, encoding='utf-8')
