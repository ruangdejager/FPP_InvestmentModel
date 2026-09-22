import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Spinner } from './components/ui.js';
import { api } from './lib/api.js';
import AssetClassesPage from './pages/AssetClasses.js';
import AssumptionsPage from './pages/Assumptions.js';
import ComparablesPage from './pages/Comparables.js';
import DashboardPage from './pages/Dashboard.js';
import DirectorsPage from './pages/Directors.js';
import LoginPage from './pages/Login.js';
import PortfolioPage from './pages/Portfolio.js';
import PropertyDetailPage from './pages/PropertyDetail.js';
import PropertyPortfolioPage from './pages/PropertyPortfolio.js';
import ReviewPage from './pages/Review.js';
import VerdictPage from './pages/Verdict.js';

interface Director {
  id: string;
  name: string;
  email: string;
  sharePct: number;
  isAdmin: boolean;
}

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/review', label: 'Under review' },
  { to: '/asset-classes', label: 'Asset classes' },
  { to: '/portfolio', label: 'Portfolio' },
  { to: '/comparables', label: 'Comparables' },
  { to: '/assumptions', label: 'Assumptions' },
  { to: '/directors', label: 'Directors' },
];

export default function App() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);

  const session = useQuery({
    queryKey: ['session'],
    queryFn: () => api.get<{ director: Director | null }>('/api/auth/me'),
  });

  const unverified = useQuery({
    queryKey: ['unverified'],
    queryFn: () => api.get<{ count: number }>('/api/dashboard/unverified'),
    enabled: Boolean(session.data?.director),
  });

  if (session.isLoading) return <Spinner label="Signing in" />;

  if (!session.data?.director) {
    return <LoginPage onSignedIn={() => queryClient.invalidateQueries()} />;
  }

  const director = session.data.director;

  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex flex-1 items-center gap-3">
            <button
              type="button"
              className="rounded-lg border border-line px-2 py-1 text-sm lg:hidden"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
            >
              Menu
            </button>
            <div>
              <p className="text-sm font-semibold leading-tight">Five Peaks Properties</p>
              <p className="text-xs text-ink-soft">Investment model</p>
            </div>
          </div>

          <nav className="hidden items-center gap-1 lg:flex">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-1.5 text-sm font-medium ${
                    isActive ? 'bg-accent-soft text-accent' : 'text-ink-soft hover:bg-canvas hover:text-ink'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            {(unverified.data?.count ?? 0) > 0 && (
              <NavLink
                to="/assumptions"
                className="rounded-full border border-caution/30 bg-caution-soft px-2.5 py-0.5 text-xs font-semibold text-caution"
                title="Assumptions nobody has checked yet"
              >
                {unverified.data?.count} unverified
              </NavLink>
            )}
            <span className="hidden text-sm text-ink-soft sm:inline">{director.name}</span>
            <button
              type="button"
              className="text-sm font-medium text-accent hover:underline"
              onClick={async () => {
                await api.post('/api/auth/logout');
                queryClient.invalidateQueries();
              }}
            >
              Sign out
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav className="flex flex-col border-t border-line px-4 py-2 lg:hidden">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-accent-soft text-accent' : 'text-ink-soft'}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5 sm:py-6" key={location.pathname}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/properties/:propertyId" element={<PropertyDetailPage />} />
          <Route path="/properties/:propertyId/verdict" element={<VerdictPage />} />
          <Route path="/properties/:propertyId/portfolio" element={<PropertyPortfolioPage />} />
          <Route path="/asset-classes" element={<AssetClassesPage />} />
          <Route path="/portfolio" element={<PortfolioPage />} />
          <Route path="/comparables" element={<ComparablesPage />} />
          <Route path="/assumptions" element={<AssumptionsPage />} />
          <Route path="/directors" element={<DirectorsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
