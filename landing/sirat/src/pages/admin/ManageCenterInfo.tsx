import { useState, useEffect } from 'react';
import { mosques } from '../../data/mosques';
import { loadCenterInfoOverrides, saveCenterInfoOverrides, type CenterInfoOverrides } from '../../utils/centerInfo';
import { Save, CheckCircle } from 'lucide-react';

interface ManageCenterInfoProps {
  mosqueId: string;
}

export function ManageCenterInfo({ mosqueId }: ManageCenterInfoProps) {
  const mosque = mosques.find((m) => m.id === mosqueId);
  const [saved, setSaved] = useState(false);

  const [form, setForm] = useState<CenterInfoOverrides>(() => loadCenterInfoOverrides(mosqueId));

  useEffect(() => {
    setForm(loadCenterInfoOverrides(mosqueId));
    setSaved(false);
  }, [mosqueId]);

  if (!mosque) return null;

  const getValue = (field: keyof CenterInfoOverrides) => {
    if (form[field] !== undefined) return form[field]!;
    return (mosque as unknown as Record<string, string>)[field] || '';
  };

  const handleChange = (field: keyof CenterInfoOverrides, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleSave = () => {
    saveCenterInfoOverrides(mosqueId, form);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const fields: { key: keyof CenterInfoOverrides; label: string; type?: string; placeholder?: string }[] = [
    { key: 'address', label: 'Address', placeholder: 'Street address' },
    { key: 'city', label: 'City', placeholder: 'City' },
    { key: 'state', label: 'State', placeholder: 'CA' },
    { key: 'zip', label: 'ZIP Code', placeholder: '90000' },
    { key: 'phone', label: 'Phone', placeholder: '(555) 123-4567', type: 'tel' },
    { key: 'email', label: 'Email', placeholder: 'info@center.org', type: 'email' },
    { key: 'website', label: 'Website URL', placeholder: 'https://...', type: 'url' },
    { key: 'donateUrl', label: 'Donate URL', placeholder: 'https://...', type: 'url' },
    { key: 'youtubeUrl', label: 'YouTube / Live Stream URL', placeholder: 'https://...', type: 'url' },
    { key: 'subscribeUrl', label: 'Newsletter / Subscribe URL', placeholder: 'https://...', type: 'url' },
    { key: 'sundaySchoolUrl', label: 'Sunday School URL', placeholder: 'https://...', type: 'url' },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/10 space-y-4">
        <h2 className="text-white font-semibold text-sm">Contact & Address</h2>

        <div className="grid grid-cols-1 gap-3">
          {fields.map((f) => (
            <div key={f.key}>
              <label className="text-white/93 text-xs block mb-1">{f.label}</label>
              <input
                type={f.type || 'text'}
                value={getValue(f.key)}
                onChange={(e) => handleChange(f.key, e.target.value)}
                placeholder={f.placeholder}
                className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-2.5 text-white text-sm
                           placeholder-white/55 focus:outline-none focus:border-gold/50"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/10 space-y-3">
        <h2 className="text-white font-semibold text-sm">Parking Info</h2>
        <textarea
          value={getValue('parkingInfo')}
          onChange={(e) => handleChange('parkingInfo', e.target.value)}
          placeholder="Describe parking availability, lot location, street parking, etc."
          rows={3}
          className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-2.5 text-white text-sm
                     placeholder-white/55 focus:outline-none focus:border-gold/50 resize-none"
        />
      </div>

      <button
        type="button"
        onClick={handleSave}
        className="w-full bg-gold/80 hover:bg-gold text-charcoal font-medium py-3 px-4 
                   rounded-xl flex items-center justify-center gap-2 transition-colors text-sm"
      >
        {saved ? <CheckCircle size={16} /> : <Save size={16} />}
        {saved ? 'Saved!' : 'Save Changes'}
      </button>
    </div>
  );
}
