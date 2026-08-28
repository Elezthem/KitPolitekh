# KitSite Politekh

Адаптивний сайт для збору контактів і побажань факультету з live-екраном для телевізора.

## Що є в проєкті

- стартова сторінка з логотипом і кнопкою реєстрації
- форма з телефоном, ім'ям і Telegram
- форма побажання
- екран для телевізора з котиком, QR-кодами та live-побажаннями
- адмін-сторінка `/admin`
- локальне збереження заявок у `data/submissions.json`

## Локальний запуск

1. Встановіть Node.js 18+.
2. Запустіть `node server.js`.
3. Відкрийте `http://localhost:3000`.

## Deploy на Render

Проєкт підготовлений під Render через [render.yaml](C:/Users/Serhii/Downloads/KitSitePolitekh/render.yaml).

1. Завантажте цей проєкт у GitHub-репозиторій.
2. У Render натисніть `New +`, далі `Blueprint`.
3. Підключіть репозиторій і підтвердьте створення сервісу.
4. У `Environment Variables` задайте:
   - `ADMIN_USER`
   - `ADMIN_PASSWORD`
5. Дочекайтеся деплою та відкрийте URL, який видасть Render.

Health check: `/healthz`

## Важливо про безкоштовний план

На безкоштовному Render файлове сховище тимчасове. Це означає, що `data/submissions.json` може очищатися після рестарту або нового деплою. Для постійного збереження заявок наступним кроком варто перенести дані в базу.

## Адмінка

- URL: `/admin`
- логін і пароль беруться з `ADMIN_USER` та `ADMIN_PASSWORD`

## Що варто змінити перед публікацією

- посилання на соцмережі в [public/app.js](C:/Users/Serhii/Downloads/KitSitePolitekh/public/app.js:14)
- fallback-значення адмінки в [server.js](C:/Users/Serhii/Downloads/KitSitePolitekh/server.js:8)
