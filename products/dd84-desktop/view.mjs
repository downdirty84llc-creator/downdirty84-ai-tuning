const sizes = [100, 125, 150, 175, 200];
const controls = document.getElementById('view-controls');
const select = document.getElementById('view-size');
if (window.dd84View) {
  controls.hidden = false;
  let current = 100;
  const apply = percent => {
    current = window.dd84View.setSize(percent);
    select.value = String(current);
  };
  select.addEventListener('change', () => apply(Number(select.value)));
  document.getElementById('view-reset').addEventListener('click', () => apply(100));
  document.addEventListener('keydown', event => {
    if (!event.ctrlKey || event.altKey || event.metaKey) return;
    if (!['+', '=', '-', '_', '0'].includes(event.key)) return;
    event.preventDefault();
    const step = ['+', '='].includes(event.key) ? 1 : -1;
    apply(event.key === '0' ? 100 : sizes[Math.max(0, Math.min(sizes.length - 1, sizes.indexOf(current) + step))]);
  });
}
