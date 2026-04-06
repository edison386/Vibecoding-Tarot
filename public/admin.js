const TOKEN_KEY = 'tarot_admin_token_v1';
const AUTO_REFRESH_MS = 60_000;

const dom = {
  loginPanel: document.querySelector('#login-panel'),
  loginForm: document.querySelector('#login-form'),
  tokenInput: document.querySelector('#admin-token'),
  dashboard: document.querySelector('#dashboard'),
  status: document.querySelector('#admin-status'),
  logoutBtn: document.querySelector('#logout-btn'),
  rangeTabs: [...document.querySelectorAll('#range-tabs button')],
  refreshBtn: document.querySelector('#refresh-btn'),
  autoRefresh: document.querySelector('#auto-refresh'),
  summaryGrid: document.querySelector('#summary-grid'),
  funnelList: document.querySelector('#funnel-list'),
  aiMetrics: document.querySelector('#ai-metrics'),
  trendChart: document.querySelector('#trend-chart'),
  topReferrers: document.querySelector('#top-referrers'),
  topCampaigns: document.querySelector('#top-campaigns'),
  deviceBreakdown: document.querySelector('#device-breakdown'),
  recentReadings: document.querySelector('#recent-readings')
};

const state = {
  range: '7d',
  refreshTimer: null,
  loading: false
};

function setStatus(message, type) {
  dom.status.textContent = message || '';
  dom.status.className = 'status-message';
  if (type) {
    dom.status.classList.add(type);
  }
}

function getToken() {
  return window.sessionStorage.getItem(TOKEN_KEY) || '';
}

function saveToken(token) {
  window.sessionStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  window.sessionStorage.removeItem(TOKEN_KEY);
}

function showLogin(message) {
  dom.loginPanel.hidden = false;
  dom.dashboard.hidden = true;
  dom.logoutBtn.hidden = true;
  if (message) {
    setStatus(message, 'error');
  }
}

function showDashboard() {
  dom.loginPanel.hidden = true;
  dom.dashboard.hidden = false;
  dom.logoutBtn.hidden = false;
}

async function requestAdminJson(url) {
  const response = await window.fetch(url, {
    headers: {
      Authorization: `Bearer ${getToken()}`
    }
  });

  const data = await response.json().catch(() => ({ error: 'invalid response' }));
  if (!response.ok) {
    const error = new Error(data.error || `请求失败（${response.status}）`);
    error.status = response.status;
    throw error;
  }

  return data;
}

