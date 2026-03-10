"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { CheckCircle, Clock, AlertCircle } from "lucide-react";
import { JobListItem } from "@/lib/jobs";

interface JobsListProps {
  jobs: JobListItem[];
  onDelete?: (jobId: string) => void;
  onComplete?: (jobId: string) => void;
}

export function JobsList({ jobs, onDelete, onComplete }: JobsListProps) {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "DONE":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "IN_PROGRESS":
        return <Clock className="h-4 w-4 text-blue-600" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-400" />;
    }
  };

  return (
    <div className="space-y-3">
      {jobs.map((job) => (
        <div
          key={job.id}
          className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                {getStatusIcon(job.status)}
                <h3 className="font-semibold text-gray-900">
                  {job.extracted_data?.client || "Unknown Client"}
                </h3>
              </div>
              <p className="mt-1 text-sm text-gray-600">
                {job.extracted_data?.job_title || "No title provided"}
              </p>
              {job.extracted_data?.location && (
                <p className="mt-1 text-xs text-gray-500">
                  📍 {job.extracted_data.location}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">
                {new Date(job.created_at).toLocaleDateString()}
              </p>
              {job.compliance_status && (
                <span
                  className={`inline-block mt-1 px-2 py-1 text-xs rounded-full ${
                    job.compliance_status === "GREEN_SHIELD"
                      ? "bg-green-100 text-green-800"
                      : job.compliance_status === "RED_SHIELD"
                      ? "bg-red-100 text-red-800"
                      : "bg-yellow-100 text-yellow-800"
                  }`}
                >
                  {job.compliance_status.replace("_", " ")}
                </span>
              )}
              <div className="mt-2 flex gap-2">
                {onComplete && (
                  <button
                    onClick={() => onComplete(job.id)}
                    className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    Complete
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={() => onDelete(job.id)}
                    className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
