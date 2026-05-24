export interface OcrResult {
  text: string;
  confidence: number;
}

export interface OcrAdapter {
  recognize(imageDataUrl: string, lang: string): Promise<OcrResult>;
  terminate(): Promise<void>;
}
