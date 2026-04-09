<!--firebender-plan
name: RPW Launcher Features
overview: Масштабное обновление RPWorld Launcher: расширенные настройки, пользовательские модпаки, тёмная тема, фоны, Discord-ссылка, GPU-настройки, аватарки, API для загрузки версий Minecraft/Forge/Fabric/NeoForge, ускорение CI.
todos:
  - id: ci-speedup
    content: "Ускорить CI: sccache, lto=thin, codegen-units"
  - id: dark-theme
    content: "Тёмная тема [data-theme=dark] с неоново-зелёными/тёмно-синими цветами"
  - id: backgrounds
    content: "Фоновые изображения для RPWorld/Minigames/Custom в game-panel"
  - id: sidebar-update
    content: "Sidebar: Discord, открыть папку, мини-игры серые, свой модпак"
  - id: settings-java
    content: "Настройки: Java, RAM, JVM-аргументы, предустановки"
  - id: settings-gpu
    content: "Настройки: выбор видеокарты (дискретная/встроенная)"
  - id: settings-avatar
    content: "Настройки: кастомная аватарка (png/jpg/webp/gif)"
  - id: settings-theme
    content: "Настройки: переключатель светлая/тёмная тема"
  - id: settings-delete
    content: "Настройки: кнопка удаления лаунчера"
  - id: versions-api
    content: "Rust: API загрузки версий MC/Forge/Fabric/NeoForge"
  - id: custom-modpack
    content: "CustomModpackPanel: выбор загрузчика, версии, создание модпака"
  - id: cancel-download
    content: "Кнопка Отменить поверх Играть во время установки"
  - id: bonus-features
    content: "Бонусные фичи: статус сервера, логи, горячие клавиши"
  - id: build-release
    content: "Коммит и релиз v2.0.0"
-->

# RPWorld Launcher v2.0 — Полное обновление

## 1. Ускорение CI (ещё быстрее)

Текущее: ~9 мин (параллельные jobs). Цель: ~4-5 мин.

- Убрать из **stub** `Cargo.toml` агрессивные оптимизации: `lto = true`, `codegen-units = 1` замедляют компиляцию в 3-4x. Заменить на `lto = "thin"`, `codegen-units = 4`
- В **main app** `Cargo.toml` тоже: `lto = "thin"` вместо `true`, `codegen-units = 2`
- Добавить `CARGO_INCREMENTAL=1` и `RUSTC_WRAPPER=sccache` в CI (sccache ускоряет повторные сборки на 50-70%)
- Добавить шаг `mozilla-actions/sccache-action@v0.0.4` в оба job'а

## 2. Новая архитектура страниц

Расширить `Page` type в `Sidebar.tsx`:

```
"rpworld" | "minigames" | "custom" | "settings"
```

- **RPWorld** — Forge 1.20.1, фон `rpworld.jpg` или `rpworld2.jpg` (рандом)
- **Мини-игры** — заблокировано, серый, бейдж "В разработке"
- **Свой модпак** — полный конструктор модпака (загрузчик + версия + Java + параметры)
- **Настройки** — полная страница настроек

## 3. Фоновые изображения

Копировать `images/background/*.jpg` и `images/icons/*` в `src/assets/` (или `public/`), чтобы Vite подхватил. Показывать соответствующий фон за контентом каждой страницы:

- `rpworld.jpg` / `rpworld2.jpg` (случайный выбор при каждом заходе) для RPWorld
- `minigames.jpg` для Мини-игр
- `custom.jpg` для "Свой модпак"

Фон отображается внутри `game-panel` с затемнением (`linear-gradient overlay`) для читаемости текста.

## 4. Sidebar — Discord, папка, мини-игры

В `Sidebar.tsx`:

- Добавить иконку Discord (из `images/icons/discord.png`) — при нажатии открывает `https://discord.gg/DnVNeBYzMM` в браузере через `tauri-plugin-shell`
- Добавить SVG-иконку "Открыть папку" — при нажатии открывает `%APPDATA%/.rpworld` в проводнике
- Пункт "Мини-игры" сделать серым с пометкой "В разработке" (disabled, не кликается)
- Добавить пункт "Свой модпак" с иконкой

## 5. Расширенные настройки (SettingsPanel)

Полная переработка `SettingsPanel.tsx` на секции:

### 5a. Java

- Путь к Java (автопоиск + ручной выбор через `tauri-plugin-dialog`)
- Версия Java (авто)
- Выделенная RAM (ползунок 1024-16384 МБ)
- Дополнительные JVM-аргументы (текстовое поле)
- Предустановки: "Оптимальные", "Для слабых ПК", "Максимум"

### 5b. Видеокарта (GPU)

- Переключатель: "Авто / Дискретная (NVIDIA/AMD) / Встроенная (Intel)"
- Реализация: добавляем JVM-аргумент `-Dsun.java2d.opengl=true` и env-переменные при запуске:
  - NVIDIA: `__NV_PRIME_RENDER_OFFLOAD=1`, `__GLX_VENDOR_LIBRARY_NAME=nvidia`
  - Общее (Windows): установка GPU preference через reg-ключ `HKCU\Software\Microsoft\DirectX\UserGpuPreferences` для javaw.exe

### 5c. Аватарка

- Кнопка "Сменить аватарку" — открывает file picker (png, jpg, webp, gif)
- Копирует файл в `%APPDATA%/.rpworld/avatar.{ext}`
- Отображается в sidebar вместо буквы; поддержка анимированных GIF

### 5d. Тема

