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
  for (const button of document.querySelectorAll('[data-workspace-target]')) {
    button.addEventListener('click', () => {
      const target = $(button.dataset.workspaceTarget);
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
  new ResizeObserver(() => {
    document.documentElement.style.setProperty('--tools-height', `${tools.getBoundingClientRect().height + 12}px`);
  }).observe(tools);
}
