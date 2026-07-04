import { useState, useEffect } from 'react';
import type { Announcement } from '../types';
import { mosques } from '../data/mosques';
import { BottomNav } from '../components/BottomNav';
import { Plus, Megaphone } from 'lucide-react';
import {
  loadAnnouncements,
  addAnnouncement,
  getSampleAnnouncements,
} from '../utils/announcements';

export function Announcements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<'all' | 'death' | 'birth' | 'marriage' | 'general'>('all');

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [type, setType] = useState<Announcement['type']>('general');
  const [mosqueId, setMosqueId] = useState(mosques[0].id);

  useEffect(() => {
    const stored = loadAnnouncements();
    if (stored.length > 0) {
      setAnnouncements(stored);
    } else {
      setAnnouncements(getSampleAnnouncements());
    }
  }, []);

  const handleSubmit = () => {
    if (!title || !content) return;

    const newAnnouncement: Announcement = {
      id: crypto.randomUUID(),
      mosqueId,
      title,
      content,
      date: new Date().toISOString().split('T')[0],
      type,
    };

    addAnnouncement(newAnnouncement);
    setAnnouncements((prev) => [newAnnouncement, ...prev]);
    setTitle('');
    setContent('');
    setShowForm(false);
  };

  const filtered = announcements.filter((a) => filter === 'all' || a.type === filter);

  const getTypeStyle = (t: Announcement['type']) => {
    switch (t) {
      case 'death': return 'bg-gray-800/50 border-gray-600/30';
      case 'birth': return 'bg-green-900/20 border-green-700/20';
      case 'marriage': return 'bg-purple-900/20 border-purple-700/20';
      default: return 'bg-white/5 border-white/10';
    }
  };

  const getTypeBadge = (t: Announcement['type']) => {
    switch (t) {
      case 'death': return { text: 'Inna Lillahi', class: 'text-gray-400' };
      case 'birth': return { text: 'Mubarak', class: 'text-green-400' };
      case 'marriage': return { text: 'Nikah', class: 'text-purple-400' };
      default: return { text: 'Announcement', class: 'text-gold' };
    }
  };

  const getMosqueName = (id: string) => mosques.find((m) => m.id === id)?.shortName || id;

  return (
    <div className="min-h-screen bg-charcoal pb-20">
      <div className="px-5 pt-12">
        <h1 className="text-2xl font-bold text-white mb-2">Community Announcements</h1>
        <p className="text-white/50 text-sm mb-6">News from across the community</p>

        <button
          onClick={() => setShowForm(!showForm)}
          className="w-full bg-green-800/60 hover:bg-green-700/70 border border-green-600/40 
                     text-white font-medium py-3 px-4 rounded-xl flex items-center justify-center gap-2
                     transition-colors mb-4"
        >
          <Plus size={18} />
          Post Announcement
        </button>

        {showForm && (
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/10 space-y-3 mb-6">
            <div className="flex gap-2 flex-wrap">
              {(['general', 'death', 'birth', 'marriage'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                    type === t
                      ? 'bg-gold/20 border-gold/40 text-gold'
                      : 'bg-white/5 border-white/10 text-white/50'
                  }`}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>

            <select
              value={mosqueId}
              onChange={(e) => setMosqueId(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white text-sm
                         focus:outline-none focus:border-gold/50"
            >
              {mosques.map((m) => (
                <option key={m.id} value={m.id} className="bg-charcoal">
                  {m.name}
                </option>
              ))}
            </select>

            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Announcement title"
              className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white 
                         placeholder-white/30 focus:outline-none focus:border-gold/50 text-sm"
            />

            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Details..."
              rows={3}
              className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white 
                         placeholder-white/30 focus:outline-none focus:border-gold/50 text-sm resize-none"
            />

            <div className="flex gap-2">
              <button
                onClick={handleSubmit}
                className="flex-1 bg-gold/80 hover:bg-gold text-charcoal font-medium py-2 px-4 
                           rounded-xl text-sm transition-colors"
              >
                Post
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-white/50 hover:text-white/70 text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Filter */}
        <div className="flex gap-2 overflow-x-auto pb-3 mb-4">
          {(['all', 'general', 'death', 'birth', 'marriage'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                filter === f
                  ? 'bg-gold/20 border-gold/40 text-gold'
                  : 'bg-white/5 border-white/10 text-white/50'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Announcements */}
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <Megaphone size={40} className="text-white/20 mx-auto mb-4" />
            <p className="text-white/40 text-sm">No announcements</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((announcement) => {
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
                    <span className="text-white/30 text-xs">{announcement.date}</span>
                  </div>
                  <h3 className="text-white font-medium text-sm">{announcement.title}</h3>
                  <p className="text-white/50 text-xs mt-2 leading-relaxed">{announcement.content}</p>
                  <p className="text-gold/50 text-xs mt-2">— {getMosqueName(announcement.mosqueId)}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
