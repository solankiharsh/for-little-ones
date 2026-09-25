import { ShaderGradient, ShaderGradientCanvas } from "@shadergradient/react";
import { useReducedMotion } from "motion/react";

export default function HeroShaderBackdrop() {
  const reduced = useReducedMotion();

  return (
    <div className="flo-hero-shader" aria-hidden="true">
      <ShaderGradientCanvas pixelDensity={1} fov={45} style={{ width: "100%", height: "100%" }}>
        <ShaderGradient
          animate={reduced ? "off" : "on"}
          type="plane"
          color1="#f6efe0"
          color2="#eec184"
          color3="#d9a86a"
          uSpeed={reduced ? 0 : 0.5}
          uStrength={0.65}
          uFrequency={2.2}
          cDistance={18}
          cPolarAngle={100}
          lightType="3d"
          brightness={1.5}
          grain="off"
          reflection={0}
        />
      </ShaderGradientCanvas>
    </div>
  );
}