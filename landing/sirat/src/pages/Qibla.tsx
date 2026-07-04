import { useState, useEffect } from 'react';
import { BottomNav } from '../components/BottomNav';
import { Compass } from 'lucide-react';

const KAABA_LAT = 21.4225;
const KAABA_LNG = 39.8262;

function calculateQiblaDirection(lat: number, lng: number): number {
  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;
  const kaabaLatRad = (KAABA_LAT * Math.PI) / 180;
  const kaabaLngRad = (KAABA_LNG * Math.PI) / 180;

  const dLng = kaabaLngRad - lngRad;
  const x = Math.sin(dLng);
  const y = Math.cos(latRad) * Math.tan(kaabaLatRad) - Math.sin(latRad) * Math.cos(dLng);

  let qibla = (Math.atan2(x, y) * 180) / Math.PI;
  if (qibla < 0) qibla += 360;
  return qibla;
}

export function Qibla() {
  const [qiblaAngle, setQiblaAngle] = useState<number | null>(null);
  const [deviceHeading, setDeviceHeading] = useState<number>(0);
  const [error, setError] = useState<string>('');
  const [permissionGranted, setPermissionGranted] = useState(false);

  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const angle = calculateQiblaDirection(
            position.coords.latitude,
            position.coords.longitude
          );
          setQiblaAngle(angle);
        },
        () => {
          setQiblaAngle(calculateQiblaDirection(34.0522, -118.2437));
          setError('Using approximate location (Los Angeles)');
        }
      );
    } else {
      setQiblaAngle(calculateQiblaDirection(34.0522, -118.2437));
      setError('Geolocation not available');
    }
  }, []);

  const requestOrientation = async () => {
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      try {
        const permission = await (DeviceOrientationEvent as any).requestPermission();
        if (permission === 'granted') {
          setPermissionGranted(true);
        }
      } catch {
        setError('Compass permission denied');
      }
    } else {
      setPermissionGranted(true);
    }
  };

  useEffect(() => {
    if (!permissionGranted) return;

    const handler = (event: DeviceOrientationEvent) => {
      if (event.alpha !== null) {
        setDeviceHeading(event.alpha);
      }
    };

    window.addEventListener('deviceorientation', handler);
    return () => window.removeEventListener('deviceorientation', handler);
  }, [permissionGranted]);

  const rotation = qiblaAngle !== null ? qiblaAngle - deviceHeading : 0;

  return (
    <div className="min-h-screen bg-charcoal pb-20">
      <div className="px-5 pt-12">
        <h1 className="text-2xl font-bold text-white mb-2">Qibla Direction</h1>
        <p className="text-white text-sm mb-8">Face the direction of the Kaaba</p>

        <div className="flex flex-col items-center justify-center">
          <div className="relative w-64 h-64 rounded-full bg-white/5 border-2 border-white/10 flex items-center justify-center">
            <div
              className="absolute inset-4 rounded-full border-2 border-gold/30 flex items-center justify-center transition-transform duration-300"
              style={{ transform: `rotate(${rotation}deg)` }}
            >
              <div className="absolute -top-1 left-1/2 -translate-x-1/2">
                <div className="w-3 h-3 bg-gold rotate-45 transform" />
              </div>
              <Compass size={40} className="text-gold" />
            </div>

            <div className="absolute top-2 left-1/2 -translate-x-1/2 text-white text-xs">N</div>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-white text-xs">S</div>
            <div className="absolute left-2 top-1/2 -translate-y-1/2 text-white text-xs">W</div>
            <div className="absolute right-2 top-1/2 -translate-y-1/2 text-white text-xs">E</div>
          </div>

          {qiblaAngle !== null && (
            <p className="text-gold text-lg font-semibold mt-6">
              {Math.round(qiblaAngle)}° from North
            </p>
          )}

          {error && (
            <p className="text-white text-sm mt-2">{error}</p>
          )}

          {!permissionGranted && (
            <button
              onClick={requestOrientation}
              className="mt-6 bg-green-800/60 hover:bg-green-700/70 border border-green-600/40 
                         text-white font-medium py-3 px-6 rounded-xl transition-colors"
            >
              Enable Compass
            </button>
          )}

          <p className="text-white text-xs mt-6 text-center max-w-xs">
            Point the top of your device toward the gold arrow for the Qibla direction. 
            Best accuracy outdoors away from metal objects.
          </p>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
