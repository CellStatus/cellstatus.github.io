import { QueryClient, QueryFunction } from "@tanstack/react-query";

// Base URL for API when deployed separately (e.g., Render/Railway/Vercel)
// Set at build time: VITE_API_BASE_URL=https://your-backend.example.com npm run build
const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

function buildUrl(path: string) {
  if (!API_BASE) return path; // relative same-origin fallback
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${normalized}`;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest<T = any>(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<T> {
  // Simple retry with backoff for transient errors (e.g., 429 rate limit)
  const maxAttempts = 3;
  let attempt = 0;
  let lastError: Error | null = null;
  while (attempt < maxAttempts) {
    const res = await fetch(buildUrl(url), {
      method,
      headers: data ? { "Content-Type": "application/json" } : {},
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
      cache: "no-store",
    });

    if (res.ok) {
      try {
        return await res.json() as unknown as T;
      } catch (e) {
        // not JSON, return raw text
        const txt = await res.text();
        return txt as unknown as T;
      }
    }

    if (!res.ok) {
      const isRateLimit = res.status === 429;
      const isServerError = res.status >= 500;
      const shouldRetry = isRateLimit || isServerError;

      const text = (await res.text()) || res.statusText;
      lastError = new Error(`${res.status}: ${text}`);

      if (!shouldRetry) {
        // Non-retryable error
        throw lastError;
      }
    }

    attempt += 1;
    const backoffMs = attempt * 400; // linear backoff: 400ms, 800ms
    await new Promise((r) => setTimeout(r, backoffMs));
  }

  if (lastError) throw lastError;
  throw new Error("Request failed");
}

// Note: previously apiRequest returned the raw Response. Now it returns parsed JSON.
export async function apiRequestJson<T = any>(
  method: string,
  url: string,
  data?: unknown,
): Promise<T> {
  const res = await apiRequest(method, url, data as any);
  // if the implementation already returned parsed JSON, just cast
  return res as unknown as T;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(buildUrl(queryKey.join("/") as string), {
      credentials: "include",
      cache: "no-store",
      headers: { "Pragma": "no-cache", "Cache-Control": "no-store" },
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
