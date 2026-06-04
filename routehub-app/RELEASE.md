# RouteHub iOS release

## Что уже настроено

- `expo-notifications` подключен
- `eas.json` добавлен
- `ios.bundleIdentifier` задан как `com.routehub.app`
- сервер умеет хранить Expo push token и отправлять push при новом сообщении

## Что нужно сделать один раз

1. Войти в Expo:

```bash
npm run eas:whoami
npx eas-cli@latest login
```

2. Инициализировать или привязать EAS-проект:

```bash
npm run eas:project:init
```

После этого Expo создаст или привяжет проект и запишет реальный `extra.eas.projectId` в `app.json`.

3. Настроить Apple credentials и push credentials в EAS.

Во время первой iOS production-сборки EAS предложит создать или подключить:

- Apple Distribution Certificate
- Provisioning Profile
- APNs Key

## Production build

```bash
npm run eas:build:ios
```

## Отправка в App Store Connect

```bash
npm run eas:submit:ios
```

## Проверка

- push token должен успешно отправляться с приложения на `/api/mobile/push-tokens`
- при новом сообщении сервер отправляет push через Expo Push API
- тестировать лучше через TestFlight, а не Expo Go
