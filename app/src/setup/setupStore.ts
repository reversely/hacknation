import type { LocalStore } from '../store/localStore';
import { parseProgress, type BusinessBasics, type SetupConfig, type SetupProgress } from './steps';

// Setup progress and non-secret settings live in SQLite so setup resumes after a restart.
// Tokens never come here; they go to the secure vault.
const PROGRESS_KEY = 'setup_progress';
const API_URL_KEY = 'api_url';
const BUSINESS_KEY = 'business_basics';

export function readProgress(store: LocalStore): SetupProgress {
  return parseProgress(store.getMeta(PROGRESS_KEY));
}

export function saveProgress(store: LocalStore, progress: SetupProgress): void {
  store.setMeta(PROGRESS_KEY, JSON.stringify(progress));
}

export function readConfig(store: LocalStore): SetupConfig {
  const business = store.getMeta(BUSINESS_KEY);
  return { apiUrl: store.getMeta(API_URL_KEY), business: business ? (JSON.parse(business) as BusinessBasics) : null };
}

export function saveApiUrl(store: LocalStore, url: string): void {
  store.setMeta(API_URL_KEY, url.trim().replace(/\/+$/, ''));
}

export function saveBusiness(store: LocalStore, business: BusinessBasics): void {
  store.setMeta(BUSINESS_KEY, JSON.stringify(business));
}
