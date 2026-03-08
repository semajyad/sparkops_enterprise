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
  let parseApiJson: <T>(response: Response) => Promise<T>;

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
    parseApiJson = apiModule.parseApiJson;
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

  it("omits authorization when there is no session and preserves multipart uploads", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    fetchMock.mockResolvedValue(responseDouble({ status: 200, jsonBody: {} }));

    const formData = new FormData();
    formData.append("file", "abc");
    await apiFetch("https://example.com/upload", { method: "POST", body: formData });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBeNull();
    expect(headers.get("Content-Type")).toBeNull();
  });

  it("preserves explicitly provided Accept and Content-Type headers", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
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