- Переключатель: "Светлая (молочная)" / "Тёмная (неон)"
- Тёмная тема: фон `#0A0E1A`, текст `#E0E0E0`, акценты неоново-зелёный `#39FF14` и тёмно-синий `#1B2838`, максимальный контраст
- Реализация: CSS-переменные в `:root` и `[data-theme="dark"]`, переключение через `document.documentElement.dataset.theme`
- Сохранение в localStorage

### 5e. Удаление лаунчера

- Красная кнопка внизу настроек "Удалить лаунчер"
- Подтверждение через диалог (`tauri-plugin-dialog`)
- Удаляет `%APPDATA%/.rpworld` и запускает NSIS uninstaller из реестра

### 5f. О лаунчере

- Версия, ссылка на GitHub, ссылка на Discord, кнопка проверки обновлений

## 6. Свой модпак (CustomModpackPanel)

Новый компонент `CustomModpackPanel.tsx` — полноценный конструктор модпака:

### 6a. Выбор загрузчика

- Vanilla, Forge, NeoForge, Fabric, OptiFine (радио-кнопки с иконками)

### 6b. Выбор версии Minecraft

API: `https://launchermeta.mojang.com/mc/game/version_manifest_v2.json`

- Список версий (release/snapshot с фильтром)
- При выборе версии подгружает совместимые версии загрузчика

### 6c. Выбор версии загрузчика

APIs:
- **Forge**: `https://files.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml` (парсинг XML) или сторонний `https://mc-versions-api.net/api/forge/{mc_version}`
- **Fabric**: `https://meta.fabricmc.net/v2/versions/loader/{mc_version}`
- **NeoForge**: `https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge` + фильтр по MC-версии
- **OptiFine**: `https://optifine.net/adloadx?f=OptiFine_{version}` (список через скрапинг или hardcoded popular versions)

Реализация на стороне Rust — новые команды `get_mc_versions`, `get_loader_versions`, `install_custom_modpack`.

### 6d. Настройки модпака

- Имя модпака (input)
- Выделенная RAM
- JVM-аргументы
- Кнопка "Создать и установить"

### 6e. Прогресс установки

- Оверлей поверх кнопки "Играть" с прогресс-баром и кнопкой "Отменить"
- Кнопка "Отменить" прерывает скачивание (Rust CancellationToken)

## 7. GamePanel — кнопка "Отменить"

В `GamePanel.tsx`:
- Во время скачивания/установки поверх кнопки "ИГРАТЬ" показать кнопку "Отменить"
- Rust: добавить `cancel_download` command с `AtomicBool` флагом отмены
- Frontend: вызывает `invoke("cancel_download")`, прогресс-бар останавливается

## 8. Тёмная тема (CSS)

В `globals.css` добавить блок `[data-theme="dark"]` с переопределением всех CSS-переменных:

```
--bg-primary: #0A0E1A;
--bg-secondary: #0D1117;
--accent-primary: #39FF14;
--accent-secondary: #00E5FF;
--text-primary: #E8E8E8;
--glass-bg: rgba(13,17,23,0.85);
--glass-border: rgba(57,255,20,0.15);
```

## 9. Rust Backend — новые команды

В `src-tauri/src/commands/`:

- **`versions.rs`** (новый) — `get_mc_versions`, `get_loader_versions` (Forge/Fabric/NeoForge), `install_loader`
- **`launcher.rs`** — добавить GPU env-переменные при запуске Java, поддержка JVM-аргументов из настроек
- **`downloader.rs`** — добавить `cancel_download` с `AtomicBool`
- **`settings.rs`** (новый) — `save_avatar`, `get_avatar`, `delete_launcher`, `open_data_folder`

## 10. Дополнительные фичи (бонус)

- **Статус сервера RPWorld** — пинг сервера, показ онлайна в sidebar (зелёный/красный индикатор)
- **Логирование** — при крашах Minecraft сохраняет лог и показывает кнопку "Посмотреть лог"
- **Drag-n-drop модов** — перетаскивание .jar файлов в лаунчер для установки модов
- **Горячие клавиши** — Ctrl+Q выход, F5 обновить, Ctrl+, настройки
- **Анимация запуска** — при нажатии "ИГРАТЬ" кнопка трансформируется в прогресс-бар с пульсацией

## Затронутые файлы

### Новые файлы
- `src/components/CustomModpackPanel.tsx` — конструктор модпака
- `src-tauri/src/commands/versions.rs` — API для загрузки версий
- `src-tauri/src/commands/settings.rs` — аватарки, удаление, открытие папки
- `src/assets/backgrounds/` — копии фонов для Vite
- `src/assets/icons/` — Discord PNG, SVG иконки

### Изменяемые файлы
- `src/styles/globals.css` — тёмная тема, стили для новых компонентов
- `src/App.tsx` — новые страницы, тема, аватарка
- `src/components/Sidebar.tsx` — Discord, папка, "Свой модпак", серые мини-игры
- `src/components/SettingsPanel.tsx` — полная переработка
- `src/components/GamePanel.tsx` — кнопка отменить, фоны
- `src-tauri/src/commands/mod.rs` — новые модули
- `src-tauri/src/commands/launcher.rs` — GPU, JVM args
- `src-tauri/src/commands/downloader.rs` — cancel
- `src-tauri/src/lib.rs` — регистрация новых команд
- `src-tauri/Cargo.toml` — возможно новые зависимости (quick-xml для Forge Maven)
- `.github/workflows/build.yml` — sccache, оптимизация
