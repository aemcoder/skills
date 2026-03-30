/**
 * Convert .plain.html files (EDS div-based format) to DA source HTML.
 *
 * Transformations:
 *   1. Block divs → tables (DA's authoring format)
 *   2. Image URL rewriting → absolute public URLs with lowercased filenames
 *   3. Full HTML wrapping with <!DOCTYPE html><html><head><body><main>
 *
 * Usage (in slicc JavaScript tool):
 *   const script = await fs.readFile(
 *     '/workspace/skills/migrate-page/scripts/prepare-da-content.js',
 *     { encoding: 'utf-8' }
 *   );
 *   eval(script);
 *   const result = await prepareDaContent({
 *     projectPath: '/shared/vibemigrated',
 *     branch: 'home-k5m2n8',
 *   });
 *   return JSON.stringify(result);
 *
 * @param {object} options
 * @param {string} options.projectPath - VFS path to EDS project
 * @param {string} options.branch - Branch name (used for image URLs)
 * @returns {Promise<{files: string[], imageMap: Object}>}
 */
var prepareDaContent = async function prepareDaContent(options) {
  var projectPath = options.projectPath;
  var branch = options.branch;
  var draftsDir = projectPath + '/drafts';
  var outputDir = projectPath + '/.migration/da';
  var daBase = 'https://main--vibemigrated--aemcoder.aem.page';

  await fs.mkdir(outputDir);

  var entries = await fs.readDir(draftsDir);
  var plainFiles = [];
  for (var i = 0; i < entries.length; i++) {
    var name = typeof entries[i] === 'string' ? entries[i] : entries[i].name;
    if (name && name.slice(-11) === '.plain.html') {
      plainFiles.push(name);
    }
  }

  var processedFiles = [];
  var imageMap = {};

  for (var fi = 0; fi < plainFiles.length; fi++) {
    var filename = plainFiles[fi];
    var inputPath = draftsDir + '/' + filename;
    var outputName = filename.slice(0, -11) + '.html'; // foo.plain.html → foo.html
    var outputPath = outputDir + '/' + outputName;

    var html = await fs.readFile(inputPath, { encoding: 'utf-8' });

    // Step 1: Convert block divs to tables (innermost-first via repeated passes)
    html = convertBlockDivsToTables(html);

    // Step 2: Rewrite image URLs to absolute public URLs with lowercased filenames
    html = rewriteImageUrls(html, daBase, branch, imageMap);

    // Step 3: Wrap in full HTML document with <main>
    html = wrapInDocument(html);

    await fs.writeFile(outputPath, html);
    processedFiles.push(outputPath);
  }

  return { files: processedFiles, imageMap: imageMap };
};

/**
 * Convert EDS div-based blocks to DA table format.
 *
 * Processes innermost blocks first by repeating passes until stable.
 * A block is a <div class="blockname"> or <div class="blockname variant">.
 * The class must be present and the element must NOT be a section wrapper
 * (which is a plain <div> with no class, or a div whose only class is section-metadata).
 */
var convertBlockDivsToTables = function convertBlockDivsToTables(html) {
  var prev;
  do {
    prev = html;
    html = convertOneBlockPass(html);
  } while (html !== prev);
  return html;
};

/**
 * Single pass: find and convert one innermost block div to a table.
 * Processes depth-first so nested blocks are converted before their parents.
 * Returns modified HTML, or the original string unchanged if no block divs remain.
 */
var convertOneBlockPass = function convertOneBlockPass(html) {
  return convertBlocksInFragment(html).html;
};

/**
 * Recursively scan a fragment and convert the first innermost block div found.
 * Emits all non-block content (text, closing tags, other elements) unchanged.
 *
 * @param {string} html
 * @returns {{ html: string, converted: boolean }}
 */
var convertBlocksInFragment = function convertBlocksInFragment(html) {
  var pos = 0;
  var len = html.length;
  var result = '';

  while (pos < len) {
    var tagStart = html.indexOf('<div', pos);
    if (tagStart === -1) {
      // No more divs — emit the rest as-is
      result += html.slice(pos);
      return { html: result, converted: false };
    }

    // Emit everything before this <div
    result += html.slice(pos, tagStart);

    var tagEnd = html.indexOf('>', tagStart);
    if (tagEnd === -1) {
      // Malformed tag — emit the rest as-is
      result += html.slice(tagStart);
      return { html: result, converted: false };
    }

    var tagText = html.slice(tagStart, tagEnd + 1);
    var classMatch = tagText.match(/\sclass="([^"]+)"/);

    // Not a block div (no class attribute): emit opening tag only and advance
    if (!classMatch) {
      result += tagText;
      pos = tagEnd + 1;
      continue;
    }

    var className = classMatch[1].trim();
    if (!className || className === 'section-metadata') {
      // Section wrapper or metadata div — emit opening tag and continue
      result += tagText;
      pos = tagEnd + 1;
      continue;
    }

    // Found a block div. Extract its full content (opening tag through </div>).
    var extracted = extractDivContent(html, tagStart);
    if (extracted === null) {
      // Unbalanced — emit opening tag and continue
      result += tagText;
      pos = tagEnd + 1;
      continue;
    }

    var closePos = extracted.endPos;
    var content = extracted.content;

    // Recurse into content to convert innermost blocks first
    var inner = convertBlocksInFragment(content);
    if (inner.converted) {
      // A nested block was converted — rebuild this div with updated inner content
      result += '<div class="' + className + '">' + inner.html + '</div>';
      pos = closePos;
      result += html.slice(pos);
      return { html: result, converted: true };
    }

    // No nested blocks — this IS the innermost block div, convert it now
    var table = blockToTable(className, content);
    result += table;
    pos = closePos;
    result += html.slice(pos);
    return { html: result, converted: true };
  }

  return { html: result, converted: false };
};

