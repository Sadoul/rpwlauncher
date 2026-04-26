import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Page } from "./Sidebar";
import type { CustomModpack } from "../App";

const BUILTIN_CONFIGS: Record<string, { title: string; loader: string; mcVersion: string; loaderVersion: string; memory: number; jvmArgs: string }> = {
  rpworld: { title: "RPWorld", loader: "forge", mcVersion: "1.20.1", loaderVersion: "47.4.20", memory: 4096, jvmArgs: "" },
  minigames: { title: "Мини-игры", loader: "forge", mcVersion: "1.20.1", loaderVersion: "", memory: 4096, jvmArgs: "" },
};

interface Props {
  page: Page;
  customModpacks: CustomModpack[];
  onBack: () => void;
  onChanged: () => void;
}

export default function ModpackSettingsPanel({ page, customModpacks, onBack, onChanged }: Props) {
  const isCustom = page.startsWith("custom:");
  const customName = isCustom ? page.slice("custom:".length) : "";
  const custom = customModpacks.find((pack) => pack.name === customName);
  const builtin = !isCustom ? BUILTIN_CONFIGS[page] : null;

  const [name, setName] = useState(custom?.name ?? builtin?.title ?? "Сборка");
  const [loader, setLoader] = useState(custom?.loader ?? builtin?.loader ?? "forge");
  const [mcVersion, setMcVersion] = useState(custom?.mc_version ?? builtin?.mcVersion ?? "1.20.1");
  const [loaderVersion, setLoaderVersion] = useState(custom?.loader_version ?? builtin?.loaderVersion ?? "");
  const [memory, setMemory] = useState(custom?.max_memory ?? builtin?.memory ?? 4096);
  const [jvmArgs, setJvmArgs] = useState(custom?.jvm_args ?? builtin?.jvmArgs ?? "");
  const [gameDir, setGameDir] = useState(custom?.game_dir ?? "");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isCustom && (page === "rpworld" || page === "minigames")) {
      invoke<string>("get_builtin_modpack_dir", { modpackName: page })
        .then(setGameDir)
        .catch(() => {});
    }
  }, [isCustom, page]);

  const openFolder = async () => {
    try {
      if (isCustom && custom?.game_dir) {
        await invoke("open_path", { path: custom.game_dir });
      } else {
        await invoke("open_builtin_modpack_folder", { modpackName: page });
      }
    } catch (e) {
      setMessage(String(e));
    }
  };

  const save = async () => {
    if (!isCustom) {
      setMessage("Настройки встроенных сборок сохраняются через Админ → Сборки. Локальные аргументы/ОЗУ будут добавлены отдельным профилем позже.");
      return;
    }
    try {
      await invoke("install_custom_modpack", {
        name,
        loader,
        mcVersion,
        loaderVersion,
        maxMemory: memory,
        jvmArgs,
      });
      setMessage("Настройки модпака сохранены");
      onChanged();
    } catch (e) {
      setMessage(String(e));
    }
  };

  const deletePack = async () => {
    const title = isCustom ? name : (page === "rpworld" ? "RPWorld" : "Мини-игры");
    if (!confirm(`Удалить установленную сборку «${title}» с компьютера? Лаунчер останется.`)) return;
    try {
      if (isCustom) {
        await invoke("delete_custom_modpack", { name: customName });
      } else {
        await invoke("delete_builtin_modpack", { modpackName: page });
      }
      setMessage("Сборка удалена с компьютера");
      onChanged();
    } catch (e) {
      setMessage(String(e));
    }
  };

  const locked = page === "minigames";

  return (
    <div className="settings-panel modpack-settings-panel">
      <div className="settings-header">
        <div>
          <h2>Настройки сборки</h2>
          <p>{name} · отдельные параметры модпака</p>
        </div>
        <button className="settings-btn" onClick={onBack}>Назад</button>
      </div>

      <div className="modpack-settings-grid">
        <div className="admin-card">
          <label>Название сборки</label>
          <input value={name} onChange={(e) => setName(e.target.value)} disabled={!isCustom} />
        </div>
        <div className="admin-card">
          <label>Тип загрузчика</label>
          <select value={loader} onChange={(e) => setLoader(e.target.value)} disabled={locked}>
            <option value="vanilla">Vanilla</option>
            <option value="forge">Forge</option>
            <option value="fabric">Fabric</option>
            <option value="neoforge">NeoForge</option>
            <option value="optifine">OptiFine</option>
          </select>
        </div>
        <div className="admin-card">
          <label>Версия Minecraft</label>
          <input value={mcVersion} onChange={(e) => setMcVersion(e.target.value)} disabled={locked} />
        </div>
        <div className="admin-card">
          <label>Версия загрузчика</label>
          <input value={loaderVersion} onChange={(e) => setLoaderVersion(e.target.value)} disabled={locked} />
        </div>
        <div className="admin-card">
          <label>ОЗУ сборки</label>
          <div className="memory-row">
            <input type="range" min={1024} max={16384} step={512} value={memory} onChange={(e) => setMemory(Number(e.target.value))} />
            <span className="memory-chip">{(memory / 1024).toFixed(1)} ГБ</span>
          </div>
        </div>
        <div className="admin-card wide">
          <label>JVM аргументы</label>
          <textarea value={jvmArgs} onChange={(e) => setJvmArgs(e.target.value)} rows={4} placeholder="Например: -XX:+UseG1GC" />
        </div>
        <div className="admin-card wide">
          <label>Папка сборки</label>
          <div className="folder-row">
            <code>{gameDir || "Папка ещё не создана"}</code>
            <button className="settings-btn" onClick={openFolder}>Открыть папку</button>
          </div>
        </div>
      </div>

      <div className="modpack-settings-actions">
        <button className="settings-btn primary" onClick={save} disabled={locked}>Сохранить настройки</button>
        <button className="settings-btn danger" onClick={deletePack}>Удалить сборку с компьютера</button>
      </div>
      {message && <div className="admin-message">{message}</div>}
    </div>
  );
}
