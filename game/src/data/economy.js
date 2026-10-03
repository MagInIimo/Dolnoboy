// Trailers: length in metres from king pin to rear, axle offset from king pin.
export const TRAILERS = {
  curtain: { ru: 'Тентованный полуприцеп', en: 'Curtainsider', length: 13.6, axle: 8.6, mass: 6800, height: 4.0 },
  reefer: { ru: 'Рефрижератор', en: 'Refrigerated', length: 13.4, axle: 8.5, mass: 8100, height: 4.0 },
  flatbed: { ru: 'Бортовая платформа', en: 'Flatbed', length: 13.6, axle: 8.6, mass: 6200, height: 1.45 },
  tanker: { ru: 'Цистерна', en: 'Tanker', length: 12.4, axle: 8.0, mass: 7200, height: 3.6 },
  container: { ru: 'Контейнеровоз', en: 'Container chassis', length: 12.4, axle: 8.0, mass: 5200, height: 4.0 },
  logger: { ru: 'Лесовоз', en: 'Log trailer', length: 12.8, axle: 8.2, mass: 6400, height: 3.6 },
  lowloader: { ru: 'Трал', en: 'Low loader', length: 14.2, axle: 9.6, mass: 9800, height: 3.7 },
};

// Cargo: trailer, mass range in tonnes, rate multiplier, fragility, hazardous, required level, visual load.
export const CARGO = {
  groceries: { ru: 'Продукты', en: 'Groceries', trailer: 'curtain', mass: [8, 16], rate: 1.0, fragile: 0.4, level: 1 },
  beverages: { ru: 'Напитки', en: 'Beverages', trailer: 'curtain', mass: [14, 22], rate: 1.0, fragile: 0.6, level: 1 },
  appliances: { ru: 'Бытовая техника', en: 'Home appliances', trailer: 'curtain', mass: [6, 12], rate: 1.25, fragile: 1.2, level: 2 },
  furniture: { ru: 'Мебель', en: 'Furniture', trailer: 'curtain', mass: [5, 10], rate: 1.15, fragile: 0.9, level: 1 },
  carParts: { ru: 'Автозапчасти', en: 'Car parts', trailer: 'curtain', mass: [8, 18], rate: 1.15, fragile: 0.6, level: 2 },
  paper: { ru: 'Рулоны бумаги', en: 'Paper rolls', trailer: 'curtain', mass: [16, 24], rate: 1.0, fragile: 0.5, level: 1 },
  flour: { ru: 'Мука', en: 'Flour', trailer: 'curtain', mass: [18, 22], rate: 0.95, fragile: 0.3, level: 1 },
  buildMix: { ru: 'Сухие смеси', en: 'Dry building mix', trailer: 'curtain', mass: [18, 24], rate: 0.95, fragile: 0.2, level: 1 },
  fertilizer: { ru: 'Удобрения', en: 'Fertilizer', trailer: 'curtain', mass: [18, 24], rate: 1.1, fragile: 0.2, level: 3 },
  textile: { ru: 'Текстиль', en: 'Textiles', trailer: 'curtain', mass: [5, 9], rate: 1.05, fragile: 0.2, level: 1 },
  frozen: { ru: 'Замороженные продукты', en: 'Frozen food', trailer: 'reefer', mass: [10, 18], rate: 1.3, fragile: 0.7, level: 2 },
  dairy: { ru: 'Молочная продукция', en: 'Dairy products', trailer: 'reefer', mass: [10, 16], rate: 1.25, fragile: 0.8, level: 1 },
  meat: { ru: 'Мясо', en: 'Meat', trailer: 'reefer', mass: [12, 18], rate: 1.35, fragile: 0.7, level: 2 },
  vegetables: { ru: 'Овощи и фрукты', en: 'Fruit and vegetables', trailer: 'reefer', mass: [10, 20], rate: 1.2, fragile: 0.9, level: 1 },
  fish: { ru: 'Рыба', en: 'Fish', trailer: 'reefer', mass: [10, 18], rate: 1.4, fragile: 0.8, level: 3 },
  medicine: { ru: 'Лекарства', en: 'Medicines', trailer: 'reefer', mass: [4, 8], rate: 1.7, fragile: 1.5, level: 5 },
  pipes: { ru: 'Стальные трубы', en: 'Steel pipes', trailer: 'flatbed', mass: [18, 24], rate: 1.15, fragile: 0.15, level: 2, load: 'pipes' },
  lumber: { ru: 'Пиломатериалы', en: 'Lumber', trailer: 'flatbed', mass: [14, 22], rate: 1.0, fragile: 0.3, level: 1, load: 'lumber' },
  slabs: { ru: 'Бетонные плиты', en: 'Concrete slabs', trailer: 'flatbed', mass: [20, 26], rate: 1.1, fragile: 0.5, level: 3, load: 'slabs' },
  coils: { ru: 'Рулонная сталь', en: 'Steel coils', trailer: 'flatbed', mass: [20, 25], rate: 1.2, fragile: 0.2, level: 3, load: 'coils' },
  bricks: { ru: 'Кирпич на поддонах', en: 'Pallets of bricks', trailer: 'flatbed', mass: [18, 24], rate: 1.0, fragile: 0.6, level: 1, load: 'bricks' },
  diesel: { ru: 'Дизельное топливо', en: 'Diesel fuel', trailer: 'tanker', mass: [20, 26], rate: 1.45, fragile: 0.5, level: 4, adr: true },
  petrol: { ru: 'Бензин', en: 'Petrol', trailer: 'tanker', mass: [18, 24], rate: 1.55, fragile: 0.6, level: 5, adr: true },
  milk: { ru: 'Сырое молоко', en: 'Raw milk', trailer: 'tanker', mass: [18, 24], rate: 1.15, fragile: 0.5, level: 2 },
  oil: { ru: 'Подсолнечное масло', en: 'Sunflower oil', trailer: 'tanker', mass: [20, 24], rate: 1.2, fragile: 0.4, level: 2 },
  chemicals: { ru: 'Химикаты', en: 'Chemicals', trailer: 'tanker', mass: [16, 22], rate: 1.6, fragile: 0.8, level: 6, adr: true },
  containers: { ru: 'Контейнер с товарами', en: 'Container of goods', trailer: 'container', mass: [12, 24], rate: 1.15, fragile: 0.4, level: 2 },
  logs: { ru: 'Брёвна', en: 'Logs', trailer: 'logger', mass: [20, 26], rate: 1.05, fragile: 0.1, level: 1 },
  excavator: { ru: 'Экскаватор', en: 'Excavator', trailer: 'lowloader', mass: [22, 30], rate: 1.8, fragile: 0.6, level: 6, load: 'excavator' },
  tractor: { ru: 'Трактор', en: 'Farm tractor', trailer: 'lowloader', mass: [10, 16], rate: 1.6, fragile: 0.5, level: 4, load: 'tractor' },
  transformer: { ru: 'Трансформатор', en: 'Transformer', trailer: 'lowloader', mass: [26, 34], rate: 2.0, fragile: 1.2, level: 8, load: 'transformer' },
};

