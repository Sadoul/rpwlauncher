import { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { motion, AnimatePresence } from "framer-motion";

interface UpdateInfo {
  current_version: string;
  latest_version: string;
  update_available: boolean;
  download_url: string;
  installer_url: string;
  release_notes: string;
  file_size: number;
}

interface UpdateProgress {
  stage: string;
  downloaded: number;
  total: number;
  speed_kb: number;
  message: string;
}

interface UpdateOverlayProps {
  updateInfo: UpdateInfo;
  onSkip: () => void; // kept for type compat but NOT used — update is mandatory
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / 1_048_576).toFixed(1)} МБ`;
}

function formatSpeed(kbs: number): string {
  if (kbs < 1024) return `${kbs} КБ/с`;
  return `${(kbs / 1024).toFixed(1)} МБ/с`;
}

export default function UpdateOverlay({ updateInfo }: UpdateOverlayProps) {
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState("");
  const unlistenRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    listen<UpdateProgress>("update-progress", (event) => {
      setProgress(event.payload);
    }).then((unlisten) => {
      unlistenRef.current = unlisten;
    });
    return () => { if (unlistenRef.current) unlistenRef.current(); };
  }, []);

  // Auto-start update
  useEffect(() => {
    handleUpdate();
  }, []);

  const handleUpdate = async () => {
    setStarted(true);
    setError("");
    try {
      await invoke("update_launcher");
    } catch (err) {
      setError(String(err));
      setStarted(false);
    }
  };

  const percent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
      : 0;

  const isDone = progress?.stage === "done";
  const isApplying = progress?.stage === "applying";
  const isDownloading = progress?.stage === "downloading";

  return (
    <motion.div
      className="update-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      {/* Animated bg orbs using theme accent colors */}
      <div className="update-orbs">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className={`update-orb update-orb-${i}`}
            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.9, 0.5] }}
            transition={{ duration: 4 + i * 1.5, repeat: Infinity, delay: i * 0.8 }}
          />
        ))}
      </div>

      <motion.div
        className="update-content"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.45, ease: "easeOut" }}
      >
        {/* Launcher icon with pulse rings */}
        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <motion.div
            className="update-ring update-ring-outer"
            animate={{ scale: [1, 1.25, 1], opacity: [0.4, 0, 0.4] }}
            transition={{ duration: 2.2, repeat: Infinity }}
          />
          <motion.div
            className="update-ring update-ring-inner"
            animate={{ scale: [1, 1.14, 1], opacity: [0.6, 0, 0.6] }}
            transition={{ duration: 2.2, repeat: Infinity, delay: 0.35 }}
          />
          <img
            src="/icons/launcher.png"
            alt="RPWorld"
            className="update-launcher-icon"
          />
        </div>

        {/* Title */}
        <div className="update-title-block">
          <motion.div
            className="update-title"
            animate={isApplying ? { opacity: [1, 0.55, 1] } : {}}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            {isDone
              ? "✓ Обновление применено!"
              : isApplying
              ? "Применение обновления..."
              : `Доступно обновление v${updateInfo.latest_version}`}
          </motion.div>
          <div className="update-subtitle">
            {isDone
              ? "Лаунчер перезапустится автоматически"
              : isApplying
              ? "Пожалуйста, не закрывайте лаунчер"
              : `v${updateInfo.current_version} → v${updateInfo.latest_version}${updateInfo.file_size ? ` · ${formatSize(updateInfo.file_size)}` : ""}`}
          </div>
        </div>

        {/* Progress */}
        <div className="update-progress-block">
          <div className="update-progress-track">
            <motion.div
              className="update-progress-fill"
              style={isApplying ? { width: "100%" } : {}}
              animate={
                isApplying
                  ? { backgroundPosition: ["0% 0%", "200% 0%"] }
                  : { width: `${started ? percent : 0}%` }
              }
              transition={
                isApplying
                  ? { duration: 1.2, repeat: Infinity, ease: "linear" }
                  : { duration: 0.35, ease: "easeOut" }
              }
            />
          </div>

          <div className="update-progress-stats">
            <span>{started ? (progress?.message || "Соединение...") : "Загрузка обновления..."}</span>
            {isDownloading && progress && (
              <span style={{ display: "flex", gap: 10 }}>
                <span className="update-percent">{percent}%</span>
                {progress.speed_kb > 0 && <span>{formatSpeed(progress.speed_kb)}</span>}
              </span>
            )}
          </div>
        </div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              className="update-error"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
            >
              <div style={{ marginBottom: 10 }}>{error}</div>
              <motion.button
                className="update-retry-btn"
                onClick={handleUpdate}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
              >
                Повторить
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Release notes */}
        {updateInfo.release_notes && (
          <motion.div
            className="update-notes"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            {updateInfo.release_notes.slice(0, 400)}
            {updateInfo.release_notes.length > 400 && "..."}
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}
