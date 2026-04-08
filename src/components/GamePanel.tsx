import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "framer-motion";
import type { Page } from "./Sidebar";

interface Account {
  username: string;
  uuid: string;
  access_token: string;
  account_type: string;
}

interface LaunchProgress {
  stage: string;
  progress: number;
  total: number;
  message: string;
}

interface GamePanelProps {
  page: Page;
  account: Account;
  javaPath: string;
  maxMemory: number;
}

interface ModpackConfig {
  title: string;
  description: string;
  githubRepo: string;
  modpackName: string;
  defaultVersion: string;
}

const MODPACK_CONFIGS: Record<string, ModpackConfig> = {
  rpworld: {
    title: "RPWorld",
    description:
      "Погрузитесь в мир ролевых приключений с уникальными модами, квестами и захватывающим геймплеем. Постройте свою историю вместе с другими игроками.",
    githubRepo: "Sadoul/rpwlauncher",
    modpackName: "rpworld",
    defaultVersion: "1.20.1",
  },
  minigames: {
    title: "Мини-игры",
    description:
      "Быстрые и весёлые мини-игры для всех! BedWars, SkyWars, Murder Mystery и многое другое. Соревнуйтесь с друзьями и поднимайтесь в рейтинге.",
    githubRepo: "Sadoul/rpwlauncher",
    modpackName: "minigames",
    defaultVersion: "1.20.1",
  },
};

export default function GamePanel({ page, account, javaPath, maxMemory }: GamePanelProps) {
  const [launching, setLaunching] = useState(false);
  const [progress, setProgress] = useState<LaunchProgress | null>(null);
  const [status, setStatus] = useState<"ready" | "downloading" | "update">("ready");
  const [error, setError] = useState("");
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const progressInterval = useRef<number | null>(null);

  const config = MODPACK_CONFIGS[page] || MODPACK_CONFIGS.rpworld;

  useEffect(() => {
    checkModpackUpdate();
    return () => {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
      }
    };
  }, [page]);

  const checkModpackUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const update = await invoke<any>("check_modpack_update", {
        modpackName: config.modpackName,
        githubRepo: config.githubRepo,
      });
      if (update) {
        setStatus("update");
      } else {
        setStatus("ready");
      }
    } catch {
      setStatus("ready");
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleUpdateModpack = async () => {
    setStatus("downloading");
    setError("");
    try {
      const update = await invoke<any>("check_modpack_update", {
        modpackName: config.modpackName,
        githubRepo: config.githubRepo,
      });
      if (update) {
        await invoke("download_modpack", {
          modpackName: update.name,
          downloadUrl: update.download_url,
          version: update.version,
          minecraftVersion: update.minecraft_version,
        });
      }
      setStatus("ready");
    } catch (err) {
      setError(String(err));
      setStatus("ready");
    }
  };

  const handlePlay = async () => {
    if (status === "update") {
      await handleUpdateModpack();
      return;
    }

    setLaunching(true);
    setError("");
    setProgress(null);

    // Start polling progress
    progressInterval.current = window.setInterval(async () => {
      try {
        const p = await invoke<LaunchProgress | null>("get_launch_progress");
        if (p) {
          setProgress(p);
          if (p.stage === "done") {
            if (progressInterval.current) clearInterval(progressInterval.current);
            setTimeout(() => {
              setLaunching(false);
              setProgress(null);
            }, 2000);
          }
        }
      } catch {
        // ignore
      }
    }, 500);

    try {
      const gameDir =
        (
          await import("@tauri-apps/api/path").then((m) => m.appLocalDataDir())
        ) +
        "\\modpacks\\" +
        config.modpackName;

      await invoke("launch_game", {
        username: account.username,
        uuid: account.uuid,
        accessToken: account.access_token,
        version: config.defaultVersion,
        javaPath,
        maxMemory,
        gameDir,
      });
    } catch (err) {
      setError(String(err));
      setLaunching(false);
      if (progressInterval.current) clearInterval(progressInterval.current);
    }
  };

  const progressPercent =
    progress && progress.total > 0
      ? Math.round((progress.progress / progress.total) * 100)
      : 0;

  return (
    <motion.div
      className="game-panel"
      key={page}
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <div className="game-panel-header">
        <motion.h2
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
        >
          {config.title}
        </motion.h2>
        <motion.p
          className="description"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.3 }}
        >
          {config.description}
        </motion.p>
      </div>

      <div className="game-panel-content">
        <AnimatePresence mode="wait">
          {launching && progress ? (
            <motion.div
              key="progress"
              className="progress-container"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.25 }}
            >
              <div className="progress-bar-wrapper">
                <motion.div
                  className="progress-bar-fill"
                  initial={{ width: "0%" }}
                  animate={{ width: `${progressPercent}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              <div className="progress-text">{progress.message}</div>
            </motion.div>
          ) : (
            <motion.div
              key="play"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.3 }}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}
            >
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  style={{
                    color: "var(--accent-red)",
                    fontSize: "13px",
                    textAlign: "center",
                    maxWidth: 400,
                    padding: "12px 16px",
                    background: "rgba(239, 68, 68, 0.1)",
                    borderRadius: "8px",
                    border: "1px solid rgba(239, 68, 68, 0.2)",
                  }}
                >
                  {error}
                </motion.div>
              )}

              <motion.button
                className="play-button"
                onClick={handlePlay}
                disabled={launching || !javaPath || checkingUpdate}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.98 }}
                animate={
                  status === "update"
                    ? { boxShadow: "0 0 30px rgba(245, 158, 11, 0.4)" }
                    : {}
                }
                style={
                  status === "update"
                    ? { background: "linear-gradient(135deg, #f59e0b, #d97706)" }
                    : status === "downloading"
                    ? { background: "linear-gradient(135deg, #3b82f6, #2563eb)" }
                    : undefined
                }
              >
                {checkingUpdate
                  ? "Проверка..."
                  : status === "update"
                  ? "Обновить"
                  : status === "downloading"
                  ? "Скачивание..."
                  : "Играть"}
              </motion.button>

              {!javaPath && (
                <div style={{ fontSize: "12px", color: "var(--accent-orange)" }}>
                  Java не найдена. Установите Java в настройках.
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="game-panel-footer">
        <div className="modpack-info">
          <span style={{ fontSize: "13px", fontWeight: 600 }}>{config.title}</span>
          <span className="mc-version">Minecraft {config.defaultVersion}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            className={`status-badge ${
              status === "ready" ? "ready" : status === "update" ? "update" : "downloading"
            }`}
          >
            <span className="status-dot" />
            {status === "ready"
              ? "Готово"
              : status === "update"
              ? "Обновление"
              : "Загрузка"}
          </span>
          <span className="version-badge">v1.0.0</span>
        </div>
      </div>
    </motion.div>
  );
}
