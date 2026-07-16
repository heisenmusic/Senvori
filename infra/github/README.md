# infra/github

GitHub Actions **requires** workflows to live at the repository root under `.github/workflows/` —
they cannot be loaded from this directory.

- Active workflows: [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)
- This directory holds CI/CD support material (composite actions, deployment scripts, runner
  images) as the pipeline grows in later phases.
