# Система управління рієлторським агентством

Реализация этапов 1–6 учебного проекта. Проверка требований и архитектуры описана в [docs/project-stages.md](docs/project-stages.md).

- **Веб-приложение:** React/Vite, Netlify Functions, Supabase Auth и таблицы PostgreSQL.
- **C# приложение:** ASP.NET Core .NET 10, бизнес-логика и EF Core 10 с SQLite. Сохранение по умолчанию выполняется в БД, а JSON используется для импорта/экспорта.

Netlify не запускает C# процесс: его HTTP API реализован в JavaScript. Вариант .NET позволяет запускать и проверять требуемый в задании EF Core локально. Оба варианта сохраняют исходные идентификаторы и бизнес-данные; изменения правил в них нужно согласовывать.

## Быстрый локальный запуск веб-версии

Нужен Node.js 22 или новее. Из корня репозитория:

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd run dev
```

Открыть <http://127.0.0.1:8888>. На Linux/macOS используйте `npm` вместо `npm.cmd`.

Без настроек Supabase сервер запускает локальное демо на loopback-адресе. Данные берутся из `RealEstateAgency/agency_data.json` и сохраняются в игнорируемую папку `.local`, оригинал не изменяется. Демонстрационные аккаунты:

| Роль | Email | Пароль только локального демо |
| --- | --- | --- |
| Менеджер | `manager@example.test` | `local-demo-only` |
| Агент | `agent@example.test` | `local-demo-only` |
| Клиент | `client@example.test` | `local-demo-only` |

Демо-авторизация не импортируется в Netlify Function и недоступна в production. При наличии настроек Supabase локальный сервер использует настоящие БД и Auth. `npm run dev` раздаёт собранный интерфейс без HMR; после изменения React повторите `npm.cmd --prefix client-app run build`. Такой запуск поддерживает Windows-путь с `#`.

## Supabase: схема и перенос исходных данных

Откройте **SQL Editor → New query** в своём проекте Supabase и выполните **весь [supabase/setup.sql](supabase/setup.sql)**. Он выполняет в одной транзакции:

1. Создание таблиц, внешних ключей, ограничений, индексов и серверных функций.
2. Перенос предыдущего облачного `agency_state`, если новая схема ещё пуста.
3. Импорт отсутствующих записей из исходного файла: **12 объектов, 3 клиента, 3 агента, 2 сделки**, истории цен и статусов, поиски и уведомления.

Существующие записи с тем же ID сохраняются без перезаписи. Повторный запуск не создаёт дубликатов. Старая таблица `agency_state` остаётся резервной копией и больше не используется новым API. При любой ошибке вся транзакция откатывается.

Файл генерируется из исходных данных и миграции. После изменения исходного JSON обновите его:

```powershell
npm.cmd run db:prepare
```

Отдельная миграция без встроенного набора данных: [202611180001_relational_accounts.sql](supabase/migrations/202611180001_relational_accounts.sql).

В исходном enum C# арендатор и владелец имели одинаковое значение `2`. Теперь `1` — покупатель, `2` — арендатор, `3` — владелец. Импорт сохраняет исходные значения; старые записи с `2` менеджеру нужно проверить и при необходимости исправить в интерфейсе.

Ответственный агент выводится из существующей сделки, если связь однозначна. Остальные объекты и клиенты остаются непривязанными и доступны менеджеру для назначения агенту. Исходные даты, цены и идентификаторы не заменяются новыми.

## Настройка настоящего Auth и production

Для локального подключения создайте `.env` по `.env.example`. Для Netlify задайте те же имена в **Project configuration → Environment variables**, контекст **Production**:

```dotenv
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=sb_secret_your_server_key
SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_public_key
BOOTSTRAP_MANAGER_EMAIL=owner@example.com
```

Вместо `SUPABASE_SECRET_KEY` поддерживается прежний `SUPABASE_SERVICE_ROLE_KEY`. Auth использует publishable key, а доступ сервера к таблицам — secret/service_role key. Ключи и email первого менеджера не вшиваются в браузерную сборку. Не используйте префикс `VITE_` для секретных настроек.

По возможности ограничьте scope переменных областью Functions. Если тариф Netlify требует All scopes, контекст всё равно должен оставаться Production; ключ будет доступен и процессу сборки. На текущем развёртывании этот вариант согласован с владельцем. `.env`, `.local` и `.netlify` исключены из Git.

В Supabase **Authentication → URL Configuration**:

- Site URL: `https://willowy-moxie-1de800.netlify.app`
- Redirect URLs: `https://willowy-moxie-1de800.netlify.app/login` и `https://willowy-moxie-1de800.netlify.app/reset-password`.
- Для локальной работы при необходимости добавьте `http://127.0.0.1:8888/login` и `http://127.0.0.1:8888/reset-password`.

Email-подтверждение должно быть включено. Зарегистрируйте адрес из `BOOTSTRAP_MANAGER_EMAIL`, подтвердите письмо и войдите: сервер назначит ему роль первого менеджера. Привилегии не берутся из формы регистрации или редактируемого `user_metadata`. При наличии менеджера произвольный новый пользователь не становится менеджером автоматически.

