import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { UserPlus } from 'lucide-react';

export function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { register } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      await register(email, password, name);
      navigate('/home');
    } catch {
      setError('Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex flex-col items-center justify-center px-6">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: 'url(/images/shrine-najaf.png)' }}
      />
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <div className="relative z-10 w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-1">Sirat</h1>
          <p className="text-white/50 text-sm">Create your account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-900/30 border border-red-500/30 text-red-300 text-sm p-3 rounded-xl">
              {error}
            </div>
          )}

          <div>
            <label className="text-white/70 text-xs uppercase tracking-wide mb-1 block">
              Full Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white 
                         placeholder-white/30 focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/30
                         transition-colors"
              placeholder="Your name"
              required
            />
          </div>

          <div>
            <label className="text-white/70 text-xs uppercase tracking-wide mb-1 block">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white 
                         placeholder-white/30 focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/30
                         transition-colors"
              placeholder="your@email.com"
              required
            />
          </div>

          <div>
            <label className="text-white/70 text-xs uppercase tracking-wide mb-1 block">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white 
                         placeholder-white/30 focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/30
                         transition-colors"
              placeholder="••••••••"
              required
            />
          </div>

          <div>
            <label className="text-white/70 text-xs uppercase tracking-wide mb-1 block">
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white 
                         placeholder-white/30 focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/30
                         transition-colors"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-800 hover:bg-green-700 text-white font-medium py-3 px-4 
                       rounded-xl flex items-center justify-center gap-2 transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <UserPlus size={18} />
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <button
          onClick={() => navigate('/login')}
          className="w-full mt-4 text-white/40 hover:text-white/60 py-2 text-sm transition-colors"
        >
          ← Back to Sign In
        </button>
      </div>
    </div>
  );
}
