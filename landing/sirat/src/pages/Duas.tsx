import { useState } from 'react';
import { BottomNav } from '../components/BottomNav';
import { duasData } from '../data/duas';
import type { DuaEntry } from '../data/duas';
import { Book, ChevronRight, ArrowLeft } from 'lucide-react';

export function Duas() {
  const [selectedDua, setSelectedDua] = useState<DuaEntry | null>(null);

  if (selectedDua) {
    return (
      <div className="min-h-screen bg-charcoal pb-20">
        <div className="px-5 pt-12">
          <button
            onClick={() => setSelectedDua(null)}
            className="text-gold hover:text-gold/95 text-sm mb-6 transition-colors flex items-center gap-1"
          >
            <ArrowLeft size={14} />
            Back to Duas
          </button>

          <h1 className="text-2xl font-bold text-white mb-1">{selectedDua.name}</h1>
          <p className="text-gold text-sm font-arabic mb-1" dir="rtl">{selectedDua.arabicName}</p>
          <p className="text-white/93 text-xs mb-8">{selectedDua.occasion}</p>

          <div className="space-y-4">
            {selectedDua.verses.map((verse, i) => (
              <div
                key={i}
                className="bg-white/5 rounded-xl p-4 border border-white/5"
              >
                <p className="text-white text-lg text-right leading-relaxed font-arabic mb-3" dir="rtl">
                  {verse.arabic}
                </p>
                <p className="text-gold text-sm italic mb-1">
                  {verse.transliteration}
                </p>
                <p className="text-white/95 text-sm">
                  {verse.translation}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-8 text-center">
            <a
              href="https://www.duas.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/55 hover:text-white/75 text-xs transition-colors"
            >
              Source: Duas.org
            </a>
          </div>
        </div>

        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-charcoal pb-20">
      <div className="px-5 pt-12">
        <h1 className="text-2xl font-bold text-white mb-2">Duas & Ziyarat</h1>
        <p className="text-white/93 text-sm mb-6">
          Supplications from the Ahlulbayt (a.s.)
        </p>

        <div className="space-y-3">
          {duasData.map((dua) => (
            <button
              key={dua.id}
              onClick={() => setSelectedDua(dua)}
              className="w-full bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl p-4 
                         hover:bg-white/15 hover:border-gold/30 transition-all duration-300
                         flex items-center gap-4 text-left group"
            >
              <div className="w-10 h-10 rounded-xl bg-green-900/50 border border-green-700/30 
                              flex items-center justify-center flex-shrink-0">
                <Book size={18} className="text-gold" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-white font-medium text-sm group-hover:text-gold transition-colors">
                  {dua.name}
                </h3>
                <p className="text-white/93 text-xs mt-0.5">{dua.occasion}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-white/86 text-xs font-arabic" dir="rtl">{dua.arabicName}</span>
                <ChevronRight size={16} className="text-white/78 group-hover:text-gold transition-colors" />
              </div>
            </button>
          ))}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
