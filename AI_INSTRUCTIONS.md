# SparkOps AI Instructions

## Debug Workflow

Trigger phrase: `Debug This`

When the user says `Debug This`, immediately run:

```bash
./scripts/diagnose.sh
```

Then:
1. Read the output.
2. Identify the most likely root cause (deployment, service, DB connectivity, env config, or API/runtime errors).
3. Propose the smallest safe fix first.
4. Apply and validate the fix.
