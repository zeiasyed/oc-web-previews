export const CONFIG = {
  USER_EMAIL: 'zeiasyed@nexa-care.com',
  USER_NAME: 'Zeia Syed',
  ORG_NAME: 'Nexa Care',
  /** Set after deploying worker; override in localStorage prospectus_sync_api */
  SYNC_API_URL: '',
};

export function getSyncApiUrl() {
  return localStorage.getItem('prospectus_sync_api') || CONFIG.SYNC_API_URL || '';
}

export function getSyncToken() {
  return localStorage.getItem('prospectus_sync_token') || '';
}

export function setSyncCredentials(apiUrl, token) {
  if (apiUrl) localStorage.setItem('prospectus_sync_api', apiUrl.trim());
  if (token) localStorage.setItem('prospectus_sync_token', token);
}
