"use client";

import { useCallback, useEffect, useState } from "react";

import { apiFetch, parseApiJson } from "@/lib/api";
import { getJobDetailFromCache, upsertJobDetail, type CachedJobDetail } from "@/lib/db";
import { isMissingJobId, isValidJobUuid, type JobLineItem } from "@/lib/jobs";

type JobDraftResponse = CachedJobDetail & {
  extracted_data: CachedJobDetail["extracted_data"] & {
    line_items?: JobLineItem[];
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

    setErrorMessage("");
    let hydratedFromCache = false;

    const cached = await getJobDetailFromCache(jobId);
    if (cached) {
      setJob(cached);
      setIsLoading(false);
      hydratedFromCache = true;
    } else {
      setIsLoading(true);
    }

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
      await upsertJobDetail(payload);
    } catch (error) {
      if (!hydratedFromCache) {
        setJob(null);
        setErrorMessage(error instanceof Error ? error.message : "Failed to load job review.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { job, isLoading, errorMessage, refresh: load };
}
