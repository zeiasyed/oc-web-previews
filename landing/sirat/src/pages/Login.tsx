import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { assetUrl } from '../utils/assets';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login, skip } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate('/home');
    } catch {
      setError('Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    skip();
    navigate('/home');
  };

  return (
    <div className="min-h-screen relative flex flex-col items-center justify-center px-6">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${assetUrl('images/shrine-najaf.png')})` }}
      />
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <div className="relative z-10 w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-1">Sirat</h1>
          <p className="text-white/78 text-sm">Sign in to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-900/30 border border-red-500/30 text-red-300 text-sm p-3 rounded-xl">
              {error}
            </div>
          )}

          <div>
            <label className="text-white/93 text-xs uppercase tracking-wide mb-1 block">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white 
                         placeholder-white/55 focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/30
                         transition-colors"
              placeholder="your@email.com"
              required
            />
          </div>

          <div>
            <label className="text-white/93 text-xs uppercase tracking-wide mb-1 block">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white 
                           placeholder-white/55 focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/30
                           transition-colors pr-12"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/68 hover:text-white"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-800 hover:bg-green-700 text-white font-medium py-3 px-4 
                       rounded-xl flex items-center justify-center gap-2 transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <LogIn size={18} />
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-4 space-y-3">
          <button
            onClick={() => navigate('/register')}
            className="w-full bg-white/5 border border-white/10 hover:border-white/20 
                       text-white/93 font-medium py-3 px-4 rounded-xl transition-colors text-sm"
          >
            Create Account
          </button>

          <button
            onClick={handleSkip}
            className="w-full text-white/68 hover:text-white/85 py-2 text-sm transition-colors"
          >
            Skip for now →
          </button>
        </div>
      </div>
    </div>
  );
}
