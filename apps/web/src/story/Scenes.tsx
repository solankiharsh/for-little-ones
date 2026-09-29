/**
 * Hand-drawn SVG storybook scenes. No stock, no gradients-for-decoration:
 * flat storybook shapes in the section palette, layered for parallax
 * (foreground / mid / background groups carry data-depth for the scroll code).
 */

export function Emblem({ className = "" }: { className?: string }) {
  return (
    <svg className={`flo-emblem ${className}`} viewBox="0 0 48 48" aria-hidden="true">
      <path
        d="M24 4c.9 9.6 4.4 14.6 6.8 16.4 2.1 1.6 7.3 3 13.2 3.6-5.9.6-11.1 2-13.2 3.6-2.4 1.8-5.9 6.8-6.8 16.4-.9-9.6-4.4-14.6-6.8-16.4-2.1-1.6-7.3-3-13.2-3.6 5.9-.6 11.1-2 13.2-3.6C19.6 18.6 23.1 13.6 24 4z"
        fill="currentColor"
      />
      <circle cx="38" cy="10" r="2.2" fill="currentColor" opacity={0.7} />
      <circle cx="10" cy="36" r="1.6" fill="currentColor" opacity={0.55} />
    </svg>
  );
}

export function MoonDial() {
  return (
    <svg className="flo-moon" viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r="34" fill="var(--story-gold)" />
      <circle cx="72" cy="50" r="30" fill="var(--story-night)" opacity={0.92} />
      <circle cx="30" cy="26" r="2" fill="var(--story-gold)" opacity={0.8} />
      <circle cx="96" cy="88" r="1.6" fill="var(--story-gold)" opacity={0.7} />
      <circle cx="88" cy="20" r="1.3" fill="var(--story-paper)" opacity={0.8} />
    </svg>
  );
}

/** The child, always: a warm medallion with their initial at the centre. */
export function HeroMedallion({ name, photo, size = 148 }: { name: string; photo?: string | undefined; size?: number }) {
  const initial = (name.trim()[0] ?? "✦").toUpperCase();
  return (
    <span className="flo-hero-medallion" style={{ width: size, height: size }} aria-hidden="true">
      {photo ? (
        // eslint-disable-next-line jsx-a11y/img-redundant-alt
        <img src={photo} alt="" />
      ) : (
        <span className="flo-hero-initial">{initial}</span>
      )}
      <Emblem className="flo-hero-spark" />
    </span>
  );
}

export interface WorldDef {
  id: string;
  title: string;
  blurb: string;
  sky: string;
  ground: string;
  accent: string;
}

export const WORLDS: WorldDef[] = [
  { id: "space", title: "Space Explorer", blurb: "Rocket trails and quiet moons.", sky: "#1d2440", ground: "#3a4668", accent: "#d9b36a" },
  { id: "forest", title: "Enchanted Forest", blurb: "Lanterns between old trees.", sky: "#22392e", ground: "#3d5a40", accent: "#e8d9a8" },
  { id: "dino", title: "Dinosaur Adventure", blurb: "Gentle giants, warm valleys.", sky: "#7a5c3e", ground: "#4d6b3c", accent: "#f0e3bb" },
  { id: "sea", title: "Under the Sea", blurb: "Slow light through blue water.", sky: "#17384a", ground: "#1f5a6e", accent: "#cfe3d8" },
  { id: "kingdom", title: "Magical Kingdom", blurb: "Banners over a sleepy castle.", sky: "#3a2d55", ground: "#5a4a7a", accent: "#e3b7c2" }
];

