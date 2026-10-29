export class ApiError extends Error {
  constructor({ status, code, message, fields, retryAfter, requestId }) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.retryAfter = retryAfter;
    this.requestId = requestId;
  }
}

// Every call goes through here, so every failure has the same shape.
async function request(method, path, body) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers:
        body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // fetch only rejects when no response arrived at all
    throw new ApiError({
      status: 0,
      code: "network_error",
      message: "Cannot reach the server",
    });
  }

  const requestId = res.headers.get("X-Request-Id") ?? undefined;
  const retryAfter = Number(res.headers.get("Retry-After")) || undefined;
  if (res.status === 204) return null;

  let data = null;
  try {
    data = await res.json();
  } catch {
    // the body was empty or not JSON
  }

  if (!res.ok) {
    const detail = data?.error;
    // A 5xx without our JSON error shape did not come from our API. It is
    // usually the dev proxy failing because the API is down.
    if (!detail && res.status >= 500) {
      throw new ApiError({
        status: res.status,
        code: "network_error",
        message: "The server is not reachable",
        requestId,
      });
    }
    throw new ApiError({
      status: res.status,
      code: detail?.code ?? "unknown",
      message: detail?.message ?? `Request failed (${res.status})`,
      fields: detail?.fields,
      retryAfter,
      requestId,
    });
  }
  return data;
}

export const register = (credentials) =>
  request("POST", "/api/register", credentials);
export const login = (credentials) =>
  request("POST", "/api/login", credentials);
export const logout = () => request("POST", "/api/logout");
export const me = () => request("GET", "/api/me");
