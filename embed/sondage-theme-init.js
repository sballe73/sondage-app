(function () {
  var THEME_KEY = "sondage_theme";
  function getTheme() {
    return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  }
  function applyTheme(theme) {
    if (theme === "dark") {
      document.documentElement.dataset.theme = "dark";
    } else {
      delete document.documentElement.dataset.theme;
    }
  }
  applyTheme(getTheme());
  window.SondageTheme = {
    getTheme: getTheme,
    applyTheme: applyTheme,
    toggleTheme: function () {
      var next = getTheme() === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_KEY, next);
      applyTheme(next);
      return next;
    },
  };
})();
