import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { mosques } from '../../data/mosques';
import { ManagePrograms } from './ManagePrograms';
import { ManageCenterInfo } from './ManageCenterInfo';
import { ArrowLeft, Settings, Calendar, Building, Megaphone } from 'lucide-react';
import type { Announcement } from '../../types';
import {
  getAnnouncementsForCenter,
  addAnnouncement,
  deleteAnnouncement,
} from '../../utils/announcements';

type AdminTab = 'info' | 'programs' | 'announcements';

export function AdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedMosqueId, setSelectedMosqueId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>('info');

  if (!user) {
    navigate('/login');
    return null;
  }

  if (selectedMosqueId) {
    const mosque = mosques.find((m) => m.id === selectedMosqueId);

    const tabs: { id: AdminTab; label: string; icon: typeof Building }[] = [
      { id: 'info', label: 'Center Info', icon: Building },
      { id: 'programs', label: 'Programs', icon: Calendar },
      { id: 'announcements', label: 'Announce', icon: Megaphone },
    ];

    return (
      <div className="min-h-screen bg-charcoal pb-10">
        <div className="px-5 pt-12">
          <button
            onClick={() => { setSelectedMosqueId(null); setActiveTab('info'); }}
            className="text-gold hover:text-gold/80 text-sm mb-4 transition-colors flex items-center gap-1"
          >
            <ArrowLeft size={16} />
            Back to centers
          </button>
          <h1 className="text-xl font-bold text-white mb-4">
            Manage: {mosque?.name}
          </h1>

          <div className="flex gap-2 mb-6 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'bg-gold/20 text-gold border border-gold/40'
                    : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'
                }`}
              >
                <tab.icon size={14} />
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'info' && <ManageCenterInfo mosqueId={selectedMosqueId} />}
          {activeTab === 'programs' && <ManagePrograms mosqueId={selectedMosqueId} />}
          {activeTab === 'announcements' && <ManageAnnouncements mosqueId={selectedMosqueId} />}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-charcoal">
      <div className="px-5 pt-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Settings size={20} className="text-gold" />
              <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
            </div>
            <p className="text-white/70 text-sm">Manage center info, programs & announcements</p>
          </div>
          <button
            onClick={() => navigate('/home')}
            className="text-white/60 hover:text-white/80 text-sm transition-colors"
          >
            ← App
          </button>
        </div>

        <div className="space-y-3">
          {mosques.map((mosque) => (
            <button
              key={mosque.id}
              onClick={() => setSelectedMosqueId(mosque.id)}
              className="w-full bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl p-4
                         hover:bg-white/15 hover:border-gold/30 transition-all duration-300
                         flex items-center gap-4 text-left group"
            >
              <div className="w-10 h-10 rounded-xl bg-green-900/50 border border-green-700/30 
                              flex items-center justify-center flex-shrink-0">
                <Building size={18} className="text-gold" />
              </div>
              <div className="flex-1">
                <h3 className="text-white font-medium text-sm group-hover:text-gold transition-colors">
                  {mosque.name}
                </h3>
                <p className="text-white/60 text-xs">{mosque.city}, {mosque.state}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ManageAnnouncements({ mosqueId }: { mosqueId: string }) {
  const [announcements, setAnnouncements] = useState<Announcement[]>(() =>
    getAnnouncementsForCenter(mosqueId)
  );
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [type, setType] = useState<Announcement['type']>('general');
  const [showForm, setShowForm] = useState(false);

  const handleAdd = () => {
    if (!title.trim() || !content.trim()) return;
    const item: Announcement = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      mosqueId,
      title: title.trim(),
      content: content.trim(),
      type,
      date: new Date().toISOString().split('T')[0],
    };
    addAnnouncement(item);
    setAnnouncements((prev) => [item, ...prev]);
    setTitle('');
    setContent('');
    setShowForm(false);
  };

  const handleDelete = (id: string) => {
    deleteAnnouncement(id);
    setAnnouncements((prev) => prev.filter((x) => x.id !== id));
  };

  return (
    <div className="space-y-4">
      <button
        onClick={() => setShowForm(!showForm)}
        className="w-full bg-green-800/60 hover:bg-green-700/70 border border-green-600/40 
                   text-white font-medium py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors"
      >
        <Megaphone size={16} />
        New Announcement
      </button>

      {showForm && (
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/10 space-y-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Announcement title"
            className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white 
                       placeholder-white/40 focus:outline-none focus:border-gold/50 text-sm"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Details"
            rows={3}
            className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white 
                       placeholder-white/40 focus:outline-none focus:border-gold/50 text-sm resize-none"
          />
          <div className="flex flex-wrap gap-2">
            {['general', 'death', 'birth', 'marriage'].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t as Announcement['type'])}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                  type === t ? 'bg-gold/20 text-gold border border-gold/40' : 'bg-white/5 text-white/60 border border-white/10'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleAdd}
            className="w-full bg-gold/80 hover:bg-gold text-charcoal font-medium py-3 rounded-xl transition-colors text-sm"
          >
            Post Announcement
          </button>
        </div>
      )}

      <div className="space-y-2">
        {announcements.length === 0 ? (
          <p className="text-white/50 text-center py-8 text-sm">No announcements yet.</p>
        ) : (
          announcements.map((a) => (
            <div key={a.id} className="bg-white/5 rounded-xl p-4 border border-white/5 flex items-start justify-between">
              <div>
                <h4 className="text-white font-medium text-sm">{a.title}</h4>
                <p className="text-white/60 text-xs mt-1">{a.content}</p>
                <p className="text-gold/60 text-xs mt-1 capitalize">{a.type} · {a.date}</p>
              </div>
              <button
                onClick={() => handleDelete(a.id)}
                className="text-red-400/50 hover:text-red-400 p-1 transition-colors"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