// Companies: kind drives depot visuals; out = cargo produced, in = cargo accepted.
export const COMPANIES = {
  retail: { ru: 'РЦ «ТоргСеть»', en: 'TorgSet DC', kind: 'warehouse', color: '#d6402e', out: ['groceries', 'beverages'], in: ['groceries', 'beverages', 'appliances', 'furniture', 'frozen', 'dairy', 'meat', 'vegetables', 'fish', 'textile'] },
  logistic: { ru: 'Логистический парк', en: 'Logistics Park', kind: 'warehouse', color: '#2a6fb5', out: ['appliances', 'textile', 'carParts', 'containers', 'furniture'], in: ['appliances', 'textile', 'containers', 'carParts', 'paper', 'groceries'] },
  agro: { ru: 'Агрохолдинг «Нива»', en: 'Niva Agro', kind: 'farm', color: '#5e9b2d', out: ['vegetables', 'milk', 'oil'], in: ['fertilizer', 'tractor', 'diesel'] },
  dairy: { ru: 'Молочный комбинат', en: 'Dairy Plant', kind: 'plant', color: '#3a8fd1', out: ['dairy', 'frozen'], in: ['milk'] },
  meat: { ru: 'Мясокомбинат', en: 'Meat Plant', kind: 'plant', color: '#b13a35', out: ['meat', 'frozen'], in: ['vegetables'] },
  mill: { ru: 'Мелькомбинат', en: 'Flour Mill', kind: 'elevator', color: '#c39a3c', out: ['flour'], in: ['fertilizer'] },
  timber: { ru: 'Леспромхоз', en: 'Forestry', kind: 'forestry', color: '#477a3d', out: ['logs'], in: ['diesel', 'excavator'] },
  sawmill: { ru: 'Лесопильный завод', en: 'Sawmill', kind: 'sawmill', color: '#9b6a37', out: ['lumber', 'furniture'], in: ['logs'] },
  paper: { ru: 'Целлюлозно-бумажный комбинат', en: 'Pulp and Paper Mill', kind: 'factory', color: '#6c7f8c', out: ['paper'], in: ['logs', 'chemicals'] },
  steel: { ru: 'Металлургический комбинат', en: 'Steel Works', kind: 'steel', color: '#c45a26', out: ['coils', 'pipes'], in: ['diesel', 'chemicals'] },
  build: { ru: 'Строительная база', en: 'Builders Yard', kind: 'yard', color: '#e2a72e', out: ['buildMix', 'bricks'], in: ['lumber', 'bricks', 'slabs', 'pipes', 'buildMix'] },
  concrete: { ru: 'Завод ЖБИ', en: 'Precast Concrete Plant', kind: 'factory', color: '#8b939a', out: ['slabs'], in: ['buildMix', 'coils'] },
  site: { ru: 'Стройплощадка ЖК', en: 'Housing Site', kind: 'site', color: '#ef8b1c', out: [], in: ['slabs', 'bricks', 'lumber', 'excavator', 'pipes', 'buildMix'] },
  fuel: { ru: 'Нефтебаза', en: 'Fuel Depot', kind: 'tanks', color: '#e0b21b', out: ['diesel', 'petrol'], in: ['chemicals'] },
  chem: { ru: 'Химический завод', en: 'Chemical Plant', kind: 'chem', color: '#7c4fb0', out: ['chemicals', 'fertilizer'], in: ['diesel', 'containers'] },
  cars: { ru: 'Автозавод', en: 'Car Factory', kind: 'factory', color: '#3c4f8f', out: ['carParts'], in: ['coils', 'carParts', 'chemicals', 'containers'] },
  machinery: { ru: 'Машиностроительный завод', en: 'Machine Works', kind: 'factory', color: '#2f6d6a', out: ['excavator', 'tractor', 'transformer'], in: ['coils', 'pipes', 'carParts'] },
  port: { ru: 'Грузовой порт', en: 'Cargo Port', kind: 'port', color: '#1f5d8f', out: ['containers', 'fish', 'oil'], in: ['containers', 'lumber', 'coils', 'fertilizer', 'oil'] },
  pharma: { ru: 'Фармацевтический завод', en: 'Pharmaceutical Plant', kind: 'plant', color: '#2fa69a', out: ['medicine'], in: ['chemicals'] },
  hospital: { ru: 'Областная больница', en: 'Regional Hospital', kind: 'hospital', color: '#2f8fd6', out: [], in: ['medicine'] },
  drinks: { ru: 'Завод напитков', en: 'Drinks Factory', kind: 'plant', color: '#3daa58', out: ['beverages'], in: ['vegetables', 'containers'] },
  furniture: { ru: 'Мебельная фабрика', en: 'Furniture Factory', kind: 'factory', color: '#a06b3b', out: ['furniture'], in: ['lumber', 'textile'] },
  brick: { ru: 'Кирпичный завод', en: 'Brickworks', kind: 'factory', color: '#a54a32', out: ['bricks'], in: ['diesel'] },
  textile: { ru: 'Текстильная фабрика', en: 'Textile Mill', kind: 'factory', color: '#c2577a', out: ['textile'], in: ['containers', 'chemicals'] },
};

