// id, ru, en, lat, lon, population (thousands), region style, landmarks
const RAW = [
  ['moscow', 'Москва', 'Moscow', 55.756, 37.617, 13100, 'capital', ['kremlin', 'ostankino', 'moscowCity', 'stalinTower']],
  ['spb', 'Санкт-Петербург', 'Saint Petersburg', 59.934, 30.335, 5600, 'capital', ['admiralty', 'lakhta', 'drawbridge']],
  ['tver', 'Тверь', 'Tver', 56.859, 35.918, 410, 'central', ['travelPalace']],
  ['novgorod', 'Великий Новгород', 'Veliky Novgorod', 58.523, 31.27, 225, 'north', ['kremlinSmall']],
  ['pskov', 'Псков', 'Pskov', 57.814, 28.35, 190, 'north', ['stoneFortress']],
  ['velikieLuki', 'Великие Луки', 'Velikiye Luki', 56.34, 30.545, 85, 'central', ['waterTower']],
  ['smolensk', 'Смоленск', 'Smolensk', 54.783, 32.045, 315, 'central', ['fortressWall']],
  ['bryansk', 'Брянск', 'Bryansk', 53.244, 34.363, 375, 'central', ['tvTower']],
  ['kaluga', 'Калуга', 'Kaluga', 54.529, 36.275, 330, 'central', ['rocketVostok']],
  ['tula', 'Тула', 'Tula', 54.193, 37.618, 465, 'central', ['kremlinSmall']],
  ['orel', 'Орёл', 'Oryol', 52.97, 36.064, 290, 'central', ['tvTower']],
  ['kursk', 'Курск', 'Kursk', 51.73, 36.193, 440, 'central', ['tvTower']],
  ['belgorod', 'Белгород', 'Belgorod', 50.6, 36.598, 335, 'south', ['tvTower']],
  ['voronezh', 'Воронеж', 'Voronezh', 51.661, 39.2, 1050, 'central', ['shipGoto']],
  ['lipetsk', 'Липецк', 'Lipetsk', 52.603, 39.571, 490, 'central', ['steelPlant']],
  ['elets', 'Елец', 'Yelets', 52.62, 38.5, 100, 'central', ['waterTower']],
  ['tambov', 'Тамбов', 'Tambov', 52.721, 41.452, 255, 'central', ['waterTower']],
  ['ryazan', 'Рязань', 'Ryazan', 54.627, 39.692, 520, 'central', ['tvTower']],
  ['vladimir', 'Владимир', 'Vladimir', 56.129, 40.407, 345, 'central', ['brickWaterTower']],
  ['ivanovo', 'Иваново', 'Ivanovo', 57.0, 40.974, 360, 'central', ['shipHouse']],
  ['kostroma', 'Кострома', 'Kostroma', 57.768, 40.927, 265, 'north', ['fireTower']],
  ['yaroslavl', 'Ярославль', 'Yaroslavl', 57.626, 39.885, 570, 'north', ['rotunda']],
  ['rybinsk', 'Рыбинск', 'Rybinsk', 58.048, 38.858, 175, 'north', ['grainExchange']],
  ['sergievPosad', 'Сергиев Посад', 'Sergiev Posad', 56.315, 38.136, 100, 'central', ['waterTower']],
  ['vologda', 'Вологда', 'Vologda', 59.218, 39.889, 310, 'north', ['woodenQuarter']],
  ['cherepovets', 'Череповец', 'Cherepovets', 59.127, 37.909, 300, 'north', ['steelPlant']],
  ['volkhov', 'Волхов', 'Volkhov', 59.926, 32.338, 44, 'north', ['waterTower']],
  ['petrozavodsk', 'Петрозаводск', 'Petrozavodsk', 61.785, 34.347, 280, 'north', ['woodenQuarter']],
  ['arkhangelsk', 'Архангельск', 'Arkhangelsk', 64.54, 40.543, 300, 'north', ['portCranes']],
  ['nizhny', 'Нижний Новгород', 'Nizhny Novgorod', 56.327, 44.006, 1210, 'central', ['kremlin', 'cableCar']],
  ['cheboksary', 'Чебоксары', 'Cheboksary', 56.132, 47.252, 490, 'volga', ['tvTower']],
  ['yoshkarOla', 'Йошкар-Ола', 'Yoshkar-Ola', 56.634, 47.9, 280, 'volga', ['flemishEmbankment']],
  ['kazan', 'Казань', 'Kazan', 55.789, 49.122, 1310, 'volga', ['kazanKremlin', 'familyCenter']],
  ['chelny', 'Набережные Челны', 'Naberezhnye Chelny', 55.744, 52.396, 550, 'volga', ['truckPlant']],
  ['kotelnich', 'Котельнич', 'Kotelnich', 58.303, 48.348, 23, 'north', ['waterTower']],
  ['kirov', 'Киров', 'Kirov', 58.604, 49.668, 470, 'north', ['tvTower']],
  ['izhevsk', 'Ижевск', 'Izhevsk', 56.853, 53.204, 620, 'ural', ['tvTower']],
  ['perm', 'Пермь', 'Perm', 58.01, 56.25, 1030, 'ural', ['happinessLetters']],
  ['ekb', 'Екатеринбург', 'Yekaterinburg', 56.839, 60.606, 1540, 'ural', ['ekbCity']],
  ['chelyabinsk', 'Челябинск', 'Chelyabinsk', 55.164, 61.437, 1180, 'ural', ['steelPlant']],
  ['ufa', 'Уфа', 'Ufa', 54.739, 55.972, 1160, 'ural', ['horseman']],
  ['orenburg', 'Оренбург', 'Orenburg', 51.768, 55.097, 550, 'steppe', ['borderBridge']],
  ['samara', 'Самара', 'Samara', 53.196, 50.1, 1160, 'volga', ['rocketSoyuz']],
  ['tolyatti', 'Тольятти', 'Tolyatti', 53.531, 49.346, 680, 'volga', ['carPlant']],
  ['ulyanovsk', 'Ульяновск', 'Ulyanovsk', 54.314, 48.403, 620, 'volga', ['tvTower']],
  ['syzran', 'Сызрань', 'Syzran', 53.158, 48.468, 165, 'volga', ['waterTower']],
  ['penza', 'Пенза', 'Penza', 53.196, 45.018, 500, 'central', ['tvTower']],
  ['saransk', 'Саранск', 'Saransk', 54.184, 45.175, 320, 'central', ['arenaOrange']],
  ['saratov', 'Саратов', 'Saratov', 51.533, 46.034, 900, 'volga', ['conservatory']],
  ['volgograd', 'Волгоград', 'Volgograd', 48.708, 44.513, 1020, 'steppe', ['arenaVolga', 'planetarium']],
  ['astrakhan', 'Астрахань', 'Astrakhan', 46.35, 48.041, 470, 'steppe', ['whiteKremlin']],
  ['elista', 'Элиста', 'Elista', 46.308, 44.256, 100, 'steppe', ['waterTower']],
  ['rostov', 'Ростов-на-Дону', 'Rostov-on-Don', 47.236, 39.702, 1140, 'south', ['arenaRostov']],
  ['taganrog', 'Таганрог', 'Taganrog', 47.236, 38.897, 245, 'south', ['portCranes']],
  ['krasnodar', 'Краснодар', 'Krasnodar', 45.035, 38.975, 1100, 'south', ['stadiumBowl']],
  ['novorossiysk', 'Новороссийск', 'Novorossiysk', 44.724, 37.769, 275, 'south', ['portCranes']],
  ['sochi', 'Сочи', 'Sochi', 43.585, 39.723, 470, 'south', ['seaTerminal']],
  ['stavropol', 'Ставрополь', 'Stavropol', 45.043, 41.973, 550, 'south', ['tvTower']],
  ['pyatigorsk', 'Пятигорск', 'Pyatigorsk', 44.049, 43.059, 145, 'south', ['aeolianHarp']],
];

