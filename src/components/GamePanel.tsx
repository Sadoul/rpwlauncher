import { useState, useEffect, useRef, useMemo } from "react";
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
  jvmArgs?: string;
  gpuMode?: string;
}

interface ModpackConfig {
  title: string;
  description: string;
  githubRepo: string;
  modpackName: string;
  defaultVersion: string;
  mcVersion: string;
  locked?: boolean;
  bg: string[];  // list of background image paths
}

const MODPACK_CONFIGS: Record<string, ModpackConfig> = {
  rpworld: {
    title: "RPWorld",
    description: "Погрузитесь в мир ролевых приключений на Forge 1.20.1 с уникальными модами, квестами и захватывающим геймплеем.",
    githubRepo: "Sadoul/rpwlauncher",
    modpackName: "rpworld",
    defaultVersion: "forge-1.20.1",
    mcVersion: "1.20.1",
    bg: ["/backgrounds/rpworld.jpg", "/backgrounds/rpworld2.jpg"],
  },
  minigames: {
    title: "Мини-игры",
    description: "BedWars, SkyWars и другие мини-игры. В разработке — скоро!",
    githubRepo: "Sadoul/rpwlauncher",
    modpackName: "minigames",
    defaultVersion: "1.20.1",
    mcVersion: "1.20.1",
    locked: true,
    bg: ["/backgrounds/minigames.jpg"],
  },
};

