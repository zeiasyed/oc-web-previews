import { useState, useCallback } from 'react';
import { BottomNav } from '../components/BottomNav';
import { RotateCcw } from 'lucide-react';

const PRESETS = [
  { name: 'SubhanAllah', arabic: 'سُبْحَانَ اللّٰهِ', target: 33 },
  { name: 'Alhamdulillah', arabic: 'اَلْحَمْدُ لِلّٰهِ', target: 33 },
  { name: 'Allahu Akbar', arabic: 'اللّٰهُ أَكْبَرُ', target: 34 },
  { name: 'La ilaha illallah', arabic: 'لَا إِلٰهَ إِلَّا اللّٰهُ', target: 100 },
  { name: 'Salawat', arabic: 'اَللّٰهُمَّ صَلِّ عَلىٰ مُحَمَّدٍ وَآلِ مُحَمَّدٍ', target: 100 },
];

export function Tasbih() {
  const [count, setCount] = useState(0);
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [completed, setCompleted] = useState(false);

  const preset = PRESETS[selectedPreset];

  const handleTap = useCallback(() => {
    const newCount = count + 1;
    setCount(newCount);

    if (newCount >= preset.target) {
      setCompleted(true);
      if ('vibrate' in navigator) {
        navigator.vibrate([100, 50, 100]);
      }
    } else if (newCount % 10 === 0) {
      if ('vibrate' in navigator) {
        navigator.vibrate(30);
      }
    }
  }, [count, preset.target]);

  const handleReset = () => {
    setCount(0);
    setCompleted(false);
  };

  const progress = Math.min((count / preset.target) * 100, 100);

  return (
    <div className="min-h-screen bg-charcoal pb-20">
      <div className="px-5 pt-12">
        <h1 className="text-2xl font-bold text-white mb-2">Tasbih Counter</h1>
        <p className="text-white text-sm mb-6">Tap to count your dhikr</p>

        {/* Preset selector */}
        <div className="flex gap-2 overflow-x-auto pb-3 mb-8 -mx-1 px-1">
          {PRESETS.map((p, i) => (
            <button
              key={p.name}
              onClick={() => { setSelectedPreset(i); handleReset(); }}
              className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-medium transition-colors border ${
                i === selectedPreset
                  ? 'bg-gold/20 border-gold/40 text-gold'
                  : 'bg-white/5 border-white/10 text-white hover:text-white'
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>

        {/* Arabic text */}
        <div className="text-center mb-8">
          <p className="text-gold text-2xl font-arabic" dir="rtl">
            {preset.arabic}
          </p>
          <p className="text-white text-sm mt-2">{preset.name}</p>
        </div>

        {/* Counter tap area */}
        <div className="flex flex-col items-center">
          <button
            onClick={handleTap}
            className={`w-48 h-48 rounded-full flex items-center justify-center transition-all duration-150 active:scale-95 ${
              completed
                ? 'bg-gold/20 border-2 border-gold shadow-[0_0_30px_rgba(201,168,76,0.3)]'
                : 'bg-white/10 border-2 border-white/20 hover:border-white/30 active:bg-white/15'
            }`}
          >
            <div className="text-center">
              <span className={`text-5xl font-bold ${completed ? 'text-gold' : 'text-white'}`}>
                {count}
              </span>
              <p className="text-white text-xs mt-2">/ {preset.target}</p>
            </div>
          </button>

          {/* Progress ring */}
          <div className="w-full max-w-xs mt-6">
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  completed ? 'bg-gold' : 'bg-green-600'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-white text-xs">{count} counted</span>
              <span className="text-white text-xs">{Math.max(0, preset.target - count)} remaining</span>
            </div>
          </div>

          {completed && (
            <p className="text-gold text-sm font-medium mt-4 animate-fade-in">
              Target reached! Continue or reset.
            </p>
          )}

          {/* Reset button */}
          <button
            onClick={handleReset}
            className="mt-6 flex items-center gap-2 text-white hover:text-white text-sm transition-colors"
          >
            <RotateCcw size={16} />
            Reset
          </button>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
