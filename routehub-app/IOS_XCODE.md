# Сборка RouteHub в Xcode

Проект использует Expo/React Native. На macOS с установленными Xcode и CocoaPods выполните:

```bash
cd routehub-app
npm ci
npm run ios:prebuild
npx pod-install
open ios/routehub-app.xcworkspace
```

В Xcode выберите схему `routehub-app`, iPhone Simulator или подключённый iPhone и нажмите `Run`.

Для физического устройства откройте `Signing & Capabilities`, выберите свою Apple Developer Team и при необходимости замените Bundle Identifier `com.routehub.app` на уникальный.

После изменения `app.json` повторяйте `npm run ios:prebuild`, чтобы native-настройки iOS синхронизировались.

На Windows папка `ios/` намеренно не генерируется Expo CLI. Её нужно создать на macOS/Linux; после этого её можно сохранить в Git и открывать Xcode напрямую.
