import { api } from '../services/api';
import { usePolledResource } from './usePolledResource';

const EMPTY_LIST = [];
const HEALTH_ERROR = { os_name: 'Error', os_version: 'N/A', uptime_seconds: 0 };

export function useServerHealth(token, onUnauthorized) {
  return usePolledResource({ token, onUnauthorized, fetcher: api.fetchHealth,
    initialData: null, errorData: HEALTH_ERROR, label: 'health' });
}

export function useDeployments(token, enabled, onUnauthorized) {
  return usePolledResource({ token, enabled, onUnauthorized, fetcher: api.fetchDeployments,
    initialData: EMPTY_LIST, accept: Array.isArray, label: 'deployments' });
}

export function usePodHealth(token, enabled, onUnauthorized) {
  return usePolledResource({ token, enabled, onUnauthorized, fetcher: api.fetchPodHealth,
    initialData: null, accept: Array.isArray, label: 'pod health' });
}

export function useWorkflows(token, onUnauthorized) {
  // Workflows refresh on login, manually, and after dispatch, not on a timer.
  return usePolledResource({ token, onUnauthorized, fetcher: api.fetchWorkflows,
    initialData: EMPTY_LIST, accept: Array.isArray, interval: 0, label: 'workflows' });
}

export function useDockerContainers(token, onUnauthorized) {
  return usePolledResource({ token, onUnauthorized, fetcher: api.fetchDockerContainers,
    initialData: EMPTY_LIST, accept: Array.isArray, label: 'Docker containers' });
}
