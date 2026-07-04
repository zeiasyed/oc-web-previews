import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { assetUrl } from '../utils/assets';

export function Splash() {
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    const timer = setTimeout(() => {
      if (user) {
        navigate('/home');
      } else {
        navigate('/login');
      }
    }, 2500);
    return () => clearTimeout(timer);
  }, [navigate, user]);

  return (
    <div className="min-h-screen relative flex flex-col items-center justify-center overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${assetUrl('images/shrine-karbala.png')})` }}
      />
      <div className="absolute inset-0 bg-black/60" />

      <div className="relative z-10 text-center px-8 animate-fade-in">
        <p className="text-gold/80 text-lg mb-2 font-arabic">
          بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ
        </p>

        <h1 className="text-6xl font-bold text-white mb-3 tracking-tight">
          Sirat
        </h1>

        <p className="text-white/60 text-sm tracking-widest uppercase">
          Your guide to the community
        </p>

        <div className="mt-12 flex justify-center">
          <div className="w-8 h-8 border-2 border-gold/50 border-t-gold rounded-full animate-spin" />
        </div>
      </div>
    </div>
  );
}
