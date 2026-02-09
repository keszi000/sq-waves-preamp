// Modal helpers and server show list
async function getServerShows() {
  const res = await fetch(API_BASE + '/api/shows');
  if (!res.ok) throw new Error('Could not list shows');
  const data = await res.json();
  return data.shows || [];
}

/** Show confirm modal. message: plain text or HTML string; useHtml: set message as innerHTML if true else textContent; danger: red confirm button. */
function confirmModalImpl(message, confirmLabel, useHtml, danger) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirm-modal');
    const msgEl = document.getElementById('confirm-modal-message');
    const okBtn = document.getElementById('confirm-modal-ok');
    const cancelBtn = modal.querySelector('.modal-cancel');
    const overlay = modal.querySelector('.modal-overlay');
    if (useHtml) msgEl.innerHTML = message;
    else msgEl.textContent = message;
    okBtn.textContent = confirmLabel;
    okBtn.classList.toggle('btn-danger', danger);
    modal.classList.toggle('confirm-danger', danger);
    modal.hidden = false;
    const close = (result) => {
      modal.hidden = true;
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      overlay.removeEventListener('click', onCancel);
      document.removeEventListener('keydown', onEscape);
      resolve(result);
    };
    const onOk = () => close(true);
    const onCancel = () => close(false);
    const onEscape = (e) => { if (e.key === 'Escape') close(false); };
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    overlay.addEventListener('click', onCancel);
    document.addEventListener('keydown', onEscape);
  });
}

function confirmModal(message, confirmLabel = 'Continue') {
  return confirmModalImpl(message, confirmLabel, false, false);
}

/** Confirm with HTML message and optional danger style (red confirm button). */
function confirmModalHtml(messageHtml, confirmLabel = 'Continue', danger = false) {
  return confirmModalImpl(messageHtml, confirmLabel, true, danger);
}
