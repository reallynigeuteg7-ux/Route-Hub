# RouteHub

RouteHub - веб-сервис и мобильное приложение для работы с грузами, предложениями, чатами, профилем, кошельком и маршрутами.

Проект состоит из Express/PostgreSQL backend, статического web-интерфейса и Expo/React Native Android-приложения.

## Структура

```text
D:\RH
├─ server.js                 # Backend API, Socket.IO и раздача web-страниц
├─ public/                   # Web-страницы: login, profile, offers, admin и т.д.
├─ routehub-app/             # Мобильное приложение Expo / React Native
├─ uploads/                  # Runtime-загрузки пользователей
├─ .env                      # Локальные секреты и настройки, не коммитить
├─ .env.production.example   # Пример production-настроек без секретов
└─ kz-routehub-v16-sha1-5D68.aab # Текущий AAB для Google Play
```

## Требования

- Node.js и npm.
- PostgreSQL с базой `routehub`.
- Android Studio, Android SDK и JDK для Android-сборки.
- Для релизной Android-сборки нужен keystore из `routehub-app/android/keystore.properties`.

На этой машине Node используется из `D:\node`, а JDK для проверки подписи - из `D:\Dev\jdk-17`.

## Настройка backend

1. Установить зависимости в корне проекта:

```powershell
npm install
```

2. Создать или обновить `.env` по примеру `.env.production.example`.

Минимально важные переменные:

```env
NODE_ENV=production
PORT=3000
PGHOST=127.0.0.1
PGPORT=5432
PGUSER=routehub_user
PGPASSWORD=change-me
PGDATABASE=routehub
SESSION_SECRET=change-me
MOBILE_JWT_SECRET=change-me
ADMIN_EMAILS=owner@example.com
```

Секреты, пароли, API keys и данные keystore в README не хранить.

3. Запустить сервер:

```powershell
node server.js
```

Или явно через локальный Node:

```powershell
D:\node\node.exe D:\RH\server.js
```

Сервер слушает `http://127.0.0.1:3000`.

## Мобильное приложение

```powershell
cd D:\RH\routehub-app
npm install
npx expo start
```

Запуск на Android-устройстве или эмуляторе:

```powershell
npm run android
```

Основные файлы мобильной части:

- `routehub-app/app/` - экраны Expo Router.
- `routehub-app/components/` - общие компоненты.
- `routehub-app/lib/api.tsx` - клиент API.
- `routehub-app/lib/theme.tsx` и `routehub-app/constants/theme.ts` - тема приложения.
- `routehub-app/android/` - native Android-проект.

## Android release / Google Play

Текущие параметры релиза:

- Package name / `applicationId`: `kz.routehub.app`.
- `versionCode`: `16`.
- `versionName`: `1.0.0`.
- Правильный SHA1 сертификата для Google Play: `5D:68:6D:6B:96:8F:D1:DD:2B:D3:AF:7D:3E:C7:77:50:FD:66:C5:A6`.
- Готовый файл для загрузки: `D:\RH\kz-routehub-v16-sha1-5D68.aab`.

Сборка AAB:

```powershell
cd D:\RH\routehub-app\android
$env:NODE_ENV='production'
.\gradlew.bat bundleRelease
```

После сборки bundle находится здесь:

```text
D:\RH\routehub-app\android\app\build\outputs\bundle\release\app-release.aab
```

Для загрузки в Play Console используй файл с правильным именем и подписью:

```text
D:\RH\kz-routehub-v16-sha1-5D68.aab
```

Не загружать старые AAB рядом в корне, если Play Console ругается на ключ или package name. Для текущего обновления нужен именно bundle с `applicationId = kz.routehub.app` и SHA1 `5D:68:...:C5:A6`.

## Проверки

Проверка backend-синтаксиса:

```powershell
D:\node\node.exe --check D:\RH\server.js
```

Проверка TypeScript в мобильном приложении:

```powershell
cd D:\RH\routehub-app
D:\node\npx.cmd tsc --noEmit
```

Проверка подписи AAB:

```powershell
D:\Dev\jdk-17\bin\keytool.exe -printcert -jarfile D:\RH\kz-routehub-v16-sha1-5D68.aab
```

В выводе должен быть SHA1:

```text
5D:68:6D:6B:96:8F:D1:DD:2B:D3:AF:7D:3E:C7:77:50:FD:66:C5:A6
```

## Важные заметки

- `.env` и `routehub-app/android/keystore.properties` содержат секреты. Не публиковать их.
- `uploads/` - runtime-данные, перед чисткой проверять, не нужны ли реальные файлы пользователей.
- Если Android native-проект пересоздается через Expo prebuild, проверить, что package name снова не откатился на старый `com.routehub.app`.
- Перед загрузкой в Play Market всегда проверять `versionCode`, `applicationId` и SHA1 подписи.
