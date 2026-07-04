import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Megaphone } from 'lucide-react';
import type { Announcement } from '../types';
import { getAnnouncementsForCenter } from '../utils/announcements';

interface CenterAnnouncementsProps {
  mosqueId: string;
  limit?: number;
  showViewAll?: boolean;
}

function getTypeStyle(t: Announcement['type']) {
  switch (t) {
    case 'death':
      return 'bg-gray-800/50 border-gray-600/30';
    case 'birth':
      return 'bg-green-900/20 border-green-700/20';
    case 'marriage':
      return 'bg-purple-900/20 border-purple-700/20';
    default:
      return 'bg-white/5 border-white/10';
  }
}

function getTypeBadge(t: Announcement['type']) {
  switch (t) {
    case 'death':
      return { text: 'Inna Lillahi', class: 'text-gray-300' };
    case 'birth':
      return { text: 'Mubarak', class: 'text-green-400' };
    case 'marriage':
      return { text: 'Nikah', class: 'text-purple-400' };
    default:
      return { text: 'Announcement', class: 'text-gold' };
  }
}

export function CenterAnnouncements({
  mosqueId,
  limit = 5,
  showViewAll = true,
}: CenterAnnouncementsProps) {
  const navigate = useNavigate();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  useEffect(() => {
    setAnnouncements(getAnnouncementsForCenter(mosqueId));
  }, [mosqueId]);

  if (announcements.length === 0) return null;

  const displayed = announcements.slice(0, limit);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-white font-semibold text-sm flex items-center gap-2">
          <Megaphone size={16} className="text-gold" />
          Announcements
        </h2>
        {showViewAll && (
          <button
            type="button"
            onClick={() => navigate('/announcements')}
            className="text-gold text-xs hover:text-gold/80 transition-colors"
          >
            View all
          </button>
        )}
      </div>

      <div className="space-y-3">
        {displayed.map((announcement) => {
          const badge = getTypeBadge(announcement.type);
          return (
            <div
              key={announcement.id}
              className={`rounded-xl p-4 border ${getTypeStyle(announcement.type)}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`text-[10px] uppercase tracking-wide font-semibold ${badge.class}`}>
                  {badge.text}
                </span>
                <span className="text-white/88 text-xs">{announcement.date}</span>
              </div>
              <h3 className="text-white font-medium text-sm">{announcement.title}</h3>
              <p className="text-white/95 text-xs mt-2 leading-relaxed">{announcement.content}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
