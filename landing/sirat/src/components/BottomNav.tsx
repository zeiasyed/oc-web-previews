import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Compass, Heart, MoreHorizontal, X } from 'lucide-react';

export function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const [showMore, setShowMore] = useState(false);

  const navItems = [
    { icon: Home, label: 'Home', path: '/home' },
    { icon: Compass, label: 'Qibla', path: '/qibla' },
    { icon: Heart, label: 'Duas', path: '/duas' },
    { icon: MoreHorizontal, label: 'More', path: '#more' },
  ];

  const moreItems = [
    { label: 'Tasbih Counter', path: '/tasbih' },
    { label: "Tonight's Programs", path: '/tonight' },
    { label: 'Islamic Calendar', path: '/calendar' },
    { label: 'Quran', path: '/quran' },
    { label: 'Announcements', path: '/announcements' },
    { label: 'Lost & Found', path: '/lost-found' },
    { label: 'Halal Restaurants', path: '/halal' },
    { label: 'Notifications', path: '/notifications' },
    { label: 'Language', path: '/language' },
    { label: 'Feedback', path: '/feedback' },
    { label: 'Settings', path: '/settings' },
    { label: 'Admin Panel', path: '/admin' },
    { label: 'Profile', path: '/profile' },
  ];

  return (
    <>
      {showMore && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={() => setShowMore(false)}>
          <div
            className="absolute bottom-16 left-4 right-4 bg-charcoal border border-white/10 rounded-2xl p-4 shadow-2xl max-h-[60vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-semibold text-sm">More</h3>
              <button onClick={() => setShowMore(false)} className="text-white/86 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {moreItems.map((item) => (
                <button
                  key={item.path}
                  onClick={() => { navigate(item.path); setShowMore(false); }}
                  className={`text-left px-3 py-2.5 rounded-xl text-sm transition-colors ${
                    location.pathname === item.path
                      ? 'bg-gold/20 text-gold font-medium'
                      : 'bg-white/5 text-white/93 hover:bg-white/10'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 bg-charcoal/95 backdrop-blur-lg border-t border-white/10 z-40">
        <div className="max-w-lg mx-auto flex items-center justify-around py-2 px-4">
          {navItems.map((item) => {
            const isMore = item.path === '#more';
            const isActive = !isMore && (
              location.pathname === item.path || 
              (item.path === '/home' && location.pathname.startsWith('/mosque'))
            );

            return (
              <button
                key={item.path}
                onClick={() => {
                  if (isMore) {
                    setShowMore(!showMore);
                  } else {
                    navigate(item.path);
                    setShowMore(false);
                  }
                }}
                className={`flex flex-col items-center py-1 px-3 rounded-lg transition-colors ${
                  isActive ? 'text-gold' : showMore && isMore ? 'text-gold' : 'text-white/93 hover:text-white'
                }`}
              >
                <item.icon size={22} />
                <span className="text-[10px] mt-1 font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
