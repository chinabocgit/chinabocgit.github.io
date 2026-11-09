// Applies the theme the server resolved for this child (parent > class > grade > platform).
// Only themes with a stylesheet are styled; others keep the neutral base look but still get data-theme for later.
const STYLED = new Set(["town"]);

export function applyTheme(theme) {
  const id = theme && theme.theme_id;
  // Local-only preview helper (cosmetic): ?theme=town while developing on localhost.
  const preview = location.hostname === "localhost" ? new URLSearchParams(location.search).get("theme") : null;
  const use = preview || id;
  document.documentElement.dataset.theme = use || "";
  if (use && STYLED.has(use) && !document.getElementById("theme-css")) {
    const link = document.createElement("link");
    link.id = "theme-css"; link.rel = "stylesheet"; link.href = "css/theme-" + use + ".css";
    document.head.append(link);
  }
  return { id: use, collectibleName: (theme && theme.collectible_name) || "收藏", name: (theme && theme.name) || "" };
}
