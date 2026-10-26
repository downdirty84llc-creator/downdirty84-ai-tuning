import {openWorkspace,setupWorkspaces} from './workspaces.mjs';
const $ = id => document.getElementById(id);
const focusable = root => [...root.querySelectorAll('a[href],button,input,select,textarea,summary,[tabindex]')]
  .filter(node => node.tabIndex >= 0 && !node.disabled && node.getClientRects().length);

// A committed cell edit replaces the table. Native Tab would otherwise continue
// from a detached input and lose its position in the keyboard sequence.
export function retainTableTabOrder(input, index) {
  input.addEventListener('keydown', event => {
    if (event.key !== 'Tab' || event.ctrlKey || event.altKey || event.metaKey) return;
    event.preventDefault();
    input.blur(); // Commit through the ordinary change handler, including validation.
    const current = $('parameter-table').querySelectorAll('input,select')[index];
    const controls = focusable(document);
    const position = controls.indexOf(current);
    if (position < 0) return;
    const next = controls[position + (event.shiftKey ? -1 : 1)];
    (next ?? current).focus();
  });
}

export function showMessage(text) {
  $('message').textContent = text;
  $('message-dismiss').hidden = !text;
}

export function setupNavigation() {
  setupWorkspaces();
  for (const button of document.querySelectorAll('[data-workspace-target]')) {
    button.addEventListener('click', () => {
      const target = $(button.dataset.workspaceTarget);
      const page = target?.closest('[data-workspace]');
      if (page) openWorkspace(page.dataset.workspace, target.id, false);
      if (!target || !target.getClientRects().length) return;
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: 'start' });
    });
  }
  $('message-dismiss').onclick = () => {
    showMessage('');
    $('nav-open').focus({ preventScroll: true });
  };
  // Keep keyboard-focused controls and section headings below the sticky tools,
  // including when text wraps at a smaller window size or higher display scale.
  const tools = $('workspace-tools');
  const feedback = $('message-row');
  const observer = new ResizeObserver(() => {
    const height = window.innerWidth > 920 ? 0 : tools.getBoundingClientRect().height;
    document.documentElement.style.setProperty('--tools-height', `${height + 12}px`);
    document.documentElement.style.setProperty('--scroll-offset', `${height + feedback.getBoundingClientRect().height + 36}px`);
  });
  observer.observe(tools);
  observer.observe(feedback);
}
