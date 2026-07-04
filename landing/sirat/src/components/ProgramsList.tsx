import { useState } from 'react';
import type { Program } from '../types';
import { Calendar, Video, ChevronDown, ChevronUp, Clock, UserCircle } from 'lucide-react';

interface ProgramsListProps {
  programs: Program[];
}

function getUpcomingSamplePrograms(): Program[] {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const dayAfter = new Date(today);
  dayAfter.setDate(today.getDate() + 2);

  return [
    {
      id: 'sample-1',
      mosqueId: '',
      title: 'Weekly Majlis',
      date: today.toISOString().split('T')[0],
      description: 'Regular weekly gathering and lecture',
      speakers: ['Maulana Abbas'],
      timeSlots: [
        { time: '19:00', activity: 'Recitation' },
        { time: '19:30', activity: 'Lecture' },
        { time: '20:30', activity: 'Matam & Ziyarat' },
      ],
    },
    {
      id: 'sample-2',
      mosqueId: '',
      title: 'Dua Kumayl',
      date: tomorrow.toISOString().split('T')[0],
      description: 'Thursday night Dua Kumayl gathering',
      speakers: [],
      timeSlots: [
        { time: '20:00', activity: 'Dua Kumayl' },
        { time: '21:00', activity: 'Dinner' },
      ],
    },
    {
      id: 'sample-3',
      mosqueId: '',
      title: 'Quran Class',
      date: dayAfter.toISOString().split('T')[0],
      description: 'Tajweed and recitation class for all ages',
      speakers: ['Qari Ahmed', 'Sister Fatima'],
      timeSlots: [
        { time: '10:00', activity: 'Kids Quran Class' },
        { time: '11:00', activity: 'Adult Tajweed' },
      ],
    },
  ];
}

function formatTime(time: string): string {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
}

export function ProgramsList({ programs }: ProgramsListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const today = new Date().toISOString().split('T')[0];
  const currentPrograms = programs.filter((p) => p.date >= today);
  const displayPrograms = currentPrograms.length > 0 ? currentPrograms : getUpcomingSamplePrograms();

  const toggle = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/10">
      <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
        <Calendar size={20} className="text-gold" />
        Programs & Events
      </h3>

      <div className="space-y-3">
        {displayPrograms.map((program) => {
          const isExpanded = expandedId === program.id;
          const hasSpeakers = program.speakers && program.speakers.length > 0;
          const hasSlots = program.timeSlots && program.timeSlots.length > 0;

          return (
            <div
              key={program.id}
              className="bg-white/5 rounded-xl border border-white/5 hover:border-gold/20 transition-colors overflow-hidden"
            >
              <button
                onClick={() => toggle(program.id)}
                className="w-full p-4 text-left flex items-start justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <h4 className="text-white font-medium text-sm">{program.title}</h4>
                  <p className="text-white/93 text-xs mt-1">
                    {new Date(program.date + 'T00:00:00').toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                    {hasSpeakers && (
                      <span className="text-gold ml-2">
                        — {program.speakers.join(', ')}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {program.videoUrl && (
                    <a
                      href={program.videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gold/93 hover:text-gold transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Video size={16} />
                    </a>
                  )}
                  {isExpanded ? (
                    <ChevronUp size={16} className="text-white/78" />
                  ) : (
                    <ChevronDown size={16} className="text-white/78" />
                  )}
                </div>
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 border-t border-white/5 pt-3 space-y-3">
                  {program.description && (
                    <p className="text-white/93 text-sm">{program.description}</p>
                  )}

                  {hasSpeakers && (
                    <div>
                      <p className="text-white/78 text-xs font-medium flex items-center gap-1 mb-1.5">
                        <UserCircle size={12} className="text-gold" />
                        Speaker{program.speakers.length > 1 ? 's' : ''}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {program.speakers.map((speaker, i) => (
                          <span
                            key={i}
                            className="px-2.5 py-1 bg-gold/10 text-gold text-xs rounded-lg border border-gold/20"
                          >
                            {speaker}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {hasSlots && (
                    <div>
                      <p className="text-white/78 text-xs font-medium flex items-center gap-1 mb-1.5">
                        <Clock size={12} className="text-gold" />
                        Schedule
                      </p>
                      <div className="space-y-1.5">
                        {program.timeSlots.map((slot, i) => (
                          <div key={i} className="flex items-center gap-3">
                            <span className="text-gold font-mono text-xs w-16 flex-shrink-0">
                              {formatTime(slot.time)}
                            </span>
                            <span className="text-white/95 text-sm">{slot.activity}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
