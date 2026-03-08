"""Locust load profile for SparkOps ingest endpoint."""

from __future__ import annotations

import os

from locust import HttpUser, between, task


TARGET_USERS = 1000
P95_THRESHOLD_MS = 200


class IngestUser(HttpUser):
    """Synthetic user repeatedly validating auth handshake latency."""

    wait_time = between(0.1, 0.6)

    def on_start(self) -> None:
        token = os.getenv("LOAD_TEST_BEARER_TOKEN", "")
        self.auth_headers = {"Authorization": f"Bearer {token}"} if token else {}

    @task
    def get_auth_handshake(self) -> None:
        """Execute authenticated handshake request for latency measurement."""

        self.client.get(
            "/api/v1/auth/handshake",
            headers=self.auth_headers,
            name="GET /api/v1/auth/handshake",
        )
