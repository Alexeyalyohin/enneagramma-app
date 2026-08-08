/**
 * Единый клиент для вызовов `/api/*` из клиентских компонентов.
 *
 * Формат ответа API зафиксирован в `src/lib/api-response.ts` (backend):
 *   успех:  { data: ... }            (+ опц. { meta })
 *   ошибка: { error: { code, message } }
 *
 * Этот модуль — единственное место на фронте, которое разбирает конверт
 * ответа, чтобы компоненты не дублировали `res.ok` / `json.error` проверки.
 */

export interface ApiErrorPayload {
  code: string;
  message: string;
}

export interface PaginationMeta {
  total: number;
  page: number;
  per_page: number;
}

export type ApiResult<TData> =
  | { ok: true; data: TData; status: number }
  | { ok: false; error: ApiErrorPayload; status: number };

export type ApiPaginatedResult<TItem> =
  | { ok: true; data: TItem[]; meta: PaginationMeta; status: number }
  | { ok: false; error: ApiErrorPayload; status: number };

const NETWORK_ERROR: ApiErrorPayload = {
  code: "NETWORK_ERROR",
  message: "Проблема с сетью. Проверьте подключение и попробуйте снова",
};

const UNKNOWN_ERROR: ApiErrorPayload = {
  code: "UNKNOWN_ERROR",
  message: "Что-то пошло не так. Попробуйте ещё раз",
};

function isErrorPayload(value: unknown): value is { error: ApiErrorPayload } {
  if (typeof value !== "object" || value === null) return false;
  const err = (value as Record<string, unknown>).error;
  return (
    typeof err === "object" &&
    err !== null &&
    typeof (err as Record<string, unknown>).code === "string" &&
    typeof (err as Record<string, unknown>).message === "string"
  );
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** Низкоуровневый вызов: разбирает `{data}`/`{error}`, никогда не бросает. */
export async function apiFetch<TData>(
  input: string,
  init?: RequestInit
): Promise<ApiResult<TData>> {
  let response: Response;
  try {
    response = await fetch(input, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    return { ok: false, error: NETWORK_ERROR, status: 0 };
  }

  const json = await parseJson(response);

  if (!response.ok) {
    const error = isErrorPayload(json) ? json.error : UNKNOWN_ERROR;
    return { ok: false, error, status: response.status };
  }

  const data = (json as { data?: TData } | null)?.data as TData;
  return { ok: true, data, status: response.status };
}

/** Пагинированный вызов: разбирает `{data: [...], meta}`. */
export async function apiFetchPaginated<TItem>(
  input: string,
  init?: RequestInit
): Promise<ApiPaginatedResult<TItem>> {
  let response: Response;
  try {
    response = await fetch(input, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    return { ok: false, error: NETWORK_ERROR, status: 0 };
  }

  const json = await parseJson(response);

  if (!response.ok) {
    const error = isErrorPayload(json) ? json.error : UNKNOWN_ERROR;
    return { ok: false, error, status: response.status };
  }

  const payload = json as { data?: TItem[]; meta?: PaginationMeta } | null;
  return {
    ok: true,
    data: payload?.data ?? [],
    meta: payload?.meta ?? { total: 0, page: 1, per_page: 20 },
    status: response.status,
  };
}

export function apiGet<TData>(url: string, init?: RequestInit): Promise<ApiResult<TData>> {
  return apiFetch<TData>(url, { ...init, method: "GET" });
}

export function apiPost<TData>(
  url: string,
  body: unknown,
  init?: RequestInit
): Promise<ApiResult<TData>> {
  return apiFetch<TData>(url, { ...init, method: "POST", body: JSON.stringify(body ?? {}) });
}
