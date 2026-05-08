(async () => {
  var fixedElementsConverted = 0;
  var allElements = document.querySelectorAll('*');
  for (var i = 0; i < allElements.length; i++) {
    var style = window.getComputedStyle(allElements[i]);
    if (style.position === 'fixed') {
      allElements[i].style.position = 'relative';
      fixedElementsConverted++;
    }
  }

  return JSON.stringify({
    fixedElementsConverted: fixedElementsConverted
  });
})()
