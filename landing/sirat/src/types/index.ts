export interface Mosque {
  id: string;
  name: string;
  shortName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  website: string;
  donateUrl: string;
  youtubeUrl: string;
  subscribeUrl: string;
  sundaySchoolUrl: string;
  imageUrl: string;
  coordinates: { lat: number; lng: number };
  parkingInfo?: string;
}

export interface TimeSlot {
  time: string;
  activity: string;
}

export interface Program {
  id: string;
  mosqueId: string;
  title: string;
  date: string;
  description: string;
  speakers: string[];
  timeSlots: TimeSlot[];
  videoUrl?: string;
  imageUrl?: string;
}

export interface PrayerTimes {
  Fajr: string;
  Sunrise: string;
  Dhuhr: string;
  Asr: string;
  Maghrib: string;
  Isha: string;
}

export interface User {
  uid: string;
  email: string;
  displayName?: string;
  isAdmin?: boolean;
}

export interface LostFoundItem {
  id: string;
  mosqueId: string;
  description: string;
  type: 'lost' | 'found';
  date: string;
  contactInfo: string;
  status: 'open' | 'claimed' | 'resolved';
  imageUrl?: string;
}

export interface Announcement {
  id: string;
  mosqueId: string;
  title: string;
  content: string;
  date: string;
  type: 'death' | 'birth' | 'marriage' | 'general';
}
