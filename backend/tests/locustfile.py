"""Locust load profile for SparkOps ingest endpoint."""

from __future__ import annotations

from locust import HttpUser, between, task


class IngestUser(HttpUser):
    """Synthetic user repeatedly posting ingest jobs."""

    wait_time = between(1, 3)

    @task
    def post_ingest(self) -> None:
        """Execute a representative text-only ingest request."""

        self.client.post(
            "/api/ingest",
            json={"voice_notes": "Hori in the cupboard"},
            name="POST /api/ingest",
        )
