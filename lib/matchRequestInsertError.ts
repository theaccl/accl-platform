export function userMessageForMatchRequestInsertError(error: { message?: string } | null | undefined) {
  return error?.message ?? 'Could not create match request.';
}

