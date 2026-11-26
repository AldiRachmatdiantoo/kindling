// Apply the theme before first paint so dark mode never flashes white.
(function () {
  var t = null;
  try {
    t = localStorage.getItem('kindling:theme');
  } catch (e) {}
  if (t !== 'light' && t !== 'dark') {
    t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = t;
})();
