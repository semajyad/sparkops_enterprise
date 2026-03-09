import { describe, expect, it } from "@jest/globals";
import { render, screen } from "@testing-library/react";

import CapturePage from "@/app/capture/page";
import { SyncContext } from "@/components/SyncProvider";

describe("Capture page save/sync controls", () => {
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

  it("shows always-visible Save / Sync action while offline", () => {
    renderWithSyncState({ isOnline: false, isSyncing: false, pendingCount: 3 });

    expect(screen.queryByRole("button", { name: /save \/ sync now/i })).not.toBeNull();
  });

  it("shows sync action for pending drafts while online", async () => {
    renderWithSyncState({ isOnline: true, isSyncing: true, pendingCount: 2 });

    const syncButton = screen.getByRole("button", { name: /^sync pending drafts$/i });
    expect(syncButton).not.toBeNull();
  });
});
