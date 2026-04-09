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

const NAV_ITEMS: {
  id: Page;
  label: string;
  icon: string;
  locked?: boolean;
}[] = [
  { id: "rpworld", label: "RPWorld", icon: "🌍" },
  { id: "minigames", label: "Мини-игры", icon: "⚡", locked: true },
  { id: "custom", label: "Свой модпак", icon: "🔧" },
  { id: "settings", label: "Настройки", icon: "⚙" },
];

export default function Sidebar({
  currentPage,
  onPageChange,
  account,
  onLogout,
  avatarUrl,
}: SidebarProps) {
  const handleDiscord = async () => {
    try {
      await invoke("open_url", { url: "https://discord.gg/rpworld" });
    } catch {
      window.open("https://discord.gg/rpworld", "_blank");
    }
  };

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <motion.div
          className="logo-badge"
          animate={{ boxShadow: ["0 0 12px rgba(212,121,58,0.2)", "0 0 24px rgba(212,121,58,0.45)", "0 0 12px rgba(212,121,58,0.2)"] }}
          transition={{ duration: 3, repeat: Infinity }}
        >
          RPW
        </motion.div>
        <div>
          <div className="logo-name">RPWorld</div>
          <div className="logo-subtitle">Launcher</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {NAV_ITEMS.map(item => (
          <NavItem
            key={item.id}
            item={item}
            active={currentPage === item.id}
            onClick={() => !item.locked && onPageChange(item.id)}
          />
        ))}
      </nav>

      <div className="sidebar-spacer" />

      {/* Discord */}
      <motion.button
        className="discord-btn"
        onClick={handleDiscord}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        title="Наш Discord"
      >
        <span style={{ fontSize: 16 }}>💬</span>
        Discord
      </motion.button>

      {/* Account */}
      {account && (
        <div className="sidebar-account">
          <div className="account-avatar">
            {avatarUrl ? (
              <img src={avatarUrl} alt="av" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }} />
            ) : (
              account.username[0]?.toUpperCase()
            )}
          </div>
          <div className="account-info">
            <div className="account-name">{account.username}</div>
            <div className="account-type">
              {account.account_type === "offline" ? "Офлайн" : "Microsoft"}
            </div>
          </div>
          <motion.button
            className="logout-btn"
            onClick={onLogout}
            whileHover={{ scale: 1.1 }}
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

function NavItem({
  item,
  active,
  onClick,
}: {
  item: (typeof NAV_ITEMS)[number];
  active: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      className={`nav-item ${active ? "active" : ""} ${item.locked ? "locked" : ""}`}
      onClick={onClick}
      whileHover={item.locked ? {} : { x: 3 }}
      whileTap={item.locked ? {} : { scale: 0.97 }}
      layout
    >
      <span className="nav-icon">{item.icon}</span>
      <span className="nav-label">{item.label}</span>
      {item.locked && <span className="nav-lock">🔒</span>}
      <AnimatePresence>
        {active && (
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
  );
}
