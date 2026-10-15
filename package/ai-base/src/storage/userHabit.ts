const STORAGE_PREFIX = 'eadaf.userHabit.v1';

function readStorage(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function writeStorage(data: Record<string, unknown>) {
  try {
    localStorage.setItem(STORAGE_PREFIX, JSON.stringify(data));
  } catch {
    // ignore quota / private mode errors
  }
}

export function getUserHabit<T>(key: string, defaultValue: T): T {
  const store = readStorage();
  if (!(key in store)) return defaultValue;
  return store[key] as T;
}

export function setUserHabit<T>(key: string, value: T): void {
  const store = readStorage();
  store[key] = value;
  writeStorage(store);
}

export function chatSelectedModelSlugKey() {
  return 'chat.selectedModelSlug';
}
