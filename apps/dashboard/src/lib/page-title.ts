const APP_NAME = 'WagonWise';

/** Pages that are not in the menu (a link on another page leads to them). */
const OTHER_PAGES: Readonly<Record<string, string>> = {
  '/fleet/reports': 'Reports',
  '/guide': 'Guide',
};

/**
 * The browser tab's title for the page at `pathname`: the menu's name for it, then the product name ("Jobs · WagonWise"), so
 * several tabs open at once can be told apart. `links` are the menu links this person sees. A page beneath a link
 * (/guide/jobs) takes that link's name; the longest match wins. Anything unknown is just the product name.
 */
export function pageTitle(
  pathname: string,
  links: readonly { readonly to: string; readonly label: string }[],
): string {
  const known = [...links, ...Object.entries(OTHER_PAGES).map(([to, label]) => ({ to, label }))];
  let best: { label: string; length: number } | undefined;
  for (const link of known) {
    const here = pathname === link.to || pathname.startsWith(`${link.to}/`);
    if (here && (best === undefined || link.to.length > best.length)) {
      best = { label: link.label, length: link.to.length };
    }
  }
  return best === undefined ? APP_NAME : `${best.label} · ${APP_NAME}`;
}
