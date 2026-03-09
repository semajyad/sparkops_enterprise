import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";

type SessionPayload = {
  access_token: string;
  expires_at?: number;
};

type GetSessionResult = {
  data: {
    session: SessionPayload | null;
  };
};

type RefreshSessionResult = {
  data: {
    session: Pick<SessionPayload, "access_token"> | null;
  };
  error: Error | null;
};

const getSession = jest.fn<() => Promise<GetSessionResult>>();
const refreshSession = jest.fn<() => Promise<RefreshSessionResult>>();
const signOut = jest.fn<() => Promise<void>>();

jest.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession,
      refreshSession,
      signOut,
    },
  }),
}));

describe("api helpers", () => {
  let apiFetch: (input: string, init?: RequestInit) => Promise<Response>;
  let getBackendHeaders: (initHeaders?: HeadersInit) => Promise<Headers>;
  let parseApiJson: <T>(response: Response) => Promise<T>;
  let AuthSessionExpiredError: typeof import("@/lib/api").AuthSessionExpiredError;

  let fetchMock: jest.MockedFunction<typeof fetch>;

  function responseDouble(options: {
    status?: number;
    headers?: Record<string, string>;
    bodyText?: string;
    jsonBody?: unknown;
  }): Response {
    const headers = new Headers(options.headers ?? {});
    return {
      ok: (options.status ?? 200) >= 200 && (options.status ?? 200) < 300,
      status: options.status ?? 200,
      headers,
      text: async () => options.bodyText ?? JSON.stringify(options.jsonBody ?? {}),
      json: async () => options.jsonBody ?? {},
    } as unknown as Response;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock = jest.fn<typeof fetch>();
    (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock;
  });

  beforeAll(async () => {
    const apiModule = await import("@/lib/api");
    apiFetch = apiModule.apiFetch;
    getBackendHeaders = apiModule.getBackendHeaders;
    parseApiJson = apiModule.parseApiJson;
    AuthSessionExpiredError = apiModule.AuthSessionExpiredError;
  });

  it("constructs AuthSessionExpiredError with default message", () => {
    const error = new AuthSessionExpiredError();
    expect(error.message).toBe("Session expired");
  });

  it("adds bearer token and json headers when session is valid", async () => {
    getSession.mockResolvedValue({
      data: {
        session: {
          access_token: "token-123",
          expires_at: Math.floor(Date.now() / 1000) + 120,
        },
      },
    });

    fetchMock.mockResolvedValue(responseDouble({ status: 200, jsonBody: {} }));

    await apiFetch("https://example.com/api/jobs", { method: "GET" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.com/api/jobs");
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer token-123");
    expect(headers.get("Accept")).toBe("application/json");
  });

  it("refreshes session when token is close to expiry", async () => {
    getSession.mockResolvedValue({
      data: {
        session: {
          access_token: "stale-token",
          expires_at: Math.floor(Date.now() / 1000) + 10,
        },
      },
    });
    refreshSession.mockResolvedValue({
      data: {
        session: {
          access_token: "fresh-token",
        },
      },
      error: null,
    });

    fetchMock.mockResolvedValue(responseDouble({ status: 200, jsonBody: {} }));

    await apiFetch("https://example.com/api/jobs", { method: "POST", body: JSON.stringify({ ok: true }) });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer fresh-token");
  });

  it("throws AuthSessionExpiredError when refresh fails", async () => {
    getSession.mockResolvedValue({
      data: {
        session: {
          access_token: "stale-token",
          expires_at: Math.floor(Date.now() / 1000),
        },
      },
    });
    refreshSession.mockResolvedValue({ data: { session: null }, error: new Error("refresh failed") });

    await expect(apiFetch("https://example.com/api/jobs")).rejects.toThrow("Session expired");
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("throws when there is no session", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    await expect(apiFetch("https://example.com/upload", { method: "POST" })).rejects.toThrow(
      "No active session. Redirecting to /login.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses refreshed token when there is no active session but refresh succeeds", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    refreshSession.mockResolvedValue({
      data: { session: { access_token: "recovered-token" } },
      error: null,
    });
    fetchMock.mockResolvedValue(responseDouble({ status: 200, jsonBody: {} }));

    await apiFetch("https://example.com/recovered", { method: "GET" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer recovered-token");
  });

  it("deletes content-type when posting FormData", async () => {
    getSession.mockResolvedValue({
      data: {
        session: {
          access_token: "token-123",
          expires_at: Math.floor(Date.now() / 1000) + 120,
        },
      },
    });
    fetchMock.mockResolvedValue(responseDouble({ status: 200, jsonBody: {} }));

    const form = new FormData();
    form.append("file", new Blob(["csv"]), "prices.csv");
    await apiFetch("https://example.com/upload", {
      method: "POST",
      body: form,
      headers: { "Content-Type": "application/json" },
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("Content-Type")).toBeNull();
  });

  it("retries once on 401 after force refresh", async () => {
    getSession.mockResolvedValue({
      data: {
        session: {
          access_token: "token-123",
          expires_at: Math.floor(Date.now() / 1000) + 120,
        },
      },
    });
    refreshSession.mockResolvedValue({
      data: { session: { access_token: "retry-token" } },
      error: null,
    });

    fetchMock
      .mockResolvedValueOnce(responseDouble({ status: 401, jsonBody: {} }))
      .mockResolvedValueOnce(responseDouble({ status: 200, jsonBody: { ok: true } }));

    const response = await apiFetch("https://example.com/retry", { method: "GET" });
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [, retryInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    const retryHeaders = new Headers(retryInit.headers);
    expect(retryHeaders.get("Authorization")).toBe("Bearer retry-token");
  });

  it("returns original 401 when forced refresh cannot recover token", async () => {
    getSession.mockResolvedValue({
      data: {
        session: {
          access_token: "token-123",
          expires_at: Math.floor(Date.now() / 1000) + 120,
        },
      },
    });
    refreshSession.mockResolvedValue({
      data: { session: null },
      error: new Error("refresh failed"),
    });
    fetchMock.mockResolvedValue(responseDouble({ status: 401, jsonBody: {} }));

    const response = await apiFetch("https://example.com/retry-fails", { method: "GET" });
    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("applies content-type automatically in getBackendHeaders when absent", async () => {
    getSession.mockResolvedValue({
      data: {
        session: {
          access_token: "token-abc",
          expires_at: Math.floor(Date.now() / 1000) + 120,
        },
      },
    });
    const headers = await getBackendHeaders({ Accept: "application/json" });
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Authorization")).toBe("Bearer token-abc");
  });

  it("keeps existing content-type in getBackendHeaders", async () => {
    getSession.mockResolvedValue({
      data: {
        session: {
          access_token: "token-xyz",
          expires_at: Math.floor(Date.now() / 1000) + 120,
        },
      },
    });
    const headers = await getBackendHeaders({ "Content-Type": "application/custom+json" });
    expect(headers.get("Content-Type")).toBe("application/custom+json");
    expect(headers.get("Authorization")).toBe("Bearer token-xyz");
  });

  it("preserves explicitly provided Accept and Content-Type headers", async () => {
    getSession.mockResolvedValue({
      data: {
        session: {
          access_token: "token-123",
          expires_at: Math.floor(Date.now() / 1000) + 120,
        },
      },
    });
    fetchMock.mockResolvedValue(responseDouble({ status: 200, jsonBody: {} }));

    await apiFetch("https://example.com/custom", {
      method: "POST",
      headers: {
        Accept: "application/vnd.sparkops+json",
        "Content-Type": "application/custom+json",
      },
      body: JSON.stringify({}),
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("Accept")).toBe("application/vnd.sparkops+json");
    expect(headers.get("Content-Type")).toBe("application/custom+json");
  });

  it("parseApiJson unwraps successful envelope and throws failed envelope message", async () => {
    const okResponse = responseDouble({
      headers: { "Content-Type": "application/json" },
      jsonBody: { success: true, data: { hello: "world" } },
    });
    await expect(parseApiJson<{ hello: string }>(okResponse)).resolves.toEqual({ hello: "world" });

    const failedResponse = responseDouble({
      headers: { "Content-Type": "application/json" },
      jsonBody: { success: false, error: { message: "bad request" } },
    });
    await expect(parseApiJson(failedResponse)).rejects.toThrow("bad request");
  });

  it("parseApiJson rejects html responses", async () => {
    const htmlResponse = responseDouble({
      headers: { "Content-Type": "text/html" },
      bodyText: "<!doctype html><html></html>",
    });

    await expect(parseApiJson(htmlResponse)).rejects.toThrow("received HTML instead of JSON");
  });

  it("parseApiJson rejects uppercase doctype html responses", async () => {
    const htmlResponse = responseDouble({
      headers: { "Content-Type": "text/html" },
      bodyText: "<!DOCTYPE html><html></html>",
    });

    await expect(parseApiJson(htmlResponse)).rejects.toThrow("received HTML instead of JSON");
  });

  it("parseApiJson passes through raw JSON payloads and reports unknown malformed content", async () => {
    const rawResponse = responseDouble({
      headers: { "Content-Type": "application/json" },
      jsonBody: { id: "abc", status: "ok" },
    });
    await expect(parseApiJson<{ id: string; status: string }>(rawResponse)).resolves.toEqual({ id: "abc", status: "ok" });

    const textResponse = responseDouble({
      headers: { "Content-Type": "text/plain" },
      bodyText: "oops",
    });
    await expect(parseApiJson(textResponse)).rejects.toThrow("expected JSON but got 'text/plain'");
  });
});
