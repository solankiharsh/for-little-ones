/**
 * The emotional moment (§11): complexity stops, paper returns, copy carries.
 * Near-static by design — a single gentle fade, nothing scrubbed.
 */
export default function Emotion() {
  return (
    <section className="flo-emotion" aria-label="Why this matters">
      <p>They&rsquo;ll outgrow their shoes.</p>
      <p>Their toys.</p>
      <p>Even their favourite stories.</p>
      <p className="flo-emotion-pause" aria-hidden="true">· · ·</p>
      <p className="flo-emotion-keep">But they&rsquo;ll always have the one where <em>they</em> were the hero.</p>
    </section>
  );
}
