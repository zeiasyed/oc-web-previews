import { useState, useEffect } from 'react';
import type { PrayerTimes } from '../types';

interface UsePrayerTimesOptions {
  city: string;
  country?: string;
}

export function usePrayerTimes({ city, country = 'US' }: UsePrayerTimesOptions) {
  const [prayerTimes, setPrayerTimes] = useState<PrayerTimes | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hijriDate, setHijriDate] = useState<string>('');

  useEffect(() => {
    const fetchPrayerTimes = async () => {
      const today = new Date();
      const dateStr = `${today.getDate()}-${today.getMonth() + 1}-${today.getFullYear()}`;
      const cacheKey = `prayer_${city}_${dateStr}`;

      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const data = JSON.parse(cached);
        setPrayerTimes(data.timings);
        setHijriDate(data.hijriDate);
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(
          `https://api.aladhan.com/v1/timingsByCity/${dateStr}?city=${encodeURIComponent(city)}&country=${country}&method=7`
        );
        const data = await response.json();

        if (data.code === 200) {
          const timings: PrayerTimes = {
            Fajr: data.data.timings.Fajr,
            Sunrise: data.data.timings.Sunrise,
            Dhuhr: data.data.timings.Dhuhr,
            Asr: data.data.timings.Asr,
            Maghrib: data.data.timings.Maghrib,
            Isha: data.data.timings.Isha,
          };
          const hijri = data.data.date.hijri;
          const hijriStr = `${hijri.day} ${hijri.month.en} ${hijri.year} AH`;

          localStorage.setItem(cacheKey, JSON.stringify({ timings, hijriDate: hijriStr }));
          setPrayerTimes(timings);
          setHijriDate(hijriStr);
        } else {
          setError('Failed to fetch prayer times');
        }
      } catch (err) {
        setError('Network error fetching prayer times');
      } finally {
        setLoading(false);
      }
    };

    fetchPrayerTimes();
  }, [city, country]);

  const getNextPrayer = (): string | null => {
    if (!prayerTimes) return null;

    const now = new Date();
    const prayers = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const;

    for (const prayer of prayers) {
      const timeStr = prayerTimes[prayer].replace(' (PKT)', '').replace(' (PST)', '').split(' ')[0];
      const [hours, minutes] = timeStr.split(':').map(Number);
      const prayerTime = new Date();
      prayerTime.setHours(hours, minutes, 0, 0);

      if (now < prayerTime) {
        return prayer;
      }
    }
    return 'Fajr';
  };

  return { prayerTimes, loading, error, hijriDate, getNextPrayer };
}
