export const ROUTES = {
  login: '/login',
  home: '/',
  free: '/free',
  /** Index redirects to Trainer → Review; per-game flows use `/finished/[id]/…`. */
  finished: '/finished',
  requests: '/requests',
  game: (id: string) => `/game/${id}`,
} as const;
