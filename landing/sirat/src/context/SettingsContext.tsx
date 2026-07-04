import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';

type FontSize = 'small' | 'medium' | 'large' | 'xlarge';

interface SettingsContextType {
  fontSize: FontSize;
  setFontSize: (size: FontSize) => void;
  fontScale: number;
}

const SettingsContext = createContext<SettingsContextType | null>(null);

const FONT_SCALES: Record<FontSize, number> = {
  small: 0.9,
  medium: 1,
  large: 1.2,
  xlarge: 1.4,
};

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [fontSize, setFontSizeState] = useState<FontSize>(() => {
    const stored = localStorage.getItem('sirat-font-size');
    return (stored as FontSize) || 'large';
  });

  const setFontSize = (size: FontSize) => {
    setFontSizeState(size);
    localStorage.setItem('sirat-font-size', size);
  };

  useEffect(() => {
    const scale = FONT_SCALES[fontSize];
    document.documentElement.style.fontSize = `${scale * 16}px`;
  }, [fontSize]);

  return (
    <SettingsContext.Provider value={{ fontSize, setFontSize, fontScale: FONT_SCALES[fontSize] }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be inside SettingsProvider');
  return ctx;
}