const REGION_BASE = {
  capital: ['retail', 'logistic', 'pharma', 'hospital', 'site', 'drinks', 'cars'],
  central: ['retail', 'logistic', 'build', 'agro', 'dairy', 'site'],
  north: ['retail', 'timber', 'sawmill', 'build', 'paper'],
  volga: ['retail', 'logistic', 'fuel', 'agro', 'build', 'meat'],
  ural: ['retail', 'machinery', 'fuel', 'steel', 'build'],
  steppe: ['retail', 'agro', 'mill', 'fuel', 'build'],
  south: ['retail', 'agro', 'mill', 'drinks', 'meat', 'build'],
};

const CITY_EXTRA = {
  moscow: ['concrete', 'furniture', 'machinery'],
  spb: ['port', 'cars', 'concrete', 'furniture'],
  cherepovets: ['steel', 'chem'],
  lipetsk: ['steel'],
  chelyabinsk: ['steel', 'machinery'],
  tolyatti: ['cars'],
  chelny: ['cars', 'machinery'],
  arkhangelsk: ['port', 'paper', 'timber'],
  novorossiysk: ['port', 'fuel'],
  taganrog: ['port', 'machinery'],
  astrakhan: ['port'],
  kaluga: ['cars'],
  ivanovo: ['textile'],
  yaroslavl: ['chem', 'fuel'],
  samara: ['chem', 'fuel'],
  ufa: ['chem', 'fuel'],
  perm: ['chem', 'paper'],
  nizhny: ['cars', 'machinery'],
  kazan: ['chem', 'machinery'],
  voronezh: ['machinery', 'pharma'],
  krasnodar: ['agro', 'mill'],
  rostov: ['machinery', 'port'],
  kirov: ['timber', 'sawmill'],
  vologda: ['dairy', 'timber'],
  petrozavodsk: ['timber', 'sawmill'],
  kostroma: ['furniture', 'sawmill'],
  bryansk: ['machinery'],
  tula: ['steel', 'chem'],
  belgorod: ['meat', 'concrete'],
  kursk: ['agro'],
  tambov: ['agro', 'mill'],
  penza: ['furniture'],
  saransk: ['pharma'],
  ekb: ['machinery', 'concrete', 'pharma'],
  orenburg: ['fuel', 'mill'],
  saratov: ['oil', 'mill'],
  volgograd: ['steel', 'chem'],
  stavropol: ['chem', 'agro'],
  izhevsk: ['machinery'],
  smolensk: ['furniture'],
  rybinsk: ['machinery'],
  syzran: ['fuel'],
  elista: ['meat'],
  sochi: ['drinks'],
  pyatigorsk: ['drinks', 'hospital'],
};

