/**
 * Verify every <img> on the page — including hidden ones (images inside
 * display:none tab panes never load and hide breakage).
 *
 * Run: playwright-cli eval-file --tab={previewTabId} \
 *        /workspace/skills/migrate-block/scripts/verify-images.js
 *
 * naturalWidth alone is unreliable: SVGs can render perfectly while
 * reporting naturalWidth 0. Ambiguous cases (SVGs, pending/lazy images)
 * are resolved with an in-page fetch of the src. Non-http(s) srcs
 * (e.g., data: URIs) cannot be fetch-verified; if not ok they count as
 * failures. pass = no broken images AND every non-ok image resolved 2xx.
 */
(async function verifyImages() {
  var imgs = Array.from(document.querySelectorAll('img'));

  var records = imgs.map(function (img) {
    var src = img.currentSrc || img.src || '';
    var path = src.split(/[?#]/)[0];
    var isSVG = /\.svg$/i.test(path) || src.indexOf('data:image/svg') === 0;
    var status;
    if (!img.complete) status = 'pending';
    else if (img.naturalWidth > 0) status = 'ok';
    else status = isSVG ? 'svg-indeterminate' : 'broken';
    return {
      src: src,
      complete: img.complete,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      isSVG: isSVG,
      visible: img.getClientRects().length > 0,
      status: status
    };
  });

  for (var i = 0; i < records.length; i++) {
    var rec = records[i];
    if (rec.status === 'ok' || !/^https?:/.test(rec.src)) continue;
    try {
      var resp = await fetch(rec.src);
      rec.httpStatus = resp.status;
    } catch (e) {
      rec.httpStatus = 0;
    }
  }

  var failures = records.filter(function (r) {
    if (r.status === 'broken') return true;
    if (r.status === 'ok') return false;
    return !(r.httpStatus >= 200 && r.httpStatus < 300);
  });

  function count(status) {
    return records.filter(function (r) { return r.status === status; }).length;
  }

  return JSON.stringify({
    pass: failures.length === 0,
    counts: {
      total: records.length,
      ok: count('ok'),
      pending: count('pending'),
      svgIndeterminate: count('svg-indeterminate'),
      broken: count('broken')
    },
    failures: failures.map(function (r) {
      return { src: r.src, status: r.status, httpStatus: r.httpStatus };
    }),
    images: records
  });
})();