Новые пользователи получают собственную запись клиента. После их первого подтверждённого входа менеджер видит их в разделе **Користувачі** и может назначить роль агента либо привязать аккаунт к существующей записи клиента. Чтобы клиент видел историю из импортированного файла, выберите для него соответствующую запись клиента.

Защита входом Netlify действует отдельно от аккаунтов приложения. Она сохраняется без изменений; если проект закрыт для внешних посетителей, им сначала понадобится разрешённый владельцем доступ к самому сайту.

### Развёртывание

В Netlify импортируйте [DawnShaker/MalKukCSProj](https://github.com/DawnShaker/MalKukCSProj), ветку `main`. Корень — папка с `netlify.toml`, не `client-app`:

- Build command: `npm run build`
- Publish directory: `client-app/dist`
- Functions: `netlify/functions`
- Node.js: 24.

Сначала выполните SQL и настройте переменные, затем публикуйте новый код. Изменения переменных требуют нового deploy. `/api/health` должен вернуть `{"status":"ok","storage":"supabase"}`; включённая защита Netlify может потребовать предварительного входа.

## Работа ролей

| Роль | Возможности |
| --- | --- |
| Менеджер | Все объекты, клиенты и сделки; назначение ответственных агентов; создание агентов; управление доступом; общая аналитика и CSV-отчёт за период. |
| Агент | Свои объекты, клиенты и сделки. Нельзя изменять чужие записи, добавлять агентов, управлять ролями или читать общую статистику. |
| Клиент | Каталог доступных объектов; свои запросы, сохранённые фильтры, история поиска и уведомления; создание новых поисков и запросов. |

Ограничения проверяются на сервере для каждого запроса и каждого идентификатора. Обход скрытых кнопок прямым HTTP-запросом не даёт доступа. Нельзя снять роль последнего менеджера или привязать один клиентский/агентский профиль двум аккаунтам.

Сессии передаются в HttpOnly cookie; в HTTPS используются `Secure`, `SameSite=Lax` и префикс `__Host-`. Токены не сохраняются в Web Storage. Изменения защищены случайным CSRF-кодом, а токен пользователя проверяется через Supabase Auth. Прямой доступ браузера к таблицам и административным RPC закрыт RLS и привилегиями.

## C# / Entity Framework Core

Нужен .NET SDK 10. EF Core по умолчанию использует SQLite. Начальная миграция находится в `RealEstateAgency/PersistenceLayer/Migrations`; `Database.Migrate()` создаёт схему при запуске.

Импорт в пустую локальную SQLite БД:

```powershell
dotnet run --project RealEstateAgency --no-launch-profile -- --import-json RealEstateAgency/agency_data.json
dotnet run --project RealEstateAgency --no-launch-profile
```

После этого API .NET работает на `http://localhost:5000`. Для другой SQLite БД задайте `ConnectionStrings__Agency`, например `Data Source=D:/data/agency.db`. JSON-импорт .NET откажется перезаписывать непустую базу.

Экспорт:

```powershell
dotnet run --project RealEstateAgency --no-launch-profile -- --export-json .local/agency-ef-export.json
```

`EfAgencyDataManager` подключён к `AgencyService` через `IAgencyDataManager`. Основные сущности, истории, уведомления и поиски хранятся строками таблиц, изменения и версия — в одной транзакции. `JsonDataManager` сохранён для совместимости и не выбран основным хранилищем.

Для дальнейших миграций доступен локальный инструмент:

```powershell
dotnet tool restore
dotnet ef migrations add MigrationName --project RealEstateAgency --output-dir PersistenceLayer/Migrations
```

## Дополнительный импорт и экспорт Supabase

С настроенным `.env` можно предварительно просмотреть импорт и затем добавить отсутствующие записи:

```powershell
npm.cmd run db:import -- --dry-run
npm.cmd run db:import
npm.cmd run db:import -- .local/agency_data.json
npm.cmd run db:export -- .local/agency-export.json
```

Повторный импорт сохраняет изменения существующих облачных записей. Конфликтующие сделки на один объект пропускаются и указываются в отчёте. Экспорт не перезаписывает существующий файл.

## Проверки

```powershell
npm.cmd test
dotnet run --project tests/RealEstateAgency.PersistenceChecks
```

Node-тесты проверяют бизнес-логику, ролевую изоляцию, IDOR, CSRF, cookie и Auth-контракт; настоящая PostgreSQL-совместимая среда PGlite выполняет SQL, проверяет внешние ключи, транзакции, повторный импорт и роли. C# проверки выполняют EF-миграцию на SQLite, импортируют исходный файл и проверяют сохранение, истории и конкурентные изменения.

Документация: [Supabase Auth](https://supabase.com/docs/guides/auth), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [EF Core](https://learn.microsoft.com/en-us/ef/core/), [Netlify Functions](https://docs.netlify.com/build/functions/get-started/).
