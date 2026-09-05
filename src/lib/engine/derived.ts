/**
 * Sec 6.4 — every derived engine value is a record, never a bare number.
 * Observation is a metric. Interpretation is a pattern candidate.
 * Diagnosis is a fault only after intent / symptom / other measurements agree.
 */
export type Derived<T> = {
  value: T;
  confidence: number;
  valid: boolean;
  reason: string | null;
};

export function derived<T>(
  value: T,
  confidence: number,
  valid: boolean,
  reason: string | null,
): Derived<T> {
  return { value, confidence, valid, reason };
}

export function invalidDerived<T>(value: T, reason: string): Derived<T> {
  return { value, confidence: 0, valid: false, reason };
}
