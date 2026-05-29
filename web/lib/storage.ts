// SSR-safe localStorage helpers. All keys live under a single namespace
// so a "clear all" is a one-liner. Keys for the BYOK secret are
// segmented by provider so switching providers doesn't leak.

const NS = "threadmap";

export function getLS(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(`${NS}.${key}`);
  } catch {
    return null;
  }
}

export function setLS(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${NS}.${key}`, value);
  } catch {
    /* private mode, quota, etc. — degrade silently */
  }
}

export function delLS(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(`${NS}.${key}`);
  } catch {
    /* no-op */
  }
}

// session-only (cleared when the tab closes). Use for the BYOK secret
// when "Remember" is unchecked.
export function getSS(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(`${NS}.${key}`);
  } catch {
    return null;
  }
}

export function setSS(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(`${NS}.${key}`, value);
  } catch {
    /* no-op */
  }
}

export function delSS(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(`${NS}.${key}`);
  } catch {
    /* no-op */
  }
}
