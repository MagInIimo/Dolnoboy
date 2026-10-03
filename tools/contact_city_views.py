from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
labels = ['Москва', 'Владимир', 'Нижний Новгород', 'Чебоксары', 'Казань', 'Ульяновск', 'Самара', 'Саратов', 'Волгоград', 'Ростов-на-Дону']
sheet = Image.new('RGB', (1004, 1580), '#151e22')
draw = ImageDraw.Draw(sheet)
font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 17)
for i, label in enumerate(labels):
    x, y = (i % 2) * 502, (i // 2) * 316
    with Image.open(root / f'tmp/qa/city-{i}.png') as image:
        image.thumbnail((500, 281))
        sheet.paste(image, (x, y + 30))
    draw.text((x + 8, y + 7), label, fill='white', font=font)
sheet.save(root / 'tmp/qa/city-contact.png')
