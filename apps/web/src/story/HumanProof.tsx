import { ASSETS } from "./assets";
import StoryImage from "./StoryImage";

/**
 * Human proof (§K): family life, art-magazine layout — large portrait left,
 * two smaller frames upper/lower right, asymmetric overlap, fragment captions.
 */
export default function HumanProof() {
  return (
    <section className="flo-proof" aria-label="Part of family life">
      <figure className="flo-proof-large">
        <StoryImage asset={ASSETS.memoryReadingTogether} />
        <figcaption>After the third bedtime read</figcaption>
      </figure>
      <div className="flo-proof-side">
        <figure>
          <StoryImage asset={ASSETS.memoryPride} />
          <figcaption>A book with their name on it</figcaption>
        </figure>
        <figure>
          <StoryImage asset={ASSETS.memoryOneMorePage} />
          <figcaption>One more page, please</figcaption>
        </figure>
      </div>
    </section>
  );
}
