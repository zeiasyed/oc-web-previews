import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { BottomNav } from '../components/BottomNav';
import { LogOut, User, Mail, Shield } from 'lucide-react';

export function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-charcoal pb-20">
      <div className="px-5 pt-12">
        <h1 className="text-2xl font-bold text-white mb-8">Profile</h1>

        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/10 mb-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-full bg-green-900/50 border border-green-700/30 
                            flex items-center justify-center">
              <User size={28} className="text-gold" />
            </div>
            <div>
              <h2 className="text-white font-semibold text-lg">
                {user?.displayName || 'Guest'}
              </h2>
              <p className="text-white/70 text-sm">{user?.email}</p>
            </div>
          </div>

          <div className="space-y-3 border-t border-white/10 pt-4">
            <div className="flex items-center gap-3 text-white/70 text-sm">
              <Mail size={16} className="text-gold/70" />
              <span>{user?.email}</span>
            </div>
            <div className="flex items-center gap-3 text-white/70 text-sm">
              <Shield size={16} className="text-gold/70" />
              <span>{user?.uid === 'guest' ? 'Guest Account' : 'Verified Member'}</span>
            </div>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="w-full bg-red-900/30 border border-red-700/30 text-red-300 font-medium 
                     py-3 px-4 rounded-xl flex items-center justify-center gap-2
                     hover:bg-red-900/50 transition-colors"
        >
          <LogOut size={18} />
          Sign Out
        </button>
      </div>

      <BottomNav />
    </div>
  );
}
