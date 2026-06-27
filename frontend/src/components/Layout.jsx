import { Link } from 'react-router-dom';

export default function Layout({ children }) {
  return (
    <div className="bg-background text-on-surface min-h-screen flex flex-col">
      {/* TopNavBar */}
      <nav className="sticky top-0 z-50 glass-nav border-b border-outline-variant/30">
        <div className="flex justify-between items-center w-full px-8 max-w-[1440px] mx-auto h-16">
          <div className="flex items-center gap-12">
            <Link to="/" className="font-headline-md text-[24px] font-bold text-primary">HireFlow</Link>
            <div className="hidden md:flex gap-8">
              <Link to="/" className="text-secondary hover:text-primary transition-colors font-label-md text-[14px]">
                Jobs
              </Link>
              <Link to="/" onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })} className="text-on-surface-variant hover:text-primary transition-colors font-label-md text-[14px]">
                Post Job
              </Link>
              <a className="text-on-surface-variant hover:text-primary transition-colors font-label-md text-[14px]" href="#">
                Analytics
              </a>
              <a className="text-on-surface-variant hover:text-primary transition-colors font-label-md text-[14px]" href="#">
                Settings
              </a>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button className="p-2 text-on-surface-variant hover:bg-surface-container-low rounded-full transition-colors">
              <span className="material-symbols-outlined">notifications</span>
            </button>
            <div className="h-8 w-8 rounded-full bg-primary-fixed flex items-center justify-center overflow-hidden">
              <span className="material-symbols-outlined text-primary">account_circle</span>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-grow">
        {children}
      </main>

      {/* Footer */}
      <footer className="py-stack-lg border-t border-outline-variant/30 bg-surface-container-low mt-stack-xl">
        <div className="max-w-7xl mx-auto px-4 md:px-margin-page flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
          <div>
            <p className="font-headline-md text-primary font-bold tracking-tighter mb-2">HireFlow</p>
            <p className="text-on-surface-variant text-sm">© 2026 HireFlow. All rights reserved.</p>
          </div>
          <div className="flex gap-8 text-on-surface-variant text-sm font-medium">
            <a className="hover:text-primary transition-colors" href="#">Privacy</a>
            <a className="hover:text-primary transition-colors" href="#">Terms</a>
            <a className="hover:text-primary transition-colors" href="#">Support</a>
            <a className="hover:text-primary transition-colors" href="#">API Documentation</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
