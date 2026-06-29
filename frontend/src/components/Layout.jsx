import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

export default function Layout({ children }) {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (path) => location.pathname === path;

  return (
    <div className="bg-background text-on-surface min-h-screen flex flex-col md:flex-row">

      {/* ── Desktop Sidebar ── */}
      <nav className="hidden md:flex flex-col p-6 z-40 bg-surface-container-lowest shadow-[4px_0_20px_rgba(0,0,0,0.04)] fixed left-0 top-0 h-full w-64">
        {/* Logo */}
        <div className="mb-10">
          <Link to="/">
            <h1 className="font-headline-md text-headline-md font-black text-primary tracking-tight">
              HireFlow
            </h1>
          </Link>
          <p className="font-label-sm text-label-sm text-on-surface-variant mt-1">
            Recruitment Suite
          </p>
        </div>

        {/* Nav Links */}
        <div className="flex-1 space-y-1">
          <Link to="/" className={isActive('/') ? 'nav-active' : 'nav-item'}>
            <span className="material-symbols-outlined" style={{ fontVariationSettings: isActive('/') ? "'FILL' 1" : "'FILL' 0" }}>
              work
            </span>
            <span>Pipeline</span>
          </Link>
          <a href="#" className="nav-item">
            <span className="material-symbols-outlined">analytics</span>
            <span>Analytics</span>
          </a>
          <a href="#" className="nav-item">
            <span className="material-symbols-outlined">settings</span>
            <span>Settings</span>
          </a>
        </div>

        {/* Create Job CTA */}
        <div className="mt-auto pt-6 border-t border-outline-variant">
          <Link
            to="/"
            onClick={() => setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 100)}
            className="w-full py-3 bg-secondary-container text-primary rounded-xl font-label-bold text-label-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Create Job
          </Link>
        </div>
      </nav>

      {/* ── Mobile Top Nav ── */}
      <header className="md:hidden bg-surface/90 backdrop-blur-md sticky top-0 z-50 shadow-sm border-b border-outline-variant/30">
        <div className="flex justify-between items-center w-full px-margin-mobile py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-1.5 text-on-surface-variant hover:text-primary transition-colors rounded-lg hover:bg-surface-container-low"
              aria-label="Toggle menu"
            >
              <span className="material-symbols-outlined">{mobileMenuOpen ? 'close' : 'menu'}</span>
            </button>
            <Link to="/" className="font-headline-md text-[22px] font-black tracking-tight text-primary">
              HireFlow
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-1.5 text-on-surface-variant hover:text-primary transition-colors rounded-lg hover:bg-surface-container-low">
              <span className="material-symbols-outlined">notifications</span>
            </button>
            <div className="w-8 h-8 rounded-full bg-primary-fixed flex items-center justify-center">
              <span className="material-symbols-outlined text-on-surface-variant text-[20px]">person</span>
            </div>
          </div>
        </div>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="border-t border-outline-variant/30 bg-surface-container-lowest px-4 py-3 space-y-1 animate-fade-in">
            <Link to="/" onClick={() => setMobileMenuOpen(false)} className={isActive('/') ? 'nav-active' : 'nav-item'}>
              <span className="material-symbols-outlined" style={{ fontVariationSettings: isActive('/') ? "'FILL' 1" : "'FILL' 0" }}>work</span>
              Pipeline
            </Link>
            <a href="#" className="nav-item">
              <span className="material-symbols-outlined">analytics</span>
              Analytics
            </a>
            <a href="#" className="nav-item">
              <span className="material-symbols-outlined">settings</span>
              Settings
            </a>
            <div className="pt-2">
              <Link
                to="/"
                onClick={() => { setMobileMenuOpen(false); setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 100); }}
                className="w-full py-3 bg-secondary-container text-primary rounded-xl font-label-bold text-label-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
                Create Job
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* ── Main Content ── */}
      <main className="flex-1 md:ml-64 min-h-screen">
        {children}
      </main>
    </div>
  );
}
