import type { Program } from '../types';

function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}

export function loadProgramsForCenter(mosqueId: string): Program[] {
  const stored = localStorage.getItem(`programs_${mosqueId}`);
  if (!stored) return [];

  const all: Program[] = JSON.parse(stored);
  const current = all.filter((p) => p.date >= todayIso());

  if (current.length !== all.length) {
    localStorage.setItem(`programs_${mosqueId}`, JSON.stringify(current));
  }

  return current;
}

export function saveProgramsForCenter(mosqueId: string, programs: Program[]) {
  localStorage.setItem(`programs_${mosqueId}`, JSON.stringify(programs));
}

export function loadTonightPrograms(
  mosqueIds: { id: string; shortName: string }[]
): (Program & { mosqueName: string })[] {
  const today = todayIso();
  const collected: (Program & { mosqueName: string })[] = [];

  for (const mosque of mosqueIds) {
    const programs = loadProgramsForCenter(mosque.id);
    programs
      .filter((p) => p.date === today)
      .forEach((p) => collected.push({ ...p, mosqueName: mosque.shortName }));
  }

  return collected;
}