/**
 * Extract the inner content of the first <div ...> starting at offset,
 * returning { content: string, endPos: number } where endPos points
 * past the closing </div>. Returns null if unbalanced.
 */
var extractDivContent = function extractDivContent(html, divStart) {
  var len = html.length;
  // Find the end of the opening tag
  var openEnd = html.indexOf('>', divStart);
  if (openEnd === -1) return null;

  var depth = 1;
  var pos = openEnd + 1;
  var contentStart = pos;

  while (pos < len && depth > 0) {
    var nextOpen = html.indexOf('<div', pos);
    var nextClose = html.indexOf('</div', pos);

    if (nextClose === -1) return null; // unbalanced

    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + 4; // skip past '<div'
    } else {
      depth--;
      if (depth === 0) {
        var closeEnd = html.indexOf('>', nextClose);
        if (closeEnd === -1) return null;
        return {
          content: html.slice(contentStart, nextClose),
          endPos: closeEnd + 1
        };
      }
      pos = nextClose + 5; // skip past '</div'
    }
  }

  return null;
};

/**
 * Convert a block div's content to a DA table.
 *
 * @param {string} blockName - The class attribute value (e.g. "cards wide")
 * @param {string} innerHtml - The innerHTML of the block div
 * @returns {string} Table HTML
 */
var blockToTable = function blockToTable(blockName, innerHtml) {
  // Parse direct child <div> elements as rows
  var rows = extractDirectDivChildren(innerHtml);

  if (rows.length === 0) {
    // No child divs — treat entire content as a single cell
    return '<table><tr><td>' + blockName + '</td></tr><tr><td>' +
      innerHtml.trim() + '</td></tr></table>';
  }

  var cells;
  var colCount = 1;
  for (var i = 0; i < rows.length; i++) {
    cells = extractDirectDivChildren(rows[i]);
    if (cells.length > colCount) colCount = cells.length;
  }

  var tableRows = [];

  // Header row: block name spanning all columns
  var colspan = colCount > 1 ? ' colspan="' + colCount + '"' : '';
  tableRows.push('<tr><td' + colspan + '>' + blockName + '</td></tr>');

  // Content rows
  for (var ri = 0; ri < rows.length; ri++) {
    cells = extractDirectDivChildren(rows[ri]);
    var tr = '<tr>';
    if (cells.length === 0) {
      // Row has no child divs — single cell spanning all cols
      var rowColspan = colCount > 1 ? ' colspan="' + colCount + '"' : '';
      tr += '<td' + rowColspan + '>' + rows[ri].trim() + '</td>';
    } else {
      for (var ci = 0; ci < cells.length; ci++) {
        tr += '<td>' + cells[ci].trim() + '</td>';
      }
    }
    tr += '</tr>';
    tableRows.push(tr);
  }

  return '<table>' + tableRows.join('') + '</table>';
};

/**
 * Extract the innerHTML of each direct child <div> element in an HTML string.
 * Returns an array of innerHTML strings (one per direct child div).
 */
var extractDirectDivChildren = function extractDirectDivChildren(html) {
  var children = [];
  var pos = 0;
  var len = html.length;

  // Skip leading whitespace/text to find first direct child
  while (pos < len) {
    // Find the next tag
    var lt = html.indexOf('<', pos);
    if (lt === -1) break;

    // Check if it's a <div (direct child)
    if (html.slice(lt, lt + 4) !== '<div') {
      // Not a div — skip this tag entirely
      var gt = html.indexOf('>', lt);
      if (gt === -1) break;
      pos = gt + 1;
      continue;
    }

    // It's a <div — extract it
    var extracted = extractDivContent(html, lt);
    if (!extracted) {
      var gt2 = html.indexOf('>', lt);
      if (gt2 === -1) break;
      pos = gt2 + 1;
      continue;
    }

    children.push(extracted.content);
    pos = extracted.endPos;
  }

  return children;
};

/**
 * Rewrite /drafts/images/Foo.jpg → absolute public URL with lowercased filename.
 * Collects a mapping of original → rewritten URLs.
 *
 * @param {string} html
 * @param {string} daBase - e.g. 'https://main--vibemigrated--aemcoder.aem.page'
 * @param {string} branch
 * @param {object} imageMap - Mutated in-place to record rewrites
 * @returns {string}
 */
var rewriteImageUrls = function rewriteImageUrls(html, daBase, branch, imageMap) {
  // Match src="/drafts/images/..." and href="/drafts/images/..."
  return html.replace(/(src|href)="(\/drafts\/images\/([^"]+))"/g,
    function (match, attr, originalPath, filename) {
      var lowercased = filename.toLowerCase();
      var newUrl = daBase + '/' + branch + '/images/' + lowercased;
      imageMap[originalPath] = newUrl;
      return attr + '="' + newUrl + '"';
    });
};

/**
 * Wrap an HTML fragment in a full DA-compatible HTML document.
 * DA processes only content inside <main> — without this wrapper, output is empty.
 *
 * @param {string} fragment - HTML fragment (the .plain.html content)
 * @returns {string} Full HTML document
 */
var wrapInDocument = function wrapInDocument(fragment) {
  return '<!DOCTYPE html><html><head><title></title></head><body>' +
    '<header></header><main>' +
    fragment.trim() +
    '</main><footer></footer></body></html>';
};

// Export for Node.js test environments
if (typeof module !== 'undefined') {
  module.exports = {
    prepareDaContent,
    convertBlockDivsToTables,
    blockToTable,
    rewriteImageUrls,
    wrapInDocument
  };
}
