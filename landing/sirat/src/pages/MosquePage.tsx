import { useParams, useNavigate } from 'react-router-dom';
import { getCenterData } from '../hooks/useCenterData';
import { PrayerTimesCard } from '../components/PrayerTimesCard';
import { ProgramsList } from '../components/ProgramsList';
import { ContactInfo } from '../components/ContactInfo';
import { IslamicDivider } from '../components/IslamicDivider';
import { BottomNav } from '../components/BottomNav';
import {
  ArrowLeft,
  ExternalLink,
  PlayCircle,
  GraduationCap,
  Heart,
  Newspaper,
} from 'lucide-react';
import { assetUrl } from '../utils/assets';

export function MosquePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const mosque = id ? getCenterData(id) : undefined;

  if (!mosque) {
    return (
      <div className="min-h-screen bg-charcoal flex items-center justify-center">
        <div className="text-center">
          <p className="text-white/93 text-lg">Center not found</p>
          <button
            onClick={() => navigate('/home')}
            className="mt-4 text-gold hover:text-gold/95 transition-colors"
          >
            ← Back to centers
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-charcoal pb-20">
      {/* Header */}
      <div className="relative h-48 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${assetUrl(mosque.imageUrl)})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/30 to-charcoal" />

        <div className="relative z-10 px-5 pt-12">
          <button
            onClick={() => navigate('/home')}
            className="bg-black/30 backdrop-blur-sm text-white p-2 rounded-xl hover:bg-black/50 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
        </div>
      </div>

      {/* Center Name */}
      <div className="px-5 -mt-6 relative z-10">
        <div className="bg-charcoal/90 backdrop-blur-md border border-white/10 rounded-2xl p-5">
          <h1 className="text-xl font-bold text-white">{mosque.name}</h1>
          {mosque.city && (
            <p className="text-white/93 text-sm mt-1">
              {mosque.city}, {mosque.state}
            </p>
          )}
        </div>
      </div>

      <IslamicDivider />

      {/* Content Sections */}
      <div className="px-5 space-y-5">
        {/* Prayer Times */}
        <PrayerTimesCard city={mosque.city || 'Los Angeles'} />

        {/* Programs */}
        <ProgramsList programs={[]} />

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3">
          {mosque.youtubeUrl && (
            <a
              href={mosque.youtubeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-red-900/30 border border-red-700/30 rounded-xl p-4 flex flex-col items-center gap-2
                         hover:bg-red-900/50 transition-colors"
            >
              <PlayCircle size={24} className="text-red-400" />
              <span className="text-white/95 text-xs font-medium">Watch Live</span>
            </a>
          )}

          {mosque.donateUrl && (
            <a
              href={mosque.donateUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-green-900/30 border border-green-700/30 rounded-xl p-4 flex flex-col items-center gap-2
                         hover:bg-green-900/50 transition-colors"
            >
              <Heart size={24} className="text-green-400" />
              <span className="text-white/95 text-xs font-medium">Donate</span>
            </a>
          )}

          {mosque.sundaySchoolUrl && (
            <a
              href={mosque.sundaySchoolUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-blue-900/30 border border-blue-700/30 rounded-xl p-4 flex flex-col items-center gap-2
                         hover:bg-blue-900/50 transition-colors"
            >
              <GraduationCap size={24} className="text-blue-400" />
              <span className="text-white/95 text-xs font-medium">Sunday School</span>
            </a>
          )}

          {mosque.subscribeUrl && (
            <a
              href={mosque.subscribeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-purple-900/30 border border-purple-700/30 rounded-xl p-4 flex flex-col items-center gap-2
                         hover:bg-purple-900/50 transition-colors"
            >
              <Newspaper size={24} className="text-purple-400" />
              <span className="text-white/95 text-xs font-medium">Subscribe</span>
            </a>
          )}
        </div>

        {/* Contact & Directions */}
        <ContactInfo mosque={mosque} />

        {/* Visit Website */}
        {mosque.website && (
          <a
            href={mosque.website}
            target="_blank"
            rel="noopener noreferrer"
            className="block bg-white/5 border border-white/10 rounded-xl p-4 text-center
                       hover:bg-white/10 transition-colors"
          >
            <span className="text-white/93 text-sm flex items-center justify-center gap-2">
              <ExternalLink size={16} />
              Visit Full Website
            </span>
          </a>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
