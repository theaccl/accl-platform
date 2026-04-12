export function playwrightBaseUrl(): string {
  const port = process.env.PLAYWRIGHT_DEV_PORT ?? '3000';
  return process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;
}

/** User A (challenger / queue opener) — same as legacy `E2E_USER_EMAIL`. */
export function e2eUserEmail(): string | undefined {
  const v = process.env.E2E_USER_EMAIL?.trim();
  return v || undefined;
}

export function e2eUserPassword(): string | undefined {
  const v = process.env.E2E_USER_PASSWORD?.trim();
  return v || undefined;
}

export function hasE2ECredentials(): boolean {
  return Boolean(e2eUserEmail() && e2eUserPassword());
}

/** User B (recipient / queue joiner). */
export function e2eUserBEmail(): string | undefined {
  const v = process.env.E2E_USER_B_EMAIL?.trim();
  return v || undefined;
}

export function e2eUserBPassword(): string | undefined {
  const v = process.env.E2E_USER_B_PASSWORD?.trim();
  return v || undefined;
}

export function hasTwoUserE2ECredentials(): boolean {
  return Boolean(
    e2eUserEmail() &&
      e2eUserPassword() &&
      e2eUserBEmail() &&
      e2eUserBPassword()
  );
}

export function e2eModeratorEmail(): string | undefined {
  const v = process.env.E2E_MODERATOR_EMAIL?.trim();
  return v || undefined;
}

export function e2eModeratorPassword(): string | undefined {
  const v = process.env.E2E_MODERATOR_PASSWORD?.trim();
  return v || undefined;
}

export function hasModeratorE2ECredentials(): boolean {
  return Boolean(e2eModeratorEmail() && e2eModeratorPassword());
}

export function e2eNonModeratorEmail(): string | undefined {
  const v = process.env.E2E_NON_MODERATOR_EMAIL?.trim();
  return v || undefined;
}

export function e2eNonModeratorPassword(): string | undefined {
  const v = process.env.E2E_NON_MODERATOR_PASSWORD?.trim();
  return v || undefined;
}

export function hasNonModeratorE2ECredentials(): boolean {
  return Boolean(e2eNonModeratorEmail() && e2eNonModeratorPassword());
}