export function companiesFor(city) {
  const base = REGION_BASE[city.region] ?? REGION_BASE.central;
  const extra = CITY_EXTRA[city.id] ?? [];
  const list = [...new Set([...extra, ...base])].filter((id) => COMPANIES[id]);
  const max = city.pop > 2000 ? 8 : city.pop > 700 ? 6 : city.pop > 250 ? 5 : 4;
  return list.slice(0, max);
}

export const TRUCKS = {
  sokol: { ru: '«Сокол» 440', en: 'Sokol 440', price: 0, power: 440, torque: 2200, cab: 'sokol' },
  buran: { ru: '«Буран» 520', en: 'Buran 520', price: 420000, power: 520, torque: 2550, cab: 'buran' },
  atlant: { ru: '«Атлант» 650', en: 'Atlant 650', price: 860000, power: 650, torque: 3100, cab: 'atlant' },
};

export const UPGRADES = {
  engine: { ru: 'Чип-тюнинг двигателя', en: 'Engine tune', steps: [0, 35000, 80000, 140000], bonus: [0, 0.07, 0.14, 0.22] },
  brakes: { ru: 'Тормоза и ретардер', en: 'Brakes and retarder', steps: [0, 25000, 60000, 110000], bonus: [0, 0.1, 0.2, 0.32] },
  tank: { ru: 'Топливный бак', en: 'Fuel tank', steps: [0, 18000, 42000], bonus: [600, 900, 1200] },
  tyres: { ru: 'Шины', en: 'Tyres', steps: [0, 22000, 50000], bonus: [0, 0.08, 0.16] },
  lights: { ru: 'Дополнительные фары', en: 'Extra lights', steps: [0, 15000], bonus: [0, 1] },
};

export const PAINTS = [
  { id: 'white', ru: 'Белый', en: 'White', color: '#e9ebe8', price: 0 },
  { id: 'red', ru: 'Красный', en: 'Red', color: '#a8231d', price: 12000 },
  { id: 'blue', ru: 'Синий', en: 'Blue', color: '#1f4f8c', price: 12000 },
  { id: 'orange', ru: 'Оранжевый', en: 'Orange', color: '#e0701b', price: 12000 },
  { id: 'green', ru: 'Тёмно-зелёный', en: 'Dark green', color: '#244d34', price: 15000 },
  { id: 'black', ru: 'Чёрный', en: 'Black', color: '#16181b', price: 15000 },
  { id: 'yellow', ru: 'Жёлтый', en: 'Yellow', color: '#e9b51c', price: 15000 },
  { id: 'silver', ru: 'Серебристый', en: 'Silver', color: '#9aa3ab', price: 18000 },
];

export const FUEL_PRICE = 68;
export const BASE_RATE = 78;

export function levelForXp(xp) {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  return level;
}
export function xpForLevel(level) {
  return Math.round(600 * Math.pow(level - 1, 1.55));
}
