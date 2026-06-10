(function () {
  const slug = new URLSearchParams(window.location.search).get("biz");

  function withBiz(path) {
    return slug ? `${path}?biz=${encodeURIComponent(slug)}` : path;
  }

  const links = {
    "nav-brand": "connect.html",
    "nav-connect": "connect.html",
    "nav-pricing": "pricing.html",
    "nav-register": "register.html",
    "nav-payment": "payment.html",
    "pricing-link": "pricing.html",
    "pricing-back": "pricing.html",
  };

  for (const [id, path] of Object.entries(links)) {
    const el = document.getElementById(id);
    if (el) el.href = withBiz(path);
  }
})();