function formatPercent(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function formatLatency(value) {
  if (value === null || value === undefined) {
    return '-';
  }

  return `${value} ms`;
}

function formatDate(timestamp) {
  if (!timestamp) {
    return '-';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(timestamp));
}

function renderSummary(summary) {
  const cards = [
    ['首页访问', summary.landing_views],
    ['发起占卜', summary.reading_starts],
    ['选满三张', summary.selection_completed],
    ['完成解读', summary.reveal_successes],
    ['抽牌完成率', formatPercent(summary.completion_rate)],
    ['解读完成率', formatPercent(summary.reveal_rate)]
  ];

  dom.summaryGrid.innerHTML = cards
    .map(
      ([label, value]) => `
        <article class="admin-metric-card">
          <p class="admin-metric-label">${label}</p>
          <strong class="admin-metric-value">${value}</strong>
        </article>
      `
    )
    .join('');
}

function buildFunnelSvg(stages) {
  const viewBoxWidth = 1000;
  const stageHeight = 104;
  const stageGap = 16;
  const paddingY = 18;
  const viewBoxHeight = paddingY * 2 + stages.length * stageHeight + (stages.length - 1) * stageGap;

  return `
    <svg viewBox="0 0 ${viewBoxWidth} ${viewBoxHeight}" role="img" aria-label="占卜转化漏斗图">
      ${stages
        .map((stage, index) => {
          const y = paddingY + index * (stageHeight + stageGap);
          const topLeft = (viewBoxWidth - stage.topWidth) / 2;
          const topRight = topLeft + stage.topWidth;
          const bottomLeft = (viewBoxWidth - stage.bottomWidth) / 2;
          const bottomRight = bottomLeft + stage.bottomWidth;
          const centerX = viewBoxWidth / 2;
          const labelFontSize = stage.topWidth <= 460 ? 24 : 28;
          const countFontSize = stage.topWidth <= 460 ? 34 : 40;

          return `
            <g>
              <path
                d="M ${topLeft} ${y} L ${topRight} ${y} L ${bottomRight} ${y + stageHeight} L ${bottomLeft} ${y + stageHeight} Z"
                fill="${stage.color}"
              ></path>
              <text
                x="${centerX}"
                y="${y + 38}"
                fill="${stage.textColor}"
                font-size="${labelFontSize}"
                font-weight="600"
                letter-spacing="-0.48"
                text-anchor="middle"
              >${stage.label}</text>
              <text
                x="${centerX}"
                y="${y + 76}"
                fill="${stage.textColor}"
                font-size="${countFontSize}"
                font-weight="600"
                letter-spacing="-1.2"
                text-anchor="middle"
              >${stage.count}</text>
            </g>
          `;
        })
        .join('')}
    </svg>
  `;
}

function renderFunnel(funnel) {
  const rows = [
    ['进入首页', funnel.landing_views],
    ['发起占卜', funnel.reading_starts],
    ['选满三张', funnel.selection_completed],
    ['完成解读', funnel.reveal_successes]
  ];
  const baseCount = Math.max(1, Number(rows[0][1].count || 0));
  const palette = [
    { color: '#1d1d1f', textColor: '#ffffff', textMutedColor: 'rgba(255,255,255,0.72)' },
    { color: '#4b4b4f', textColor: '#ffffff', textMutedColor: 'rgba(255,255,255,0.72)' },
    { color: '#b7b7bd', textColor: '#1d1d1f', textMutedColor: 'rgba(29,29,31,0.62)' },
    { color: '#e8e8ed', textColor: '#1d1d1f', textMutedColor: 'rgba(29,29,31,0.62)' }
  ];
  const maxWidth = 900;
  const minWidth = 360;
  const stageWidths = rows.map(([, item], index) => {
    if (!baseCount) {
      return maxWidth - index * 120;
    }

    const ratio = Number(item.count || 0) / baseCount;
    return Math.round(minWidth + (maxWidth - minWidth) * ratio);
  });
  const stages = rows.map(([label, item], index) => {
    const stagePercent = Number(((Number(item.count || 0) / baseCount) * 100).toFixed(1));
    const nextWidth = stageWidths[index + 1] || Math.max(260, Math.round(stageWidths[index] * 0.68));
    return {
      label,
      count: item.count,
      conversionText: formatPercent(item.conversion_rate),
      shareText: `阶段占比 ${stagePercent.toFixed(1)}%`,
      topWidth: stageWidths[index],
      bottomWidth: index === rows.length - 1 ? Math.max(260, Math.round(nextWidth)) : nextWidth,
      ...palette[index]
    };
  });

  dom.funnelList.innerHTML = `
    <div class="funnel-shell">
      <div class="funnel-visual">
        ${buildFunnelSvg(stages)}
      </div>
      <div class="funnel-detail-list">
        ${stages
          .map(
            (stage) => `
              <article class="funnel-detail-item">
                <div class="funnel-detail-head">
                  <span class="funnel-detail-dot" style="background:${stage.color}"></span>
                  <div>
                    <h3>${escapeHtml(stage.label)}</h3>
                    <p>${stage.shareText}</p>
                  </div>
                </div>
                <div class="funnel-detail-metrics">
                  <strong>${stage.count}</strong>
                  <span>${stage.conversionText}</span>
                </div>
              </article>
            `
          )
          .join('')}
      </div>
    </div>
  `;
}

function renderAi(ai) {
  const rows = [
    ['成功次数', ai.success_count],
    ['回退次数', ai.fallback_count],
    ['未启用次数', ai.disabled_count],
    ['成功率', formatPercent(ai.success_rate)],
    ['平均耗时', formatLatency(ai.avg_latency_ms)],
    ['P95 耗时', formatLatency(ai.p95_latency_ms)]
  ];

  dom.aiMetrics.innerHTML = rows
    .map(
      ([label, value]) => `
        <div class="admin-stat-item">
          <span>${label}</span>
          <strong>${value}</strong>
        </div>
      `
    )
    .join('');
}

function renderMiniList(target, rows, labelKey, emptyLabel) {
  if (!rows.length) {
    target.innerHTML = `<p class="admin-empty">${emptyLabel}</p>`;
    return;
  }

  target.innerHTML = rows
    .map(
      (row) => `
        <div class="admin-mini-item">
          <span>${escapeHtml(row[labelKey])}</span>
          <strong>${row.count}</strong>
        </div>
      `
    )
    .join('');
}

function getNiceScaleMax(maxValue) {
  if (maxValue <= 4) {
    return 4;
  }

  const magnitude = 10 ** Math.floor(Math.log10(maxValue));
  const normalized = maxValue / magnitude;

  if (normalized <= 1) {
    return magnitude;
  }

  if (normalized <= 2) {
    return 2 * magnitude;
  }

  if (normalized <= 5) {
    return 5 * magnitude;
  }

  return 10 * magnitude;
}

function getVisibleLabelIndexes(length, maxLabels) {
  if (length <= maxLabels) {
    return new Set(Array.from({ length }, (_, index) => index));
  }

  const indexes = new Set([0, length - 1]);
  for (let step = 1; step < maxLabels - 1; step += 1) {
    indexes.add(Math.round(((length - 1) * step) / (maxLabels - 1)));
  }

  return indexes;
}

function buildTrendSvg(trend) {
  const width = 960;
  const height = 320;
  const padding = { top: 24, right: 26, bottom: 56, left: 58 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(
    1,
    ...trend.flatMap((item) => [item.landing_views, item.reading_starts, item.reveal_successes])
  );
  const scaleMax = getNiceScaleMax(maxValue);
  const yTicks = [...new Set([0, scaleMax / 3, (scaleMax * 2) / 3, scaleMax].map((value) => Math.round(value)))];
  const visibleLabelIndexes = getVisibleLabelIndexes(trend.length, 6);
  const series = [
    {
      key: 'landing_views',
      label: '首页访问',
      color: '#1d1d1f',
      strokeWidth: 3.5,
      dash: ''
    },
    {
      key: 'reading_starts',
      label: '发起占卜',
      color: '#0071e3',
      strokeWidth: 3,
      dash: ''
    },
    {
      key: 'reveal_successes',
      label: '完成解读',
      color: '#8e8e93',
      strokeWidth: 2.5,
      dash: '7 7'
    }
  ];

  function xAt(index) {
    if (trend.length === 1) {
      return padding.left + chartWidth / 2;
    }

    return padding.left + (chartWidth * index) / (trend.length - 1);
  }

  function yAt(value) {
    return padding.top + chartHeight - (Number(value || 0) / scaleMax) * chartHeight;
  }

  const grid = yTicks
    .map((tick) => {
      const y = yAt(tick);
      return `
        <g>
          <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="rgba(29,29,31,0.10)" stroke-width="1"></line>
          <text x="${padding.left - 12}" y="${y + 4}" fill="rgba(29,29,31,0.48)" font-size="12" font-weight="400" text-anchor="end">${tick}</text>
        </g>
      `;
    })
    .join('');

  const xLabels = trend
    .map((item, index) => {
      if (!visibleLabelIndexes.has(index)) {
        return '';
      }

      return `
        <text
          x="${xAt(index)}"
          y="${height - 18}"
          fill="rgba(29,29,31,0.48)"
          font-size="12"
          font-weight="400"
          text-anchor="middle"
        >${item.bucket}</text>
      `;
    })
    .join('');

  const lines = series
    .map((entry) => {
      const points = trend.map((item, index) => `${xAt(index)},${yAt(item[entry.key])}`).join(' ');
      return `
        <g>
          <polyline
            fill="none"
            stroke="${entry.color}"
            stroke-width="${entry.strokeWidth}"
            stroke-linecap="round"
            stroke-linejoin="round"
            ${entry.dash ? `stroke-dasharray="${entry.dash}"` : ''}
            points="${points}"
          ></polyline>
          ${trend
            .map(
              (item, index) => `
                <circle
                  cx="${xAt(index)}"
                  cy="${yAt(item[entry.key])}"
                  r="${entry.key === 'landing_views' ? 4.5 : 4}"
                  fill="#ffffff"
                  stroke="${entry.color}"
                  stroke-width="2"
                ></circle>
              `
            )
            .join('')}
        </g>
      `;
    })
    .join('');

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="运营趋势折线图">
      ${grid}
      ${lines}
      ${xLabels}
    </svg>
  `;
}

function renderTrend(trend) {
  if (!trend.length) {
    dom.trendChart.innerHTML = '<p class="admin-empty">当前时间范围还没有趋势数据。</p>';
    return;
  }

  dom.trendChart.innerHTML = `
    <div class="trend-shell">
      <div class="trend-legend">
        <span class="trend-legend-item">
          <i class="trend-legend-swatch trend-legend-landing"></i>
          首页访问
        </span>
        <span class="trend-legend-item">
          <i class="trend-legend-swatch trend-legend-start"></i>
          发起占卜
        </span>
        <span class="trend-legend-item">
          <i class="trend-legend-swatch trend-legend-reveal"></i>
          完成解读
        </span>
      </div>
      <div class="trend-canvas">
        ${buildTrendSvg(trend)}
      </div>
      <div class="trend-table-wrap">
        <table class="trend-table">
          <thead>
            <tr>
              <th>时间</th>
              <th>首页访问</th>
              <th>发起占卜</th>
              <th>完成解读</th>
            </tr>
          </thead>
          <tbody>
            ${trend
              .map(
                (item) => `
                  <tr>
                    <td>${escapeHtml(item.bucket)}</td>
                    <td>${item.landing_views}</td>
                    <td>${item.reading_starts}</td>
                    <td>${item.reveal_successes}</td>
                  </tr>
                `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderReadings(readings) {
  if (!readings.length) {
    dom.recentReadings.innerHTML = '<tr><td colspan="8" class="admin-empty-cell">当前时间范围还没有占卜记录。</td></tr>';
    return;
  }

  dom.recentReadings.innerHTML = readings
    .map(
      (reading) => `
        <tr>
          <td>${formatDate(reading.created_at)}</td>
          <td class="question-cell">${escapeHtml(reading.question_text || '')}</td>
          <td>${reading.selected_count}/3</td>
          <td>${escapeHtml(reading.reveal_status || '-')}</td>
          <td>${escapeHtml(reading.ai_status || reading.analysis_source || '-')}</td>
          <td>${formatLatency(reading.ai_latency_ms)}</td>
          <td>${escapeHtml(reading.device_type || '-')}</td>
          <td>${escapeHtml(reading.referrer || '-')}</td>
        </tr>
      `
    )
    .join('');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function loadDashboard() {
  if (!getToken() || state.loading) {
    return;
  }

  state.loading = true;
  setStatus('正在刷新运营数据...', '');

  try {
    const [overview, readings] = await Promise.all([
      requestAdminJson(`/api/admin/overview?range=${state.range}`),
      requestAdminJson(`/api/admin/readings?range=${state.range}&limit=50&offset=0`)
    ]);

    showDashboard();
    renderSummary(overview.summary);
    renderFunnel(overview.funnel);
    renderAi(overview.ai);
    renderTrend(overview.trend);
    renderMiniList(dom.topReferrers, overview.traffic.top_referrers, 'referrer', '暂无来源数据');
    renderMiniList(dom.topCampaigns, overview.traffic.top_utm_campaigns, 'utm_campaign', '暂无活动数据');
    renderMiniList(dom.deviceBreakdown, overview.traffic.device_breakdown, 'device_type', '暂无设备数据');
    renderReadings(readings.readings || []);
    setStatus(`已刷新 ${state.range} 运营数据。`, 'success');
  } catch (error) {
    if (error.status === 401) {
      clearToken();
      showLogin('后台 Token 无效，请重新输入。');
      return;
    }

    setStatus(error.message || '后台数据加载失败。', 'error');
  } finally {
    state.loading = false;
  }
}

function syncRangeButtons() {
  dom.rangeTabs.forEach((button) => {
    button.classList.toggle('active', button.dataset.range === state.range);
  });
}

function resetAutoRefresh() {
  if (state.refreshTimer) {
    window.clearInterval(state.refreshTimer);
    state.refreshTimer = null;
  }

  if (dom.autoRefresh.checked) {
    state.refreshTimer = window.setInterval(() => {
      void loadDashboard();
    }, AUTO_REFRESH_MS);
  }
}

function init() {
  dom.loginForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const token = dom.tokenInput.value.trim();
    if (!token) {
      setStatus('请输入后台 Token。', 'error');
      return;
    }

    saveToken(token);
    void loadDashboard();
  });

  dom.logoutBtn.addEventListener('click', () => {
    clearToken();
    dom.tokenInput.value = '';
    resetAutoRefresh();
    showLogin('已退出后台。');
  });

  dom.rangeTabs.forEach((button) => {
    button.addEventListener('click', () => {
      state.range = button.dataset.range || '7d';
      syncRangeButtons();
      void loadDashboard();
    });
  });

  dom.refreshBtn.addEventListener('click', () => {
    void loadDashboard();
  });

  dom.autoRefresh.addEventListener('change', resetAutoRefresh);
  syncRangeButtons();

  if (getToken()) {
    void loadDashboard();
  } else {
    showLogin();
  }
}

init();
