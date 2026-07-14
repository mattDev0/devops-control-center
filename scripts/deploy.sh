#!/bin/bash
set -e

echo "Successfully triggered keyless deployment via Azure Run Command."

# Navigate to devops-control-center directory
cd /opt/devops-control-center

# Temporarily configure HTTPS URL with token to bypass SSH authentication
git remote set-url origin https://x-access-token:${GITHUB_TOKEN}@github.com/mattDev0/devops-control-center.git

# Ensure the server is locked to the correct branch and fetch the latest code
git fetch origin main
git checkout main
git reset --hard origin/main

# Restore original SSH remote URL
git remote set-url origin git@github.com:mattDev0/devops-control-center.git

# Ensure a dummy kubeconfig file exists on the host so the Agent doesn't block on startup
mkdir -p ~/.kube
if [ ! -s ~/.kube/config ]; then
  echo "Creating dummy kubeconfig for standalone Agent mode..."
  echo "apiVersion: v1" > ~/.kube/config
  echo "clusters:" >> ~/.kube/config
  echo "- cluster:" >> ~/.kube/config
  echo "    server: https://localhost:8443" >> ~/.kube/config
  echo "  name: dummy-cluster" >> ~/.kube/config
  echo "contexts:" >> ~/.kube/config
  echo "- context:" >> ~/.kube/config
  echo "    cluster: dummy-cluster" >> ~/.kube/config
  echo "    user: dummy-user" >> ~/.kube/config
  echo "  name: dummy-context" >> ~/.kube/config
  echo "current-context: dummy-context" >> ~/.kube/config
  echo "kind: Config" >> ~/.kube/config
  echo "preferences: {}" >> ~/.kube/config
  echo "users:" >> ~/.kube/config
  echo "- name: dummy-user" >> ~/.kube/config
  echo "  user:" >> ~/.kube/config
  echo "    token: dummy-token" >> ~/.kube/config
fi

echo "Making scripts executable..."
chmod +x scripts/*.sh

echo "Logging in to GitHub Container Registry..."
echo "${GITHUB_TOKEN}" | docker login ghcr.io -u "${GITHUB_ACTOR}" --password-stdin

echo "Pulling latest Docker images..."
COMMIT_SHA="${COMMIT_SHA}" docker compose -f docker-compose.yml -f docker-compose.prod.yml pull

echo "Updating containers..."
COMMIT_SHA="${COMMIT_SHA}" docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

echo "Running post-deploy health check..."
bash scripts/health-check.sh

echo "Cleaning up dangling images..."
docker image prune -f

echo "Docker Compose deployment successfully executed!"
