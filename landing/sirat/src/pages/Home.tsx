import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MosqueCard } from '../components/MosqueCard';
import { CenterAnnouncements } from '../components/CenterAnnouncements';
import { BottomNav } from '../components/BottomNav';
import { mosques } from '../data/mosques';
import { LogOut, ChevronRight, RefreshCw } from 'lucide-react';
import { assetUrl } from '../utils/assets';

export function Home() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [lastMosqueId, setLastMosqueId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('sirat-last-mosque');
    if (stored) setLastMosqueId(stored);
  }, []);

  const lastMosque = mosques.find((m) => m.id === lastMosqueId);
  const hasLastMosque = !!lastMosque && !showAll;

  const handleGoToMosque = (id: string) => {
    localStorage.setItem('sirat-last-mosque', id);
    navigate(`/mosque/${id}`);
  };

  return (
    <div className="min-h-screen bg-charcoal pb-20">
      {/* Hero with shrine background */}
      <div className="relative overflow-hidden" style={{ minHeight: hasLastMosque ? '82vh' : undefined }}>
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url(${assetUrl('images/shrine-karbala.png')})`,
            opacity: hasLastMosque ? 0.4 : 0.2,
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-charcoal/20 via-transparent to-charcoal/90" />

        <div className="relative z-10 px-5 pt-12 pb-6 flex flex-col" style={{ minHeight: hasLastMosque ? '82vh' : undefined }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-gold text-xs uppercase tracking-widest">Sirat</p>
              <h1 className="text-2xl font-bold text-white mt-1">
                {hasLastMosque ? 'Welcome Back' : 'Select a Center'}
              </h1>
            </div>
            {user && user.uid !== 'guest' && (
              <button
                onClick={logout}
                className="text-white hover:text-white p-2 rounded-lg transition-colors"
                title="Logout"
              >
                <LogOut size={20} />
              </button>
            )}
          </div>

          {user && (
            <p className="text-white text-sm">
              Welcome, <span className="text-white">{user.displayName}</span>
            </p>
          )}

          {/* Spacer pushes mosque card to bottom */}
          {hasLastMosque && <div className="flex-1" />}

          {/* Last used mosque - prominent card at bottom */}
          {hasLastMosque && (
            <div>
              <button
                onClick={() => handleGoToMosque(lastMosque.id)}
                className="w-full bg-white/10 backdrop-blur-xl border border-gold/30 rounded-2xl p-5
                           hover:bg-white/15 hover:border-gold/50 transition-all duration-300
                           flex items-center gap-4 text-left group"
              >
                <div className="w-14 h-14 rounded-xl bg-gold/20 border border-gold/30 
                                flex items-center justify-center flex-shrink-0">
                  <span className="text-gold text-2xl">☪</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-gold text-xs uppercase tracking-wide mb-0.5">Your Last Visit</p>
                  <h2 className="text-white font-bold text-lg truncate group-hover:text-gold transition-colors">
                    {lastMosque.name}
                  </h2>
                  <p className="text-white text-sm">
                    {lastMosque.city}, {lastMosque.state}
                  </p>
                </div>
                <ChevronRight size={24} className="text-gold group-hover:text-gold transition-colors flex-shrink-0" />
              </button>

              <button
                onClick={() => setShowAll(true)}
                className="mt-4 w-full text-center text-white hover:text-gold text-sm 
                           flex items-center justify-center gap-2 transition-colors py-2"
              >
                <RefreshCw size={14} />
                Choose a different center
              </button>
            </div>
          )}
        </div>
      </div>

      {hasLastMosque && (
        <div className="px-5 py-5">
          <CenterAnnouncements mosqueId={lastMosque.id} />
        </div>
      )}

      {/* Full mosque list */}
      {!hasLastMosque && (
        <div className="px-5 space-y-3 mt-2">
          {mosques.map((mosque) => (
            <div key={mosque.id} onClick={() => localStorage.setItem('sirat-last-mosque', mosque.id)}>
              <MosqueCard mosque={mosque} />
            </div>
          ))}
        </div>
      )}

      {/* "Choose different" expanded list */}
      {showAll && lastMosque && (
        <div className="px-5 space-y-3 mt-2">
          <div className="flex items-center justify-between mb-1">
            <p className="text-white text-sm font-medium">All Centers</p>
            <button
              onClick={() => setShowAll(false)}
              className="text-gold hover:text-gold text-xs transition-colors"
            >
              Back
            </button>
          </div>
          {mosques.map((mosque) => (
            <div key={mosque.id} onClick={() => { localStorage.setItem('sirat-last-mosque', mosque.id); setLastMosqueId(mosque.id); setShowAll(false); }}>
              <MosqueCard mosque={mosque} />
            </div>
          ))}
        </div>
      )}

      <BottomNav />
    </div>
  );
}
