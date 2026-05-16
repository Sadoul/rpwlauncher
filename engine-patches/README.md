# RPWorld Engine Patches

Патчи поверх декомпилированного Minecraft 1.20.1 (через MCP-Reborn) для сборки RPWorld.

## Где что лежит

```
engine-patches/
├── README.md                 — этот файл
├── original/                 — оригиналы декомпиленных файлов (для diff и rollback)
├── patches/                  — наши модифицированные версии
│   ├── 01-paletted-container/PalettedContainer.java
│   └── 02-empty-section/LevelChunkSection.java
└── scripts/
    ├── apply.ps1             — копирует patches/* поверх MCP-Reborn src/
    ├── restore.ps1           — восстанавливает original/* в MCP-Reborn src/
    ├── build.ps1             — gradlew build в MCP-Reborn → jar в build/libs/
    └── deploy.ps1            — копирует jar в .rpworld/versions/<custom>
```

## Пути (захардкожены в скриптах)

- MCP-Reborn:  `C:\Users\smopo\Desktop\MinecraftEngine\references\MCP-Reborn-1.20`
- RPWorld:     `C:\Users\smopo\AppData\Roaming\.rpworld\modpacks\rpworld`
- Forge MDK:   `C:\Users\smopo\Desktop\Forge MDK 1.20.1 47.4.20`

## Workflow

```powershell
# 1. Применить все патчи к MCP-Reborn
.\scripts\apply.ps1

# 2. Собрать новый клиентский jar
.\scripts\build.ps1

# 3. Развернуть в .rpworld как новый профиль "rpworld-engine"
.\scripts\deploy.ps1

# Откат:
.\scripts\restore.ps1
```

## Текущие патчи

### P-01: PalettedContainer slim
**Цель:** уменьшить footprint каждого PalettedContainer (~96 → ~64 bytes overhead).

Изменения:
- `dummyPaletteResize` lambda → `static final` (вместо instance field на каждом)
- `ThreadingDetector` → lazy (создаётся только при реальной конкуренции потоков)
- `Strategy.getConfiguration` → кэш immutable Configuration по bits

**Ожидаемая экономия:** при 5000 загруженных чанков × 24 секции × 2 контейнера ≈
240 000 объектов × ~30 bytes = **~7 MB heap**. Не магия, но bricks one by one.

### P-02: Empty section singleton
**Цель:** не аллоцировать полноценный PalettedContainer для секций из чистого воздуха.

Типичный чанк имеет 18-22 пустых секции из 24. Сейчас каждая такая секция держит
два PalettedContainer (states + biomes) с полными `Data`/`Palette`/`BitStorage` объектами.

Изменения:
- `LevelChunkSection` ловит конструктор и при дефолтных AIR/PLAINS использует
  shared singleton контейнеры
- При первом `setBlockState(non-AIR)` — lazy "разворачивает" в полноценный контейнер
  (copy-on-write)

**Ожидаемая экономия:** при 5000 чанков × 20 пустых секций × ~400 bytes per pair ≈
**~38 MB heap**.

## Совместимость с модами сборки

- ✅ Сигнатуры публичных классов/методов сохранены — Forge ABI не сломан
- ✅ Не пересекается с FerriteCore (тот работает на BlockState property dedup)
- ✅ Не пересекается с Saturn (тот сжимает большие палитры, мы — empty)
- ⚠️ ThreadingDetector lazy: если какой-то мод напрямую дёргает поле через
  reflection — может упасть. Не видел такого в практике.
