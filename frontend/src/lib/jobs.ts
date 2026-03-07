export type JobStatus = "DRAFT" | "SYNCING" | "DONE" | string;

export type JobLineItem = {
  qty?: string | number;
  description?: string;
  type?: string;
  unit_price?: string | number;
  line_total?: string | number;
};

export type JobListItem = {
  id: string;
  status: JobStatus;
  created_at: string;
  client_name: string;
  extracted_data?: {
    line_items?: JobLineItem[];
  };
};

export type PulseMetrics = {
  pendingJobs: number;
  totalBillableHours: number;
  materialSpend: number;
};

export function parseNumeric(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().replace(/[^0-9.-]/g, "");
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

export function normalizeJobStatus(status: string): JobStatus {
  const normalized = status.toUpperCase();
  if (normalized === "DRAFT" || normalized === "SYNCING" || normalized === "DONE") {
    return normalized;
  }
  return normalized;
}

export function computePulseMetrics(jobs: JobListItem[]): PulseMetrics {
  let pendingJobs = 0;
  let totalBillableHours = 0;
  let materialSpend = 0;

  for (const job of jobs) {
    const status = normalizeJobStatus(job.status);
    if (status !== "DONE") {
      pendingJobs += 1;
    }

    const lineItems = job.extracted_data?.line_items ?? [];
    for (const item of lineItems) {
      const qty = parseNumeric(item.qty);
      const itemType = String(item.type ?? "").toUpperCase();

      if (itemType === "LABOR") {
        totalBillableHours += qty;
        continue;
      }

      if (itemType === "MATERIAL") {
        const lineTotal = parseNumeric(item.line_total);
        if (lineTotal > 0) {
          materialSpend += lineTotal;
          continue;
        }

        const unitPrice = parseNumeric(item.unit_price);
        if (unitPrice > 0) {
          materialSpend += qty * unitPrice;
        }
      }
    }
  }

  return {
    pendingJobs,
    totalBillableHours,
    materialSpend,
  };
}

export function formatJobDate(isoDate: string): string {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return "Unknown date";
  }
  return parsed.toLocaleDateString("en-NZ", { month: "short", day: "numeric" });
}
