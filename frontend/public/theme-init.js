// Apply the theme before first paint so dark mode never flashes white.
(function () {
  var t = null;
  try {
    t = localStorage.getItem('kindling:theme');
  } catch (e) {}
  if (t !== 'light' && t !== 'dark') {
    t = 'dark'; // The night palette is the default; the toggle remembers a light choice.
  }
  document.documentElement.dataset.theme = t;
})();
