(function attachTarotShared() {
  const FLOW_KEY = 'tarot_flow_v2';
  const FLASH_KEY = 'tarot_flash_v1';
  const VISITOR_KEY = 'tarot_visitor_id';
  const MAX_SELECTION = 3;
  const SIGIL_MARKUP = `
    <svg class="card-sigil" viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <circle cx="60" cy="60" r="44"></circle>
      <circle cx="60" cy="60" r="28"></circle>
      <path d="M60 18L70 41L95 44L76 61L81 86L60 74L39 86L44 61L25 44L50 41L60 18Z"></path>
      <path d="M60 4V18"></path>
      <path d="M60 102V116"></path>
      <path d="M4 60H18"></path>
      <path d="M102 60H116"></path>
    </svg>
  `;

  function normalizeFlow(flow) {
    if (!flow || typeof flow !== 'object') {
      return null;
    }

    return {
      sessionId: typeof flow.sessionId === 'string' ? flow.sessionId : '',
      question: typeof flow.question === 'string' ? flow.question : '',
      selectedIds: Array.isArray(flow.selectedIds) ? flow.selectedIds.map(Number).filter(Number.isInteger) : [],
      result: flow.result && typeof flow.result === 'object' ? flow.result : null
    };
  }

  function loadFlow() {
    try {
      const raw = window.sessionStorage.getItem(FLOW_KEY);
      if (!raw) {
        return null;
      }

      return normalizeFlow(JSON.parse(raw));
    } catch (error) {
      return null;
    }
  }

  function saveFlow(flow) {
    const next = normalizeFlow(flow);
    if (!next) {
      return null;
    }

    window.sessionStorage.setItem(FLOW_KEY, JSON.stringify(next));
    return next;
  }

  function updateFlow(patch) {
    const current = loadFlow() || {
      sessionId: '',
      question: '',
      selectedIds: [],
      result: null
    };

    return saveFlow({
      ...current,
      ...patch
    });
  }

  function clearFlow() {
    window.sessionStorage.removeItem(FLOW_KEY);
  }

  function setFlash(message, type) {
    const payload = {
      message,
      type: type || 'error'
    };
    window.sessionStorage.setItem(FLASH_KEY, JSON.stringify(payload));
  }

  function consumeFlash() {
    try {
      const raw = window.sessionStorage.getItem(FLASH_KEY);
      if (!raw) {
        return null;
      }

      window.sessionStorage.removeItem(FLASH_KEY);
      return JSON.parse(raw);
    } catch (error) {
      window.sessionStorage.removeItem(FLASH_KEY);
      return null;
    }
  }

  function getVisitorId() {
    try {
      const existing = window.localStorage.getItem(VISITOR_KEY);
      if (existing) {
        return existing;
      }

      const generated =
        window.crypto && typeof window.crypto.randomUUID === 'function'
          ? window.crypto.randomUUID()
          : `visitor_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      window.localStorage.setItem(VISITOR_KEY, generated);
      return generated;
    } catch (error) {
      return '';
    }
  }

  function buildTrackingPayload(pathname, extra) {
    const url = new URL(window.location.href);
    return {
      path: pathname || url.pathname || '/',
      referrer: document.referrer || '',
      utm_source: url.searchParams.get('utm_source') || '',
      utm_medium: url.searchParams.get('utm_medium') || '',
      utm_campaign: url.searchParams.get('utm_campaign') || '',
      ...(extra || {})
    };
  }

  async function requestJson(method, url, payload, options) {
    const requestOptions = options || {};
    const headers = {
      'X-Visitor-Id': getVisitorId()
    };

    if (method !== 'GET') {
      headers['Content-Type'] = 'application/json';
    }

    const response = await window.fetch(url, {
      method,
      headers,
      ...(method === 'GET' ? {} : { body: JSON.stringify(payload || {}) })
    });

    let data;
    try {
      data = await response.json();
    } catch (error) {
      if (requestOptions.suppressError) {
        return null;
      }

      throw new Error('服务器返回了无效数据，请稍后再试。');
    }

    if (!response.ok) {
      if (requestOptions.suppressError) {
        return data;
      }

      const message = data && data.error ? data.error : `请求失败（${response.status}）`;
      const err = new Error(message);
      err.status = response.status;
      throw err;
    }

    return data;
  }

  function postJson(url, payload, options) {
    return requestJson('POST', url, payload, options);
  }

  function getJson(url, options) {
    return requestJson('GET', url, null, options);
  }

  function trackPageView(pathname, extra) {
    return postJson('/api/analytics/pageview', buildTrackingPayload(pathname, extra), {
      suppressError: true
    });
  }

  function redirect(path) {
    window.location.assign(path);
  }

  window.TarotShared = {
    MAX_SELECTION,
    buildTrackingPayload,
    clearFlow,
    consumeFlash,
    getJson,
    getVisitorId,
    loadFlow,
    postJson,
    redirect,
    saveFlow,
    sigilMarkup: SIGIL_MARKUP,
    setFlash,
    trackPageView,
    updateFlow
  };
})();
