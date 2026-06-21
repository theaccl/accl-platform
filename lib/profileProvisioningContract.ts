/**
 * Neutral pure contract for minimal `profiles` row creation.
 * Shared by client lazy-load and server-side provisioning (no I/O here).
 */

export type MinimalProfileInsertRow = {
  id: string;
  username: null;
};

/** Build the canonical minimal insert payload for a new profile row. */
export function minimalProfileInsertRow(userId: string): MinimalProfileInsertRow {
  return { id: userId, username: null };
}
