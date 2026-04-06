const shared = window.TarotShared;
const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

const dom = {
  question: document.querySelector('#reading-question'),
  cards: document.querySelector('#reading-cards'),
  analysisPanel: document.querySelector('#analysis-panel'),
  analysisSource: document.querySelector('#analysis-source'),
  analysisCards: document.querySelector('#analysis-cards'),
  summaryText: document.querySelector('#summary-text'),
  riskText: document.querySelector('#risk-text'),
  adviceList: document.querySelector('#advice-list'),
  status: document.querySelector('#status-message'),
  restart: document.querySelector('#restart-btn')
};

function isReducedMotion() {
  return reduceMotionQuery.matches;
}

function setStatus(message, type) {
  dom.status.textContent = message;
  dom.status.className = 'status-message';
  if (type) {
    dom.status.classList.add(type);
  }
}

function createRevealCard(cardId) {
  const item = document.createElement('article');
  item.className = 'reveal-card';
  item.dataset.cardId = String(cardId);
  item.innerHTML = `
    <div class="reveal-card-inner">
      <div class="reveal-face reveal-back">
        ${shared.sigilMarkup}
        <div class="card-index">ARCANA ${String(cardId).padStart(2, '0')}</div>
      </div>
      <div class="reveal-face reveal-front">
        <h3>未揭示</h3>
        <div class="orientation-badge">-</div>
        <p class="keyword-line">正在汇聚解析...</p>
      </div>
    </div>
  `;
  return item;
}

function renderSkeleton(selectedIds) {
  dom.cards.innerHTML = '';
  selectedIds.forEach((cardId) => {
    dom.cards.append(createRevealCard(cardId));
  });
}

function populateRevealCards(result) {
  const cardMap = new Map(result.cards.map((card) => [card.card_id, card]));
  const cardElements = [...dom.cards.querySelectorAll('.reveal-card')];

  cardElements.forEach((element, index) => {
    const cardId = Number(element.dataset.cardId);
    const card = cardMap.get(cardId);
    if (!card) {
      return;
    }

    const front = element.querySelector('.reveal-front');
    front.innerHTML = `
      <h3>${card.name}</h3>
      <div class="orientation-badge">${card.orientation === 'upright' ? '正位' : '逆位'}</div>
      <p class="keyword-line">${card.keywords.join(' · ')}</p>
    `;

    window.setTimeout(() => {
      element.classList.add('flipped');
    }, isReducedMotion() ? 0 : 180 * index);
  });
}

function renderAnalysis(result) {
  dom.analysisCards.innerHTML = '';

  result.cards.forEach((card) => {
    const article = document.createElement('article');
    article.className = 'analysis-item';
    article.innerHTML = `
      <h4>${card.name} · ${card.orientation === 'upright' ? '正位' : '逆位'}</h4>
      <p>${card.interpretation}</p>
    `;
    dom.analysisCards.append(article);
  });

  dom.summaryText.textContent = result.summary;
  dom.riskText.textContent = result.risk;
  dom.adviceList.innerHTML = '';

  result.advice.forEach((line) => {
    const li = document.createElement('li');
    li.textContent = line;
    dom.adviceList.append(li);
  });

  if (result.analysis_source === 'spark') {
    dom.analysisSource.hidden = false;
    dom.analysisSource.textContent = '本次解读已启用 AI 增强分析';
    dom.analysisSource.className = 'analysis-source analysis-source-spark';
  } else {
    dom.analysisSource.hidden = false;
    dom.analysisSource.textContent = '本次解读使用模板解析（AI 当前未生效或已回退）';
    dom.analysisSource.className = 'analysis-source analysis-source-template';
  }

  dom.analysisPanel.hidden = false;
}

async function reveal(flow) {
  setStatus('牌面正在翻转，解析即将出现...', '');

  try {
    const result = await shared.postJson(`/api/reading/${flow.sessionId}/reveal`, {});
    shared.updateFlow({ result });
    populateRevealCards(result);

    window.setTimeout(() => {
      renderAnalysis(result);
      if (result.analysis_source === 'spark') {
        setStatus('三张牌已经展开，本次解读已启用 AI 增强。', 'success');
      } else {
        setStatus('三张牌已经展开，但本次仅显示模板解析。', 'error');
      }
    }, isReducedMotion() ? 60 : 760);
  } catch (error) {
    if (error.status === 404) {
      shared.clearFlow();
      shared.setFlash('解析会话已失效，请重新输入问题开始新一轮占卜。', 'error');
      shared.redirect('/');
      return;
    }

    setStatus(error.message || '解析失败，请重新开始。', 'error');
  }
}

function init() {
  const flow = shared.loadFlow();
  if (!flow || !flow.sessionId || !flow.question) {
    shared.setFlash('请先输入问题，再查看解析。', 'error');
    shared.redirect('/');
    return;
  }

  if (flow.selectedIds.length < shared.MAX_SELECTION) {
    shared.redirect('/draw.html');
    return;
  }

  dom.question.textContent = flow.question;
  renderSkeleton(flow.selectedIds);
  void shared.trackPageView('/reading.html', {
    session_id: flow.sessionId
  });

  dom.restart.addEventListener('click', () => {
    shared.clearFlow();
    shared.redirect('/');
  });

  void reveal(flow);
}

init();
