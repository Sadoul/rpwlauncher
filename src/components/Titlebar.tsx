import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { motion } from "framer-motion";

export default function Titlebar() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const win = getCurrentWindow();

    // Set initial maximized state
    win.isMaximized().then(setIsMaximized);

    // Listen for resize events to update the icon
    const unlisten = win.onResized(() => {
      win.isMaximized().then(setIsMaximized);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleMinimize = () => getCurrentWindow().minimize();
  const handleMaximize = () => getCurrentWindow().toggleMaximize();
  const handleClose = () => getCurrentWindow().close();

  return (
    <div className="titlebar" data-tauri-drag-region>
      <div className="titlebar-title" data-tauri-drag-region>
        <span className="logo-text">RPW</span>
        <span>Launcher</span>
      </div>

      <div className="titlebar-buttons">
        {/* Minimize */}
        <motion.button
          className="titlebar-btn"
          whileHover={{ scale: 1.1, backgroundColor: "rgba(255,255,255,0.12)" }}
          whileTap={{ scale: 0.9 }}
          onClick={handleMinimize}
          title="Свернуть"
        >
          <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <line x1="3" y1="8" x2="13" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </motion.button>

        {/* Maximize / Restore */}
        <motion.button
          className="titlebar-btn"
          whileHover={{ scale: 1.1, backgroundColor: "rgba(255,255,255,0.12)" }}
          whileTap={{ scale: 0.9 }}
          onClick={handleMaximize}
          title={isMaximized ? "Восстановить" : "Развернуть"}
        >
          {isMaximized ? (
            /* Restore icon — two overlapping squares */
            <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="5.5" y="3" width="7.5" height="7.5" rx="1" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M3 5.5V12a1 1 0 001 1h6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          ) : (
            /* Maximize icon — single square */
            <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="3" y="3" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
            </svg>
          )}
        </motion.button>

        {/* Close */}
        <motion.button
          className="titlebar-btn close"
          whileHover={{ scale: 1.05, backgroundColor: "#ef4444" }}
          whileTap={{ scale: 0.9 }}
          onClick={handleClose}
          title="Закрыть"
        >
          <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <line x1="4" y1="4" x2="12" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="12" y1="4" x2="4" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </motion.button>
      </div>
    </div>
  );
}
