# GitHub Actions Workflows

This directory contains CI/CD workflows for automated testing and deployment.

## Setup Instructions

Due to GitHub App permissions, workflow files need to be added manually to your repository:

1. Copy the workflow file to your repository:
   ```bash
   cp workflows/ci.yml /path/to/your/repo/.github/workflows/ci.yml
   ```

2. Commit and push the workflow:
   ```bash
   git add .github/workflows/ci.yml
   git commit -m "ci: Add automated testing and deployment pipeline"
   git push
   ```

3. The workflow will automatically run on:
   - Push to main, develop, or claude/* branches
   - Pull requests to main or develop

## Workflow Features

The CI/CD pipeline includes:

- **Linting & Type Checking** - TypeScript compilation and code quality
- **Backend Tests** - Unit and integration tests with PostgreSQL and Redis
- **Frontend Tests** - React component tests
- **Build** - Compile applications and upload artifacts
- **Docker Build** - Build and cache container images
- **Security Scan** - Dependency vulnerability scanning
- **Deploy** - Automated deployment to production

## Requirements

For the workflow to run successfully, you need to configure these GitHub Secrets:

- `DOCKER_USERNAME` - Docker Hub username (optional)
- `DOCKER_TOKEN` - Docker Hub access token (optional)

## Monitoring

View workflow runs at: `https://github.com/YOUR_USERNAME/YOUR_REPO/actions`

For more information, see the main project documentation.
