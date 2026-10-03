# Текущие локальные проверки «Дальнобоя по России»

Round21; обновлено 2026-10-01T06:51:31.487471+00:00; версия 1.0.0. Только приватные headless-контексты, без изменения пользовательских окон/сохранений. Локальная сборка, загрузка в портал/модерация/публикация отсутствуют.

| Область | Проверено | Граница |
|---|---|---|
| Полный рейс | [Native final](../tmp/qa/round21-final-native-trip.json): 355.87 сек симуляции; оплата 13200 ₽; баланс после reload 45200 ₽. Контактов по native-наблюдателю 0; повреждения тягача 0%, груза 0%; расходы 0 ₽. App/QA совпадают с финальной заморозкой; обычные клавиши, E и persisted reload. | Телепортов, injected steps и assisted unload нет; headless не доказывает foreground FPS или все 10 городов. |
| Разгрузка | Весь тягач и прицеп внутри видимой зоны 8.2×19 м: maxX=1.8769 м, maxZ=8.9667 м; запас по ширине 2.2231 м, по длине 0.5333 м; ошибки направления 3.751°/1.570°. [174 geometry](../tmp/qa/round21-delivery-results.json)/[132 independent](../tmp/qa/round21-delivery-review.md) PASS; прежний broadside false positive отвергается. | Assisted20% и экономика/save сохранены; первый native с дефектом не получал payout. |
| Трафик | [276 независимых пар/10 actual Rapier](../tmp/qa/round21-independent-review.md) без контактов/тупиков; [72 машины/300с](../tmp/qa/round21-traffic-summary.json), 0 sampled contacts; прицеп включён в прогноз. | Очереди 45–61сек; fleet sampled каждый10-й step. Внезапный манёвр без тормозного пути не гарантируется. |
| Ядро/GPS | [23 исходных регрессии](../tmp/qa/round21-regression-report.md)/46model/6network/10navigation PASS; 36 steering profiles остаются историческим Round20 evidence. | Planar yaw-assistance без подвески; старый wall peak11.8см/settled1мм сохранён. |
| Дороги/кабина | [12 material](../tmp/qa/round21-surface-results.json)/[13 marking](../tmp/qa/round21-road-marks-results.json) PASS; реальные ribbon vertices сохранены. [11 финальных кадров](../tmp/qa/root-round21-2026-10-01T06-20-37-349Z-results.json), downloaded SHA/GL0/errors0/warnings0. | Уровень ниже ETS2; continuous-motion flicker/foregroundFPS NOT TESTED. |
| Exact runtime | [Production replay](../tmp/qa/round21-exact-results.json): 35 проверок; точный app SHA `77d2350ee75111a23472577f03e2b63243aca6a91ab10da39c6a056a9f49e4cd`. | Физические телефоны и live SDK/ads/cloud/portal NOT TESTED. |
| Архив/требования | 35 runtime-файлов/CRC/SHA/marker0/comment0, [audit](runtime-audit-733f8847f1df.json); [свежие157 правил](../tmp/sources/yandex-requirements-round21-2026-10-01.md), без source delta. | 22PASS/1FAIL/90NOT TESTED/44N/A сохранены. Игра не release-ready. |

Точный ZIP SHA `733f8847f1df5de4d880d87677f4408ddb2fea9beb0271ca98ea4f0d4d68fb36`; 33354003 распакованных байт; 25651911 ZIP-байт. [Текущий manifest](current-local-evidence-2026-10-01.json). [Поимённые157пунктов](release-check-2026-10-01.md).

Первый native app3c033/QA4f176 и parking iteration1 FAIL сохранены; preflight wait не считается рейсом. [Предыдущий manifest](current-local-evidence-2026-10-01-before-round21-20261001T065131486954Z-7f7183d1.json) и неизменяемые Round20 captures закреплены отдельно. Исторические свидетельства ниже имеют собственные SHA и scope.

[Первый exact FAIL](../tmp/qa/round21-exact-failed-seeded-reload/results.json): harness заново записывал seed при reload; отчет и PNG сохранены. Новый exact прогон допускается только после исправления seed-once при сохранённых payout/reload assertions. Native fresh-profile reload проверен независимо.

## Round20 — исторический инвентарь

