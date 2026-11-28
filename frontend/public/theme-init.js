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

  // Adaptive atmosphere: repaint today's tier before first paint so a reload never flashes
  // the default accent. Only inside the signed-in shell, only for today in the user's zone,
  // and only while "Match colors to my day" is on (see src/features/theme/atmosphere.ts).
  try {
    if (!/^\/(checkin|cope|wins|profile)(\/|$)/.test(location.pathname)) return;
    if (localStorage.getItem('kindling:atmosphere') === 'off') return;
    var saved = JSON.parse(localStorage.getItem('kindling:atmosphere-today') || 'null');
    if (!saved || !/^(gentle|balanced|standard)$/.test(saved.tier)) return;
    var parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: saved.tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    var get = function (type) {
      for (var i = 0; i < parts.length; i++) if (parts[i].type === type) return parts[i].value;
      return '';
    };
    if (get('year') + '-' + get('month') + '-' + get('day') === saved.date) {
      document.documentElement.dataset.atmosphere = saved.tier;
    }
  } catch (e) {}
})();
