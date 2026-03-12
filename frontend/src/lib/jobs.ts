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
  compliance_status?: string | null;
  avatar_url?: string | null;
  created_at: string;
  date_scheduled?: string | null;
  client_name: string;
  client_email?: string | null;
  customer_email?: string | null;
  customer_mobile?: string | null;
  extracted_data?: {
    client?: string;
    job_title?: string;
    location?: string;
    address?: string;
    assigned_to_user_id?: string;
    assigned_to_name?: string;
    required_trade?: string;
    avatar_url?: string | null;
    scheduled_date?: string | null;
    latitude?: number | string;
    longitude?: number | string;
    line_items?: JobLineItem[];
  };
};

export type PulseMetrics = {
  pendingJobs: number;
  totalBillableHours: number;
  materialSpend: number;
};

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeRequiredTrade(value: unknown): "ELECTRICAL" | "PLUMBING" | "ANY" {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "PLUMBING" || normalized === "ANY") {
    return normalized;
  }
  return "ELECTRICAL";
}

export function isMissingJobId(value: unknown): boolean {
  if (typeof value !== "string") {
    return true;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length === 0 || normalized === "undefined" || normalized === "null";
}

export function isValidJobUuid(value: unknown): value is string {
  if (isMissingJobId(value)) {
    return false;
  }

  return UUID_V4_PATTERN.test(String(value).trim());
}

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

  const day = parsed.getDate();
  const suffix =
    day % 10 === 1 && day % 100 !== 11
      ? "st"
      : day % 10 === 2 && day % 100 !== 12
        ? "nd"
        : day % 10 === 3 && day % 100 !== 13
          ? "rd"
          : "th";
  const weekdayMonth = parsed.toLocaleDateString("en-NZ", {
    weekday: "short",
    month: "short",
  });
  const time = parsed.toLocaleTimeString("en-NZ", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return `${weekdayMonth} ${day}${suffix}, ${time}`;
}
