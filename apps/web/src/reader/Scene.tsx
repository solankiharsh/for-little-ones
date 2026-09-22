export type SceneTone = "dusk" | "night" | "dawn";

const TONES: Record<SceneTone, { sky: [string, string]; moon: string; moonInner: string; hillBack: string; hillMid: string; hillFront: string; star: string }> = {
  dusk:  { sky: ["#2b1431", "#4a1a3a"], moon: "#f5e9c4", moonInner: "#7a2f3a", hillBack: "#3a1730", hillMid: "#2b0f24", hillFront: "#1a0818", star: "rgba(255,244,214,0.55)" },
  night: { sky: ["#0e1020", "#1c1530"], moon: "#fff6d8", moonInner: "#3a2f52", hillBack: "#221a38", hillMid: "#160f26", hillFront: "#0a0615", star: "rgba(255,246,216,0.8)" },
  dawn:  { sky: ["#3a1a3a", "#7a2f3a"], moon: "#ffedc0", moonInner: "#8a3a4a", hillBack: "#4a1f36", hillMid: "#331430", hillFront: "#1d0a1c", star: "rgba(255,237,192,0.4)" },
};

export function toneForPage(pageNumber: number): SceneTone {
  const n = pageNumber - 1;
  if (n % 3 === 0) return "dusk";
  if (n % 3 === 1) return "night";
  return "dawn";
}

export function frameOf(pageNumber: number): number {
  return pageNumber;
}

export function Scene({ tone, pageNumber }: { tone: SceneTone; pageNumber: number }) {
  const p = TONES[tone];
  const frame = frameOf(pageNumber);
  return (
    <svg viewBox="0 0 300 300" role="img" aria-label={`Illustration for page ${pageNumber}`} preserveAspectRatio="xMidYMid slice" className="flo-scene-svg">
      <defs>
        <linearGradient id={`sky-${tone}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.sky[0]} />
          <stop offset="100%" stopColor={p.sky[1]} />
        </linearGradient>
      </defs>
      <rect width="300" height="300" fill={`url(#sky-${tone})`} />
      <g fill={p.star}>
        {[12, 40, 71, 96, 158, 210, 246, 278].map((x, i) => {
          const y = 18 + ((frame * 13 + i * 23) % 90);
          return <circle key={i} cx={x} cy={y} r={i % 2 ? 1.2 : 1.6} />;
        })}
      </g>
      <circle cx="150" cy="120" r="52" fill={p.moon} />
      <g transform="translate(142 132)" stroke={p.moonInner} strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M0 20 L-8 2 L-2 0 L0 6 L2 0 L8 2 Z" fill={p.moonInner} stroke="none" />
        <path d="M0 16 Q6 4 14 2" />
        <path d="M0 16 Q-6 4 -14 2" />
        <path d="M0 22 L2 32 M0 28 L6 40 M0 28 L-6 40" />
      </g>
      <path d="M0 200 Q75 150 150 192 Q225 176 300 190 L300 300 L0 300 Z" fill={p.hillBack} />
      <path d="M0 230 Q90 196 180 226 Q250 240 300 222 L300 300 L0 300 Z" fill={p.hillMid} />
      <path d="M0 262 Q100 238 190 260 Q260 276 300 258 L300 300 L0 300 Z" fill={p.hillFront} />
      <text x="24" y="286" fill="rgba(255,255,255,0.28)" fontSize="12" fontFamily="Inter, ui-sans-serif">F.{String(frame).padStart(3, "0")}</text>
    </svg>
  );
}
