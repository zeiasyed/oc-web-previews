import { useState, useEffect } from 'react';
import { BottomNav } from '../components/BottomNav';
import { IslamicDivider } from '../components/IslamicDivider';
import { Star } from 'lucide-react';

interface ImportantDate {
  day: number;
  month: string;
  monthNum: number;
  event: string;
  type: 'martyrdom' | 'birth' | 'event' | 'holiday';
}

const IMPORTANT_DATES: ImportantDate[] = [
  { day: 1, month: 'Muharram', monthNum: 1, event: 'Islamic New Year', type: 'holiday' },
  { day: 10, month: 'Muharram', monthNum: 1, event: 'Ashura - Martyrdom of Imam Hussain (a.s.)', type: 'martyrdom' },
  { day: 20, month: 'Safar', monthNum: 2, event: 'Arbaeen of Imam Hussain (a.s.)', type: 'event' },
  { day: 28, month: 'Safar', monthNum: 2, event: 'Wafat of Prophet Muhammad (s.a.w.w.) & Martyrdom of Imam Hasan (a.s.)', type: 'martyrdom' },
  { day: 17, month: 'Rabi al-Awwal', monthNum: 3, event: 'Birth of Prophet Muhammad (s.a.w.w.) & Imam Jafar Sadiq (a.s.)', type: 'birth' },
  { day: 13, month: 'Rajab', monthNum: 7, event: 'Birth of Imam Ali (a.s.)', type: 'birth' },
  { day: 27, month: 'Rajab', monthNum: 7, event: "Me'raj - Night of Ascension", type: 'event' },
  { day: 3, month: "Sha'ban", monthNum: 8, event: 'Birth of Imam Hussain (a.s.)', type: 'birth' },
  { day: 15, month: "Sha'ban", monthNum: 8, event: 'Birth of Imam Mahdi (a.t.f.s.)', type: 'birth' },
  { day: 1, month: 'Ramadan', monthNum: 9, event: 'Start of Ramadan', type: 'holiday' },
  { day: 19, month: 'Ramadan', monthNum: 9, event: 'Injury of Imam Ali (a.s.)', type: 'martyrdom' },
  { day: 21, month: 'Ramadan', monthNum: 9, event: 'Martyrdom of Imam Ali (a.s.) & Laylatul Qadr', type: 'martyrdom' },
  { day: 1, month: 'Shawwal', monthNum: 10, event: 'Eid al-Fitr', type: 'holiday' },
  { day: 25, month: 'Shawwal', monthNum: 10, event: 'Martyrdom of Imam Jafar Sadiq (a.s.)', type: 'martyrdom' },
  { day: 10, month: 'Dhul Hijjah', monthNum: 12, event: 'Eid al-Adha', type: 'holiday' },
  { day: 18, month: 'Dhul Hijjah', monthNum: 12, event: 'Eid al-Ghadeer', type: 'holiday' },
  { day: 24, month: 'Dhul Hijjah', monthNum: 12, event: 'Eid al-Mubahila', type: 'event' },
];

export function IslamicCalendar() {
  const [hijriDate, setHijriDate] = useState({ day: '', month: '', year: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHijriDate = async () => {
      try {
        const today = new Date();
        const dateStr = `${today.getDate()}-${today.getMonth() + 1}-${today.getFullYear()}`;
        const response = await fetch(
          `https://api.aladhan.com/v1/gpiToH/${dateStr}`
        );
        const data = await response.json();
        if (data.code === 200) {
          setHijriDate({
            day: data.data.hijri.day,
            month: data.data.hijri.month.en,
            year: data.data.hijri.year,
          });
        }
      } catch {
        setHijriDate({ day: '—', month: '—', year: '—' });
      } finally {
        setLoading(false);
      }
    };
    fetchHijriDate();
  }, []);

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'martyrdom': return 'bg-red-900/30 border-red-700/30 text-red-300';
      case 'birth': return 'bg-green-900/30 border-green-700/30 text-green-300';
      case 'holiday': return 'bg-gold/20 border-gold/30 text-gold';
      case 'event': return 'bg-blue-900/30 border-blue-700/30 text-blue-300';
      default: return 'bg-white/10 border-white/10 text-white/70';
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'martyrdom': return 'Shahadat';
      case 'birth': return 'Wiladat';
      case 'holiday': return 'Eid';
      case 'event': return 'Event';
      default: return '';
    }
  };

  return (
    <div className="min-h-screen bg-charcoal pb-20">
      <div className="px-5 pt-12">
        <h1 className="text-2xl font-bold text-white mb-2">Islamic Calendar</h1>

        {/* Today's Hijri Date */}
        {!loading && (
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/10 mb-6">
            <p className="text-white/40 text-xs uppercase tracking-wide mb-1">Today's Hijri Date</p>
            <p className="text-white text-xl font-semibold">
              {hijriDate.day} {hijriDate.month} {hijriDate.year} AH
            </p>
          </div>
        )}

        <IslamicDivider />

        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Star size={18} className="text-gold" />
          Important Dates
        </h2>

        <div className="space-y-2">
          {IMPORTANT_DATES.map((date, i) => (
            <div
              key={i}
              className={`rounded-xl p-4 border ${getTypeColor(date.type)}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="font-medium text-sm">{date.event}</p>
                  <p className="text-xs opacity-70 mt-1">
                    {date.day} {date.month}
                  </p>
                </div>
                <span className="text-[10px] uppercase tracking-wide opacity-70 font-semibold">
                  {getTypeBadge(date.type)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
