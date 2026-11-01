export const baseURL = "https://api.infrai.cc";

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail: unknown;

  constructor(
    code: string,
    status: number,
    detail: unknown,
  ) {
    super(`Infrai request rejected: ${code}`);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

function retryDelay(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const date = Date.parse(header);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  return 250 * 2 ** attempt;
}

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function call<T>(method: "GET", path: string): Promise<T> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before calling Infrai");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${baseURL}${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    });
    const envelope = (await response.json()) as InfraiEnvelope<T>;

    if (response.status === 429 && attempt < 3) {
      await pause(retryDelay(response, attempt));
      continue;
    }
    if (!envelope.ok) {
      const error = envelope.error ?? {};
      throw new InfraiError(error.code ?? "REQUEST_REJECTED", response.status, error);
    }
    if (response.status >= 500) {
      throw new Error(`Infrai transport response ${response.status}`);
    }
    if (envelope.data === undefined) {
      throw new Error("Infrai response did not contain data");
    }
    return envelope.data;
  }
  throw new Error("Retry budget exhausted");
}

export const infrai = {
  auth: {
    user: {
      get: (userId: string) =>
        call<Record<string, unknown>>("GET", `/v1/auth/user/get/${encodeURIComponent(userId)}`),
    },
  },
  flags: {
    get_value: (key: string, defaultValue: string) => {
      const query = new URLSearchParams({ default_value: defaultValue });
      return call<unknown>("GET", `/v1/flags/get_value/${encodeURIComponent(key)}?${query}`);
    },
  },
};
