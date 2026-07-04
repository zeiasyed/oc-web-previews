import { useState } from 'react';
import { BottomNav } from '../components/BottomNav';
import { Book, ExternalLink } from 'lucide-react';

interface Surah {
  number: number;
  name: string;
  arabic: string;
  verses: number;
  type: 'Meccan' | 'Medinan';
}

const SURAHS: Surah[] = [
  { number: 1, name: 'Al-Fatiha', arabic: 'الفاتحة', verses: 7, type: 'Meccan' },
  { number: 2, name: 'Al-Baqarah', arabic: 'البقرة', verses: 286, type: 'Medinan' },
  { number: 3, name: 'Aal-e-Imran', arabic: 'آل عمران', verses: 200, type: 'Medinan' },
  { number: 4, name: 'An-Nisa', arabic: 'النساء', verses: 176, type: 'Medinan' },
  { number: 18, name: 'Al-Kahf', arabic: 'الكهف', verses: 110, type: 'Meccan' },
  { number: 36, name: 'Ya-Sin', arabic: 'يس', verses: 83, type: 'Meccan' },
  { number: 48, name: 'Al-Fath', arabic: 'الفتح', verses: 29, type: 'Medinan' },
  { number: 55, name: 'Ar-Rahman', arabic: 'الرحمن', verses: 78, type: 'Medinan' },
  { number: 56, name: "Al-Waqi'ah", arabic: 'الواقعة', verses: 96, type: 'Meccan' },
  { number: 67, name: 'Al-Mulk', arabic: 'الملك', verses: 30, type: 'Meccan' },
  { number: 71, name: 'Nuh', arabic: 'نوح', verses: 28, type: 'Meccan' },
  { number: 78, name: 'An-Naba', arabic: 'النبأ', verses: 40, type: 'Meccan' },
  { number: 87, name: "Al-A'la", arabic: 'الأعلى', verses: 19, type: 'Meccan' },
  { number: 93, name: 'Ad-Duha', arabic: 'الضحى', verses: 11, type: 'Meccan' },
  { number: 94, name: 'Ash-Sharh', arabic: 'الشرح', verses: 8, type: 'Meccan' },
  { number: 97, name: 'Al-Qadr', arabic: 'القدر', verses: 5, type: 'Meccan' },
  { number: 108, name: 'Al-Kawthar', arabic: 'الكوثر', verses: 3, type: 'Meccan' },
  { number: 109, name: 'Al-Kafirun', arabic: 'الكافرون', verses: 6, type: 'Meccan' },
  { number: 110, name: 'An-Nasr', arabic: 'النصر', verses: 3, type: 'Medinan' },
  { number: 111, name: 'Al-Masad', arabic: 'المسد', verses: 5, type: 'Meccan' },
  { number: 112, name: 'Al-Ikhlas', arabic: 'الإخلاص', verses: 4, type: 'Meccan' },
  { number: 113, name: 'Al-Falaq', arabic: 'الفلق', verses: 5, type: 'Meccan' },
  { number: 114, name: 'An-Nas', arabic: 'الناس', verses: 6, type: 'Meccan' },
];

export function QuranReader() {
  const [search, setSearch] = useState('');

  const filtered = SURAHS.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.arabic.includes(search) ||
      s.number.toString() === search
  );

  const openSurah = (number: number) => {
    window.open(`https://quran.com/${number}`, '_blank');
  };

  return (
    <div className="min-h-screen bg-charcoal pb-20">
      <div className="px-5 pt-12">
        <h1 className="text-2xl font-bold text-white mb-2">Quran</h1>
        <p className="text-white/50 text-sm mb-6">Quick reference to surahs</p>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search surah by name or number..."
          className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white 
                     placeholder-white/30 focus:outline-none focus:border-gold/50 text-sm mb-6"
        />

        <div className="space-y-2">
          {filtered.map((surah) => (
            <button
              key={surah.number}
              onClick={() => openSurah(surah.number)}
              className="w-full bg-white/5 border border-white/10 rounded-xl p-4 
                         hover:bg-white/10 hover:border-gold/20 transition-all
                         flex items-center gap-4 text-left group"
            >
              <div className="w-9 h-9 rounded-lg bg-green-900/50 border border-green-700/30 
                              flex items-center justify-center flex-shrink-0">
                <span className="text-gold text-xs font-bold">{surah.number}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h3 className="text-white font-medium text-sm group-hover:text-gold transition-colors">
                    {surah.name}
                  </h3>
                  <span className="text-white/70 text-base font-arabic" dir="rtl">
                    {surah.arabic}
                  </span>
                </div>
                <p className="text-white/30 text-xs mt-0.5">
                  {surah.verses} verses · {surah.type}
                </p>
              </div>
              <ExternalLink size={14} className="text-white/20 group-hover:text-gold/50 transition-colors flex-shrink-0" />
            </button>
          ))}
        </div>

        <div className="mt-6 text-center">
          <a
            href="https://quran.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-gold/70 hover:text-gold text-sm transition-colors"
          >
            <Book size={16} />
            Full Quran on Quran.com
          </a>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
