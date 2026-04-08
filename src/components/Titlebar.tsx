import { getCurrentWindow } from "@tauri-apps/api/window";
import { motion } from "framer-motion";

const appWindow = getCurrentWindow();

export default function Titlebar() {
  return (
    <div className="titlebar">
      <div className="titlebar-title">
        <span className="logo-text">RPW</span>
        <span>Launcher</span>
      </div>
      <div className="titlebar-buttons">
        <motion.button
          className="titlebar-btn"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => appWindow.minimize()}
          title="Свернуть"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <line x1="4" y1="8" x2="12" y2="8" />
          </svg>
        </motion.button>
        <motion.button
          className="titlebar-btn"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => appWindow.toggleMaximize()}
          title="Развернуть"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" />
          </svg>
        </motion.button>
        <motion.button
          className="titlebar-btn close"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => appWindow.close()}
          title="Закрыть"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <line x1="4" y1="4" x2="12" y2="12" />
            <line x1="12" y1="4" x2="4" y2="12" />
          </svg>
        </motion.button>
      </div>
    </div>
  );
}
