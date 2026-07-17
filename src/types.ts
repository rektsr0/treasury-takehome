export type CheckStatus = 'pass' | 'fail' | 'manual';

export interface LabelSource {
  kind: 'sample' | 'upload';
  name: string;
  previewUrl: string;
  ocrSource: string;
}

export interface FieldCheck {
  key: string;
  label: string;
  status: CheckStatus;
  expected?: string;
  actual?: string;
  detail: string;
}

export interface ReviewResult {
  overall: 'pass' | 'attention';
  headline: string;
  extractedText: string;
  durationMs: number;
  confidence: number;
  passedCount: number;
  failedCount: number;
  manualCount: number;
  checks: FieldCheck[];
}

export interface OcrResult {
  text: string;
  confidence: number;
  durationMs: number;
  lines: string[];
}

export interface ApplicationRecord {
  id: string;
  brandName: string;
  classType: string;
  alcoholContent: string;
  netContents: string;
  producer: string;
  countryOfOrigin: string;
  label?: LabelSource;
  review?: ReviewResult;
  error?: string;
  isReviewing: boolean;
  progressText?: string;
}
