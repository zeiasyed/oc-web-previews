import { usePrayerTimes } from '../hooks/usePrayerTimes';
import { Clock } from 'lucide-react';

interface PrayerTimesCardProps {
  city: string;
}

export function PrayerTimesCard({ city }: PrayerTimesCardProps) {
  const { prayerTimes, loading, error, hijriDate, getNextPrayer } = usePrayerTimes({ city });
  const nextPrayer = getNextPrayer();

  if (loading) {
    return (
      <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 animate-pulse">
        <div className="h-6 bg-white/20 rounded w-1/3 mb-4" />
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-4 bg-white/20 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !prayerTimes) {
    return (
      <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6">
        <p className="text-white/70 text-center">Unable to load prayer times</p>
      </div>
    );
  }

  const prayers = [
    { name: 'Fajr', arabic: 'الفجر', time: prayerTimes.Fajr },
    { name: 'Sunrise', arabic: 'الشروق', time: prayerTimes.Sunrise },
    { name: 'Dhuhr', arabic: 'الظهر', time: prayerTimes.Dhuhr },
    { name: 'Asr', arabic: 'العصر', time: prayerTimes.Asr },
    { name: 'Maghrib', arabic: 'المغرب', time: prayerTimes.Maghrib },
    { name: 'Isha', arabic: 'العشاء', time: prayerTimes.Isha },
  ];

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/10">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Clock size={20} className="text-gold" />
          Prayer Times
        </h3>
      </div>
      {hijriDate && (
        <p className="text-gold text-sm mb-4">{hijriDate}</p>
      )}

      {nextPrayer && (
        <div className="bg-green-900/40 border border-green-500/30 rounded-xl p-3 mb-4">
          <p className="text-green-300 text-xs uppercase tracking-wide">Next Prayer</p>
          <p className="text-white font-semibold text-lg">{nextPrayer}</p>
        </div>
      )}

      <div className="space-y-2">
        {prayers.map((prayer) => (
          <div
            key={prayer.name}
            className={`flex items-center justify-between py-2 px-3 rounded-lg transition-colors ${
              nextPrayer === prayer.name
                ? 'bg-gold/20 border border-gold/30'
                : 'hover:bg-white/5'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-white/90 font-medium text-sm">{prayer.name}</span>
              <span className="text-white/70 text-xs">{prayer.arabic}</span>
            </div>
            <span className="text-white font-mono text-sm">
              {prayer.time.split(' ')[0]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
