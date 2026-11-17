# Система управління рієлторським агентством

Веб-версия для **Netlify + Supabase**: React/Vite → `/api/*` → Netlify Functions (JavaScript, Node.js) → Supabase PostgreSQL.

Исходный ASP.NET Core проект сохранён в `RealEstateAgency/`. Netlify-версия выполняет бизнес-логику из `server/agency.mjs`; отдельный хостинг .NET для неё не требуется. Изменения бизнес-правил в C# и JavaScript нужно согласовывать вручную.

## Локальный запуск

Нужен Node.js 22 или новее; Netlify использует Node.js 24. Из корня репозитория:

```powershell
npm.cmd run build
npm.cmd run dev
```

Открыть <http://127.0.0.1:8888>. Сборка сама устанавливает клиентские зависимости по `client-app/package-lock.json`. На Linux/macOS используйте `npm` вместо `npm.cmd`.

Без переменных Supabase локальный сервер использует `.local/agency_data.json`. При первом запуске данные берутся из исходного C# JSON; изменения сохраняются отдельно и не меняют оригинал. Путь с `#` поддерживается этим запуском собранной версии. После изменений React повторите `npm.cmd run build` и обновите страницу. `npm run dev` запускает API и раздачу собранного интерфейса, без HMR.

Проверки:

```powershell
npm.cmd test
```

## Создание Supabase

1. Создайте проект в [Supabase Dashboard](https://supabase.com/dashboard), задайте пароль базы и дождитесь готовности.
2. В **SQL Editor** выполните файл [202611170001_agency_state.sql](supabase/migrations/202611170001_agency_state.sql). Он создаёт таблицу и пустую запись агентства. Повторный запуск сохраняет существующие данные.
3. В настройках проекта скопируйте **Project URL** и **Secret API key** (`sb_secret_…`). Поддерживается также прежний ключ `service_role`. Публичный `anon`/publishable key для этого сервера не подходит.
4. Для локального подключения скопируйте `.env.example` в `.env` и замените примеры настоящими значениями:

```dotenv
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=sb_secret_your_server_key
PORT=8888
```

После перезапуска `npm.cmd run dev` будет использовать Supabase вместо локального файла. `.env` исключён из Git. Серверные ключи нельзя добавлять в переменные с префиксом `VITE_` или в клиентский код.

### Перенос существующих записей

После SQL-миграции и настройки `.env`, пока база ещё пуста:

```powershell
npm.cmd run db:import
```

Это перенесёт `RealEstateAgency/agency_data.json`, включая идентификаторы, сделки, историю и поиски. Для переноса изменений из нового локального запуска:

```powershell
npm.cmd run db:import -- .local/agency_data.json
```

Импорт откажется перезаписывать непустую базу. Он не выполняется автоматически при сборке или публикации. Можно пропустить импорт и добавлять записи через интерфейс.

В исходном C# enum `Tenant` и `Owner` имели одно значение `2`. В веб-версии: `1` — покупатель, `2` — арендатор, `3` — владелец. Старые записи с `2` импортируются без догадок о роли; их нужно проверить отдельно. Исходный C# JSON не изменяется.

## Развёртывание на Netlify

1. В Netlify выберите **Add new project → Import an existing project → GitHub**, репозиторий [DawnShaker/MalKukCSProj](https://github.com/DawnShaker/MalKukCSProj), ветка `main`.
2. Корнем проекта должна быть папка с `netlify.toml` и этим README. **Base directory** и **Package directory** оставьте пустыми, не выбирайте `client-app` в качестве корня. Настройки берутся из `netlify.toml`:
   - Build command: `npm run build`
   - Publish directory: `client-app/dist`
   - Functions directory: `netlify/functions`
3. В **Environment variables** задайте `SUPABASE_URL` и `SUPABASE_SECRET_KEY` для среды **Production**, с доступом для **Functions**. Для старого ключа вместо `SUPABASE_SECRET_KEY` используйте `SUPABASE_SERVICE_ROLE_KEY`. Ключ вводите в Netlify, не в GitHub и не в чат.
4. Запустите deploy. Если меняли переменные после публикации, выполните новый deploy.
5. Откройте `https://ваш-сайт.netlify.app/api/health`: ожидается `{"status":"ok","storage":"supabase"}`. Затем проверьте каталог, клиентов, сделки и аналитику. Прямые переходы и обновление `/clients`, `/deals`, `/analytics` поддерживаются.

Если API вернул `503`, проверьте переменные и выполнение SQL. Неизвестные `/api/*` возвращают JSON `404`, а не HTML. `vite preview` раздаёт только интерфейс и без API не заменяет полный запуск.

Приложение, как и исходная версия, пока **не имеет авторизации пользователей**. RLS закрывает прямой доступ к таблице из браузера, но серверный `/api` доступен посетителям сайта. Для размещения с реальными контактами клиентов нужен контроль доступа к приложению; защита ключа Supabase его не заменяет.

## Хранение и ограничения

`agency_state` содержит один документ JSONB с коллекциями `properties`, `clients`, `agents`, `deals`, `requests`. Это сохраняет совместимость с файловой моделью учебного проекта; это ещё не нормализованная схема таблиц и не интеграция Entity Framework из будущего этапа задания.

Каждая операция записи атомарно заменяет документ при совпадении `version`. При конфликте сервер перечитывает данные и повторяет операцию до пяти раз, затем отвечает `409`. Создание/отмена сделки и изменение статуса объекта сохраняются вместе. Каждый запрос читает актуальную базу; данные не зависят от памяти или файлов экземпляра Netlify Functions.

Модель подходит для небольшой учебной CRM. При росте объёма потребуется переход к отдельным таблицам и транзакциям PostgreSQL. Денежные суммы новой версии округляются до центов; календарные дни и месяцы аналитики определяются в `Europe/Kyiv`.

Автотесты проверяют бизнес-операции, HTTP-контракт, импорт формата C#, перезапуски локального хранилища и конфликты Supabase через имитацию REST API. Подключение к настоящему Supabase проверяется после создания проекта.

Документация платформ: [Netlify Functions](https://docs.netlify.com/build/functions/get-started/), [Netlify configuration](https://docs.netlify.com/build/configure-builds/file-based-configuration/), [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
