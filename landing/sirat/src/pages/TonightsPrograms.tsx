import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { mosques } from '../data/mosques';
import { loadTonightPrograms } from '../utils/programs';
import { BottomNav } from '../components/BottomNav';
import { IslamicDivider } from '../components/IslamicDivider';
import { Calendar, MapPin, Navigation } from 'lucide-react';

export function TonightsPrograms() {
  const navigate = useNavigate();
  const [allPrograms, setAllPrograms] = useState<
    ReturnType<typeof loadTonightPrograms>
  >([]);

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    const collected = loadTonightPrograms(mosques);

    if (collected.length === 0) {
      setAllPrograms([
        {
          id: 'sample-1',
          mosqueId: 'jafaria',
          mosqueName: 'Jafaria',
          title: 'Muharram Majlis - Shab e 19th',
          date: today,
          description: 'Commemoration majlis with lecture and matam',
          speakers: ['Maulana Sadiq Hasan'],
          timeSlots: [{ time: '19:30', activity: 'Recitation' }, { time: '20:00', activity: 'Lecture' }, { time: '21:00', activity: 'Matam' }],
        },
        {
          id: 'sample-2',
          mosqueId: 'zainabia',
          mosqueName: 'Zainabia',
          title: 'Weekly Friday Program',
          date: today,
          description: 'Dua Kumayl followed by dinner',
          speakers: [],
          timeSlots: [{ time: '20:00', activity: 'Dua Kumayl' }, { time: '21:00', activity: 'Dinner' }],
        },
        {
          id: 'sample-3',
          mosqueId: 'imamia',
          mosqueName: 'Imamia',
          title: 'Quran Class & Majlis',
          date: today,
          description: 'Tajweed class at 7 PM, Majlis at 8:30 PM',
          speakers: ['Maulana Abbas', 'Qari Ahmed'],
          timeSlots: [{ time: '19:00', activity: 'Tajweed Class' }, { time: '20:30', activity: 'Majlis' }],
        },
        {
          id: 'sample-4',
          mosqueId: 'hussainiya',
          mosqueName: 'Hussainiya',
          title: 'Muharram Program - Night 19',
          date: today,
          description: 'Lecture by Maulana followed by Ziyarat and Tabarruk',
          speakers: ['Maulana Naqvi'],
          timeSlots: [{ time: '19:00', activity: 'Recitation' }, { time: '19:30', activity: 'Lecture' }, { time: '20:30', activity: 'Ziyarat & Tabarruk' }],
        },
      ]);
    } else {
      setAllPrograms(collected);
    }
  }, []);

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="min-h-screen bg-charcoal pb-20">
      <div className="px-5 pt-12">
        <h1 className="text-2xl font-bold text-white mb-1">Tonight's Programs</h1>
        <p className="text-white/78 text-sm mb-2">{today}</p>
        <p className="text-gold/86 text-xs mb-6">What's happening across all centers tonight</p>

        <IslamicDivider />

        {allPrograms.length === 0 ? (
          <div className="text-center py-12">
            <Calendar size={40} className="text-white/45 mx-auto mb-4" />
            <p className="text-white/68">No programs scheduled for tonight</p>
          </div>
        ) : (
          <div className="space-y-3">
            {allPrograms.map((program) => (
              <div
                key={program.id}
                className="bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl p-4
                           hover:border-gold/20 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h3 className="text-white font-medium text-sm">{program.title}</h3>
                    <p className="text-white/68 text-xs mt-1">{program.description}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
                  <span className="text-gold/93 text-xs flex items-center gap-1">
                    <MapPin size={12} />
                    {program.mosqueName}
                  </span>
                  <button
                    onClick={() => navigate(`/mosque/${program.mosqueId}`)}
                    className="text-xs text-white/78 hover:text-gold flex items-center gap-1 transition-colors"
                  >
                    <Navigation size={12} />
                    View Center
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
