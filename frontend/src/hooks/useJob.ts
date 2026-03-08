"use client";

import { useCallback, useEffect, useState } from "react";

import { apiFetch, parseApiJson } from "@/lib/api";
import { isMissingJobId, isValidJobUuid, type JobLineItem } from "@/lib/jobs";

type JobDraftResponse = {
  id: string;
  raw_transcript: string;
  client_email?: string | null;
  compliance_status?: string | null;
  certificate_pdf_url?: string | null;
  extracted_data: {
    client?: string;
    address?: string;
    scope?: string;
    line_items?: JobLineItem[];
    safety_tests?: Array<{
      type?: string;
      value?: string | null;
      unit?: string | null;
      result?: string | null;
      gps_lat?: number | null;
      gps_lng?: number | null;
    }>;
  };
  status: string;
  created_at: string;
  invoice_summary?: {
    subtotal?: string;
    markup_amount?: string;
    gst?: string;
    total?: string;
    material_cost_base?: string;
    material_cost_with_markup?: string;
    labor_total?: string;
  };
  compliance_summary?: {
    status?: string;
    notes?: string;
    missing_items?: string[];
    checks?: Array<{ key?: string; label?: string; present?: boolean }>;
  };
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

export function useJob(jobId: string | null | undefined): {
  job: JobDraftResponse | null;
  isLoading: boolean;
  errorMessage: string;
  refresh: () => Promise<void>;
} {
  const [job, setJob] = useState<JobDraftResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const load = useCallback(async (): Promise<void> => {
    if (isMissingJobId(jobId)) {
      setJob(null);
      setErrorMessage("");
      setIsLoading(false);
      return;
    }

    if (!isValidJobUuid(jobId)) {
      setJob(null);
      setErrorMessage("Invalid job id.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage("");
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/jobs/${jobId}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `Failed to load job (${response.status})`);
      }

      const payload = await parseApiJson<JobDraftResponse>(response);
      setJob(payload);
    } catch (error) {
      setJob(null);
      setErrorMessage(error instanceof Error ? error.message : "Failed to load job review.");
    } finally {
      setIsLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { job, isLoading, errorMessage, refresh: load };
}
