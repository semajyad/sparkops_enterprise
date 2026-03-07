import { describe, expect, it } from "@jest/globals";
import { render, screen } from "@testing-library/react";

import CapturePage from "@/app/capture/page";
import { SyncContext } from "@/components/SyncProvider";

describe("Capture page network indicators", () => {
  function renderWithSyncState(state: {
    isOnline: boolean;
    isSyncing: boolean;
    pendingCount: number;
  }): void {
    render(
      <SyncContext.Provider
        value={{
          ...state,
          refreshCounts: async () => undefined,
          triggerSync: async () => undefined,
        }}
      >
        <CapturePage />
      </SyncContext.Provider>
    );
  }

  it("shows Offline indicator when connection is down", () => {
    renderWithSyncState({ isOnline: false, isSyncing: false, pendingCount: 3 });

    expect(screen.getByText(/Offline · 3 pending/i)).toBeInTheDocument();
  });

  it("shows Syncing indicator while sync is in progress", () => {
    renderWithSyncState({ isOnline: true, isSyncing: true, pendingCount: 2 });

    expect(screen.getByText(/Syncing · 2 pending/i)).toBeInTheDocument();
  });
});
