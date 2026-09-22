import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { motion, useReducedMotion } from "motion/react";
import { sampleBook, sampleChild, samplePrintSpec } from "./data/sample-book";
import BookReader from "./reader/BookReader";

const STUDIO = "For Little One";
const SAMPLE_TITLE = sampleBook.metadata.title ?? "The Fox Who Lost the Moon";

function Logo() {
  return (
    <motion.a
      className="flo-logo"
      href="#top"
      aria-label={`${STUDIO} — home`}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
    >
      <svg className="flo-logo-mark" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M20.5 7.6 12 12 3.5 7.6 4 9l8 4.4L20 9l.5-1.4z"
          fill="currentColor"
          opacity={0.9}
        />
        <path d="M5 10.2v5.9l7 3.3v-6l-7-3.2z" fill="currentColor" opacity={0.62} />
        <path d="M19 10.2v5.9l-7 3.3v-6l7-3.2z" fill="currentColor" opacity={0.78} />
      </svg>
      <span className="flo-logo-type">For&nbsp;Little&nbsp;One</span>
    </motion.a>
  );
}

export default function App() {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<"idle" | "reader">("idle");
  const [previewTitle, setPreviewTitle] = useState(SAMPLE_TITLE);
  const previewRef = useRef<HTMLDivElement>(null);
  const previewTriggerRef = useRef<HTMLElement | null>(null);

  const open = useCallback(() => {
    document.getElementById("story-worlds")?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }, [reduced]);

  const close = useCallback(() => {
    setPhase("idle");
    window.requestAnimationFrame(() => previewTriggerRef.current?.focus());
  }, []);

  const previewStory = useCallback((title: string, trigger?: HTMLElement) => {
    previewTriggerRef.current = trigger ?? null;
    setPreviewTitle(title);
    setPhase("reader");
  }, []);

  useEffect(() => {
    if (phase === "reader") previewRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [phase]);

  const trapPreviewFocus = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = [...(previewRef.current?.querySelectorAll<HTMLElement>("button, [href], input, textarea, select, [tabindex]:not([tabindex='-1'])") ?? [])];
    if (controls.length === 0) return;
    const first = controls[0]!;
    const last = controls.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, [close]);

  const previewBook = useMemo(
    () => ({
      ...sampleBook,
      metadata: { ...sampleBook.metadata, title: previewTitle },
      pages: sampleBook.pages.map((page) => page.pageNumber === 1
        ? { ...page, textBlocks: page.textBlocks.map((block) => block.kind === "cover-title" ? { ...block, text: previewTitle } : block) }
        : page),
    }),
    [previewTitle],
  );

  return (
    <div className="flo-site">
      <a className="flo-skip" href="#story">
        Skip to the reader
      </a>

      <motion.header
        className="flo-mast"
        initial={reduced ? false : { y: -28, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
      >
        <div className="flo-mast-inner">
          <Logo />
          <nav className="flo-mast-nav" aria-label="Primary">
            <a href="#how">How it works</a>
            <a href="#story">Your book</a>
            <a href="#about">The studio</a>
          </nav>
          <motion.button
            type="button"
            className="flo-btn flo-btn-primary"
            onClick={open}
            {...(reduced ? {} : { whileHover: { scale: 1.03 }, whileTap: { scale: 0.96 } })}
          >
            Make <span className="flo-btn-arrow" aria-hidden="true">→</span>
          </motion.button>
        </div>
      </motion.header>

      <main id="story">
        {/* ============ hero ============ */}
        <section className="flo-hero" id="top" aria-label="What we make">
          <div className="flo-hero-inner">
            <div className="flo-hero-copy">
              <p className="flo-kicker">A story made for one child</p>
              <h1 className="flo-hero-title">
                Every child deserves{" "}
                <em className="flo-hero-title-em">a book that’s theirs</em>.
              </h1>
              <p className="flo-hero-sub">
                A real, printed picture book — written around exactly one child,
                illustrated in a single warm world, and bound in a hardcover
                that arrives at your door.
              </p>
              <div className="flo-hero-actions">
                <button type="button" className="flo-btn flo-btn-primary flo-btn-lg" onClick={open}>
                  Start their story <span className="flo-btn-arrow" aria-hidden="true">→</span>
                </button>
                <a href="#story-worlds" className="flo-btn flo-btn-ghost">
                  Explore story worlds
                </a>
              </div>
              <p className="flo-hero-note">
                6 × 8&nbsp;in · 210 × 210&nbsp;mm hardcover · printed &
                bound to order
              </p>
            </div>

            <div className="flo-hero-book" aria-label="A printed picture book standing on a warm desk">
              <div className="flo-desk-rim" aria-hidden="true" />
              {reduced ? (
                <div className="flo-book-prop">
                  <div className="flo-book-prop-spine" />
                  <div className="flo-book-prop-cover">
                    <span className="flo-book-prop-title">The Fox Who Lost the Moon</span>
                    <span className="flo-book-prop-byline">for Ava · a bedtime story</span>
                  </div>
                  <div className="flo-book-prop-foot" />
                </div>
              ) : (
                <motion.div
                  className="flo-hero-video-frame"
                  initial={{ opacity: 0, y: 26 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.25 }}
                >
                  <video
                    autoPlay
                    muted
                    playsInline
                    preload="metadata"
                    aria-label="A personalised colouring book transforming into a finished book"
                    onLoadedMetadata={({ currentTarget }) => {
                      currentTarget.currentTime = 15;
                    }}
                    onEnded={({ currentTarget }) => {
                      currentTarget.currentTime = 15;
                      void currentTarget.play();
                    }}
                  >
                    <source src="/demo/story-worlds-hero.mp4#t=15" type="video/mp4" />
                  </video>
                </motion.div>
              )}
            </div>
          </div>
        </section>

        {/* ============ how it works ============ */}
        <section className="flo-how" id="how" aria-label="How it works">
          <div className="flo-how-inner">
            <p className="flo-kicker">How it works</p>
            <h2 className="flo-how-title">
              Told once, told true — <em>for one reader</em>.
            </h2>
            <ol className="flo-how-list">
              <li className="flo-how-item">
                <span className="flo-how-num">01</span>
                <h3>Tell us about them</h3>
                <p>
                  A few warm details — their name, the things they love, their
                  small quirks — shape the whole story.
                </p>
              </li>
              <li className="flo-how-item">
                <span className="flo-how-num">02</span>
                <h3>We write and illustrate it</h3>
                <p>
                  Your child becomes the main character of a hand-illustrated
                  story, drawn in one consistent world.
                </p>
              </li>
              <li className="flo-how-item">
                <span className="flo-how-num">03</span>
                <h3>We print a real book</h3>
                <p>
                  210&nbsp;mm hardcover, printed edge to edge, bound and
                  finished with the care of a real children’s book.
                </p>
              </li>
            </ol>
          </div>
        </section>

        <section className="flo-process" aria-label="How a child becomes the hero of a book">
          <div className="flo-process-inner">
            <div className="flo-process-copy">
              <p className="flo-kicker">A story, in motion</p>
              <h2>Little details become a world they recognise.</h2>
              <p>
                The experience should show the transformation, not explain the technology:
                a few familiar details become a character, then a story, then a book to keep.
              </p>
            </div>
            <div className="flo-process-film" aria-label="A child profile transforming into a finished book">
              <motion.div
                className="flo-process-card flo-process-profile"
                animate={{ y: [0, -8, 0], rotate: [-2, 1, -2] }}
                transition={{ duration: 5.4, repeat: Infinity, ease: "easeInOut" }}
              >
                <span className="flo-process-portrait" aria-hidden="true">M</span>
                <span>Mira likes foxes, rainy windows and moon stones.</span>
              </motion.div>
              <motion.div
                className="flo-process-spark flo-process-spark-one"
                animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1.15, 0.8] }}
                transition={{ duration: 2.3, repeat: Infinity, ease: "easeInOut" }}
                aria-hidden="true"
              >
                ✦
              </motion.div>
              <motion.div
                className="flo-process-card flo-process-page"
                animate={{ y: [0, 7, 0], rotate: [3, -1, 3] }}
                transition={{ duration: 5.8, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
              >
                <span className="flo-process-line flo-process-line-short" />
                <span className="flo-process-line" />
                <span className="flo-process-line" />
                <span className="flo-process-mini-scene" aria-hidden="true" />
              </motion.div>
              <motion.div
                className="flo-process-card flo-process-finished"
                animate={{ y: [0, -10, 0], rotate: [-4, -1, -4] }}
                transition={{ duration: 5.1, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
              >
                <span>The Fox Who<br />Lost the Moon</span>
                <i aria-hidden="true" />
              </motion.div>
            </div>
          </div>
        </section>

        <section className="flo-worlds" id="story-worlds" aria-label="Story world examples">
          <div className="flo-worlds-inner">
            <div className="flo-worlds-head">
              <div>
                <p className="flo-kicker">A place to begin</p>
                <h2>Start with a world they already love.</h2>
              </div>
              <p>
                A bedtime question, a favourite creature, a family in-joke. Pick a spark,
                then we make the story unmistakably theirs.
              </p>
            </div>
            <div className="flo-world-grid">
              <button type="button" className="flo-world flo-world-night" onClick={(event) => previewStory("The Moon That Followed Home", event.currentTarget)}>
                <span className="flo-world-kicker">Bedtime wonder</span>
                <h3>The moon that followed home</h3>
                <p>For the child who always has one more question about the sky.</p>
                <span className="flo-world-preview">Open preview <span aria-hidden="true">→</span></span>
              </button>
              <button type="button" className="flo-world flo-world-garden" onClick={(event) => previewStory("The Secret Garden Map", event.currentTarget)}>
                <span className="flo-world-kicker">Small adventures</span>
                <h3>The secret garden map</h3>
                <p>A rainy-day expedition with a brave companion and a pocketful of clues.</p>
                <span className="flo-world-preview">Open preview <span aria-hidden="true">→</span></span>
              </button>
              <button type="button" className="flo-world flo-world-sea" onClick={(event) => previewStory("The Lighthouse That Sang", event.currentTarget)}>
                <span className="flo-world-kicker">Big imagination</span>
                <h3>The lighthouse that sang</h3>
                <p>A sea-swept story for a little explorer who never misses a wave.</p>
                <span className="flo-world-preview">Open preview <span aria-hidden="true">→</span></span>
              </button>
            </div>
            <div className="flo-world-actions">
              <button type="button" className="flo-btn flo-btn-ghost" onClick={(event) => previewStory(SAMPLE_TITLE, event.currentTarget)}>See a sample story <span className="flo-btn-arrow" aria-hidden="true">→</span></button>
              <button type="button" className="flo-btn flo-btn-primary flo-btn-lg" onClick={open}>Create their own <span className="flo-btn-arrow" aria-hidden="true">→</span></button>
            </div>
          </div>
        </section>

        {/* ============ studio / trust ============ */}
        <section className="flo-about" id="about" aria-label="The studio">
          <div className="flo-about-inner">
            <p className="flo-kicker">The studio</p>
            <h2 className="flo-about-title">
              Honestly, purely, <em>for one little one.</em>
            </h2>
            <p className="flo-about-body">
              For Little One is a small studio making personalised picture books.
              No templates — every story is written and illustrated around
              exactly the child it’s for, and printed as a real book they can
              hold, keep, and read over and over.
            </p>
            <div className="flo-about-facts">
              <div className="flo-fact">
                <span className="flo-fact-num">21</span>
                <span className="flo-fact-label">illustrated pages</span>
              </div>
              <div className="flo-fact">
                <span className="flo-fact-num">210&nbsp;mm</span>
                <span className="flo-fact-label">hardcover trim</span>
              </div>
              <div className="flo-fact">
                <span className="flo-fact-num">300&nbsp;dpi</span>
                <span className="flo-fact-label">print resolution</span>
              </div>
              <div className="flo-fact">
                <span className="flo-fact-num">∞</span>
                <span className="flo-fact-label">reads ahead</span>
              </div>
            </div>
          </div>
        </section>

        <section className="flo-stories" aria-label="Books made to be kept">
          <div className="flo-stories-inner">
            <div>
              <p className="flo-kicker">Made for their shelf</p>
              <h2>Not a novelty. A little piece of their childhood.</h2>
            </div>
            <p className="flo-stories-intro">
              A lasting book should feel personal on every read: the familiar detail,
              the character they know, the page they insist on turning again.
            </p>
            <div className="flo-memory-grid" aria-label="Prototype image slots for family reading moments">
              <article className="flo-memory flo-memory-one"><span>After the third bedtime read</span></article>
              <article className="flo-memory flo-memory-two"><span>A book with their name on it</span></article>
              <article className="flo-memory flo-memory-three"><span>One more page, please</span></article>
            </div>
            <p className="flo-stories-note">Prototype image slots. Replace with consented customer photography before launch.</p>
          </div>
        </section>
      </main>

      {phase === "reader" && (
        <div className="flo-preview-overlay" role="dialog" aria-modal="true" aria-label={`${previewTitle} preview`} onKeyDown={trapPreviewFocus}>
          <div className="flo-preview-modal" ref={previewRef}>
            <p className="flo-preview-kicker">Preview: {previewTitle}</p>
            <BookReader
              book={previewBook}
              child={sampleChild}
              printSpec={samplePrintSpec}
              onExit={close}
            />
          </div>
        </div>
      )}

      <footer className="flo-foot" id="foot">
        <div className="flo-foot-inner">
          <div className="flo-foot-brand">
            <Logo />
            <p className="flo-foot-note">
              Personalised picture books, written and illustrated for one child,
              printed as real hardcovers. Made in the West of England, mailed
              anywhere a bed-time story is read.
            </p>
          </div>
          <nav className="flo-foot-nav" aria-label="Footer">
            <a href="#how">How it works</a>
            <a href="#story-worlds">Story worlds</a>
            <a href="#about">The studio</a>
            <a href="#top">Back to top</a>
          </nav>
          <div className="flo-foot-meta">
            <span>© 2026 For Little One</span>
            <span>US & INT shipping</span>
            <span>Handmade · hardcover</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
