# Авторизатор преподавателя: запуск и подключение

Исходник: [negativchik09/Security](https://github.com/negativchik09/Security), проверенная ревизия `6e4bb988130137749954a08ef813d03a7b11ea4a`. Веб-приложение умеет использовать его вместо Supabase Auth. Данные недвижимости и роли приложения остаются в Supabase PostgreSQL.

В репозитории Security нет адреса публичного сервера. Локальный `http://127.0.0.1:5252` подходит для разработки на этом компьютере. Для сайта на Netlify нужен отдельно работающий HTTPS-сервер Security.

## 1. Подготовка

Нужны Git, Node.js 22+ и .NET SDK 10. В PowerShell из корня RealEstateAgency:

```powershell
npm.cmd ci
npm.cmd run security:prepare -- --username owner@example.com
```

Укажите логин первого менеджера вместо `owner@example.com`. Логин может быть email или обычным именем пользователя. Логин уже подготовленной локальной копии находится в `.local/security-config.json`.

Команда скачивает только исходники в `.local/security-source` и подготавливает их для .NET 10. На этом компьютере .NET 10 уже установлен. Исходная версия сервиса рассчитана на .NET 8; его поддержка завершилась 10 ноября 2026 года ([Microsoft](https://devblogs.microsoft.com/dotnet/dotnet-8-9-end-of-support/)). Обновляются target framework, Microsoft Identity, JWT и EF Core; HTTP-контракт сохраняется.

Также подготовка включает проверку срока действия JWT, убирает опубликованный демонстрационный ключ из настроек и заменяет демонстрационный Seed на создание администратора из конфигурации. Data Protection сохраняет ключи рядом с локальной БД, логирование использует консоль. Исходный репозиторий на GitHub не изменяется.

Создаются два игнорируемых Git файла:

- `.local/security-config.json` — частный JWT-ключ, issuer, audience, логин и случайный начальный пароль администратора.
- `.local/security-server.env` — те же настройки для запуска контейнера.

Откройте `security-config.json` в редакторе, чтобы посмотреть **BootstrapAdmin__Username** и **BootstrapAdmin__Password**. Не публикуйте эти файлы. Повторная подготовка сохраняет существующие ключи и пароль; `--username` используется только при первом создании конфигурации. Неожиданные изменения в скачанных исходниках не перезаписываются.

## 2. Запуск Security

```powershell
npm.cmd run security:start
```

Оставьте терминал открытым. Адреса:

- API: <http://127.0.0.1:5252/api/Users/login>
- Swagger: <http://127.0.0.1:5252/swagger>

Команда собирает и запускает сервис на .NET 10. База аккаунтов SQLite и ключи Data Protection сохраняются в `.local/security-data`; остановка и повторный запуск не удаляют пользователей. Изменение начального пароля в JSON после создания аккаунта не меняет пароль в БД: для этого есть API смены пароля.

## 3. Подключение локального сайта

Сначала выполните **весь** актуальный `supabase/setup.sql` в SQL Editor Supabase. Он создаёт таблицы агентства и импортирует исходный файл жилищ.

Создайте `.env` по `.env.example`, задайте настоящие `SUPABASE_URL` и `SUPABASE_SECRET_KEY`. Для провайдера Security publishable key Supabase не требуется. В **другом** терминале PowerShell, также из корня репозитория:

```powershell
$securityConfig = Get-Content -LiteralPath .local/security-config.json -Raw | ConvertFrom-Json
$env:AUTH_PROVIDER = 'security'
$env:SECURITY_AUTH_URL = 'http://127.0.0.1:5252'
$env:SECURITY_JWT_KEY = $securityConfig.Jwt__Key
$env:SECURITY_JWT_ISSUER = $securityConfig.Jwt__Issuer
$env:SECURITY_JWT_AUDIENCE = $securityConfig.Jwt__Audience
$env:BOOTSTRAP_MANAGER_USERNAME = $securityConfig.BootstrapAdmin__Username
npm.cmd run build
npm.cmd run dev
```

Откройте <http://127.0.0.1:8888>. В форме будет **Логін**, а не обязательный email. Введите логин и начальный пароль из локального JSON. Пароль не нужно отправлять в переписку. При первом входе выбранный администратор Security становится первым менеджером агентства, если менеджера ещё нет.

Эти переменные действуют только в текущем терминале. Для постоянной локальной настройки перенесите их значения в игнорируемый `.env`. Значения `Jwt__Key` и `SECURITY_JWT_KEY` должны совпадать; это строка, а не декодированный hex-массив.

## 4. Создание остальных аккаунтов

В этом авторизаторе нет публичной регистрации и восстановления по email. Аккаунты создаёт администратор через Swagger или API:

1. `POST /api/Users/login` с `{ "username": "…", "password": "…" }`. Ответ содержит `token` и `role`.
2. В Swagger нажмите **Authorize** и введите `Bearer <token>`. Не переносите токен в исходники или настройки браузерного приложения.
3. `POST /api/Users/register` с `{ "username": "agent1", "password": "ваш пароль", "role": "Agent" }`. Для клиента используйте роль `Client`.
4. После первого входа созданного пользователя менеджер агентства назначает ему локальную роль и связанный агентский/клиентский профиль в разделе **Користувачі**.

Роль Security `Admin` разрешает администрирование самого авторизатора. Роли агентства и связи с конкретными записями проверяются отдельно по таблице `user_profiles`. Только подписанный `Admin` с логином из `BOOTSTRAP_MANAGER_USERNAME` может получить роль первого менеджера автоматически. Поля роли из формы входа или неподписанного JSON-ответа этого не позволяют.

Смена пароля в Security: `PUT /api/Users/password/change`, Bearer-токен, тело `{ "oldPassword": "…", "newPassword": "…" }`. UI приложения не показывает отсутствующие у сервиса самостоятельную регистрацию, восстановление или обновление токена. Через час потребуется повторный вход; выход удаляет cookie этого браузера, но у исходного API нет отдельной операции отзыва JWT.

Переключение с Supabase Auth не переносит старые аккаунты автоматически. Security-идентификаторы имеют отдельное пространство UUID; совпадение email не связывает аккаунты и не передаёт права. Если такой логин уже есть в `user_profiles` от другого провайдера, требуется отдельно согласовать перенос профиля.

## 5. Подключение сайта Netlify

Netlify Functions остаются JavaScript-функциями. Security — отдельный постоянно работающий процесс C#, поэтому его нужно разместить на сервере, поддерживающем .NET 10 или Docker. Подготовленный Dockerfile:

```powershell
docker build -f integrations/security/Dockerfile -t realestate-security .local/security-source
docker run -d --name realestate-security --restart unless-stopped --env-file .local/security-server.env -p 127.0.0.1:5252:8080 -v realestate-security-data:/data realestate-security
```

Это пример для хоста с Docker; контейнер публикует порт только на loopback. Перед ним нужен HTTPS reverse proxy, направляющий запросы на `127.0.0.1:5252`. Сохраняйте постоянный том `/data`: там находятся аккаунты и ключи. Swagger включён только локальным `security:start` в Development; в production он не публикуется. Dockerfile подготовлен, но сборка контейнера в текущей среде не проверялась — Docker здесь не установлен.

В Netlify для Production задайте:

```dotenv
AUTH_PROVIDER=security
SECURITY_AUTH_URL=https://ваш-домен-авторизатора
SECURITY_JWT_KEY=тот_же_частный_ключ_что_у_Security
SECURITY_JWT_ISSUER=real-estate-security
SECURITY_JWT_AUDIENCE=real-estate-agency
BOOTSTRAP_MANAGER_USERNAME=логин_первого_администратора
```

`SUPABASE_URL` и серверный ключ БД остаются нужны. JWT-параметры должны точно совпадать с сервером Security. В production HTTP и localhost для авторизатора не подходят. Ключи не должны иметь префикс `VITE_`. После настройки нужен новый deploy.

До появления HTTPS-адреса Security текущая публикация не переключается. При отсутствии `AUTH_PROVIDER` сохраняется прежний Supabase Auth; неизвестное значение провайдера блокирует вход, а не включает демо.

## Проверки

`server/security-auth.test.mjs` проверяет совместимость HTTP-контракта, подпись HS256, issuer/audience, срок JWT, защиту от подделки ролей, cookie и закрытые операции. Дополнительно локально проверен настоящий запущенный Security → адаптер → сессия менеджера → чтение каталога. Эта проверка использовала отдельное хранилище профилей и не меняла production Supabase.
