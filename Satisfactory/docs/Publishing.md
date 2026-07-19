# Publishing Guide

## GitHub Pages

- The app is configured to build with a relative asset base so it can be hosted from GitHub Pages.
- The Pages workflow builds `Satisfactory/app` and publishes the generated `dist` folder.
- If you change the app path or host it somewhere else, review the Pages workflow and Vite base setting together.

## Codespaces

- The repository includes a devcontainer rooted at the workspace.
- Codespaces installs dependencies in `Satisfactory/app` and forwards the Vite dev server port.
- This keeps the contributor onboarding path close to the local npm workflow.

## Repository Hygiene

- Use the issue and PR templates to keep reports consistent.
- Use `CONTRIBUTING.md` for local setup and pull request expectations.
- Use `SECURITY.md` for private security reports.
