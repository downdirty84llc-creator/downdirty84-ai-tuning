const $ = id => document.getElementById(id);
export const workspaceNames = Object.freeze({home:'Home',projects:'Calibration projects',logs:'Recorded logs',
  comparisons:'Tune comparisons',learning:'Learning evidence',device:'Device bench',help:'Help & file guide',troubleshoot:'Troubleshooting'});

// Switching a workspace only changes presentation. Loaded files, edits and save
// guards remain owned by their existing modules, including while hidden.
export function openWorkspace(name, targetId, focus = true) {
  if (!Object.hasOwn(workspaceNames, name)) return false;
  const panel = document.querySelector(`[data-workspace="${name}"]`);
  if (!panel) return false;
  for (const page of document.querySelectorAll('[data-workspace]')) page.hidden = page !== panel;
  for (const button of document.querySelectorAll('#workspace-navigation [data-page]')) {
    if (button.dataset.page === name) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  $('project-navigation').classList.toggle('outside-projects', name !== 'projects');
  $('current-workspace').textContent = workspaceNames[name];
  document.title = `${workspaceNames[name]} · DD84 Calibration Studio`;
  const target = targetId ? $(targetId) : panel.querySelector('h1,h2');
  if (focus && target && !target.closest('[hidden]')) {
    target.tabIndex = -1;
    target.focus({preventScroll:true});
    target.scrollIntoView({block:'start'});
  }
  return true;
}

export function setupWorkspaces() {
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-page]');
    if (button) openWorkspace(button.dataset.page, button.dataset.target);
  });
  openWorkspace('home', undefined, false);
}