export default function GamePanel({ page, account, javaPath, maxMemory, jvmArgs = "", gpuMode = "auto" }: GamePanelProps) {
  const [launching, setLaunching] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [progress, setProgress] = useState<LaunchProgress | null>(null);
  const [status, setStatus] = useState<"ready" | "downloading" | "update">("ready");
  const [error, setError] = useState("");
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const progressInterval = useRef<number | null>(null);

  const config = MODPACK_CONFIGS[page] || MODPACK_CONFIGS.rpworld;

  // Pick a random background once per page mount
  const bgImage = useMemo(() => {
    if (!config.bg || config.bg.length === 0) return null;
    return config.bg[Math.floor(Math.random() * config.bg.length)];
  }, [page]);

  useEffect(() => {
    if (!config.locked) checkModpackUpdate();
    return () => {
      if (progressInterval.current) clearInterval(progressInterval.current);
    };
  }, [page]);

  const checkModpackUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const update = await invoke<any>("check_modpack_update", {
        modpackName: config.modpackName,
        githubRepo: config.githubRepo,
      });
      setStatus(update ? "update" : "ready");
    } catch {
      setStatus("ready");
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handlePlay = async () => {
    if (status === "update") {
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
      return;
    }

    setLaunching(true);
    setError("");
    setProgress(null);

    progressInterval.current = window.setInterval(async () => {
      try {
        const p = await invoke<LaunchProgress | null>("get_launch_progress");
        if (p) {
          setProgress(p);
          if (p.stage === "done") {
            if (progressInterval.current) clearInterval(progressInterval.current);
            setTimeout(() => { setLaunching(false); setProgress(null); }, 2000);
          }
        }
      } catch { /* ignore */ }
    }, 500);

    try {
      const { appLocalDataDir } = await import("@tauri-apps/api/path");
      const baseDir = await appLocalDataDir();
      const gameDir = baseDir + "\\modpacks\\" + config.modpackName;

      await invoke("launch_game", {
        username: account.username,
        uuid: account.uuid,
        accessToken: account.access_token,
        version: config.defaultVersion,
        javaPath,
        maxMemory,
        gameDir,
        jvmArgs,
        gpuMode,
      });
    } catch (err) {
      setError(String(err));
      setLaunching(false);
      if (progressInterval.current) clearInterval(progressInterval.current);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await invoke("cancel_download");
    } catch { /* ignore */ }
    setLaunching(false);
    setStatus("ready");
    setProgress(null);
    if (progressInterval.current) clearInterval(progressInterval.current);
    setCancelling(false);
  };

  const progressPercent = progress && progress.total > 0
    ? Math.round((progress.progress / progress.total) * 100)
    : 0;

  return (
    <motion.div
      className={`game-panel ${bgImage ? "has-bg" : ""}`}
      key={page}
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      {/* Background image */}
      {bgImage && (
        <div
          className="panel-bg"
          style={{ backgroundImage: `url(${bgImage})` }}
        />
      )}

      {/* Locked overlay for minigames */}
      {config.locked && (
        <div className="locked-overlay">
          <div className="locked-overlay-icon">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="40" height="40">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" opacity="0.4"/>
              <path d="M12 7v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="12" cy="15.5" r="1" fill="currentColor"/>
            </svg>
          </div>
          <div className="locked-overlay-title">В разработке</div>
          <div className="locked-overlay-sub">Скоро будет доступно</div>
        </div>
      )}

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
          transition={{ delay: 0.18, duration: 0.3 }}
        >
          {config.description}
        </motion.p>
      </div>

      <div className="game-panel-content">
        <div className="game-content-card">
        <AnimatePresence mode="wait">
          {launching ? (
            <motion.div
              key="launching"
              className="progress-container"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.25 }}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, width: "100%" }}
            >
              {progress && (
                <>
                  <div className="progress-bar-wrapper" style={{ width: "100%", maxWidth: 440 }}>
                    <motion.div
                      className="progress-bar-fill"
                      initial={{ width: "0%" }}
                      animate={{ width: `${progressPercent}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                  <div className="progress-text" style={{ color: bgImage ? "rgba(255,255,255,0.75)" : undefined }}>
                    {progress.message}
                  </div>
                </>
              )}

              {/* Cancel button over play area */}
              <motion.button
                className="cancel-button"
                onClick={handleCancel}
                disabled={cancelling}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                style={bgImage ? { borderColor: "rgba(255,100,100,0.7)", color: "#ff6b6b", background: "rgba(0,0,0,0.25)" } : undefined}
              >
                {cancelling ? "Отмена..." : "Отменить"}
              </motion.button>
            </motion.div>
          ) : (
            <motion.div
              key="play"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.3 }}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}
            >
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  style={{
                    color: "var(--accent-red)",
                    fontSize: "12px",
                    textAlign: "center",
                    maxWidth: 380,
                    padding: "10px 14px",
                    background: "rgba(192, 57, 43, 0.1)",
                    borderRadius: "8px",
                    border: "1px solid rgba(192, 57, 43, 0.25)",
                  }}
                >
                  {error}
                </motion.div>
              )}

              {!config.locked && (
                <motion.button
                  className="play-button"
                  onClick={handlePlay}
                  disabled={launching || !javaPath || checkingUpdate || config.locked}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.97 }}
                  style={bgImage ? { backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" } : undefined}
                >
                  {checkingUpdate ? "Проверка..."
                    : status === "update" ? "Обновить"
                    : status === "downloading" ? "Скачивание..."
                    : "Играть"}
                </motion.button>
              )}

              {!javaPath && !config.locked && (
                <div style={{ fontSize: "12px", color: bgImage ? "rgba(255,200,120,0.9)" : "var(--accent-orange)" }}>
                  Java не найдена. Настройте Java в настройках.
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        </div>{/* end game-content-card */}
      </div>

      <div className="game-panel-footer">
        <div className="modpack-info">
          <span style={{ fontSize: "13px", fontWeight: 600, color: bgImage ? "#fff" : undefined }}>
            {config.title}
          </span>
          <span className="mc-version" style={{ color: bgImage ? "rgba(255,255,255,0.6)" : undefined }}>
            Minecraft {config.mcVersion} · Forge
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className={`status-badge ${status === "ready" ? "ready" : status === "update" ? "update" : "downloading"}`}
            style={bgImage ? { background: "rgba(0,0,0,0.3)", backdropFilter: "blur(8px)" } : undefined}
          >
            <span className="status-dot" />
            {status === "ready" ? "Готово" : status === "update" ? "Обновление" : "Загрузка"}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
