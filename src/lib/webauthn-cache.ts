// In-memory кеш ключів пристрою (TTL 5 хв) для усунення затримок при частих запитах

export interface CachedCredential {
  id: string;
  transports: any;
  public_key: string;
  counter: number;
}

let credentialsCache: {
  data: CachedCredential[];
  timestamp: number;
} | null = null;

const CACHE_TTL_MS = 5 * 60 * 1000;

export function getCachedCredentials(): CachedCredential[] | null {
  if (
    credentialsCache &&
    Date.now() - credentialsCache.timestamp < CACHE_TTL_MS
  ) {
    return credentialsCache.data;
  }
  return null;
}

export function setCachedCredentials(data: CachedCredential[]): void {
  credentialsCache = {
    data,
    timestamp: Date.now(),
  };
}

export function updateCachedCredentialCounter(
  id: string,
  counter: number
): void {
  if (credentialsCache) {
    const cached = credentialsCache.data.find((c) => c.id === id);
    if (cached) cached.counter = counter;
  }
}

export function invalidateWebAuthnCache(): void {
  credentialsCache = null;
}
