import { usePersonalization } from "./personalization";

/**
 * From screen to keepsake (§12): the flat spread becomes a hardcover object.
 * CSS perspective shift on scroll — no product grid, the book is the object.
 */
export default function Keepsake() {
  const { heroName, dedication } = usePersonalization();
  return (
    <section className="flo-keepsake" aria-label="A keepsake to hold" id="story-keepsake">
      <div className="flo-screen">
        <div className="flo-keepsake-object">
          <div className="flo-book-3d" role="img" aria-label={`Hardcover book personalised for ${heroName}`}>
            <span className="flo-book-spine" aria-hidden="true" />
            <span className="flo-book-front">
              <small>Made for {heroName}</small>
              <strong>{heroName}&rsquo;s Storybook</strong>
              <em>A keepsake, printed to last</em>
            </span>
          </div>
          <ul className="flo-keepsake-facts">
            <li>Hardcover, premium print</li>
            <li>Personalised cover with {heroName}&rsquo;s name</li>
            {dedication.trim() ? <li>Dedication page, in your words</li> : <li>Optional dedication page</li>}
            <li>Beautiful full-page illustrations</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
