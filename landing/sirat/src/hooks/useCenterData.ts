import { mosques } from '../data/mosques';
import type { Mosque } from '../types';

export function getCenterData(mosqueId: string): Mosque | undefined {
  const mosque = mosques.find((m) => m.id === mosqueId);
  if (!mosque) return undefined;

  const stored = localStorage.getItem(`center_info_${mosqueId}`);
  if (!stored) return mosque;

  const overrides = JSON.parse(stored);
  return { ...mosque, ...overrides };
}
