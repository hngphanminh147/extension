/**
 * OCR adapter factory.
 *
 * To swap the OCR engine, change the implementation returned here.
 * All consumers call `createOcrAdapter()` and depend only on the `OcrAdapter`
 * interface — nothing else needs to change.
 *
 * Example swap:
 *   return new CloudVisionAdapter({ apiKey: '...' });
 */

import type { OcrAdapter } from './adapter';
import { TesseractAdapter } from './tesseract-adapter';

export { type OcrAdapter, type OcrResult } from './adapter';

export function createOcrAdapter(): OcrAdapter {
  return new TesseractAdapter();
}