Обновлено 2026-10-01T04:55:46.142243+00:00; локальная дата 01.10.2026. Round20, версия1.0.0. Обычная игра8787; QA8789; точный архив8797. Только отдельные headless контексты; пользовательские окна и сохранения не изменены.

| Область | Проверено | Граница |
|---|---|---|
| Первый рейс | Понятная карточка Москва→Владимир, продукты9т, оплата/дистанция/время. «Начать доставку» готовит сцепку в депо; ручные заказы сохранены. Активный заказ всегда продолжается. Независимое ревью проверило все10городов и профиль. | Подготовка2.2сек; топливо/деньги/повреждения/улучшения сохраняются. |
| Руление | [36 измеренных профилей и17 регрессий](../tmp/qa/round20-driving-report.md); loaded90° на15км/ч2.6–2.7сек вместо30–36. Физический угол используется колёсами и рулём. [Независимая Rapier проверка](../tmp/qa/round20-independent-review.md). | Плоская модель с ограниченным моментом, без настоящей подвески. Peak wall penetration11.8см, после остановки1мм; прежний FAIL5см сохранён. |
| Полный проезд | [Native рейс](../tmp/qa/round20-final-native-trip.json): старт→городские повороты→трасса→Владимир→E-разгрузка→оплата12286→reload баланс43286. Без телепорта, injected physics steps или автопарковки;262.05сек симуляции. | Helper следовал GPS без избегания трафика: повреждения тягача12.37%, груза9%, расходы1000. Полный рейс был на промежуточном bundle25ff9f; физика/GPS финала те же. Это не чистый проезд и не полный replay финального ZIP. |
| GPS | Городской граф построен из настоящих пересечений дороги. Pickup ведёт в депо, detached — к оставленному прицепу; красная трасса/маркер согласованы. 450 городских и578 междугородних независимых сценариев. | Вся сеть не пройдена человеком; движения всех городских машин отдельно не проверены. |
| Перекрёстки | Белые полосы точно вырезаны по асфальту пересекающей дороги.13pure тестов/80точек; независимые77600SAT/800reverse. Все67road-asphalt vertices побитно прежние. [Ревью](../tmp/qa/round20-road-marks-review.md). | Renderer/physics geometry сохранена; Node timing не FPS. Root просмотрела текущие exterior/cab кадры. |
| Начало/пауза/save | [Exact production](../tmp/qa/round20-exact-results.json):24checks, Escape во время подготовки, native gas/manualE, активный reload, RUEN,4камеры,320×568/568×320/640×360, downloaded app SHA, GL0/errors0/noQAglobals. | Физические телефоны/живой SDK NOT TESTED. |
| Графика |11финальных кадров clear/rain/night/sunset/map/home; SHA/GL0/errors0/warnings0. [Capture](../tmp/qa/root-round17-2026-10-01T04-48-04-930Z-results.json). | Художественный уровень ниже цели; спицы иногда закрываютLCD. Continuous flicker/foregroundFPS NOT TESTED. |
| Ядро/география |46model/6network повторены; physics6старых+17новых;10городов включаяКазань,17междугородних+50городских дорог. | Pure/model evidence не заменяет каждую реальную поездку. |
| Загрузка | Код Loading/Assets сохранён; новый exact cold boot проверен. Round19 delay/error/retry/30resourcecounter доказательства сохранены как история. |20сценариев ошибок Round19 не повторены целиком на Round20. |
| Архив |35runtime файлов, CRC/SHA, marker0/comment0, лицензии сохранены. [Audit](runtime-audit-bf8fff2dda2b.json). Прежний1973ea сохранён вstore с совпадающимSHA. | Только локально; загрузка/модерация/публикация отсутствуют. |

Точный ZIP SHA `bf8fff2dda2bfd9fc87bd33e0129f38ac4d68e09465d9297de310b3b1a94c587`; 33342958 распакованных байт; 25647792 ZIP-байт. [Снимок исходников/доказательств](current-local-evidence-2026-10-01-before-round21-20261001T065131486954Z-7f7183d1.json). Папкаvolga-haul/ключvolga-haul-progress-v1 сохранены.

[Поимённые157пунктов](release-check-2026-10-01.md):22PASS/1FAIL/90NOT TESTED/44N/A; старые E-свидетельства имеют свой scope, новые проверки не повышают непроверенные пункты. Игра не release-ready. Историческая оценка2.9/10 относится к прежнему c89c; новая художественная оценка не присвоена.

