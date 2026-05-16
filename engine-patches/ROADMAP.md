# RPWorld Engine — Roadmap & Progress Log

> Цели пользователя: **−30..50% памяти**, **−50% время загрузки клиента**, **−50% время загрузки мира**, без удаления модов.
>
> Каждый патч ниже это точечная правка декомпилированного исходника `client-srg.jar` через MCP-Reborn. Накладываются поверх Forge runtime, не ломают ABI, моды загружаются.

---

## 📊 Текущий статус

| Метрика | Цель | Достигнуто | До цели |
|---|---|---|---|
| Память (heap on loaded world) | −30% (~−450 MB из ~1.5 GB) | **~−32 MB** (−2%) | ещё ~−420 MB |
| Время старта клиента | −50% | не оптимизировано | вся работа впереди |
| Время загрузки мира | −50% | не оптимизировано | вся работа впереди |

**Честная оценка:** 30-50% — это ОЧЕНЬ агрессивная цель. Команды ModernFix/Saturn/FerriteCore (которые УЖЕ установлены в RPWorld) суммарно дают ~25-40%. Чтобы добавить ещё столько же поверх — мы должны либо находить совсем тонкие места которые они пропустили, либо подрезать функциональность ванилы. Идём первым путём, второй держим в резерве.

---

## ✅ Сделано

### P-01 — PalettedContainer slim
- **Файл:** `net/minecraft/world/level/chunk/PalettedContainer.java`
- **Что:** Удалён instance-field `ThreadingDetector` (debug only); `dummyPaletteResize` lambda → `static final`
- **Эффект памяти:** ~10 MB на загруженном мире (5000 чанков × 24 секции × 2 контейнера)
- **Совместимость:** публичные сигнатуры `acquire()/release()` сохранены как no-op для ABI
- **Дата:** 2026-04-27

### P-02 — LevelChunkSection empty singleton (copy-on-write)
- **Файл:** `net/minecraft/world/level/chunk/LevelChunkSection.java`
- **Что:** Пустые секции (~75% всех секций чанка) ссылаются на shared `EMPTY_BLOCK_STATES` singleton; полноценный контейнер аллоцируется только при первой записи non-air блока
- **Эффект памяти:** ~20 MB на загруженном мире (~100к пустых секций × ~200 байт)
- **Совместимость:** `getStates()` промоутит до записи (внешние мутации защищены)
- **Дата:** 2026-04-27

### P-03 — MappedRegistry lifecycles dedup
- **Файл:** `net/minecraft/core/MappedRegistry.java`
- **Что:** В `lifecycles` Map записываются только non-stable lifecycles. Для остальных `lifecycle()` возвращает singleton `Lifecycle.stable()`
- **Эффект памяти:** ~2 MB heap + ~50k fewer Map.Entry GC roots
- **Совместимость:** контракт `lifecycle(T)` сохранён
- **Дата:** 2026-04-27

### Инфраструктура
- ✅ `apply.ps1 / restore.ps1` — наложение/откат патчей в MCP-Reborn
- ✅ `build.ps1` — gradlew compileJava + reobfJar (SRG names)
- ✅ `deploy.ps1` — overlay reobf classes в `client-srg.jar`
- ✅ `verify.ps1` — javap-based bytecode smoke tests
- ✅ `launch.ps1` — прямой запуск Forge в обход launcher.exe
- ✅ `make-shortcut.ps1` + `RPWorld (engine).bat` на десктопе — для пользователя

---

## 🚧 В работе / следующие патчи

### Память (приоритет 1)
- [ ] **P-04 — BlockStateBase init field pruning.** В каждом BlockState ~20 boolean/byte/int полей кэшируется в init. Часть из них (`hasLargeCollisionShape`, `opacityIfCached`, `requiresCorrectToolForDrops`) дублируется через FerriteCore и может быть `null`-able с lazy init. Цель: ~10 MB
- [ ] **P-05 — Holder.Reference internal slim.** Поле `tags` инициализируется как `Set.of()`, но `bindTags()` создаёт HashSet даже для пустых тегов. Lazy-инициализация. Цель: ~5 MB
- [ ] **P-06 — VoxelShape interning.** Десятки тысяч `Shapes.box(...)` вызовов модов создают эквивалентные VoxelShape объекты. Глобальный intern pool через `WeakHashMap`. Цель: ~20-40 MB
- [ ] **P-07 — Items.SHAPES Map → array.** `Item` registry хранит мапу свойств в `HashMap`, всегда статична после freeze. Замена на array. Цель: ~3 MB
- [ ] **P-08 — RecipeManager dedup.** Forge моды дублируют ингредиенты в крафтах. Intern Ingredient. Цель: ~5-10 MB

