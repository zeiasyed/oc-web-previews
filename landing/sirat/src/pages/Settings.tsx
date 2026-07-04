import { useState } from 'react';
import { BottomNav } from '../components/BottomNav';
import { useSettings } from '../context/SettingsContext';
import { Settings as SettingsIcon, Type, RefreshCw } from 'lucide-react';
import { refreshApp } from '../utils/appRefresh';

const FONT_OPTIONS = [
  { value: 'small' as const, label: 'Small', preview: 'Aa' },
  { value: 'medium' as const, label: 'Default', preview: 'Aa' },
  { value: 'large' as const, label: 'Large', preview: 'Aa' },
  { value: 'xlarge' as const, label: 'Extra Large', preview: 'Aa' },
];

export function Settings() {
  const { fontSize, setFontSize } = useSettings();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshApp();
  };

  return (
    <div className="min-h-screen bg-charcoal pb-20">
      <div className="px-5 pt-12">
        <h1 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
          <SettingsIcon size={24} className="text-gold" />
          Settings
        </h1>
        <p className="text-white text-sm mb-8">Customize your reading experience</p>

        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/10 mb-6">
          <div className="flex items-center gap-3 mb-5">
            <Type size={20} className="text-gold" />
            <div>
              <h2 className="text-white font-semibold">Font Size</h2>
              <p className="text-white text-xs">Adjust text size for easier reading</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {FONT_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setFontSize(option.value)}
                className={`rounded-xl p-4 border transition-all duration-200 flex flex-col items-center gap-2 ${
                  fontSize === option.value
                    ? 'bg-gold/20 border-gold/50 ring-1 ring-gold/30'
                    : 'bg-white/5 border-white/10 hover:bg-white/10'
                }`}
              >
                <span
                  className={`font-bold text-white ${
                    option.value === 'small' ? 'text-sm' :
                    option.value === 'medium' ? 'text-base' :
                    option.value === 'large' ? 'text-xl' :
                    'text-2xl'
                  }`}
                >
                  {option.preview}
                </span>
                <span className={`text-xs ${
                  fontSize === option.value ? 'text-gold font-medium' : 'text-white'
                }`}>
                  {option.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/10 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <RefreshCw size={20} className={`text-gold ${refreshing ? 'animate-spin' : ''}`} />
            <div>
              <h2 className="text-white font-semibold">Refresh App</h2>
              <p className="text-white text-xs">
                Reload the latest version and update announcements, programs, and center info.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="w-full bg-green-800/60 hover:bg-green-700/70 border border-green-600/40 
                       disabled:opacity-60 text-white font-medium py-3 px-4 rounded-xl 
                       flex items-center justify-center gap-2 transition-colors text-sm"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Refreshing…' : 'Refresh Now'}
          </button>
        </div>

        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/10">
          <h3 className="text-white font-semibold mb-3">Preview</h3>
          <div className="bg-white/5 rounded-xl p-4 border border-white/5">
            <p className="text-white text-right leading-relaxed font-arabic mb-2" dir="rtl">
              بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
            </p>
            <p className="text-gold text-sm italic mb-1">
              Bismillahir Rahmanir Raheem
            </p>
            <p className="text-white text-sm">
              In the name of Allah, the Most Gracious, the Most Merciful
            </p>
          </div>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
