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
  onSkip: () => void;
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

export default function UpdateOverlay({ updateInfo, onSkip }: UpdateOverlayProps) {
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState("");
  const unlistenRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Listen to real-time progress events from Rust
    listen<UpdateProgress>("update-progress", (event) => {
      setProgress(event.payload);
    }).then((unlisten) => {
      unlistenRef.current = unlisten;
    });

    return () => {
      if (unlistenRef.current) unlistenRef.current();
    };
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
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background:
          "linear-gradient(135deg, rgba(10,10,26,0.97) 0%, rgba(26,10,46,0.97) 50%, rgba(10,22,40,0.97) 100%)",
        backdropFilter: "blur(30px)",
        gap: 0,
      }}
    >
      {/* Animated background orbs */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        {[...Array(3)].map((_, i) => (
          <motion.div
            key={i}
            style={{
              position: "absolute",
              borderRadius: "50%",
              background:
                i === 0
                  ? "radial-gradient(circle, rgba(124,58,237,0.15) 0%, transparent 70%)"
                  : i === 1
                  ? "radial-gradient(circle, rgba(59,130,246,0.1) 0%, transparent 70%)"
                  : "radial-gradient(circle, rgba(6,182,212,0.08) 0%, transparent 70%)",
              width: `${300 + i * 100}px`,
              height: `${300 + i * 100}px`,
              left: `${10 + i * 30}%`,
              top: `${10 + i * 20}%`,
            }}
            animate={{
              scale: [1, 1.15, 1],
              opacity: [0.6, 1, 0.6],
            }}
            transition={{
              duration: 4 + i * 1.5,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.8,
            }}
          />
        ))}
      </div>

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5, ease: "easeOut" }}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 32,
          zIndex: 1,
          width: "100%",
          maxWidth: 520,
          padding: "0 40px",
        }}
      >
        {/* Logo + pulse ring */}
        <div style={{ position: "relative" }}>
          <motion.div
            style={{
              position: "absolute",
              inset: -16,
              borderRadius: "50%",
              border: "2px solid rgba(124,58,237,0.3)",
            }}
            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <motion.div
            style={{
              position: "absolute",
              inset: -8,
              borderRadius: "50%",
              border: "1px solid rgba(168,85,247,0.4)",
            }}
            animate={{ scale: [1, 1.12, 1], opacity: [0.7, 0, 0.7] }}
            transition={{ duration: 2, repeat: Infinity, delay: 0.3 }}
          />
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: "20px",
              background: "linear-gradient(135deg, #7c3aed, #06b6d4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 26,
              fontWeight: 800,
              color: "white",
              letterSpacing: 2,
              boxShadow: "0 0 40px rgba(124,58,237,0.5)",
            }}
          >
            RPW
          </div>
        </div>

        {/* Title */}
        <div style={{ textAlign: "center" }}>
          <motion.div
            style={{
              fontSize: 26,
              fontWeight: 700,
              background: "linear-gradient(135deg, #f1f5f9, #c4b5fd)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              marginBottom: 8,
            }}
            animate={isApplying ? { opacity: [1, 0.6, 1] } : {}}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            {isDone
              ? "Обновление применено!"
              : isApplying
              ? "Применение обновления..."
              : `Доступно обновление v${updateInfo.latest_version}`}
          </motion.div>
          <div style={{ fontSize: 13, color: "rgba(148,163,184,0.8)", lineHeight: 1.5 }}>
            {isDone
              ? "Лаунчер перезапустится автоматически"
              : isApplying
              ? "Пожалуйста, не закрывайте лаунчер"
              : started
              ? null
              : `Текущая версия: v${updateInfo.current_version} → v${updateInfo.latest_version}${
                  updateInfo.file_size
                    ? ` · ${formatSize(updateInfo.file_size)}`
                    : ""
                }`}
          </div>
        </div>

        {/* Progress area */}
        <AnimatePresence mode="wait">
          {started ? (
            <motion.div
              key="progress"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12 }}
            >
              {/* Progress bar */}
              <div
                style={{
                  width: "100%",
                  height: 8,
                  borderRadius: 4,
                  background: "rgba(255,255,255,0.08)",
                  overflow: "hidden",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <motion.div
                  style={{
                    height: "100%",
                    borderRadius: 4,
                    background: isApplying
                      ? "linear-gradient(90deg, #10b981, #06b6d4)"
                      : "linear-gradient(90deg, #7c3aed, #3b82f6, #06b6d4)",
                    backgroundSize: "200% 100%",
                  }}
                  animate={
                    isApplying
                      ? { width: "100%", backgroundPosition: ["0% 0%", "100% 0%"] }
                      : { width: `${percent}%`, backgroundPosition: ["0% 0%", "100% 0%"] }
                  }
                  transition={
                    isApplying
                      ? { duration: 1.5, repeat: Infinity, ease: "linear" }
                      : { duration: 0.3, ease: "easeOut" }
                  }
                />
              </div>

              {/* Stats row */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 12,
                  color: "rgba(148,163,184,0.7)",
                }}
              >
                <span>{progress?.message || "..."}</span>
                {isDownloading && progress && (
                  <span style={{ display: "flex", gap: 12 }}>
                    <span style={{ color: "rgba(167,139,250,0.9)" }}>{percent}%</span>
                    {progress.speed_kb > 0 && (
                      <span>{formatSpeed(progress.speed_kb)}</span>
                    )}
                  </span>
                )}
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  style={{
                    padding: "10px 14px",
                    background: "rgba(239,68,68,0.12)",
                    border: "1px solid rgba(239,68,68,0.25)",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "#fca5a5",
                    lineHeight: 1.5,
                  }}
                >
                  {error}
                </motion.div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="buttons"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              style={{ display: "flex", gap: 12, width: "100%" }}
            >
              <motion.button
                onClick={handleUpdate}
                whileHover={{ scale: 1.02, boxShadow: "0 0 40px rgba(124,58,237,0.6)" }}
                whileTap={{ scale: 0.98 }}
                style={{
                  flex: 1,
                  padding: "14px 24px",
                  fontSize: 15,
                  fontWeight: 700,
                  fontFamily: "'Inter', sans-serif",
                  color: "white",
                  border: "none",
                  borderRadius: 10,
                  cursor: "pointer",
                  background: "linear-gradient(135deg, #7c3aed, #3b82f6)",
                  boxShadow: "0 0 20px rgba(124,58,237,0.35)",
                  letterSpacing: 0.5,
                  transition: "box-shadow 0.2s",
                }}
              >
                Обновить сейчас
              </motion.button>

              <motion.button
                onClick={onSkip}
                whileHover={{ scale: 1.02, background: "rgba(255,255,255,0.1)" }}
                whileTap={{ scale: 0.98 }}
                style={{
                  padding: "14px 24px",
                  fontSize: 14,
                  fontWeight: 500,
                  fontFamily: "'Inter', sans-serif",
                  color: "rgba(148,163,184,0.8)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 10,
                  cursor: "pointer",
                  background: "rgba(255,255,255,0.05)",
                  transition: "all 0.2s",
                }}
              >
                Позже
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Release notes */}
        {!started && updateInfo.release_notes && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            style={{
              width: "100%",
              padding: "14px 16px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10,
              fontSize: 12,
              color: "rgba(148,163,184,0.7)",
              lineHeight: 1.7,
              maxHeight: 120,
              overflowY: "auto",
              whiteSpace: "pre-wrap",
            }}
          >
            {updateInfo.release_notes.slice(0, 400)}
            {updateInfo.release_notes.length > 400 && "..."}
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}
