"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface AppHeaderProps {
  alertCount?: number;
  onAlertsClick?: () => void;
  floating?: boolean;
}

const NAV = [
  { href: "/", label: "Peta Operasional" },
  { href: "/manajemen", label: "Dashboard Manajemen" },
];

export default function AppHeader({ alertCount, onAlertsClick, floating = true }: AppHeaderProps) {
  const pathname = usePathname();

  return (
    <header className={`appHeader ${floating ? "" : "appHeaderStatic"}`}>
      <div className="brandLogo">
        <div className="logoIcon">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden>
            <path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9 1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
          </svg>
        </div>
        <span className="logoText">
          SI<span className="logoTextAccent">MARDA</span>
          <span className="logoSubtext">Monitoring Armada DLH</span>
        </span>
      </div>

      <nav className="headerNav">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={`navLink ${pathname === n.href ? "active" : ""}`}>
            {n.label}
          </Link>
        ))}
      </nav>

      <div className="headerActions">
        {onAlertsClick && (
          <button className="headerBtn" onClick={onAlertsClick}>
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden>
              <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
            </svg>
            <span>Peringatan</span>
            {!!alertCount && <span className="alertCountBadge">{alertCount}</span>}
          </button>
        )}
      </div>
    </header>
  );
}
