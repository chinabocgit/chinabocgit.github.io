// Whitelist HTML sanitizer for question stems, option text and data cards.
// Parsing happens in an inert document (DOMParser): scripts do not run and images do not load while we clean.
// Rules: only the tags below survive; every attribute is dropped except colspan/rowspan on cells;
// dangerous containers are removed with their content; unknown tags are unwrapped (text is kept).

const ALLOWED = new Set([
  "b", "strong", "i", "em", "u", "br", "p", "span", "div", "small", "sub", "sup",
  "ul", "ol", "li", "table", "thead", "tbody", "tr", "th", "td", "h3", "h4",
]);
const DROP_WITH_CONTENT = new Set([
  "script", "style", "iframe", "frame", "frameset", "object", "embed", "template", "noscript",
  "svg", "math", "link", "meta", "base", "form", "input", "button", "textarea", "select", "audio", "video", "canvas",
]);
const KEEP_ATTRS = { td: ["colspan", "rowspan"], th: ["colspan", "rowspan"] };

function clean(node, out, doc) {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 3) {                       // text
      out.append(doc.createTextNode(child.nodeValue));
    } else if (child.nodeType === 1) {                // element
      const tag = child.tagName.toLowerCase();
      if (DROP_WITH_CONTENT.has(tag)) continue;
      if (ALLOWED.has(tag)) {
        const copy = doc.createElement(tag);
        for (const a of KEEP_ATTRS[tag] || []) {
          const v = child.getAttribute(a);
          if (v != null && /^\d{1,2}$/.test(v)) copy.setAttribute(a, v);
        }
        clean(child, copy, doc);
        out.append(copy);
      } else {
        clean(child, out, doc);                       // unwrap unknown tag, keep its text
      }
    }
    // comments and everything else are dropped
  }
}

export function sanitizeHtml(html) {
  if (html == null) return "";
  const doc = new DOMParser().parseFromString("<!doctype html><body>" + String(html), "text/html");
  const holder = doc.createElement("div");
  clean(doc.body, holder, doc);
  return holder.innerHTML;
}

// Use this instead of `el.innerHTML = …` for any content that came from the database.
export function setSafeHtml(target, html) {
  target.innerHTML = sanitizeHtml(html);
  return target;
}
