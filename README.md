
## Run Locally
1. Install dependencies:
   `npm install`
2. Run the app:
   `npm run dev`

## Deploy on GitHub Pages (GitHub Actions)
1. Push this repository to GitHub and make sure the default branch is `main`.
2. In GitHub, open Settings -> Pages.
3. In Build and deployment, set Source to `GitHub Actions`.
4. Push to `main` (or run the workflow manually from Actions).
5. Wait for `Deploy to GitHub Pages` to finish, then open the URL shown in the deployment job.

### Notes
- Workflow file: `.github/workflows/deploy-pages.yml`
- Vite base path is set automatically for GitHub Pages during Actions builds.
