// Production base URL used for links sent to clients (signing, review, reset-password).
// VITE_APP_URL lets local dev override so test links point to localhost instead of prod.
export const APP_BASE_URL = import.meta.env.VITE_APP_URL || 'https://app.goforgept.com'
