export interface GenerateAttempt<T> {
  output: T;
  /** self-reported confidence (0-1) from the generate() call itself */
  confidence: number;
  reason?: string;
}

export interface ScoreResult {
  confidence: number;
  reason?: string;
}

export interface GenerateContext<T> {
  /** 1-indexed */
  attempt: number;
  previousAttempts: readonly GenerateAttempt<T>[];
}

export type GenerateFn<T> = (context: GenerateContext<T>) => Promise<GenerateAttempt<T>>;
export type ScoreFn<T> = (output: T) => Promise<ScoreResult>;

export interface GenerateWithConfidenceOptions<T> {
  generate: GenerateFn<T>;
  /** Optional separate judge call. When omitted, generate()'s own self-reported confidence is used. */
  score?: ScoreFn<T>;
  threshold: number;
  maxAttempts: number;
}

export interface AcceptedResult<T> {
  status: "accepted";
  output: T;
  confidence: number;
  attempts: number;
}

export interface LowConfidenceResult<T> {
  status: "low_confidence";
  lastOutput: T;
  lastConfidence: number;
  lastReason?: string;
  attempts: number;
}

export type GenerateWithConfidenceResult<T> = AcceptedResult<T> | LowConfidenceResult<T>;
