const STATES = {
  ENTRANCE: 'entrance',
  DRAWING: 'drawing',
  TRANSITIONING: 'transitioning'
};

const DISPLAY_CARD_IDS = Array.from({ length: 16 }, (_, index) => index + 1);
const CARD_ASPECT_RATIO = 224 / 146;
const CARD_MIN_WIDTH = 86;
const CARD_MAX_WIDTH = 146;
const shared = window.TarotShared;
const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

const dom = {
  questionEcho: document.querySelector('#question-echo'),
  stage: document.querySelector('.table-stage'),
  ringContainer: document.querySelector('#ring-container'),
  selectionCounter: document.querySelector('#selection-counter'),
  status: document.querySelector('#status-message'),
  restartLink: document.querySelector('#restart-link')
};

const appState = {
  phase: STATES.ENTRANCE,
  flow: null,
  cards: [],
  busy: false,
  rotation: 0,
  rotationSpeed: 0,
  targetSpeed: 0,
  ticking: false,
  lastTickAt: 0,
  stageObserver: null
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

function updateSelectionCounter() {
  dom.selectionCounter.textContent = `已选择 ${appState.flow.selectedIds.length} / ${shared.MAX_SELECTION} 张`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getStageMetrics() {
  const stageRect = dom.ringContainer.getBoundingClientRect();
  const width = Math.max(stageRect.width || 0, 320);
  const height = Math.max(stageRect.height || 0, 320);
  const cardWidth = Math.round(
    clamp(Math.min(width * 0.14, height * 0.28), CARD_MIN_WIDTH, CARD_MAX_WIDTH)
  );
  const cardHeight = Math.round(cardWidth * CARD_ASPECT_RATIO);
  const radiusX = Math.min(
    420,
    width * 0.34,
    Math.max(cardWidth * 0.92, width / 2 - cardWidth * 0.76)
  );
  const radiusY = Math.min(
    radiusX * 0.42,
    height * 0.22,
    Math.max(cardHeight * 0.22, height / 2 - cardHeight * 0.68)
  );

  return {
    width,
    height,
    cardWidth,
    cardHeight,
    radiusX,
    radiusY,
    selectedSpread: clamp(cardWidth * 1.58, 112, 240),
    selectedLift: clamp(cardHeight * 0.82, 96, 184),
    entranceX: width * 0.58,
    entranceY: -Math.max(cardHeight * 0.82, 92),
    orbitOffsetY: clamp(height * 0.028, -8, 18),
    cardPadding: clamp(cardWidth * 0.12, 12, 18),
    cardRadius: clamp(cardWidth * 0.16, 16, 24),
    cardFrameInset: clamp(cardWidth * 0.07, 6, 10),
    sigilSize: clamp(cardWidth * 0.48, 42, 70),
    cardIndexSize: clamp(cardWidth * 0.075, 9, 11)
  };
}

function setBusy(isBusy) {
  appState.busy = isBusy;
  renderCards();
}

function buildCardModel(cardId, index, total) {
  return {
    id: cardId,
    index,
    baseAngle: (Math.PI * 2 * index) / total - Math.PI / 2,
    entered: false,
    selectedIndex: null,
    hidden: false,
    el: null
  };
}

function createCardElement(card) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ring-card card-hidden';
  button.dataset.cardId = String(card.id);

  const inner = document.createElement('div');
  inner.className = 'card-inner';

  const back = document.createElement('div');
  back.className = 'card-face card-back';
  back.innerHTML = `
    ${shared.sigilMarkup}
    <div class="card-index">ARCANA ${String(card.id).padStart(2, '0')}</div>
  `;

  const front = document.createElement('div');
  front.className = 'card-face card-front';
  front.innerHTML = `
    <h3>已锁定</h3>
    <div class="orientation-badge">待揭示</div>
    <p class="keyword-line">这张牌会在解析页翻开。</p>
  `;

  inner.append(back, front);
  button.append(inner);
  button.addEventListener('click', () => {
    void handleCardSelect(card.id);
  });

  card.el = button;
  return button;
}

function hydrateCards() {
  appState.cards = DISPLAY_CARD_IDS.map((cardId, index, arr) => buildCardModel(cardId, index, arr.length));

  dom.ringContainer.innerHTML = '';
  appState.cards.forEach((card) => {
    const el = createCardElement(card);
    dom.ringContainer.append(el);
  });

  appState.flow.selectedIds.forEach((cardId, index) => {
    const target = appState.cards.find((item) => item.id === cardId);
    if (target) {
      target.selectedIndex = index;
      target.entered = true;
    }
  });

  if (appState.flow.selectedIds.length > 0) {
    appState.cards.forEach((card) => {
      card.entered = true;
    });
  }
}

function selectedPose(selectedIndex, stageMetrics) {
  const xOffsets = [-stageMetrics.selectedSpread, 0, stageMetrics.selectedSpread];
  const rotations = [-9, 0, 9];

  return {
    x: xOffsets[selectedIndex] || 0,
    y: -stageMetrics.selectedLift,
    z: 320,
    rotateX: 2,
    rotateY: 0,
    rotateZ: rotations[selectedIndex] || 0,
    scale: 1.08,
    opacity: 1,
    blur: 0,
    brightness: 1.1,
    zIndex: 300 + selectedIndex
  };
}

function orbitPose(card, stageMetrics) {
  if (!card.entered) {
    return {
      x: stageMetrics.entranceX + (appState.cards.length - card.index) * Math.max(12, stageMetrics.cardWidth * 0.16),
      y: stageMetrics.entranceY + card.index * Math.max(5, stageMetrics.cardHeight * 0.04),
      z: -280,
      rotateX: 8,
      rotateY: -34,
      rotateZ: -12,
      scale: 0.82,
      opacity: 0.02,
      blur: 6,
      brightness: 0.65,
      zIndex: card.index
    };
  }

  const angle = card.baseAngle + appState.rotation;
  const depth = (Math.sin(angle) + 1) / 2;
  const x = Math.cos(angle) * stageMetrics.radiusX;
  const y = Math.sin(angle) * stageMetrics.radiusY + stageMetrics.orbitOffsetY;
  const z = -190 + depth * 380;

  return {
    x,
    y,
    z,
    rotateX: 5 - depth * 4,
    rotateY: Math.cos(angle) * -30,
    rotateZ: Math.sin(angle) * 8,
    scale: 0.72 + depth * 0.4,
    opacity: 0.34 + depth * 0.66,
    blur: (1 - depth) * 1.8,
    brightness: 0.55 + depth * 0.7,
    zIndex: Math.round(depth * 200) + card.index
  };
}

function syncStageVars(stageMetrics) {
  dom.stage.style.setProperty('--deck-card-width', `${stageMetrics.cardWidth}px`);
  dom.stage.style.setProperty('--deck-card-height', `${stageMetrics.cardHeight}px`);
  dom.stage.style.setProperty('--deck-card-padding', `${stageMetrics.cardPadding}px`);
  dom.stage.style.setProperty('--deck-card-radius', `${stageMetrics.cardRadius}px`);
  dom.stage.style.setProperty('--deck-card-frame-inset', `${stageMetrics.cardFrameInset}px`);
  dom.stage.style.setProperty('--deck-card-sigil-size', `${stageMetrics.sigilSize}px`);
  dom.stage.style.setProperty('--deck-card-index-size', `${stageMetrics.cardIndexSize}px`);
}

function applyCardPose(card, stageMetrics) {
  if (!card.el) {
    return;
  }

  const pose =
    card.selectedIndex !== null
      ? selectedPose(card.selectedIndex, stageMetrics)
      : orbitPose(card, stageMetrics);
  card.el.style.transform =
    `translate3d(calc(-50% + ${pose.x}px), calc(-50% + ${pose.y}px), ${pose.z}px) ` +
    `rotateX(${pose.rotateX}deg) rotateY(${pose.rotateY}deg) rotateZ(${pose.rotateZ}deg) scale(${pose.scale})`;
  card.el.style.opacity = String(pose.opacity);
  card.el.style.filter = `blur(${pose.blur}px) brightness(${pose.brightness})`;
  card.el.style.zIndex = String(pose.zIndex);
}

function renderCards() {
  const stageMetrics = getStageMetrics();
  syncStageVars(stageMetrics);

  appState.cards.forEach((card) => {
    if (!card.el) {
      return;
    }

    const isDisabled =
      appState.busy || appState.phase !== STATES.DRAWING || card.selectedIndex !== null;
    const isLiveMotion =
      appState.phase === STATES.DRAWING &&
      !appState.busy &&
      card.selectedIndex === null &&
      !card.hidden &&
      card.entered;

    card.el.disabled = isDisabled;
    card.el.classList.toggle('disabled', isDisabled);
    card.el.classList.toggle('card-hidden', card.hidden || !card.entered);
    card.el.classList.toggle('live-motion', isLiveMotion);
    applyCardPose(card, stageMetrics);
  });
}

function startTicking() {
  if (isReducedMotion() || appState.ticking) {
    return;
  }

  appState.ticking = true;
  appState.lastTickAt = 0;

  const tick = (timestamp) => {
    if (!appState.lastTickAt) {
      appState.lastTickAt = timestamp;
    }

    const delta = Math.min(32, timestamp - appState.lastTickAt || 16.67);
    appState.lastTickAt = timestamp;
    const shouldContinue =
      appState.phase === STATES.DRAWING ||
      Math.abs(appState.rotationSpeed) > 0.0002 ||
      Math.abs(appState.targetSpeed) > 0.0002;

    if (!shouldContinue) {
      appState.ticking = false;
      appState.lastTickAt = 0;
      return;
    }

    const easing = 1 - Math.pow(0.82, delta / 16.67);
    appState.rotationSpeed += (appState.targetSpeed - appState.rotationSpeed) * easing;
    appState.rotation += appState.rotationSpeed * (delta / 16.67);
    renderCards();
    window.requestAnimationFrame(tick);
  };

  window.requestAnimationFrame(tick);
}

function animateEntrance() {
  const baseDelay = isReducedMotion() ? 0 : 55;

  appState.cards.forEach((card) => {
    window.setTimeout(() => {
      card.entered = true;
      card.el.classList.remove('card-hidden');
      renderCards();
    }, baseDelay * card.index);
  });

  window.setTimeout(() => {
    appState.phase = STATES.DRAWING;
    setStatus('请选择三张最吸引你的牌。', 'success');
    renderCards();
    startTicking();
  }, baseDelay * appState.cards.length + (isReducedMotion() ? 20 : 460));
}

function moveToReadingPage() {
  appState.phase = STATES.TRANSITIONING;
  appState.cards.forEach((card) => {
    if (card.selectedIndex === null) {
      card.hidden = true;
    }
  });
  renderCards();

  setStatus('牌面已锁定，正在进入解析页面...', 'success');
  window.setTimeout(() => {
    shared.redirect('/reading.html');
  }, isReducedMotion() ? 120 : 900);
}

async function handleCardSelect(cardId) {
  if (appState.busy || appState.phase !== STATES.DRAWING) {
    return;
  }

  const card = appState.cards.find((item) => item.id === cardId);
  if (!card || card.selectedIndex !== null) {
    return;
  }

  setBusy(true);
  setStatus('正在锁定这张牌...', '');

  try {
    const response = await shared.postJson(`/api/reading/${appState.flow.sessionId}/select`, {
      card_id: cardId
    });

    card.selectedIndex = appState.flow.selectedIds.length;
    appState.flow.selectedIds = [...appState.flow.selectedIds, cardId];
    shared.updateFlow({
      selectedIds: appState.flow.selectedIds
    });

    updateSelectionCounter();

    if (response.is_complete || appState.flow.selectedIds.length === shared.MAX_SELECTION) {
      moveToReadingPage();
      return;
    }

    setStatus(`已锁定 ${response.selected_count} / ${shared.MAX_SELECTION} 张牌。`, 'success');
  } catch (error) {
    if (error.status === 404) {
      shared.clearFlow();
      shared.setFlash('当前会话已失效，请重新输入问题开始新一轮抽牌。', 'error');
      shared.redirect('/');
      return;
    }

    setStatus(error.message || '抽牌失败，请稍后重试。', 'error');
  } finally {
    setBusy(false);
    renderCards();
  }
}

function handleEdgeRotation(event) {
  if (isReducedMotion() || appState.phase !== STATES.DRAWING) {
    appState.targetSpeed = 0;
    return;
  }

  const stageRect = dom.stage.getBoundingClientRect();
  const stageWidth = stageRect.width;
  const localX = Math.max(0, Math.min(stageWidth, event.clientX - stageRect.left));
  const cardWidth = getStageMetrics().cardWidth;
  const edgeBand = Math.min(cardWidth * 2.1, stageWidth * 0.24);
  const centerBand = Math.min(cardWidth * 4.1, stageWidth * 0.46);
  const centerStart = (stageWidth - centerBand) / 2;
  const centerEnd = centerStart + centerBand;
  const maxSpeed = 0.03;

  if (localX >= centerStart && localX <= centerEnd) {
    appState.targetSpeed = 0;
    startTicking();
    return;
  }

  const sideFalloff = Math.max(24, centerStart - edgeBand);

  if (localX < centerStart) {
    const ratio =
      localX <= edgeBand ? 1 : 1 - (localX - edgeBand) / sideFalloff;
    appState.targetSpeed = -maxSpeed * Math.max(0, Math.min(1, ratio));
  } else {
    const distanceFromRight = stageWidth - localX;
    const ratio =
      distanceFromRight <= edgeBand
        ? 1
        : 1 - (distanceFromRight - edgeBand) / sideFalloff;
    appState.targetSpeed = maxSpeed * Math.max(0, Math.min(1, ratio));
  }

  startTicking();
}

function init() {
  const flow = shared.loadFlow();
  if (!flow || !flow.sessionId || !flow.question) {
    shared.setFlash('请先输入问题，再进入抽卡页面。', 'error');
    shared.redirect('/');
    return;
  }

  if (flow.result || flow.selectedIds.length >= shared.MAX_SELECTION) {
    shared.redirect('/reading.html');
    return;
  }

  appState.flow = flow;
  dom.questionEcho.textContent = flow.question;
  updateSelectionCounter();
  void shared.trackPageView('/draw.html', {
    session_id: flow.sessionId
  });

  dom.restartLink.addEventListener('click', (event) => {
    event.preventDefault();
    shared.clearFlow();
    shared.redirect('/');
  });

  hydrateCards();
  renderCards();
  animateEntrance();

  dom.stage.addEventListener('mousemove', handleEdgeRotation);
  dom.stage.addEventListener('mouseleave', () => {
    appState.targetSpeed = 0;
    appState.rotationSpeed = 0;
    renderCards();
  });
  window.addEventListener('resize', renderCards);
  reduceMotionQuery.addEventListener('change', renderCards);

  if (window.ResizeObserver) {
    appState.stageObserver = new window.ResizeObserver(() => {
      renderCards();
    });
    appState.stageObserver.observe(dom.stage);
  }
}

init();
