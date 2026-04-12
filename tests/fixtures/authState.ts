import path from 'node:path';

export const AUTH_STATE_DIR = path.join(process.cwd(), 'playwright', '.auth');
export const MODERATOR_AUTH_STATE_PATH = path.join(AUTH_STATE_DIR, 'moderator.json');
export const NON_MODERATOR_AUTH_STATE_PATH = path.join(AUTH_STATE_DIR, 'non-moderator.json');
