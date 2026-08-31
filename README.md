# KitSite Politekh

Адаптивний сайт для збору контактів і побажань факультету з live-екраном для телевізора.

## Що є в проєкті

- стартова сторінка з логотипом і кнопкою реєстрації
- форма з телефоном, ім'ям і Telegram
- форма побажання
- екран для телевізора з котиком, QR-кодами та live-побажаннями
- адмін-сторінка `/admin`
- керування списком заборонених слів для побажань в адмінці
- збереження побажань і бази учасників у `submissions.json`
- резервні копії даних у `backups/`

## Локальний запуск

1. Встановіть Node.js 18+.
2. Запустіть `node server.js`.
3. Відкрийте `http://localhost:3000`.

## Де лежать дані

- основний файл: `data/submissions.json`
- резервні копії: `data/backups/`
- останній гарантований бекап: `data/backups/submissions-latest.json`
- історія бекапів на кожне збереження: `data/backups/submissions-YYYY-MM-DDTHH-mm-ss-sss.json`
- якщо задана змінна середовища `DATA_DIR`, дані будуть зберігатися там

## Deploy на Render

Проєкт підготовлений під Render через [render.yaml](C:/Users/Serhii/Downloads/KitSitePolitekh/render.yaml).

1. Завантажте цей проєкт у GitHub-репозиторій.
2. У Render натисніть `New +`, далі `Blueprint`.
3. Підключіть репозиторій і підтвердьте створення сервісу.
4. У `Environment Variables` задайте:
   - `ADMIN_USER`
   - `ADMIN_PASSWORD`
   - `DATA_DIR=/var/data/kitsite-politekh`
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
5. Якщо хочете, щоб дані не зникали після перезапусків і деплоїв, підключіть persistent disk і змонтуйте його в `/var/data`.
6. Дочекайтеся деплою та відкрийте URL, який видасть Render.

Health check: `/healthz`

## Важливо про Render

Станом на 30 серпня 2026 року Render зберігає локальні файли між деплоями лише для paid web service з persistent disk. На `free` плані файлова система тимчасова, тому і `submissions.json`, і резервні копії можуть зникнути після рестарту або нового деплою.

У цьому проєкті код уже підготовлений до постійного збереження:

- можна вказати окрему папку через `DATA_DIR`
- запис у файл відбувається атомарно через тимчасовий файл і `rename`
- при кожному оновленні створюється денний бекап, `submissions-latest.json` і timestamp-бекап
- якщо `submissions.json` зникне або пошкодиться, сервер спробує автоматично відновити його з бекапу
- якщо задані `TELEGRAM_BOT_TOKEN` і `TELEGRAM_CHAT_ID`, сервер автоматично надсилає JSON-бекап бази в Telegram

## Telegram backup

1. Створіть бота через `@BotFather` і отримайте token.
2. Додайте бота в свій чат або відкрийте діалог із ботом.
3. Дізнайтесь `chat_id`.
4. Запишіть `TELEGRAM_BOT_TOKEN` і `TELEGRAM_CHAT_ID` у Render environment variables.

Після цього сервер буде надсилати бекап у Telegram:

- після нової заявки учасника
- після видалення учасника з адмінки
- після автоархівації завершеної 10-годинної сесії

## Адмінка

- URL: `/admin`
- логін і пароль беруться з `ADMIN_USER` та `ADMIN_PASSWORD`
- у панелі можна редагувати список заборонених слів для фільтрації побажань

## Що варто змінити перед публікацією

- посилання на соцмережі в [public/app.js](C:/Users/Serhii/Downloads/KitSitePolitekh/public/app.js)
- fallback-значення адмінки в [server.js](C:/Users/Serhii/Downloads/KitSitePolitekh/server.js:8)
