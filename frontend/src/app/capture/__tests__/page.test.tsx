import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import CapturePage from "@/app/capture/page";
import { SyncContext } from "@/components/SyncProvider";

const mockedUseAuth = jest.fn<() => unknown>();
const mockedApiFetch = jest.fn<() => Promise<Response>>();
const mockedSaveJobDraft = jest.fn<() => Promise<number>>();
const mockedSyncPendingDrafts = jest.fn<() => Promise<{ synced: number; attempted: number }>>();

class FakeMediaRecorder {
  static isTypeSupported = jest.fn(() => true);

  public mimeType = "audio/webm";
  public state: "inactive" | "recording" = "inactive";
  public ondataavailable: ((event: BlobEvent) => void) | null = null;
  public onstop: (() => void) | null = null;

  start(): void {
    this.state = "recording";
  }

  stop(): void {
    this.state = "inactive";
    const fakeEvent = {
      data: new Blob(["audio"], { type: "audio/webm" }),
    } as BlobEvent;
    this.ondataavailable?.(fakeEvent);
    this.onstop?.();
  }
}

jest.mock("@/lib/auth", () => ({
  useAuth: mockedUseAuth,
}));

jest.mock("@/lib/api", () => ({
  apiFetch: mockedApiFetch,
}));

jest.mock("@/lib/db", () => ({
  saveJobDraft: mockedSaveJobDraft,
}));

jest.mock("@/lib/syncManager", () => ({
  syncPendingDrafts: mockedSyncPendingDrafts,
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <span data-next-image="mock" aria-label={props.alt ?? ""} />
  ),
}));

jest.mock("framer-motion", () => ({
  motion: {
    button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
  },
  useReducedMotion: () => true,
}));

describe("Capture page logic", () => {
  const refreshCounts = jest.fn(async () => undefined);

  function renderWithSyncState(state: { isOnline: boolean; isSyncing: boolean; pendingCount: number }): void {
    render(
      <SyncContext.Provider
        value={{
          ...state,
          refreshCounts,
          triggerSync: async () => undefined,
        }}
      >
        <CapturePage />
      </SyncContext.Provider>
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();

    Object.defineProperty(globalThis, "URL", {
      configurable: true,
      value: {
        createObjectURL: jest.fn(() => "blob:mock-audio"),
        revokeObjectURL: jest.fn(),
      },
    });

    Object.defineProperty(window, "alert", {
      configurable: true,
      value: jest.fn(),
    });

    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        onLine: true,
        geolocation: {
          watchPosition: jest.fn(() => 1),
          clearWatch: jest.fn(),
        },
        mediaDevices: {
          getUserMedia: jest.fn(async () => ({
            getTracks: () => [{ stop: jest.fn() }],
          })),
        },
      },
    });

    Object.defineProperty(globalThis, "MediaRecorder", {
      configurable: true,
      value: FakeMediaRecorder,
    });

    mockedUseAuth.mockReturnValue({
      session: { access_token: "token" },
      user: null,
      role: "OWNER",
      mode: "FIELD",
      loading: false,
      setMode: () => undefined,
    });

    mockedSaveJobDraft.mockResolvedValue(100);
    mockedSyncPendingDrafts.mockResolvedValue({ synced: 1, attempted: 1 });
    mockedApiFetch.mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
  });

  it("renders always-visible Save / Sync action", () => {
    renderWithSyncState({ isOnline: false, isSyncing: false, pendingCount: 0 });
    expect(screen.getByRole("button", { name: /save \/ sync now/i })).toBeTruthy();
  });

  it("keeps primary action disabled when offline and there is no content", () => {
    renderWithSyncState({ isOnline: false, isSyncing: false, pendingCount: 0 });
    const primaryAction = screen.getByRole("button", { name: /save \/ sync now/i });
    expect(primaryAction.hasAttribute("disabled")).toBe(true);
  });

  it("saves offline draft when voice notes are present", async () => {
    renderWithSyncState({ isOnline: false, isSyncing: false, pendingCount: 0 });

    fireEvent.change(screen.getByLabelText(/voice notes/i), {
      target: { value: "Installed RCD and polarity checks" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save \/ sync now/i }));

    await waitFor(() => {
      expect(screen.getByText(/draft saved offline and queued for sync/i)).toBeTruthy();
    });

    expect(refreshCounts).toHaveBeenCalled();
  });

  it("switches to online sync mode and executes force sync", async () => {
    renderWithSyncState({ isOnline: true, isSyncing: false, pendingCount: 2 });

    expect(screen.getByRole("button", { name: /^sync pending drafts$/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^sync pending drafts$/i }));

    await waitFor(() => {
      expect(screen.getByText(/sync complete/i)).toBeTruthy();
    });
  });

  it("shows dedicated force-sync secondary action when online with pending drafts", () => {
    renderWithSyncState({ isOnline: true, isSyncing: false, pendingCount: 1 });
    expect(screen.getByRole("button", { name: /force sync pending drafts/i })).toBeTruthy();
  });

  it("records then stops audio with mocked MediaRecorder", async () => {
    renderWithSyncState({ isOnline: true, isSyncing: false, pendingCount: 0 });

    fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /stop recording/i })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: /stop recording/i }));

    await waitFor(() => {
      expect(screen.getByText(/audio captured/i)).toBeTruthy();
    }, { timeout: 10_000 });
  }, 15_000);
});
