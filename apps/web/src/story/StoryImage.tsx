import type { CSSProperties } from "react";
import type { StoryAsset } from "./assets";
import { refreshAfterDecode } from "./useStoryMotion";

/**
 * One image primitive for the whole story (§10): explicit dimensions against
 * CLS, lazy below the fold, eager + high fetch priority for the hero only.
 */
export default function StoryImage({
  asset,
  eager = false,
  className = "",
  style
}: {
  asset: StoryAsset;
  eager?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <img
      src={asset.src}
      width={asset.width}
      height={asset.height}
      alt={asset.alt}
      className={className}
      style={style}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={eager ? "high" : "auto"}
      onLoad={eager ? refreshAfterDecode : undefined}
    />
  );
}
