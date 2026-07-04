import { mosques } from '../data/mosques';
import type { Mosque } from '../types';

export type CenterInfoOverrides = Partial<
  Pick<
    Mosque,
    | 'address'
    | 'city'
    | 'state'
    | 'zip'
    | 'phone'
    | 'email'
    | 'website'
    | 'donateUrl'
    | 'youtubeUrl'
    | 'subscribeUrl'
    | 'sundaySchoolUrl'
    | 'parkingInfo'
  >
>;

export function loadCenterInfoOverrides(mosqueId: string): CenterInfoOverrides {
  const stored = localStorage.getItem(`center_info_${mosqueId}`);
  return stored ? JSON.parse(stored) : {};
}

export function saveCenterInfoOverrides(mosqueId: string, overrides: CenterInfoOverrides) {
  localStorage.setItem(`center_info_${mosqueId}`, JSON.stringify(overrides));
}

export function getCenterData(mosqueId: string): Mosque | undefined {
  const mosque = mosques.find((m) => m.id === mosqueId);
  if (!mosque) return undefined;

  const overrides = loadCenterInfoOverrides(mosqueId);
  return { ...mosque, ...overrides };
}
