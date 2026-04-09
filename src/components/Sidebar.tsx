import { motion, AnimatePresence } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";

export type Page = "rpworld" | "minigames" | "custom" | "settings";

interface SidebarProps {
  currentPage: Page;
  onPageChange: (page: Page) => void;
  account: { username: string; account_type: string } | null;
  onLogout: () => void;
  avatarUrl: string | null;
}

const NAV_ITEMS: { id: Page; label: string; icon: string; locked?: boolean }[] = [
  { id: "rpworld",   label: "RPWorld",      icon: "🌍" },
  { id: "minigames", label: "Мини-игры",    icon: "⚡", locked: true },
  { id: "custom",    label: "Свой модпак",  icon: "🔧" },
  { id: "settings",  label: "Настройки",    icon: "⚙" },
];

const DISCORD_URL = "https://discord.gg/DnVNeBYzMM";

export default function Sidebar({ currentPage, onPageChange, account, onLogout, avatarUrl }: SidebarProps) {
  const handleDiscord = async () => {
    try { await invoke("open_url", { url: DISCORD_URL }); } catch { window.open(DISCORD_URL, "_blank"); }
  };

  const handleOpenFolder = async () => {
    try { await invoke("open_data_folder"); } catch { /* ignore */ }
  };

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <img src="/icons/launcher.jpg" alt="RPWorld" className="sidebar-logo-img" draggable={false} />
        <div className="sidebar-logo-text">
          <div className="sidebar-logo-name">RPWorld</div>
          <div className="sidebar-logo-sub">Launcher</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <motion.button
            key={item.id}
            className={`nav-item${currentPage === item.id ? " active" : ""}${item.locked ? " locked" : ""}`}
            onClick={() => !item.locked && onPageChange(item.id)}
            whileHover={item.locked ? {} : { x: 2 }}
            whileTap={item.locked ? {} : { scale: 0.97 }}
            layout
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
            {item.locked && <span className="nav-lock">🔒</span>}
            <AnimatePresence>
              {currentPage === item.id && (
                <motion.span
                  className="nav-active-bar"
                  layoutId="active-bar"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                />
              )}
            </AnimatePresence>
          </motion.button>
        ))}
      </nav>

      <div className="sidebar-spacer" />

      {/* Action icons row: folder + discord */}
      <div className="sidebar-actions-row">
        {/* Open data folder */}
        <motion.button
          className="sidebar-icon-btn"
          onClick={handleOpenFolder}
          title="Открыть папку данных (%APPDATA%\.rpworld)"
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.93 }}
        >
          {/* Folder SVG (vector) */}
          <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M2 5.5A1.5 1.5 0 013.5 4h3.382a1.5 1.5 0 011.06.44l.94.94H16.5A1.5 1.5 0 0118 7v8a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 012 15V5.5z"
              stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"
            />
          </svg>
        </motion.button>

        {/* Discord */}
        <motion.button
          className="sidebar-icon-btn"
          onClick={handleDiscord}
          title="Discord сервер RPWorld"
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.93 }}
          style={{ flex: 1 }}
        >
          <img src="/icons/discord.png" alt="Discord" style={{ width: 18, height: 18, objectFit: "contain" }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", marginLeft: 6 }}>Discord</span>
        </motion.button>
      </div>

      {/* Account */}
      {account && (
        <div className="sidebar-account">
          <div className="account-avatar">
            {avatarUrl ? (
              <img src={avatarUrl} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
            ) : (
              account.username[0]?.toUpperCase()
            )}
          </div>
          <div className="account-info">
            <div className="account-name">{account.username}</div>
            <div className="account-type">{account.account_type === "offline" ? "Офлайн" : "Microsoft"}</div>
          </div>
          <motion.button
            className="logout-btn"
            onClick={onLogout}
            whileHover={{ scale: 1.12 }}
            whileTap={{ scale: 0.9 }}
            title="Выйти"
          >
            ⏏
          </motion.button>
        </div>
      )}
    </aside>
  );
}
