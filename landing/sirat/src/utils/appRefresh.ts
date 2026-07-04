/**
 * Check for a newer app version (service worker) and reload the page
 * so announcements, programs, and center info are re-read from storage.
 */
export async function refreshApp(): Promise<void> {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.update();
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      }
    } catch {
      // Continue with a normal reload
    }
  }

  window.location.reload();
}
