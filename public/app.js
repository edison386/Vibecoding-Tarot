const shared = window.TarotShared;

const dom = {
  form: document.querySelector('#question-form'),
  input: document.querySelector('#question-input'),
  submit: document.querySelector('#question-submit'),
  hint: document.querySelector('#question-hint'),
  status: document.querySelector('#status-message')
};

function setStatus(message, type) {
  dom.status.textContent = message;
  dom.status.className = 'status-message';
  if (type) {
    dom.status.classList.add(type);
  }
}

function setBusy(isBusy) {
  dom.submit.disabled = isBusy;
  dom.input.disabled = isBusy;
}

async function handleSubmit(event) {
  event.preventDefault();

  const question = dom.input.value.trim();
  if (!question) {
    setStatus('请输入你想咨询的问题。', 'error');
    return;
  }

  if (question.length > 120) {
    setStatus('问题长度需在 120 字以内。', 'error');
    return;
  }

  setBusy(true);
  setStatus('正在召唤牌阵入口...', '');

  try {
    const response = await shared.postJson(
      '/api/reading/start',
      {
        question,
        ...shared.buildTrackingPayload('/')
      }
    );
    shared.saveFlow({
      sessionId: response.session_id,
      question,
      selectedIds: [],
      result: null
    });
    shared.redirect('/draw.html');
  } catch (error) {
    setStatus(error.message || '启动失败，请稍后重试。', 'error');
    setBusy(false);
  }
}

function init() {
  void shared.trackPageView('/');

  const flash = shared.consumeFlash();
  if (flash && flash.message) {
    setStatus(flash.message, flash.type || 'error');
  }

  const activeFlow = shared.loadFlow();
  if (activeFlow && activeFlow.sessionId) {
    dom.hint.textContent = '开始新的问题会覆盖当前流程。';
  }

  dom.form.addEventListener('submit', (event) => {
    void handleSubmit(event);
  });
}

init();
