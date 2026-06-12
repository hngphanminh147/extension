/** Escapes HTML special characters in `input` for safe innerHTML insertion. */
export function escapeHtml(input: string): string {
  return input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Logs an OCR pipeline stage with elapsed time. */
export function ocrLog(stage: string, startMs: number, data: Record<string, unknown>): void {
  console.log(`[OCR:${stage}]`, { elapsed: Date.now() - startMs, ...data });
}
