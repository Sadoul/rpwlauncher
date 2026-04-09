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

// SVG icons — no emoji
const IconGlobe = () => (
  <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" width="16" height="16">
    <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M10 2.5C10 2.5 7 5.5 7 10s3 7.5 3 7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    <path d="M10 2.5C10 2.5 13 5.5 13 10s-3 7.5-3 7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    <path d="M2.5 10h15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    <path d="M3.5 6.5h13M3.5 13.5h13" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
  </svg>
);

const IconZap = () => (
  <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" width="16" height="16">
    <path d="M11.5 2L4 11h7l-2.5 7L18 9h-7l.5-7z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
  </svg>
);

const IconBox = () => (
  <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" width="16" height="16">
    <path d="M10 2L2.5 6v8L10 18l7.5-4V6L10 2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
    <path d="M10 2v16M2.5 6l7.5 4 7.5-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
);

const IconSettings = () => (
  <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" width="16" height="16">
    <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M10 1.5v2M10 16.5v2M1.5 10h2M16.5 10h2M3.7 3.7l1.42 1.42M14.88 14.88l1.42 1.42M3.7 16.3l1.42-1.42M14.88 5.12l1.42-1.42" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
);

const IconLock = () => (
  <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" width="11" height="11">
    <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M5.5 7V5a2.5 2.5 0 015 0v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);

const IconEject = () => (
  <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" width="14" height="14">
    <path d="M10 4l6 6H4l6-6z" fill="currentColor"/>
    <rect x="4" y="13" width="12" height="2" rx="1" fill="currentColor"/>
  </svg>
);

type NavItem = { id: Page; label: string; icon: React.ReactElement; locked?: boolean };

const NAV_ITEMS: NavItem[] = [
  { id: "rpworld",   label: "RPWorld",      icon: <IconGlobe /> },
  { id: "minigames", label: "Мини-игры",    icon: <IconZap />, locked: true },
  { id: "custom",    label: "Свой модпак",  icon: <IconBox /> },
  { id: "settings",  label: "Настройки",    icon: <IconSettings /> },
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
        <img src="/icons/launcher.png" alt="RPWorld" className="sidebar-logo-img" draggable={false} />
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
            {item.locked && <span className="nav-lock"><IconLock /></span>}
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
        <motion.button
          className="sidebar-icon-btn"
          onClick={handleOpenFolder}
          title="Открыть папку данных"
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.93 }}
        >
          <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 5.5A1.5 1.5 0 013.5 4h3.382a1.5 1.5 0 011.06.44l.94.94H16.5A1.5 1.5 0 0118 7v8a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 012 15V5.5z"
              stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
        </motion.button>

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
            <IconEject />
          </motion.button>
        </div>
      )}
    </aside>
  );
}
