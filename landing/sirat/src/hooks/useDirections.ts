export function getDirectionsUrl(lat: number, lng: number, address: string): string {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  if (isIOS) {
    return `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`;
  }

  const encodedAddress = encodeURIComponent(address);
  return `https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}&destination_place_id=&travelmode=driving`;
}

export function openDirections(lat: number, lng: number, address: string): void {
  const url = getDirectionsUrl(lat, lng, address);
  window.open(url, '_blank');
}
