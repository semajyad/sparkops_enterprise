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

    expect(screen.queryByLabelText(/Sync status: Offline/i)).not.toBeNull();
    expect(screen.queryByText(/3 pending/i)).not.toBeNull();
  });

  it("shows Syncing indicator while sync is in progress", () => {
    renderWithSyncState({ isOnline: true, isSyncing: true, pendingCount: 2 });

    expect(screen.queryByLabelText(/Sync status: Syncing/i)).not.toBeNull();
    expect(screen.queryByText(/2 pending/i)).not.toBeNull();
  });
});