### Старт клиента (приоритет 2)
- [ ] **P-09 — ModelBakery parallel bake.** Сейчас ~150k моделей пекутся в один поток в цикле. Распараллелить через ForkJoinPool. Цель: −20..30% времени старта
- [ ] **P-10 — TextureAtlas async stitch.** Стичинг атласов однопоточный. На 16-ядерном CPU простаивает 15 потоков. Цель: −10..15%
- [ ] **P-11 — ResourceManager parallel reload.** Моды листенеры reload идут sequentially. Часть можно параллелить. Цель: −5..10%
- [ ] **P-12 — Шейдер кэш на диске.** Сейчас Embeddium/Oculus компилируют шейдеры каждый старт. Кэш бинарников между запусками. Цель: −5%

### Загрузка мира (приоритет 3)
- [ ] **P-13 — ChunkMap async send.** Чанки отсылаются клиенту в один поток. Параллельная сериализация. Цель: −30%
- [ ] **P-14 — RegionFile async I/O.** Чтение `.mca` блокирующее. NIO async + read-ahead кэш. Цель: −15..20%
- [ ] **P-15 — Light engine compact storage.** `DataLayer` хранит свет в `byte[2048]` на каждый секционный слой. Пустые секции = нулевой массив. Singleton как в P-02. Цель: ~15 MB heap + быстрее свет
- [ ] **P-16 — Pre-warm chunk pool.** При входе в мир первые ~200 чанков аллоцируются последовательно. Пул заранее. Цель: −10%

### Долгосрочное
- [ ] **P-17 — Entity tracking partition.** `ServerEntityManager` имеет один большой Map. Sharded по 16 партиций — параллельный access без contention.
- [ ] **P-18 — JIT warm-up hints.** `-XX:CompileCommand` для горячих methods Minecraft.
- [ ] **P-19 — String dedup в NBT.** Каждый `CompoundTag` имеет map с тысячами одинаковых ключей ("id", "Damage", etc).

---

## 🎯 Реалистичные ожидания

| Цель | Оптимистичный сценарий (все патчи P-04..P-16 успешно) |
|---|---|
| Память | −15..20% поверх существующих оптимизаций сборки |
| Старт клиента | −25..35% |
| Загрузка мира | −30..40% |

Чтобы выйти **гарантированно** на −30% памяти / −50% загрузка — потребуется ещё:
- Урезать render distance default с 12 до 8 (мод-конфиг, без правок кода)
- Урезать simulation distance с 12 до 6
- Отключить дальние particle systems
- Принудительно `-XX:+UseZGC` JVM flag (есть отдельный риск со старыми GPU)

Это всё **не правки кода**, а настройки. Готов добавить как отдельный профиль.

---

## 📜 Лог изменений

| Дата | Что | Эффект |
|---|---|---|
| 2026-04-27 | P-01 + P-02 + P-03 deployed | ~32 MB heap saved, верифицировано на запуске |
| 2026-04-27 | Создан `RPWorld (engine).bat` для обхода RPWorld-Launcher.exe | прямой запуск работает |

---

## 🔧 Workflow для каждого патча

```
1. читаю ванильный исходник из MCP-Reborn (engine-patches/original/)
2. пишу новую версию в engine-patches/patches/NN-name/File.java
3. регистрирую в RPWE_FILE_MAP в _paths.ps1
4. .\scripts\apply.ps1     ← копия в MCP-Reborn src/
5. .\scripts\build.ps1     ← compile + reobf (2-3 мин)
6. .\scripts\deploy.ps1    ← overlay в .rpworld client-srg.jar
7. .\scripts\verify.ps1    ← javap bytecode smoke
8. .\scripts\launch.ps1    ← живой запуск 60-120 сек, читаю stderr
9. update ROADMAP.md       ← пометить ✅
```

Откат всего: `.\scripts\restore.ps1 -RestoreJar`
