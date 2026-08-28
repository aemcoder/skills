(async () => {
  var HEADING_SIZE_MAP = {
    H1: "xxl",
    H2: "xl",
    H3: "l",
    H4: "m",
    H5: "s",
    H6: "xs",
  };

  var DEFAULT_MOBILE_SIZES = {
    xxl: "36px",
    xl: "28px",
    l: "24px",
    m: "20px",
    s: "18px",
    xs: "16px",
  };

  var GENERIC_FONT_FAMILIES = [
    "-apple-system",
    "system-ui",
    "sans-serif",
    "serif",
    "arial",
    "helvetica",
    "georgia",
    "times new roman",
  ];

  var GOOGLE_FONTS_PROBE_TIMEOUT_MS = 5000;
  var MIN_BODY_TEXT_LENGTH = 40;

  function parsePrimaryFont(familySet) {
    var first = (familySet.split(",")[0] || "").trim();
    return first.replace(/^["']|["']$/g, "");
  }

  function extractFontInfo(el) {
    var style = window.getComputedStyle(el);
    var familySet = style.fontFamily || "";
    return {
      family: parsePrimaryFont(familySet),
      familySet: familySet,
    };
  }

  function parsePx(value) {
    var n = parseFloat(value);
    return isNaN(n) ? 0 : n;
  }

  // Picks the paragraph-like element with the largest rendered area, so a
  // display-styled first <p> (e.g. a hero lede) doesn't get mistaken for
  // body copy. Falls back to the first <p>, then document.body.
  function findLargestTextElement() {
    var candidates = document.querySelectorAll(
      "main p, article p, section p, p, li",
    );
    var best = null;
    var bestArea = 0;
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      if (el.getClientRects().length === 0) continue;
      var text = (el.innerText || "").trim();
      if (text.length < MIN_BODY_TEXT_LENGTH) continue;
      var rect = el.getBoundingClientRect();
      var area = rect.width * rect.height;
      if (area > bestArea) {
        bestArea = area;
        best = el;
      }
    }
    return best;
  }

  // The element used as the "body" baseline: the largest qualifying text
  // block, or the first <p>, or document.body. Shared by extractBodyFont()
  // and the heading-size sanity check so both agree on what "body" means.
  function resolveBodyElement() {
    return (
      findLargestTextElement() || document.querySelector("p") || document.body
    );
  }

  function extractHeadingSizes(bodyElement) {
    var sizes = {};
    var tiers = ["xxl", "xl", "l", "m", "s", "xs"];
    for (var i = 0; i < tiers.length; i++) {
      sizes[tiers[i]] = {
        mobile: DEFAULT_MOBILE_SIZES[tiers[i]],
        desktop: "",
      };
    }

    var bodySizePx = parsePx(window.getComputedStyle(bodyElement).fontSize);

    var tags = Object.keys(HEADING_SIZE_MAP);
    for (var j = 0; j < tags.length; j++) {
      var tag = tags[j];
      var tier = HEADING_SIZE_MAP[tag];
      var elements = document.querySelectorAll(tag.toLowerCase());
      var bestEl = null;
      var bestSizePx = 0;
      for (var k = 0; k < elements.length; k++) {
        var el = elements[k];
        if (el.getClientRects().length === 0) continue;
        var sizePx = parsePx(window.getComputedStyle(el).fontSize);
        if (sizePx > bestSizePx) {
          bestSizePx = sizePx;
          bestEl = el;
        }
      }
      // Sanity-check against body size: a heading tier that isn't actually
      // larger than body text is implausible (e.g. a 14px eyebrow latched
      // onto by an earlier, less-selective query) — leave it unset rather
      // than emit a wrong value.
      if (bestEl && bestSizePx > bodySizePx) {
        var headingStyle = window.getComputedStyle(bestEl);
        sizes[tier].desktop = headingStyle.fontSize;
        sizes[tier].lineHeight = headingStyle.lineHeight;
        sizes[tier].letterSpacing = headingStyle.letterSpacing;
        sizes[tier].fontWeight = headingStyle.fontWeight;
      }
    }
    return sizes;
  }

  function extractBodyFont(bodyElement) {
    return extractFontInfo(bodyElement);
  }

  function extractHeadingFont() {
    var heading = document.querySelector("h1, h2, h3");
    if (heading) return extractFontInfo(heading);
    return { family: "", familySet: "" };
  }

  function extractBaseColors() {
    var bg = "";
    var text = "";
    var bodyStyle = window.getComputedStyle(document.body);
    bg = bodyStyle.backgroundColor || "";
    text = bodyStyle.color || "";

    // If body bg is transparent, try html, then main, then first section
    if (!bg || bg === "rgba(0, 0, 0, 0)" || bg === "transparent") {
      var html = document.documentElement;
      bg = window.getComputedStyle(html).backgroundColor || "";
    }
    if (!bg || bg === "rgba(0, 0, 0, 0)" || bg === "transparent") {
      var main = document.querySelector("main");
      if (main) bg = window.getComputedStyle(main).backgroundColor || "";
    }
    if (!bg || bg === "rgba(0, 0, 0, 0)" || bg === "transparent") {
      bg = "#ffffff";
    }

    // If text is default black, try main content area for more specific value
    var mainEl = document.querySelector("main");
    if (mainEl) {
      var mainText = window.getComputedStyle(mainEl).color;
      if (mainText && mainText !== "rgb(0, 0, 0)") text = mainText;
    }

    return { background: bg, text: text };
  }

  function isOnDarkBackground(el) {
    var current = el;
    while (current && current !== document.body) {
      var bg = window.getComputedStyle(current).backgroundColor;
      if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
        var rgb = parseRgb(bg);
        if (rgb) return luminance(rgb) < 128;
      }
      current = current.parentElement;
    }
    return false;
  }

  function extractLinkColor() {
    // Sample links in body-context areas (skip header, hero, dark-bg sections)
    var links = document.querySelectorAll("main a");
    if (links.length === 0) links = document.querySelectorAll("a");
    var counts = {};
    for (var i = 0; i < links.length && i < 50; i++) {
      var link = links[i];
      var color = window.getComputedStyle(link).color || "";
      // Skip white, black, and transparent — these are inherited or
      // intentional contrast colors, not the site's "link color"
      if (!color) continue;
      if (color === "rgb(255, 255, 255)") continue;
      if (color === "rgb(0, 0, 0)") continue;
      // Skip links inside dark-background containers (heroes, promo
      // bars) where the link color is a contrast override
      if (isOnDarkBackground(link)) continue;
      counts[color] = (counts[color] || 0) + 1;
    }
    var best = "";
    var bestCount = 0;
    var keys = Object.keys(counts);
    for (var j = 0; j < keys.length; j++) {
      if (counts[keys[j]] > bestCount) {
        bestCount = counts[keys[j]];
        best = keys[j];
      }
    }
    // If no candidate survived, return empty rather than a misleading
    // color from a dark-background link
    return best;
  }

  function extractLinkHoverColor() {
    try {
      var sheets = document.styleSheets;
      for (var i = 0; i < sheets.length; i++) {
        var rules;
        try {
          rules = sheets[i].cssRules;
        } catch {
          continue;
        }
        for (var j = 0; j < rules.length; j++) {
          var rule = rules[j];
          if (rule.selectorText) {
            var selectors = rule.selectorText.split(",");
            for (var k = 0; k < selectors.length; k++) {
              if (/^a:hover$/i.test(selectors[k].trim())) {
                var color = rule.style.color;
                if (color) return color;
              }
            }
          }
        }
      }
    } catch {}
    return null;
  }

  function parseRgb(color) {
    var match = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!match) return null;
    return {
      r: parseInt(match[1], 10),
      g: parseInt(match[2], 10),
      b: parseInt(match[3], 10),
    };
  }

  function luminance(rgb) {
    return 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
  }

  function extractLightDarkColors() {
    var sections = document.querySelectorAll("section");
    var lightestColor = "";
    var lightestLum = 255;
    var darkestColor = "";
    var darkestLum = Infinity;

    for (var i = 0; i < sections.length; i++) {
      var bg = window.getComputedStyle(sections[i]).backgroundColor;
      if (!bg || bg === "transparent" || bg === "rgba(0, 0, 0, 0)") continue;

      var rgb = parseRgb(bg);
      if (!rgb) continue;

      var lum = luminance(rgb);

      if (lum < 254 && (lightestColor === "" || lum > lightestLum)) {
        lightestLum = lum;
        lightestColor = bg;
      }

      if (darkestColor === "" || lum < darkestLum) {
        darkestLum = lum;
        darkestColor = bg;
      }
    }

    return { light: lightestColor, dark: darkestColor };
  }

  function extractSectionPadding() {
    // The first section often has padding:0 (hero/full-bleed). Sample a
    // representative content section: return the first non-zero paddingTop.
    var candidates = document.querySelectorAll(
      "main section, section, main > div",
    );
    for (var i = 0; i < candidates.length; i++) {
      var p = window.getComputedStyle(candidates[i]).paddingTop || "";
      if (p && parseFloat(p) > 0) return p;
    }
    var main = document.querySelector("main");
    return main ? window.getComputedStyle(main).paddingTop || "" : "";
  }

  function extractSectionGaps() {
    // Measure vertical gaps between adjacent sections in <main>.
    // Returns the most common gap (modal) as the typical section spacing.
    var sections = document.querySelectorAll("main > section, main > div");
    if (sections.length < 2) return "";
    var gaps = {};
    for (var i = 1; i < sections.length; i++) {
      var prevBottom = sections[i - 1].getBoundingClientRect().bottom;
      var currTop = sections[i].getBoundingClientRect().top;
      var gap = Math.round(currTop - prevBottom);
      if (gap >= 0) gaps[gap] = (gaps[gap] || 0) + 1;
    }
    var bestGap = 0;
    var bestCount = 0;
    var keys = Object.keys(gaps);
    for (var j = 0; j < keys.length; j++) {
      if (gaps[keys[j]] > bestCount) {
        bestCount = gaps[keys[j]];
        bestGap = Number(keys[j]);
      }
    }
    return bestGap ? bestGap + "px" : "";
  }

  function extractContentMaxWidth() {
    var selectors = [
      "main > .container",
      "main > .wrapper",
      'main > [class*="container"]',
      'main > [class*="wrapper"]',
      "main > div",
      ".container",
      ".wrapper",
      '[class*="container"]',
      '[class*="wrapper"]',
    ];
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (!el) continue;
      var mw = window.getComputedStyle(el).maxWidth;
      if (mw && mw !== "none" && mw !== "0px") return mw;
    }
    return "";
  }

  function extractNavHeight() {
    // Prefer the outermost <header> (the sticky bar) over an inner <nav>,
    // which can report a smaller inner height. Use the rendered bounding-box
    // height (reflects the real bar) and take the larger of it vs computed.
    var el = document.querySelector("header") || document.querySelector("nav");
    if (!el) return "";
    var rectH = Math.round(el.getBoundingClientRect().height) || 0;
    var cssH = parseFloat(window.getComputedStyle(el).height) || 0;
    var h = Math.max(rectH, cssH);
    return h ? h + "px" : window.getComputedStyle(el).height || "";
  }

  function extractFavicons() {
    var links = document.querySelectorAll('link[rel*="icon"]');
    var seen = {};
    var favicons = [];

    for (var i = 0; i < links.length; i++) {
      var link = links[i];
      var href = link.getAttribute("href");
      if (!href) continue;

      var url = new URL(href, window.location.href).href;
      if (seen[url]) continue;
      seen[url] = true;

      var entry = {
        url: url,
        rel: link.getAttribute("rel") || "icon",
      };

      var sizes = link.getAttribute("sizes");
      if (sizes) entry.sizes = sizes;

      var type = link.getAttribute("type");
      if (type) entry.type = type;

      favicons.push(entry);
    }

    if (favicons.length === 0) {
      favicons.push({
        url: new URL("/favicon.ico", window.location.href).href,
        rel: "icon",
      });
    }

    return favicons;
  }

  function isGenericFont(family) {
    if (!family) return true;
    return GENERIC_FONT_FAMILIES.indexOf(family.toLowerCase()) !== -1;
  }

  function probeGoogleFont(family) {
    var url =
      "https://fonts.googleapis.com/css2?family=" + encodeURIComponent(family);
    var controller = new AbortController();
    var timer = setTimeout(() => {
      controller.abort();
    }, GOOGLE_FONTS_PROBE_TIMEOUT_MS);
    return fetch(url, { method: "GET", signal: controller.signal })
      .then((resp) => (resp.ok ? url : null))
      .catch(() => null)
      .then((result) => {
        clearTimeout(timer);
        return result;
      });
  }

  // Scrapes existing <link> tags for typekit/Google Fonts hints, then probes
  // Google Fonts directly for the resolved body/heading families in case the
  // page never linked them explicitly (e.g. self-hosted or @font-face'd).
  // googleFonts entries are css2 URLs, consistent between both sources so
  // downstream code doesn't need to distinguish "linked" vs "probed" hints.
  async function detectFontSources(bodyFamily, headingFamily) {
    var sources = { typekit: null, googleFonts: [] };
    var links = document.querySelectorAll('link[rel="stylesheet"]');
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute("href") || "";
      var tkMatch = href.match(/use\.typekit\.net\/([a-z0-9]+)\.css/);
      if (tkMatch) {
        sources.typekit = tkMatch[1];
      }
      if (href.indexOf("fonts.googleapis.com") !== -1) {
        sources.googleFonts.push(href);
      }
    }

    var families = [bodyFamily, headingFamily]
      .filter((f, idx, arr) => f && !isGenericFont(f) && arr.indexOf(f) === idx)
      .slice(0, 2);

    var probeResults = await Promise.all(families.map(probeGoogleFont));
    for (var p = 0; p < probeResults.length; p++) {
      var url = probeResults[p];
      if (url && sources.googleFonts.indexOf(url) === -1) {
        sources.googleFonts.push(url);
      }
    }

    return sources;
  }

  var bodyElement = resolveBodyElement();
  var bodyFont = extractBodyFont(bodyElement);
  var headingFont = extractHeadingFont();
  var headingSizes = extractHeadingSizes(bodyElement);
  var baseColors = extractBaseColors();
  var linkColor = extractLinkColor();
  var linkHover = extractLinkHoverColor();
  var lightDark = extractLightDarkColors();
  var fontSources = await detectFontSources(
    bodyFont.family,
    headingFont.family,
  );

  return JSON.stringify({
    fonts: {
      body: bodyFont,
      heading: headingFont,
      headingSizes: headingSizes,
      sources: fontSources,
    },
    colors: {
      background: baseColors.background,
      text: baseColors.text,
      link: linkColor,
      linkHover: linkHover,
      light: lightDark.light,
      dark: lightDark.dark,
    },
    spacing: {
      sectionPadding: extractSectionPadding(),
      sectionGap: extractSectionGaps(),
      contentMaxWidth: extractContentMaxWidth(),
      navHeight: extractNavHeight(),
    },
    favicons: extractFavicons(),
  });
})();
