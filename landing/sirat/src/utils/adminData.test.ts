import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Announcement, Program } from '../types';
import {
  addAnnouncement,
  deleteAnnouncement,
  getAnnouncementsForCenter,
  loadAnnouncements,
  saveAnnouncements,
} from './announcements';
import {
  getCenterData,
  loadCenterInfoOverrides,
  saveCenterInfoOverrides,
} from './centerInfo';
import {
  loadProgramsForCenter,
  loadTonightPrograms,
  saveProgramsForCenter,
} from './programs';

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
    clear: () => storage.clear(),
  });
});

describe('center info admin flow', () => {
  it('saves overrides and exposes them on the center page', () => {
    saveCenterInfoOverrides('jafaria', {
      phone: '(714) 555-0100',
      parkingInfo: 'Lot behind the center',
      youtubeUrl: 'https://youtube.com/@jafaria-test',
    });

    const center = getCenterData('jafaria');
    expect(center?.phone).toBe('(714) 555-0100');
    expect(center?.parkingInfo).toBe('Lot behind the center');
    expect(center?.youtubeUrl).toBe('https://youtube.com/@jafaria-test');
    expect(center?.name).toBe('Jafaria Islamic Society');
    expect(loadCenterInfoOverrides('jafaria').phone).toBe('(714) 555-0100');
  });

  it('keeps untouched fields from the default center data', () => {
    const defaults = getCenterData('jafaria');
    saveCenterInfoOverrides('jafaria', { email: 'admin@jafaria.test' });

    const center = getCenterData('jafaria');
    expect(center?.email).toBe('admin@jafaria.test');
    expect(center?.city).toBe(defaults?.city);
    expect(center?.address).toBe(defaults?.address);
  });
});

describe('programs admin flow', () => {
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowIso = tomorrow.toISOString().split('T')[0];

  const sampleProgram: Program = {
    id: 'prog-1',
    mosqueId: 'jafaria',
    title: 'Weekly Majlis',
    date: tomorrowIso,
    description: 'Test program',
    speakers: ['Maulana Test'],
    timeSlots: [{ time: '19:30', activity: 'Lecture' }],
  };

  it('persists programs for a center and loads them on the center page', () => {
    saveProgramsForCenter('jafaria', [sampleProgram]);

    const loaded = loadProgramsForCenter('jafaria');
    expect(loaded).toHaveLength(1);
    expect(loaded[0].title).toBe('Weekly Majlis');
    expect(loaded[0].speakers).toEqual(['Maulana Test']);
  });

  it('removes past programs when loading', () => {
    const past: Program = { ...sampleProgram, id: 'past', date: '2020-01-01' };
    saveProgramsForCenter('jafaria', [past, sampleProgram]);

    const loaded = loadProgramsForCenter('jafaria');
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('prog-1');
    expect(JSON.parse(storage.get(`programs_jafaria`)!)).toHaveLength(1);
  });

  it('shows tonight programs across centers', () => {
    const tonight: Program = { ...sampleProgram, id: 'tonight', date: today };
    saveProgramsForCenter('jafaria', [tonight]);
    saveProgramsForCenter('imamia', [{ ...sampleProgram, id: 'other-day', mosqueId: 'imamia' }]);

    const tonightList = loadTonightPrograms([
      { id: 'jafaria', shortName: 'Jafaria' },
      { id: 'imamia', shortName: 'Imamia' },
    ]);

    expect(tonightList).toHaveLength(1);
    expect(tonightList[0].mosqueName).toBe('Jafaria');
    expect(tonightList[0].title).toBe('Weekly Majlis');
  });
});

describe('announcements admin flow', () => {
  const deathAnnouncement: Announcement = {
    id: 'ann-1',
    mosqueId: 'jafaria',
    title: 'Inna Lillahi - Test',
    content: 'Janaza after Dhuhr',
    date: new Date().toISOString().split('T')[0],
    type: 'death',
  };

  it('persists announcements and shows them in the community feed', () => {
    addAnnouncement(deathAnnouncement);

    const all = loadAnnouncements();
    expect(all.some((a) => a.id === 'ann-1')).toBe(true);

    const jafaria = getAnnouncementsForCenter('jafaria');
    expect(jafaria[0].title).toBe('Inna Lillahi - Test');
    expect(jafaria[0].type).toBe('death');
  });

  it('deletes announcements from shared storage', () => {
    saveAnnouncements([deathAnnouncement, { ...deathAnnouncement, id: 'ann-2', mosqueId: 'imamia' }]);

    deleteAnnouncement('ann-1');

    expect(loadAnnouncements()).toHaveLength(1);
    expect(getAnnouncementsForCenter('jafaria')).toHaveLength(0);
  });

  it('migrates legacy per-center announcement keys', () => {
    storage.set(
      'announcements_jafaria',
      JSON.stringify([
        {
          id: 'legacy-1',
          title: 'Legacy Death Notice',
          content: 'From old admin storage',
          type: 'death',
          date: '2026-07-04',
        },
      ])
    );

    const migrated = loadAnnouncements();
    expect(migrated.some((a) => a.id === 'legacy-1' && a.mosqueId === 'jafaria')).toBe(true);
    expect(storage.has('announcements_jafaria')).toBe(false);
  });
});
