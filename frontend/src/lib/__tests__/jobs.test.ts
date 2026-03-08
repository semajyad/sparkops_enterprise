import { computePulseMetrics, formatJobDate, normalizeJobStatus, parseNumeric } from "@/lib/jobs";

describe("jobs helpers", () => {
  it("parses numeric values from strings and numbers", () => {
    expect(parseNumeric("$42.50")).toBeCloseTo(42.5);
    expect(parseNumeric(3)).toBe(3);
    expect(parseNumeric("invalid")).toBe(0);
  });

  it("normalizes known statuses and uppercases unknown ones", () => {
    expect(normalizeJobStatus("draft")).toBe("DRAFT");
    expect(normalizeJobStatus("syncing")).toBe("SYNCING");
    expect(normalizeJobStatus("done")).toBe("DONE");
    expect(normalizeJobStatus("queued")).toBe("QUEUED");
  });

  it("computes pulse metrics from job list", () => {
    const pulse = computePulseMetrics([
      {
        id: "1",
        status: "DRAFT",
        created_at: "2026-03-08T00:00:00Z",
        client_name: "Client A",
        extracted_data: {
          line_items: [
            { type: "LABOR", qty: 2 },
            { type: "MATERIAL", qty: 3, unit_price: 5 },
          ],
        },
      },
      {
        id: "2",
        status: "DONE",
        created_at: "2026-03-07T00:00:00Z",
        client_name: "Client B",
        extracted_data: {
          line_items: [{ type: "MATERIAL", line_total: 12.5 }],
        },
      },
    ]);

    expect(pulse.pendingJobs).toBe(1);
    expect(pulse.totalBillableHours).toBe(2);
    expect(pulse.materialSpend).toBeCloseTo(27.5);
  });

  it("formats dates for NZ short style", () => {
    const formatted = formatJobDate("2026-03-08T08:00:00Z");
    expect(formatted).toMatch(/(\d{1,2}\s\w{3}|\w{3}\s\d{1,2})/);
  });

  it("returns Unknown date for invalid date strings", () => {
    expect(formatJobDate("not-a-date")).toBe("Unknown date");
  });

  it("ignores unknown item types and handles jobs without extracted_data", () => {
    const pulse = computePulseMetrics([
      {
        id: "3",
        status: "SYNCING",
        created_at: "2026-03-06T00:00:00Z",
        client_name: "Client C",
      },
      {
        id: "4",
        status: "DONE",
        created_at: "2026-03-05T00:00:00Z",
        client_name: "Client D",
        extracted_data: {
          line_items: [{ type: "OTHER", qty: 99, unit_price: 100 }],
        },
      },
    ]);

    expect(pulse.pendingJobs).toBe(1);
    expect(pulse.totalBillableHours).toBe(0);
    expect(pulse.materialSpend).toBe(0);
  });
});
