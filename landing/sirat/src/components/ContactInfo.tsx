import type { Mosque } from '../types';
import { openDirections } from '../hooks/useDirections';
import { MapPin, Phone, Mail, Navigation, ParkingSquare } from 'lucide-react';

interface ContactInfoProps {
  mosque: Mosque;
}

export function ContactInfo({ mosque }: ContactInfoProps) {
  const fullAddress = [mosque.address, mosque.city, mosque.state, mosque.zip]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/10 space-y-4">
      <h3 className="text-lg font-semibold text-white flex items-center gap-2">
        <MapPin size={20} className="text-gold" />
        Contact & Directions
      </h3>

      {fullAddress && (
        <div className="space-y-3">
          <p className="text-white text-sm">{fullAddress}</p>
          <button
            onClick={() => openDirections(mosque.coordinates.lat, mosque.coordinates.lng, fullAddress)}
            className="w-full bg-green-800/60 hover:bg-green-700/70 border border-green-600/40 
                       text-white font-medium py-3 px-4 rounded-xl flex items-center justify-center gap-2
                       transition-colors"
          >
            <Navigation size={18} />
            Get Directions
          </button>
        </div>
      )}

      {mosque.phone && (
        <a
          href={`tel:${mosque.phone}`}
          className="flex items-center gap-3 text-white hover:text-gold transition-colors text-sm"
        >
          <Phone size={16} className="text-gold" />
          {mosque.phone}
        </a>
      )}

      {mosque.email && (
        <a
          href={`mailto:${mosque.email}`}
          className="flex items-center gap-3 text-white hover:text-gold transition-colors text-sm"
        >
          <Mail size={16} className="text-gold" />
          {mosque.email}
        </a>
      )}

      {mosque.parkingInfo && (
        <div className="border-t border-white/10 pt-4 mt-4">
          <p className="text-white text-xs uppercase tracking-wide flex items-center gap-1 mb-1">
            <ParkingSquare size={14} />
            Parking
          </p>
          <p className="text-white text-sm">{mosque.parkingInfo}</p>
        </div>
      )}
    </div>
  );
}
