/**
 * Tiny SVG utilities only: the story emblem and nothing that pretends to be a scene.
 * Story scenery comes from the generated image library (see assets.ts).
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
