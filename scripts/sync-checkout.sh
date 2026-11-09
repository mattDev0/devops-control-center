#!/bin/bash
# Sync this checkout to an exact commit on origin/main.
# Source this file, then run `sync_checkout <40-char commit SHA>` inside the repository.
sync_checkout() {
  local sha="${1:-}"
  if ! [[ "$sha" =~ ^[0-9a-f]{40}$ ]]; then
    echo "Refusing to deploy: '$sha' is not a full 40-character commit SHA" >&2
    return 1
  fi
  git fetch origin main || return 1
  if ! git cat-file -e "${sha}^{commit}" 2>/dev/null; then
    echo "Refusing to deploy: commit $sha not found after fetching origin/main" >&2
    return 1
  fi
  if ! git merge-base --is-ancestor "$sha" origin/main; then
    echo "Refusing to deploy: commit $sha is not on origin/main" >&2
    return 1
  fi
  git checkout --force --detach "$sha" || return 1
  if [ "$(git rev-parse HEAD)" != "$sha" ]; then
    echo "Checkout is at $(git rev-parse HEAD), expected $sha" >&2
    return 1
  fi
  echo "Checked out $sha"
}
