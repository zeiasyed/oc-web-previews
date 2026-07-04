import { BottomNav } from '../components/BottomNav';
import { Construction } from 'lucide-react';

interface ComingSoonProps {
  title: string;
  description: string;
}

export function ComingSoon({ title, description }: ComingSoonProps) {
  return (
    <div className="min-h-screen bg-charcoal pb-20">
      <div className="px-5 pt-12 flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-20 h-20 rounded-full bg-gold/10 border border-gold/20 flex items-center justify-center mb-6">
          <Construction size={36} className="text-gold" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">{title}</h1>
        <p className="text-white text-sm text-center max-w-xs">{description}</p>
        <div className="mt-8 bg-white/5 border border-white/10 rounded-xl px-6 py-3">
          <p className="text-gold text-sm font-medium">Coming Soon</p>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
