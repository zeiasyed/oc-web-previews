import type { Announcement } from '../types';
import { mosques } from '../data/mosques';

const STORAGE_KEY = 'sirat_announcements';

function migrateLegacyAnnouncements(existing: Announcement[]): Announcement[] {
  const merged = [...existing];
  const existingIds = new Set(existing.map((a) => a.id));

  for (const mosque of mosques) {
    const legacy = localStorage.getItem(`announcements_${mosque.id}`);
    if (!legacy) continue;

    const items = JSON.parse(legacy) as Omit<Announcement, 'mosqueId'>[];
    for (const item of items) {
      if (existingIds.has(item.id)) continue;
      merged.push({
        ...item,
        mosqueId: mosque.id,
        type: item.type as Announcement['type'],
      });
    }
    localStorage.removeItem(`announcements_${mosque.id}`);
  }

  return merged;
}

export function loadAnnouncements(): Announcement[] {
  const stored = localStorage.getItem(STORAGE_KEY);
  const existing: Announcement[] = stored ? JSON.parse(stored) : [];
  const merged = migrateLegacyAnnouncements(existing);

  if (merged.length !== existing.length) {
    saveAnnouncements(merged);
  }

  return merged;
}

export function saveAnnouncements(list: Announcement[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function getAnnouncementsForCenter(mosqueId: string): Announcement[] {
  return loadAnnouncements().filter((a) => a.mosqueId === mosqueId);
}

export function addAnnouncement(announcement: Announcement) {
  saveAnnouncements([announcement, ...loadAnnouncements()]);
}

export function deleteAnnouncement(id: string) {
  saveAnnouncements(loadAnnouncements().filter((a) => a.id !== id));
}

export function getSampleAnnouncements(): Announcement[] {
  return [
    {
      id: '1',
      mosqueId: 'jafaria',
      title: 'Inna Lillahi - Passing of Br. Ahmed Rizvi',
      content:
        'It is with deep sorrow that we announce the passing of Br. Ahmed Rizvi. Namaz e Janaza will be held at Jafaria after Dhuhr prayers. Please recite Surah Fatiha.',
      date: new Date().toISOString().split('T')[0],
      type: 'death',
    },
    {
      id: '2',
      mosqueId: 'hussainiya',
      title: 'Congratulations - Wedding of Ali & Fatima',
      content:
        'The community congratulates the families on the nikah ceremony. Walima will be held this Saturday at Hussainiya.',
      date: new Date().toISOString().split('T')[0],
      type: 'marriage',
    },
    {
      id: '3',
      mosqueId: 'imamia',
      title: 'Muharram Schedule Announced',
      content:
        'Muharram programs will begin from 1st Muharram. Majlis every night at 8:30 PM. Tabarruk served after every program.',
      date: new Date().toISOString().split('T')[0],
      type: 'general',
    },
  ];
}
