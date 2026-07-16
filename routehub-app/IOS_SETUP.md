# RouteHub iOS / Xcode setup

Этот проект уже написан на Expo / React Native. Для iOS не нужно переписывать приложение на Swift: Xcode нужен для native-проекта, подписи и сборки под App Store.

## Что уже подготовлено

- iOS bundle identifier: `kz.routehub.app`.
- App name: `RouteHub`.
- iOS build number: `1.0.0`.
- iPhone-only режим: `supportsTablet: false`.
- Добавлены iOS permission-тексты для геолокации и медиатеки.
- Добавлен `expo-location`, потому что код уже использует геолокацию перевозчика.
- EAS профили готовы для `development`, `preview` и `production` iOS сборок.

## На Mac

1. Установить Xcode из App Store и один раз открыть его, чтобы принять лицензии.
2. Установить Node.js LTS.
3. В проекте установить зависимости:

```bash
cd routehub-app
npm install
```

4. Для локального Xcode-проекта:

```bash
npm run prebuild:ios
```

5. Открыть в Xcode файл:

```text
ios/RouteHub.xcworkspace
```

Если имя workspace отличается, открывать именно `.xcworkspace`, не `.xcodeproj`.

## Запуск на iPhone через Xcode

```bash
npm run ios:device
```

Для физического iPhone телефон и Mac должны быть в одной сети. API берется из `EXPO_PUBLIC_API_BASE_URL`, если он задан. Если переменная не задана, приложение пытается взять host от Expo dev server и использовать порт `3000`.

Пример для локального backend на Mac/LAN:

```bash
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.50:3000 npm run ios:device
```

## EAS build для TestFlight / App Store

Проверить аккаунт:

```bash
npm run eas:whoami
```

Production iOS build:

```bash
npm run eas:build:ios
```

Submit в App Store Connect:

```bash
npm run eas:submit:ios
```

Для первой отправки понадобится Apple Developer аккаунт, Bundle ID `kz.routehub.app` в Apple Developer portal и приложение в App Store Connect.

## Важно

- Не запускать `expo prebuild` для всех платформ без необходимости. Для iOS использовать `npm run prebuild:ios`, чтобы не перетереть Android native-настройки.
- Android production package должен оставаться `kz.routehub.app`.
- Перед релизом проверить push notifications и геолокацию на реальном iPhone, не только в симуляторе.