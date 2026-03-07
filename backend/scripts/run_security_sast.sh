#!/usr/bin/env sh

# Run static security analysis for SparkOps backend.
set -eu

bandit -r backend/
