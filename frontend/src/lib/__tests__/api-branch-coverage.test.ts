/**API tests focused on improving branch coverage for existing functions.*/

import { getBackendHeaders, apiFetch, parseApiJson } from '../api';
import { AuthSessionExpiredError } from '../api';

// Mock Response object for testing
global.Response = class Response {
  constructor(public body: string, public init: ResponseInit = {}) {}
  
  get headers() {
    return new Map(Object.entries(this.init.headers || {}));
  }
  
  get status() {
    return this.init.status || 200;
  }
  
  async json() {
    return JSON.parse(this.body);
  }
  
  async text() {
    return this.body;
  }
} as any;

// Mock Headers object for testing
global.Headers = class Headers {
  constructor(public init: Record<string, string> = {}) {}
  
  has(name: string) {
    return name in this.init;
  }
  
  get(name: string) {
    return this.init[name];
  }
  
  set(name: string, value: string) {
    this.init[name] = value;
  }
} as any;

// Mock the Supabase client
const mockSupabase = {
  auth: {
    getSession: jest.fn(),
    refreshSession: jest.fn(),
  },
};

// Mock the createClient function
jest.mock('@/lib/supabase/client', () => ({
  createClient: jest.fn(() => mockSupabase),
}));

describe('API Branch Coverage Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getBackendHeaders', () => {
    it('should throw AuthSessionExpiredError when no session', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: null,
      });
      
      mockSupabase.auth.refreshSession.mockResolvedValue({
        data: { session: null },
        error: { message: 'No session' },
      });

      await expect(getBackendHeaders()).rejects.toThrow(AuthSessionExpiredError);
    });

    it('should return headers with valid session', async () => {
      const mockSession = {
        access_token: 'test-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      };
      
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      const headers = await getBackendHeaders();
      expect(headers.get('Authorization')).toBe('Bearer test-token');
    });

    it('should refresh token when expired', async () => {
      const expiredSession = {
        access_token: 'expired-token',
        expires_at: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
      };
      
      const refreshedSession = {
        access_token: 'new-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      };
      
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: expiredSession },
        error: null,
      });
      
      mockSupabase.auth.refreshSession.mockResolvedValue({
        data: { session: refreshedSession },
        error: null,
      });

      const headers = await getBackendHeaders();
      expect(headers.get('Authorization')).toBe('Bearer new-token');
    });

    it('should merge with initial headers', async () => {
      const mockSession = {
        access_token: 'test-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      };
      
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      const headers = await getBackendHeaders({ 'X-Custom': 'value' });
      expect(headers.get('Authorization')).toBe('Bearer test-token');
      expect(headers.get('X-Custom')).toBe('value');
    });
  });

  describe('parseApiJson', () => {
    it('should parse valid JSON response', async () => {
      const data = { result: 'success' };
      const response = new Response(JSON.stringify(data), {
        headers: { 'content-type': 'application/json' },
      });

      const result = await parseApiJson(response);
      expect(result).toEqual(data);
    });

    it('should handle JSON with charset', async () => {
      const data = { result: 'success' };
      const response = new Response(JSON.stringify(data), {
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });

      const result = await parseApiJson(response);
      expect(result).toEqual(data);
    });

    it('should throw error for non-JSON content type', async () => {
      const response = new Response('plain text', {
        headers: { 'content-type': 'text/plain' },
      });

      await expect(parseApiJson(response)).rejects.toThrow(
        'Malformed API response: expected JSON but got \'text/plain\''
      );
    });

    it('should throw error for missing content type', async () => {
      const response = new Response('some content');

      await expect(parseApiJson(response)).rejects.toThrow(
        'Malformed API response: expected JSON but got \'unknown\''
      );
    });

    it('should handle error envelope', async () => {
      const response = new Response(JSON.stringify({
        success: false,
        error: { message: 'API Error' },
      }), {
        headers: { 'content-type': 'application/json' },
      });

      await expect(parseApiJson(response)).rejects.toThrow('API Error');
    });

    it('should handle error envelope without message', async () => {
      const response = new Response(JSON.stringify({
        success: false,
        error: {},
      }), {
        headers: { 'content-type': 'application/json' },
      });

      await expect(parseApiJson(response)).rejects.toThrow('Request failed.');  // Actual default message
    });

    it('should handle successful envelope', async () => {
      const data = { result: 'success' };
      const response = new Response(JSON.stringify({
        success: true,
        data,
      }), {
        headers: { 'content-type': 'application/json' },
      });

      const result = await parseApiJson(response);
      expect(result).toEqual(data);
    });

    it('should handle malformed JSON', async () => {
      const response = new Response('invalid json', {
        headers: { 'content-type': 'application/json' },
      });

      await expect(parseApiJson(response)).rejects.toThrow();
    });
  });

  describe('apiFetch', () => {
    // Mock fetch globally
    const mockFetch = jest.fn();
    global.fetch = mockFetch;

    it('should make successful API call', async () => {
      const mockSession = {
        access_token: 'test-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      };
      
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      const mockResponse = new Response(JSON.stringify({ success: true }), {
        headers: { 'content-type': 'application/json' },
      });
      
      mockFetch.mockResolvedValue(mockResponse);

      const result = await apiFetch('/api/test');
      expect(result).toBe(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith('/api/test', {
        headers: expect.any(Headers),
      });
    });

    it('should include Accept header', async () => {
      const mockSession = {
        access_token: 'test-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      };
      
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      const mockResponse = new Response('success');
      mockFetch.mockResolvedValue(mockResponse);

      await apiFetch('/api/test');
      
      const callArgs = mockFetch.mock.calls[0];
      const headers = callArgs[1].headers;
      expect(headers.get('Accept')).toBe('application/json');
    });

    it('should handle custom init options', async () => {
      const mockSession = {
        access_token: 'test-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      };
      
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      const mockResponse = new Response('success');
      mockFetch.mockResolvedValue(mockResponse);

      await apiFetch('/api/test', {
        method: 'POST',
        body: JSON.stringify({ data: 'test' }),
      });
      
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].method).toBe('POST');
      expect(callArgs[1].body).toBe(JSON.stringify({ data: 'test' }));
    });
  });
});