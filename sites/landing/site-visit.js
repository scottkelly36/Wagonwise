/* global location, document, URLSearchParams, URL, fetch */
// Counts visits to this site without cookies or anything that identifies a visitor (docs/modules.md, "Website visits"): the page,
// where the visit came from (a utm_source, or the referring site), the utm_campaign, and on For hauliers whether the video was
// played. Nothing is stored in the browser. A failure is silent and never holds the page up.
(function () {
  var PAGES = ['/', '/for-hauliers/', '/privacy/', '/delete-account/'];
  var path = location.pathname.replace(/index\.html$/, '');
  if (path.charAt(path.length - 1) !== '/') path += '/';
  if (PAGES.indexOf(path) < 0) return;

  var clean = function (value) {
    if (!value) return undefined;
    var v = String(value)
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '')
      .slice(0, 60);
    return v === '' ? undefined : v;
  };
  var params = new URLSearchParams(location.search);
  var source = clean(params.get('utm_source'));
  if (!source && document.referrer) {
    try {
      var host = new URL(document.referrer).hostname.replace(/^(www|m|l|lm|mobile)\./, '');
      if (host && host !== location.hostname.replace(/^www\./, '')) source = clean(host);
    } catch {
      // An unreadable referrer counts as direct.
    }
  }
  var campaign = clean(params.get('utm_campaign'));

  var send = function (kind) {
    var body = { kind: kind, page: path };
    if (source) body.source = source;
    if (campaign) body.campaign = campaign;
    try {
      fetch('/signups/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true,
      }).catch(function () {});
    } catch {
      // Not counted; the page carries on.
    }
  };

  send('view');
  var played = false;
  document.querySelectorAll('video').forEach(function (video) {
    video.addEventListener('play', function () {
      if (played) return;
      played = true;
      send('video_play');
    });
  });
})();
