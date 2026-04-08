import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";

interface JavaInfo {
  path: string;
  version: string;
  found: boolean;
}

interface UpdateInfo {
  current_version: string;
  latest_version: string;
  update_available: boolean;
  download_url: string;
  release_notes: string;
}

interface SettingsPanelProps {
  javaPath: string;
  javaVersion: string;
  maxMemory: number;
  onJavaChange: (path: string, version: string) => void;
  onMemoryChange: (memory: number) => void;
}

export default function SettingsPanel({
  javaPath,
  javaVersion,
  maxMemory,
  onJavaChange,
  onMemoryChange,
}: SettingsPanelProps) {
  const [downloadingJava, setDownloadingJava] = useState(false);
  const [searchingJava, setSearchingJava] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateMsg, setUpdateMsg] = useState("");

  useEffect(() => {
    checkUpdate();
  }, []);

  const checkUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const info = await invoke<UpdateInfo>("check_launcher_update");
      setUpdateInfo(info);
    } catch {
      // ignore
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleUpdate = async () => {
    setUpdating(true);
    setUpdateMsg("");
    try {
      const result = await invoke<string>("update_launcher");
      if (result === "update_started") {
        setUpdateMsg("Установщик запущен! Лаунчер закроется для обновления.");
      } else {
        setUpdateMsg(result);
      }
    } catch (err) {
      setUpdateMsg(`Ошибка: ${String(err)}`);
    } finally {
      setUpdating(false);
    }
  };

  const handleFindJava = async () => {
    setSearchingJava(true);
    try {
      const info = await invoke<JavaInfo>("find_java");
      if (info.found) {
        onJavaChange(info.path, info.version);
      }
    } catch (err) {
      console.error("Failed to find Java:", err);
    } finally {
      setSearchingJava(false);
    }
  };

  const handleDownloadJava = async () => {
    setDownloadingJava(true);
    try {
      const info = await invoke<JavaInfo>("download_java");
      if (info.found) {
        onJavaChange(info.path, info.version);
      }
    } catch (err) {
      console.error("Failed to download Java:", err);
    } finally {
      setDownloadingJava(false);
    }
  };

  return (
    <motion.div
      className="settings-panel"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <h2>Настройки</h2>

      {/* Auto-update Section */}
      <div className="settings-section">
        <h3>Обновления лаунчера</h3>

        <div className="setting-row">
          <div>
            <div className="setting-label">Текущая версия</div>
            <div className="setting-value" style={{ marginTop: 4, fontSize: "12px" }}>
              {updateInfo ? `v${updateInfo.current_version}` : "—"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {updateInfo?.update_available && (
              <span className="status-badge update">
                <span className="status-dot" />
                v{updateInfo.latest_version}
              </span>
            )}
            {updateInfo && !updateInfo.update_available && !checkingUpdate && (
              <span className="status-badge ready">
                <span className="status-dot" />
                Актуально
              </span>
            )}
          </div>
        </div>

        {updateInfo?.update_available && (
          <div className="setting-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: 12 }}>
            <div className="setting-label">
              Доступно обновление до v{updateInfo.latest_version}
            </div>
            {updateMsg && (
              <div style={{ fontSize: "12px", color: "var(--accent-green)", padding: "8px 12px", background: "rgba(16,185,129,0.1)", borderRadius: 6, border: "1px solid rgba(16,185,129,0.2)", width: "100%" }}>
                {updateMsg}
              </div>
            )}
            <motion.button
              className="auth-button"
              style={{ padding: "10px 24px", marginTop: 0, background: "linear-gradient(135deg, #f59e0b, #d97706)" }}
              onClick={handleUpdate}
              disabled={updating}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {updating ? (
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                  Скачивание обновления...
                </span>
              ) : (
                "Обновить лаунчер"
              )}
            </motion.button>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <motion.button
            className="auth-button"
            style={{ padding: "8px 16px", fontSize: "12px", marginTop: 0, background: "rgba(0,0,0,0.3)", border: "1px solid var(--glass-border)" }}
            onClick={checkUpdate}
            disabled={checkingUpdate}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {checkingUpdate ? "Проверка..." : "Проверить обновления"}
          </motion.button>
        </div>
      </div>

      {/* Java Section */}
      <div className="settings-section">
        <h3>Java</h3>

        <div className="setting-row">
          <div>
            <div className="setting-label">Путь к Java</div>
            <div className="setting-value" style={{ marginTop: 4, fontSize: "12px", maxWidth: 350, wordBreak: "break-all" }}>
              {javaPath || "Не найдена"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <motion.button
              className="auth-button"
              style={{ padding: "8px 16px", fontSize: "12px", marginTop: 0 }}
              onClick={handleFindJava}
              disabled={searchingJava}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {searchingJava ? "Поиск..." : "Найти"}
            </motion.button>
            <motion.button
              className="auth-button"
              style={{ padding: "8px 16px", fontSize: "12px", marginTop: 0, background: "linear-gradient(135deg, #10b981, #059669)" }}
              onClick={handleDownloadJava}
              disabled={downloadingJava}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {downloadingJava ? (
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
                  Скачивание...
                </span>
              ) : (
                "Скачать Java 17"
              )}
            </motion.button>
          </div>
        </div>

        {javaVersion && (
          <div className="setting-row">
            <div className="setting-label">Версия Java</div>
            <div className="setting-value">{javaVersion}</div>
          </div>
        )}
      </div>

      {/* Memory Section */}
      <div className="settings-section">
        <h3>Память</h3>

        <div className="setting-row">
          <div>
            <div className="setting-label">Максимальная память (МБ)</div>
            <div className="setting-value" style={{ marginTop: 4, fontSize: "12px" }}>
              Рекомендуется 4096–8192 МБ ��ля модов
            </div>
          </div>
          <input
            className="setting-input"
            type="number"
            value={maxMemory}
            onChange={(e) => {
              const val = parseInt(e.target.value) || 2048;
              onMemoryChange(Math.max(1024, Math.min(32768, val)));
            }}
            min={1024}
            max={32768}
            step={512}
          />
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          {[2048, 4096, 6144, 8192].map((mem) => (
            <motion.button
              key={mem}
              onClick={() => onMemoryChange(mem)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              style={{
                padding: "6px 14px",
                fontSize: "12px",
                fontFamily: "'Inter', sans-serif",
                fontWeight: 500,
                color: maxMemory === mem ? "white" : "var(--text-secondary)",
                background:
                  maxMemory === mem
                    ? "linear-gradient(135deg, var(--accent-primary), var(--accent-blue))"
                    : "rgba(0,0,0,0.2)",
                border: `1px solid ${maxMemory === mem ? "transparent" : "var(--glass-border)"}`,
                borderRadius: "6px",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              {mem / 1024} ГБ
            </motion.button>
          ))}
        </div>
      </div>

      {/* Launcher Info */}
      <div className="settings-section">
        <h3>О лаунчере</h3>

        <div className="setting-row">
          <div className="setting-label">Данные лаунчера</div>
          <div className="setting-value">%APPDATA%\.rpworld</div>
        </div>
        <div className="setting-row">
          <div className="setting-label">GitHub</div>
          <div
            className="setting-value"
            style={{ color: "var(--accent-cyan)", cursor: "pointer" }}
            onClick={() => {
              import("@tauri-apps/plugin-shell").then((shell) =>
                shell.open("https://github.com/Sadoul/rpwlauncher")
              );
            }}
          >
            Sadoul/rpwlauncher ↗
          </div>
        </div>
      </div>
    </motion.div>
  );
}
