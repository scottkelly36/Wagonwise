/** A section with more links than this folds away, so one long list does not run down the page. */
export const SECTION_CAP = 4;
/** When the whole menu has more links than this, every section of two or more folds away. */
export const MENU_CAP = 12;

export interface NavGroup {
  readonly title: string;
  readonly items: readonly { readonly to: string }[];
}

/**
 * Which sections fold. A section folds when it has more than {@link SECTION_CAP} links; and when the whole menu is longer than
 * {@link MENU_CAP} every section with two or more links folds, so a person who sees everything (a WagonWise admin) still gets a
 * short menu. A section with a single link never folds. `groups` are the sections the person can see, already filtered.
 */
export function foldingSections(groups: readonly NavGroup[]): ReadonlySet<string> {
  const total = groups.reduce((sum, g) => sum + g.items.length, 0);
  return new Set(
    groups
      .filter((g) => (total > MENU_CAP ? g.items.length >= 2 : g.items.length > SECTION_CAP))
      .map((g) => g.title),
  );
}

/** Whether `pathname` is the link `to` or a page beneath it (so /fleet/jobs/123 belongs to /fleet/jobs). */
const onLink = (pathname: string, to: string): boolean =>
  pathname === to || pathname.startsWith(`${to}/`);

/** The section holding the page being viewed, so it opens by itself. The longest matching link wins. */
export function sectionForPath(groups: readonly NavGroup[], pathname: string): string | undefined {
  let best: { title: string; length: number } | undefined;
  for (const group of groups) {
    for (const item of group.items) {
      if (onLink(pathname, item.to) && (best === undefined || item.to.length > best.length)) {
        best = { title: group.title, length: item.to.length };
      }
    }
  }
  return best?.title;
}

/**
 * The section left open after a click on `title`: opening one closes the others; clicking the open one closes it. Only one is
 * ever open.
 */
export function toggled(open: string | undefined, title: string): string | undefined {
  return open === title ? undefined : title;
}
