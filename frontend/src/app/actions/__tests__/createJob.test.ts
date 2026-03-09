import { beforeEach, describe, expect, it, jest } from "@jest/globals";

type UpsertResult = { error: { message: string } | null };

const upsert = jest.fn<() => Promise<UpsertResult>>();
const from = jest.fn(() => ({ upsert }));

jest.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from,
  }),
}));

describe("createJob", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("writes to jobs table with expected payload", async () => {
    upsert.mockResolvedValue({ error: null });
    const { createJob } = await import("@/app/actions/createJob");

    await createJob({
      id: "job-1",
      client_name: "ACME",
      title: "Main board repair",
      location: "1 Queen St, Auckland",
      address: "1 Queen St, Auckland",
      latitude: -36.8485,
      longitude: 174.7633,
      assigned_to_user_id: "user-1",
      required_trade: "ELECTRICAL",
      scheduled_date: "2026-03-10T09:00:00.000Z",
    });

    expect(from).toHaveBeenCalledWith("jobs");
    expect(upsert).toHaveBeenCalledWith(
      {
        id: "job-1",
        client_name: "ACME",
        title: "Main board repair",
        location: "1 Queen St, Auckland",
        address: "1 Queen St, Auckland",
        latitude: -36.8485,
        longitude: 174.7633,
        assigned_to_user_id: "user-1",
        required_trade: "ELECTRICAL",
        scheduled_date: "2026-03-10T09:00:00.000Z",
        status: "SYNCING",
      },
      { onConflict: "id" },
    );
  });

  it("throws when supabase returns an error", async () => {
    upsert.mockResolvedValue({ error: { message: "schema mismatch" } });
    const { createJob } = await import("@/app/actions/createJob");

    await expect(
      createJob({
        id: "job-2",
        client_name: "Client",
        title: "Title",
        location: "Address",
        address: "Address",
        latitude: null,
        longitude: null,
        assigned_to_user_id: null,
        required_trade: "PLUMBING",
        scheduled_date: null,
      }),
    ).rejects.toThrow("Supabase jobs create failed: schema mismatch");
  });
});
