import { useState, useEffect } from 'react';
import type { Program, TimeSlot } from '../../types';
import { loadProgramsForCenter, saveProgramsForCenter } from '../../utils/programs';
import { Plus, Trash2, Save, Clock, UserCircle, AlertCircle } from 'lucide-react';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

interface ManageProgramsProps {
  mosqueId: string;
}

export function ManagePrograms({ mosqueId }: ManageProgramsProps) {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [speakers, setSpeakers] = useState<string[]>(['']);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([{ time: '', activity: '' }]);

  useEffect(() => {
    setPrograms(loadProgramsForCenter(mosqueId));
  }, [mosqueId]);

  const savePrograms = (updated: Program[]) => {
    setPrograms(updated);
    saveProgramsForCenter(mosqueId, updated);
  };

  const [error, setError] = useState('');

  const handleAdd = () => {
    setError('');
    if (!title.trim()) {
      setError('Please enter a program title');
      return;
    }
    if (!date) {
      setError('Please select a date');
      return;
    }

    const newProgram: Program = {
      id: generateId(),
      mosqueId,
      title: title.trim(),
      date,
      description: description.trim(),
      speakers: speakers.filter((s) => s.trim() !== ''),
      timeSlots: timeSlots.filter((ts) => ts.time.trim() !== '' && ts.activity.trim() !== ''),
      videoUrl: videoUrl || undefined,
    };

    savePrograms([newProgram, ...programs]);
    resetForm();
  };

  const resetForm = () => {
    setTitle('');
    setDate('');
    setDescription('');
    setVideoUrl('');
    setSpeakers(['']);
    setTimeSlots([{ time: '', activity: '' }]);
    setShowForm(false);
  };

  const handleDelete = (id: string) => {
    savePrograms(programs.filter((p) => p.id !== id));
  };

  const addSpeaker = () => setSpeakers([...speakers, '']);
  const removeSpeaker = (i: number) => setSpeakers(speakers.filter((_, idx) => idx !== i));
  const updateSpeaker = (i: number, val: string) => {
    const updated = [...speakers];
    updated[i] = val;
    setSpeakers(updated);
  };

  const addTimeSlot = () => setTimeSlots([...timeSlots, { time: '', activity: '' }]);
  const removeTimeSlot = (i: number) => setTimeSlots(timeSlots.filter((_, idx) => idx !== i));
  const updateTimeSlot = (i: number, field: keyof TimeSlot, val: string) => {
    const updated = [...timeSlots];
    updated[i] = { ...updated[i], [field]: val };
    setTimeSlots(updated);
  };

  return (
    <div className="space-y-4">
      <button
        onClick={() => setShowForm(!showForm)}
        className="w-full bg-green-800/60 hover:bg-green-700/70 border border-green-600/40 
                   text-white font-medium py-3 px-4 rounded-xl flex items-center justify-center gap-2
                   transition-colors"
      >
        <Plus size={18} />
        Add Program
      </button>

      {showForm && (
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/10 space-y-4">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Program title"
            className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white 
                       placeholder-white/65 focus:outline-none focus:border-gold/50 text-sm"
          />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white 
                       focus:outline-none focus:border-gold/50 text-sm"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description"
            rows={2}
            className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white 
                       placeholder-white/65 focus:outline-none focus:border-gold/50 text-sm resize-none"
          />

          {/* Speakers */}
          <div>
            <label className="text-white/95 text-xs font-medium flex items-center gap-1 mb-2">
              <UserCircle size={14} className="text-gold" />
              Speakers
            </label>
            <div className="space-y-2">
              {speakers.map((speaker, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    value={speaker}
                    onChange={(e) => updateSpeaker(i, e.target.value)}
                    placeholder={`Speaker ${i + 1} name`}
                    className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white 
                               placeholder-white/65 focus:outline-none focus:border-gold/50 text-sm"
                  />
                  {speakers.length > 1 && (
                    <button
                      onClick={() => removeSpeaker(i)}
                      className="text-red-400/60 hover:text-red-400 p-2 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={addSpeaker}
              className="mt-2 text-gold/93 hover:text-gold text-xs flex items-center gap-1 transition-colors"
            >
              <Plus size={12} /> Add another speaker
            </button>
          </div>

          {/* Time Slots */}
          <div>
            <label className="text-white/95 text-xs font-medium flex items-center gap-1 mb-2">
              <Clock size={14} className="text-gold" />
              Schedule / Itinerary
            </label>
            <div className="space-y-2">
              {timeSlots.map((slot, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="time"
                    value={slot.time}
                    onChange={(e) => updateTimeSlot(i, 'time', e.target.value)}
                    className="w-28 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white 
                               focus:outline-none focus:border-gold/50 text-sm"
                  />
                  <input
                    type="text"
                    value={slot.activity}
                    onChange={(e) => updateTimeSlot(i, 'activity', e.target.value)}
                    placeholder="Activity (e.g., Recitation, Lecture, Matam)"
                    className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white 
                               placeholder-white/65 focus:outline-none focus:border-gold/50 text-sm"
                  />
                  {timeSlots.length > 1 && (
                    <button
                      onClick={() => removeTimeSlot(i)}
                      className="text-red-400/60 hover:text-red-400 p-2 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={addTimeSlot}
              className="mt-2 text-gold/93 hover:text-gold text-xs flex items-center gap-1 transition-colors"
            >
              <Plus size={12} /> Add time slot
            </button>
          </div>

          <input
            type="url"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="Video URL (optional)"
            className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white 
                       placeholder-white/65 focus:outline-none focus:border-gold/50 text-sm"
          />

          {error && (
            <p className="text-red-400 text-xs flex items-center gap-1">
              <AlertCircle size={12} />
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAdd}
              className="flex-1 bg-gold/80 hover:bg-gold text-charcoal font-medium py-3 px-4 
                         rounded-xl flex items-center justify-center gap-2 transition-colors text-sm"
            >
              <Save size={16} />
              Save Program
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 text-white/86 hover:text-white/95 text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {programs.length === 0 ? (
          <p className="text-white/78 text-center py-8 text-sm">
            No programs added yet. Click "Add Program" to create one.
          </p>
        ) : (
          programs.map((program) => (
            <div
              key={program.id}
              className="bg-white/5 rounded-xl p-4 border border-white/5 flex items-start justify-between"
            >
              <div className="flex-1 min-w-0">
                <h4 className="text-white font-medium text-sm">{program.title}</h4>
                <p className="text-white/86 text-xs mt-1">{program.description}</p>
                {program.speakers && program.speakers.length > 0 && (
                  <p className="text-gold/95 text-xs mt-1">
                    Speaker{program.speakers.length > 1 ? 's' : ''}: {program.speakers.join(', ')}
                  </p>
                )}
                {program.timeSlots && program.timeSlots.length > 0 && (
                  <p className="text-white/78 text-xs mt-1">
                    {program.timeSlots.length} time slot{program.timeSlots.length > 1 ? 's' : ''}
                  </p>
                )}
                <p className="text-gold/86 text-xs mt-1">
                  {new Date(program.date + 'T00:00:00').toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => handleDelete(program.id)}
                className="text-red-400/50 hover:text-red-400 p-1 transition-colors"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