/** Layered world composition: background slowest, foreground fastest. */
export function WorldScene({ world, heroName, photo }: { world: WorldDef; heroName: string; photo?: string | undefined }) {
  return (
    <svg className="flo-world-scene" viewBox="0 0 800 500" role="img" aria-label={`${world.title} story world preview`}>
      <rect width="800" height="500" fill={world.sky} />
      <g className="flo-layer" data-depth="0.15">
        <circle cx="640" cy="110" r="46" fill={world.accent} opacity={0.9} />
        <circle cx="120" cy="80" r="2.4" fill="#fff" opacity={0.8} />
        <circle cx="250" cy="140" r="1.8" fill="#fff" opacity={0.6} />
        <circle cx="420" cy="70" r="2" fill="#fff" opacity={0.7} />
        <circle cx="540" cy="180" r="1.6" fill="#fff" opacity={0.5} />
      </g>
      <g className="flo-layer" data-depth="0.4">
        <ellipse cx="200" cy="400" rx="260" ry="120" fill={world.ground} opacity={0.75} />
        <ellipse cx="640" cy="430" rx="280" ry="110" fill={world.ground} />
        {world.id === "forest" && (
          <>
            <rect x="150" y="220" width="26" height="170" rx="12" fill="#2c3a2a" />
            <circle cx="163" cy="200" r="70" fill="#476b45" />
            <rect x="600" y="240" width="30" height="160" rx="13" fill="#2c3a2a" />
            <circle cx="615" cy="218" r="78" fill="#3d5a40" />
          </>
        )}
        {world.id === "kingdom" && (
          <>
            <rect x="330" y="230" width="140" height="170" fill="#6a5a8a" />
            <polygon points="330,230 400,150 470,230" fill="#7a6a9a" />
            <rect x="392" y="90" width="16" height="70" fill="#4a3a6a" />
            <polygon points="408,90 448,102 408,114" fill={world.accent} />
          </>
        )}
      </g>
      <g className="flo-layer" data-depth="0.7">
        <ellipse cx="400" cy="470" rx="420" ry="70" fill="#000" opacity={0.18} />
        <g transform="translate(400 350)">
          <circle r="54" fill="var(--story-paper)" />
          <circle r="54" fill="none" stroke={world.accent} strokeWidth="6" />
          <text y="22" textAnchor="middle" fontSize="52" fill={world.sky} fontFamily="Georgia, serif">
            {photo ? "" : (heroName.trim()[0] ?? "✦").toUpperCase()}
          </text>
          {photo && <circle r="46" fill="none" stroke={world.accent} strokeWidth="2" strokeDasharray="6 5" />}
        </g>
      </g>
    </svg>
  );
}

/** Small ambient critters that answer personalization choices. */
export function DinoSprite() {
  return (
    <svg className="flo-sprite" viewBox="0 0 120 70" aria-hidden="true">
      <ellipse cx="55" cy="48" rx="34" ry="18" fill="currentColor" />
      <rect x="78" y="14" width="14" height="34" rx="7" fill="currentColor" />
      <circle cx="85" cy="12" r="12" fill="currentColor" />
      <circle cx="88" cy="10" r="2.4" fill="var(--story-paper)" />
      <polygon points="40,34 22,26 24,42" fill="currentColor" />
      <rect x="34" y="58" width="9" height="10" rx="4" fill="currentColor" />
      <rect x="62" y="58" width="9" height="10" rx="4" fill="currentColor" />
    </svg>
  );
}

export function PetSprite() {
  return (
    <svg className="flo-sprite" viewBox="0 0 100 70" aria-hidden="true">
      <ellipse cx="50" cy="46" rx="30" ry="16" fill="currentColor" />
      <circle cx="76" cy="30" r="14" fill="currentColor" />
      <polygon points="66,20 62,6 72,14" fill="currentColor" />
      <polygon points="86,20 90,6 80,14" fill="currentColor" />
      <rect x="28" y="56" width="8" height="10" rx="4" fill="currentColor" />
      <rect x="62" y="56" width="8" height="10" rx="4" fill="currentColor" />
      <path d="M14 44q-12 2-14 14" stroke="currentColor" strokeWidth="6" fill="none" strokeLinecap="round" />
    </svg>
  );
}
