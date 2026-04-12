export const ROUTES = {
  login: '/login',
  home: '/',
  free: '/free',
  finished: '/finished',
  requests: '/requests',
  game: (id: string) => `/game/${id}`,
} as const;
