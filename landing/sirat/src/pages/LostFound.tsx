import { useState, useEffect } from 'react';
import type { LostFoundItem } from '../types';
import { mosques } from '../data/mosques';
import { BottomNav } from '../components/BottomNav';
import { Plus, Package, Check, X } from 'lucide-react';

export function LostFound() {
  const [items, setItems] = useState<LostFoundItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<'all' | 'lost' | 'found'>('all');

  const [description, setDescription] = useState('');
  const [type, setType] = useState<'lost' | 'found'>('lost');
  const [mosqueId, setMosqueId] = useState(mosques[0].id);
  const [contactInfo, setContactInfo] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem('sirat_lost_found');
    if (stored) {
      setItems(JSON.parse(stored));
    }
  }, []);

  const saveItems = (updated: LostFoundItem[]) => {
    setItems(updated);
    localStorage.setItem('sirat_lost_found', JSON.stringify(updated));
  };

  const handleSubmit = () => {
    if (!description || !contactInfo) return;

    const newItem: LostFoundItem = {
      id: crypto.randomUUID(),
      mosqueId,
      description,
      type,
      date: new Date().toISOString().split('T')[0],
      contactInfo,
      status: 'open',
    };

    saveItems([newItem, ...items]);
    setDescription('');
    setContactInfo('');
    setShowForm(false);
  };

  const markResolved = (id: string) => {
    saveItems(items.map((item) => item.id === id ? { ...item, status: 'resolved' as const } : item));
  };

  const filteredItems = items.filter((item) => {
    if (filter === 'all') return true;
    return item.type === filter;
  });

  const getMosqueName = (id: string) => mosques.find((m) => m.id === id)?.shortName || id;

  return (
    <div className="min-h-screen bg-charcoal pb-20">
      <div className="px-5 pt-12">
        <h1 className="text-2xl font-bold text-white mb-2">Lost & Found</h1>
        <p className="text-white/78 text-sm mb-6">Report or find items across all centers</p>

        <button
          onClick={() => setShowForm(!showForm)}
          className="w-full bg-green-800/60 hover:bg-green-700/70 border border-green-600/40 
                     text-white font-medium py-3 px-4 rounded-xl flex items-center justify-center gap-2
                     transition-colors mb-4"
        >
          <Plus size={18} />
          Report Item
        </button>

        {showForm && (
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/10 space-y-3 mb-6">
            <div className="flex gap-2">
              <button
                onClick={() => setType('lost')}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors border ${
                  type === 'lost'
                    ? 'bg-red-900/30 border-red-600/40 text-red-300'
                    : 'bg-white/5 border-white/10 text-white/78'
                }`}
              >
                Lost
              </button>
              <button
                onClick={() => setType('found')}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors border ${
                  type === 'found'
                    ? 'bg-green-900/30 border-green-600/40 text-green-200'
                    : 'bg-white/5 border-white/10 text-white/78'
                }`}
              >
                Found
              </button>
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

            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the item (e.g., black wallet, silver ring, blue jacket)"
              rows={3}
              className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white 
                         placeholder-white/55 focus:outline-none focus:border-gold/50 text-sm resize-none"
            />

            <input
              type="text"
              value={contactInfo}
              onChange={(e) => setContactInfo(e.target.value)}
              placeholder="Your contact info (phone or email)"
              className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white 
                         placeholder-white/55 focus:outline-none focus:border-gold/50 text-sm"
            />

            <div className="flex gap-2">
              <button
                onClick={handleSubmit}
                className="flex-1 bg-gold/80 hover:bg-gold text-charcoal font-medium py-2 px-4 
                           rounded-xl text-sm transition-colors"
              >
                Submit
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-white/78 hover:text-white text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex gap-2 mb-4">
          {(['all', 'lost', 'found'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                filter === f
                  ? 'bg-gold/20 border-gold/40 text-gold'
                  : 'bg-white/5 border-white/10 text-white/78'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Items list */}
        {filteredItems.length === 0 ? (
          <div className="text-center py-12">
            <Package size={40} className="text-white/45 mx-auto mb-4" />
            <p className="text-white/68 text-sm">No items reported yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className={`bg-white/5 rounded-xl p-4 border transition-colors ${
                  item.status === 'resolved'
                    ? 'border-green-700/20 opacity-60'
                    : 'border-white/10'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded ${
                        item.type === 'lost'
                          ? 'bg-red-900/40 text-red-300'
                          : 'bg-green-900/40 text-green-200'
                      }`}>
                        {item.type}
                      </span>
                      {item.status === 'resolved' && (
                        <span className="text-[10px] uppercase tracking-wide text-green-400 flex items-center gap-0.5">
                          <Check size={10} /> Resolved
                        </span>
                      )}
                    </div>
                    <p className="text-white text-sm mt-1">{item.description}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-white/55 text-xs">{getMosqueName(item.mosqueId)}</span>
                      <span className="text-white/55 text-xs">{item.date}</span>
                    </div>
                    <p className="text-white/68 text-xs mt-1">Contact: {item.contactInfo}</p>
                  </div>
                  {item.status !== 'resolved' && (
                    <button
                      onClick={() => markResolved(item.id)}
                      className="text-white/55 hover:text-green-400 p-1 transition-colors"
                      title="Mark as resolved"
                    >
                      <X size={16} />
                    </button>
                  )}
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
