export function isSupabaseLockConflictError(error: unknown): boolean {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : typeof error === "object" && error && "message" in error
          ? String((error as { message?: unknown }).message ?? "")
          : "";

  const normalized = message.toLowerCase();
  return normalized.includes("lock broken") || normalized.includes("steal");
}

export function toRenderableErrorMessage(error: unknown, fallback: string): string | null {
  if (isSupabaseLockConflictError(error)) {
    return null;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return fallback;
}
