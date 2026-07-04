import { useNavigate } from 'react-router-dom';
import type { Mosque } from '../types';
import { MapPin, ChevronRight } from 'lucide-react';

interface MosqueCardProps {
  mosque: Mosque;
}

export function MosqueCard({ mosque }: MosqueCardProps) {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate(`/mosque/${mosque.id}`)}
      className="w-full bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl p-5 
                 hover:bg-white/15 hover:border-gold/30 transition-all duration-300
                 flex items-center gap-4 text-left group"
    >
      <div className="w-12 h-12 rounded-xl bg-green-900/50 border border-green-700/30 
                      flex items-center justify-center flex-shrink-0">
        <span className="text-gold text-lg">☪</span>
      </div>

      <div className="flex-1 min-w-0">
        <h3 className="text-white font-semibold text-base truncate group-hover:text-gold transition-colors">
          {mosque.name}
        </h3>
        {mosque.city && (
          <p className="text-white/70 text-sm flex items-center gap-1 mt-0.5">
            <MapPin size={12} />
            {mosque.city}, {mosque.state}
          </p>
        )}
      </div>

      <ChevronRight size={20} className="text-white/60 group-hover:text-gold transition-colors flex-shrink-0" />
    </button>
  );
}
