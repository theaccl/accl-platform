function timingSafeEqual(value: string, expected: string): boolean {
  if (value.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < value.length; index++) {
    difference |= value.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

export function imageGenerationWorkerSecret(): string {
  return (
    process.env.ACCL_IMAGE_GENERATION_QUEUE_SECRET?.trim() ||
    process.env.ACCL_ANALYSIS_QUEUE_SECRET?.trim() ||
    ''
  );
}

export function imageGenerationWorkerConfigured(): boolean {
  return imageGenerationWorkerSecret().length >= 16;
}

export function verifyImageGenerationWorkerRequest(request: Request): boolean {
  const expected = imageGenerationWorkerSecret();
  const provided = request.headers.get('x-accl-image-generation-secret') ?? '';
  return expected.length >= 16 && timingSafeEqual(provided, expected);
}
