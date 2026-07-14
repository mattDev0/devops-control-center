const handleResponse = async (response) => {
  if (response.status === 401 || response.status === 403) {
    throw new Error('UNAUTHORIZED');
  }
  if (!response.ok) {
    let errData;
    try {
      errData = await response.json();
    } catch {
      errData = {};
    }
    throw new Error(errData.error || `Request failed with status ${response.status}`);
  }
  return response.json();
};

export const api = {
  login: async (username, password) => {
    const response = await fetch('api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    return handleResponse(response);
  },

  guestLogin: async () => {
    const response = await fetch('api/auth/guest', { method: 'POST' });
    return handleResponse(response);
  },

  fetchHealth: async (token) => {
    const response = await fetch('api/servers/health', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return handleResponse(response);
  },

  fetchDeployments: async (token) => {
    const response = await fetch('api/servers/deployments', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return handleResponse(response);
  },

  executeDeploymentAction: async (id, action, token) => {
    const response = await fetch(`api/servers/deployments/${id}/${action}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.status === 401 || response.status === 403) {
      throw new Error('UNAUTHORIZED');
    }
    if (!response.ok) {
      throw new Error(`Deployment action failed: ${response.status}`);
    }
    return true;
  },

  fetchWorkflows: async (token) => {
    const response = await fetch('api/ci/workflows', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return handleResponse(response);
  },

  triggerWorkflow: async (id, token) => {
    const response = await fetch(`api/ci/workflows/${id}/dispatch`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.status === 401 || response.status === 403) {
      throw new Error('UNAUTHORIZED');
    }
    if (!response.ok) {
      throw new Error(`Workflow trigger failed: ${response.status}`);
    }
    return true;
  },

  fetchPodHealth: async (token) => {
    const response = await fetch('api/servers/pods/health', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return handleResponse(response);
  },

  fetchDockerContainers: async (token) => {
    const response = await fetch('api/servers/docker/containers', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return handleResponse(response);
  },

  executeDockerContainerAction: async (id, action, token) => {
    const response = await fetch(`api/servers/docker/containers/${id}/${action}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.status === 401 || response.status === 403) {
      throw new Error('UNAUTHORIZED');
    }
    if (!response.ok) {
      throw new Error(`Docker action failed: ${response.status}`);
    }
    return true;
  },

  fetchDockerContainerStats: async (id, token) => {
    const response = await fetch(`api/servers/docker/containers/${id}/stats`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return handleResponse(response);
  }
};
