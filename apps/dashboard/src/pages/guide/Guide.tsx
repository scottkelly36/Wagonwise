import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { GUIDE, guideSection, searchGuide, type GuideSection } from '../../lib/guide';

/** The staff guide, at `/guide` (the contents) and `/guide/:id` (one section). Behind the staff sign-in like every page here. */
export function Guide() {
  const { id } = useParams();
  const [query, setQuery] = useState('');
  const section = guideSection(id);
  const matches = searchGuide(query);

  return (
    <div className="guide">
      <aside className="guide-contents" aria-label="Guide contents">
        <label htmlFor="guide-search" className="muted">
          Search the guide
        </label>
        <input
          id="guide-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="For example: fuel, invite"
        />
        <nav>
          {matches.map((item) => (
            <Link
              key={item.id}
              to={`/guide/${item.id}`}
              className={item.id === section?.id ? 'guide-link active' : 'guide-link'}
              data-area={item.area}
            >
              {item.title}
            </Link>
          ))}
          {matches.length === 0 && <p className="muted">Nothing matches that.</p>}
        </nav>
      </aside>

      <article className="guide-body">
        {id !== undefined && section === undefined ? (
          <>
            <h1>Not in the guide</h1>
            <p>
              There is no section called “{id}”. <Link to="/guide">Back to the contents</Link>.
            </p>
          </>
        ) : section === undefined ? (
          <Contents />
        ) : (
          <Section section={section} />
        )}
      </article>
    </div>
  );
}

function Contents() {
  return (
    <>
      <h1>Staff guide</h1>
      <p className="muted">
        What each page is for and how to use it. Each page has a “Guide for this page” link at the
        top that brings you here.
      </p>
      <p>
        New here? Start with <Link to="/guide/start">Getting started</Link>.
      </p>
      <div className="guide-cards">
        {GUIDE.map((item) => (
          <Link key={item.id} to={`/guide/${item.id}`} className="guide-card" data-area={item.area}>
            <strong>{item.title}</strong>
            <span>{item.summary}</span>
          </Link>
        ))}
      </div>
    </>
  );
}

function Section({ section }: { readonly section: GuideSection }) {
  const index = GUIDE.findIndex((item) => item.id === section.id);
  const previous = GUIDE[index - 1];
  const next = GUIDE[index + 1];
  return (
    <>
      <p className="muted">
        <Link to="/guide">Guide</Link> / {section.title}
      </p>
      <h1>{section.title}</h1>
      <p className="guide-access">
        <strong>Who can use it:</strong> {section.access}
      </p>
      {section.about.map((text) => (
        <p key={text}>{text}</p>
      ))}
      {section.steps.map((group) => (
        <section key={group.heading} className="card guide-steps">
          <h2>{group.heading}</h2>
          <ol>
            {group.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      ))}
      {section.tips.length > 0 && (
        <section className="guide-tips">
          <h2>Worth knowing</h2>
          <ul>
            {section.tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </section>
      )}
      <p className="guide-pager">
        {previous !== undefined ? (
          <Link to={`/guide/${previous.id}`}>← {previous.title}</Link>
        ) : (
          <span />
        )}
        {next !== undefined ? <Link to={`/guide/${next.id}`}>{next.title} →</Link> : <span />}
      </p>
    </>
  );
}