export const CITIES = RAW.map(([id, ru, en, lat, lon, pop, region, landmarks], index) => ({
  id,
  ru,
  en,
  lat,
  lon,
  pop,
  region,
  landmarks,
  index,
}));

export const CITY_BY_ID = Object.fromEntries(CITIES.map((c) => [c.id, c]));

// Desired built-up radius in game metres at 1:10 (close to the real size); neighbours may shrink it.
export function cityRadius(pop) {
  const cap = pop >= 10000 ? 2400 : pop >= 5000 ? 2000 : 1500;
  return Math.round(Math.min(cap, 260 + Math.sqrt(pop) * 28));
}

// Width of the suburban fringe between the last ring road and the city limit.
export function fringeWidth(R) {
  return R >= 800 ? 380 : R >= 400 ? 280 : 200;
}

// Radii shrunk so that neighbouring cities keep a stretch of open highway between them.
// The smaller city gives way first (down to 60% of its wish), then the bigger one.
export function fitRadii(cities) {
  const R = cities.map((c) => cityRadius(c.pop));
  const floor = R.map((r) => r * 0.6);
  for (let iter = 0; iter < 80; iter++) {
    let changed = false;
    for (let i = 0; i < cities.length; i++) {
      for (let j = i + 1; j < cities.length; j++) {
        const d = Math.hypot(cities[i].x - cities[j].x, cities[i].z - cities[j].z);
        const gap = Math.max(700, d * 0.16);
        let over = R[i] + R[j] + fringeWidth(R[i]) + fringeWidth(R[j]) + gap - d;
        if (over <= 0) continue;
        changed = true;
        const [a, b] = cities[i].pop < cities[j].pop ? [i, j] : [j, i];
        const take = Math.min(over, Math.max(0, R[a] - floor[a]));
        R[a] -= take;
        over -= take;
        if (over > 0) R[b] = Math.max(floor[b], R[b] - over);
      }
    }
    if (!changed) break;
  }
  return R.map((r) => Math.round(r));
}
