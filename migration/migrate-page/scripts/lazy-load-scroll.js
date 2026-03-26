(async () => {
  var scrollStep = window.innerHeight || 800;
  var totalHeight = Math.max(
    (document.body && document.body.scrollHeight) || 0,
    document.documentElement.scrollHeight || 0
  ) || 800;
  var stepsScrolled = 0;

  for (var pos = 0; pos < totalHeight; pos += scrollStep) {
    window.scrollTo(0, pos);
    stepsScrolled++;
    await new Promise(function(r) { setTimeout(r, 100); });
  }

  window.scrollTo(0, totalHeight);
  await new Promise(function(r) { setTimeout(r, 100); });

  window.scrollTo(0, 0);
  await new Promise(function(r) { setTimeout(r, 500); });

  return JSON.stringify({
    totalHeight: totalHeight,
    stepsScrolled: stepsScrolled
  });
})()
