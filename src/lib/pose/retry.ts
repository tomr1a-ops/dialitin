export type RetrySleep = (ms: number) => Promise<void>;

export type RetryOptions = {
  attempts?: number;
  delaysMs?: number[];
  sleep?: RetrySleep;
};

const defaultSleep: RetrySleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const delaysMs = options.delaysMs ?? [400, 1200];
  const sleep = options.sleep ?? defaultSleep;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await sleep(delaysMs[attempt] ?? delaysMs.at(-1) ?? 400);
      }
    }
  }

  throw lastError;
}
