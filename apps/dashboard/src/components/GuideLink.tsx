import { Link, useLocation } from 'react-router-dom';
import { guideIdForPath, guideSection } from '../lib/guide';

/** A link to the part of the guide for the page being viewed. Shows nothing on pages the guide does not cover. */
export function GuideLink() {
  const { pathname } = useLocation();
  const section = guideSection(guideIdForPath(pathname));
  if (section === undefined) return null;
  return (
    <p className="guide-here">
      <Link to={`/guide/${section.id}`}>Guide for this page: {section.title}</Link>
    </p>
  );
}
