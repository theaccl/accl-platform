"use client";

import React, { useRef, useMemo, useCallback, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { cn } from "@/lib/utils";
import * as THREE from "three";

export interface BlurredRaysProps {
  /** Container width */
  width?: string | number;
  /** Container height */
  height?: string | number;
  /** Additional CSS classes */
  className?: string;
  /** Content rendered above the effect */
  children?: React.ReactNode;
  /** Overall animation speed multiplier */
  speed?: number;
  /** Rate at which individual rays flicker */
  flickerRate?: number;
  /** Total number of light beams */
  rayCount?: number;
  /** Horizontal gap between adjacent rays */
  raySpacing?: number;
  /** Base thickness of each ray */
  rayThickness?: number;
  /** Blur radius at ray edges */
  edgeSoftness?: number;
  /** Amplitude of width oscillation (0–1) */
  widthPulse?: number;
  /** Minimum width baseline */
  widthBase?: number;
  /** Horizontal stretch factor */
  horizontalScale?: number;
  /** Vertical shift of the ray field */
  verticalOffset?: number;
  /** X position where rays originate */
  originX?: number;
  /** Red channel color modulation intensity */
  colorShiftR?: number;
  /** Green channel color modulation intensity */
  colorShiftG?: number;
  /** Blue channel color modulation intensity */
  colorShiftB?: number;
  /** Top edge fade distance */
  vignetteTop?: number;
  /** Bottom edge fade distance */
  vignetteBottom?: number;
  /** Left edge fade distance */
  vignetteLeft?: number;
  /** Right edge fade distance */
  vignetteRight?: number;
  /** Glow / bloom multiplier */
  bloom?: number;
  /** Overall brightness */
  brightness?: number;
  /** Background color in hex */
  backgroundColor?: string;
  /** Master opacity */
  opacity?: number;
  /** Enable cursor interaction to shift the ray origin */
  cursorInteraction?: boolean;
}

const vertexSource = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentSource = `
precision highp float;

varying vec2 vUv;

uniform float uElapsed;
uniform vec2 uViewport;
uniform float uTempo;
uniform float uFlicker;
uniform float uBeamTotal;
uniform float uBeamGap;
uniform float uBeamWidth;
uniform float uSoftness;
uniform float uWidthPulse;
uniform float uWidthFloor;
uniform float uScaleX;
uniform float uShiftY;
uniform float uOriginX;
uniform float uChromaR;
uniform float uChromaG;
uniform float uChromaB;
uniform float uMaskTop;
uniform float uMaskBottom;
uniform float uMaskLeft;
uniform float uMaskRight;
uniform float uBloom;
uniform float uLuminance;
uniform vec3 uBgColor;
uniform float uAlpha;
uniform vec2 uPointer;
uniform float uCursorActive;

float prng(vec2 s) {
  s = fract(s * vec2(198.75, 743.26));
  s += dot(s, s + 67.41);
  return fract(s.x * s.y);
}

float pulse(float id, float t, float rate) {
  float e = prng(vec2(id * 341.7, id * 527.3));
  return clamp(sin(t * id * rate * e) * 0.5 + 0.5, 0.0, 1.0);
}

void main() {
  float ar = uViewport.x / uViewport.y;
  vec2 p = (vUv - 0.5) * vec2(ar, 1.0);

  p.x *= uScaleX;
  p.y += uShiftY;

  float t = uElapsed * uTempo;
  vec3 rays = vec3(0.0);

  for (float n = 0.0; n < 128.0; n += 1.0) {
    if (n >= uBeamTotal) break;

    float idx = n * 2.0;
    float rng = prng(vec2(idx, 382.91));
    float thickness = uBeamWidth * (sin(t * rng) * uWidthPulse + uWidthFloor);
    float blur = uSoftness * (sin(t * rng) * uWidthPulse + uWidthFloor);

    float midPoint = uBeamTotal * 0.5;
    float pointerShift = (uPointer.x - 0.5) * 4.0 * uCursorActive;
    float xPos = (n - midPoint) * uBeamGap + uOriginX + pointerShift;
    float beam = smoothstep(thickness + blur, thickness, abs(p.x - xPos));

    rays += beam * pulse(2.0 + idx * 0.02, t, uFlicker);
  }

  rays.r -= pulse(4.0, t, uFlicker) * uChromaR;
  rays.g -= pulse(5.0, t, uFlicker) * uChromaG;
  rays.b -= pulse(6.0, t, uFlicker) * uChromaB;

  rays *= smoothstep(-uMaskBottom, 0.0, p.y);
  rays *= smoothstep(0.0, -uMaskTop, p.y);
  rays *= smoothstep(-uMaskLeft, 1.0, p.x);
  rays *= smoothstep(uMaskRight, -1.0, p.x);

  rays += rays * uBloom;
  rays *= uLuminance;

  vec3 result = uBgColor + rays;
  gl_FragColor = vec4(result, uAlpha);
}
`;

function parseHexColor(hex: string): [number, number, number] {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!match) return [0, 0, 0];
  return [
    parseInt(match[1], 16) / 255,
    parseInt(match[2], 16) / 255,
    parseInt(match[3], 16) / 255,
  ];
}

interface RaySceneProps {
  speed: number;
  flickerRate: number;
  rayCount: number;
  raySpacing: number;
  rayThickness: number;
  edgeSoftness: number;
  widthPulse: number;
  widthBase: number;
  horizontalScale: number;
  verticalOffset: number;
  originX: number;
  colorShiftR: number;
  colorShiftG: number;
  colorShiftB: number;
  vignetteTop: number;
  vignetteBottom: number;
  vignetteLeft: number;
  vignetteRight: number;
  bloom: number;
  brightness: number;
  backgroundColor: string;
  opacity: number;
  pointer: [number, number];
  cursorInteraction: boolean;
}

const RayScene: React.FC<RaySceneProps> = ({
  speed,
  flickerRate,
  rayCount,
  raySpacing,
  rayThickness,
  edgeSoftness,
  widthPulse,
  widthBase,
  horizontalScale,
  verticalOffset,
  originX,
  colorShiftR,
  colorShiftG,
  colorShiftB,
  vignetteTop,
  vignetteBottom,
  vignetteLeft,
  vignetteRight,
  bloom,
  brightness,
  backgroundColor,
  opacity,
  pointer,
  cursorInteraction,
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const { size } = useThree();
  const smoothPointer = useRef(new THREE.Vector2(0.5, 0.5));

  const shaderUniforms = useMemo(
    () => ({
      uElapsed: { value: 0 },
      uViewport: { value: new THREE.Vector2(1, 1) },
      uTempo: { value: 1 },
      uFlicker: { value: 1.4 },
      uBeamTotal: { value: 32 },
      uBeamGap: { value: 0.2 },
      uBeamWidth: { value: 0.1 },
      uSoftness: { value: 0.3 },
      uWidthPulse: { value: 0.5 },
      uWidthFloor: { value: 0.6 },
      uScaleX: { value: 4.5 },
      uShiftY: { value: -0.5 },
      uOriginX: { value: 3.2 },
      uChromaR: { value: 1 },
      uChromaG: { value: 1 },
      uChromaB: { value: 1 },
      uMaskTop: { value: 0.95 },
      uMaskBottom: { value: 0.95 },
      uMaskLeft: { value: 5 },
      uMaskRight: { value: 5 },
      uBloom: { value: 2 },
      uLuminance: { value: 1 },
      uBgColor: { value: new THREE.Vector3(0, 0, 0) },
      uAlpha: { value: 1 },
      uPointer: { value: new THREE.Vector2(0.5, 0.5) },
      uCursorActive: { value: 0 },
    }),
    [],
  );

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    const mat = meshRef.current.material as THREE.ShaderMaterial;

    mat.uniforms.uElapsed.value = state.clock.elapsedTime;
    mat.uniforms.uViewport.value.set(size.width, size.height);
    mat.uniforms.uTempo.value = speed;
    mat.uniforms.uFlicker.value = flickerRate;
    mat.uniforms.uBeamTotal.value = rayCount;
    mat.uniforms.uBeamGap.value = raySpacing;
    mat.uniforms.uBeamWidth.value = rayThickness;
    mat.uniforms.uSoftness.value = edgeSoftness;
    mat.uniforms.uWidthPulse.value = widthPulse;
    mat.uniforms.uWidthFloor.value = widthBase;
    mat.uniforms.uScaleX.value = horizontalScale;
    mat.uniforms.uShiftY.value = verticalOffset;
    mat.uniforms.uOriginX.value = originX;
    mat.uniforms.uChromaR.value = colorShiftR;
    mat.uniforms.uChromaG.value = colorShiftG;
    mat.uniforms.uChromaB.value = colorShiftB;
    mat.uniforms.uMaskTop.value = vignetteTop;
    mat.uniforms.uMaskBottom.value = vignetteBottom;
    mat.uniforms.uMaskLeft.value = vignetteLeft;
    mat.uniforms.uMaskRight.value = vignetteRight;
    mat.uniforms.uBloom.value = bloom;
    mat.uniforms.uLuminance.value = brightness;
    mat.uniforms.uBgColor.value.set(...parseHexColor(backgroundColor));
    mat.uniforms.uAlpha.value = opacity;
    mat.uniforms.uCursorActive.value = cursorInteraction ? 1 : 0;

    const ease = 1 - Math.exp(-delta / 0.15);
    smoothPointer.current.x += (pointer[0] - smoothPointer.current.x) * ease;
    smoothPointer.current.y += (pointer[1] - smoothPointer.current.y) * ease;
    mat.uniforms.uPointer.value.set(
      smoothPointer.current.x,
      smoothPointer.current.y,
    );
  });

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        vertexShader={vertexSource}
        fragmentShader={fragmentSource}
        uniforms={shaderUniforms}
        transparent
      />
    </mesh>
  );
};

const BlurredRays: React.FC<BlurredRaysProps> = ({
  width = "100%",
  height = "100%",
  className,
  children,
  speed = 0.5,
  flickerRate = 1,
  rayCount = 25,
  raySpacing = 0.27,
  rayThickness = 0.35,
  edgeSoftness = 0.65,
  widthPulse = 0.1,
  widthBase = 0.3,
  horizontalScale = 4.6,
  verticalOffset = -0.5,
  originX = 0,
  colorShiftR = 1,
  colorShiftG = 1,
  colorShiftB = 1,
  vignetteTop = 1.3,
  vignetteBottom = 0.95,
  vignetteLeft = 3,
  vignetteRight = 3,
  bloom = 4,
  brightness = 2,
  backgroundColor = "#000000",
  opacity = 1,
  cursorInteraction = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pointer, setPointer] = useState<[number, number]>([0.5, 0.5]);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!cursorInteraction) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = 1 - (e.clientY - rect.top) / rect.height;
      setPointer([nx, ny]);
    },
    [cursorInteraction],
  );

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-hidden", className)}
      style={{ width, height }}
      onPointerMove={handlePointerMove}
    >
      <Canvas
        className="absolute inset-0"
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
        orthographic
        camera={{
          position: [0, 0, 1],
          zoom: 1,
          left: -1,
          right: 1,
          top: 1,
          bottom: -1,
        }}
      >
        <RayScene
          speed={speed}
          flickerRate={flickerRate}
          rayCount={rayCount}
          raySpacing={raySpacing}
          rayThickness={rayThickness}
          edgeSoftness={edgeSoftness}
          widthPulse={widthPulse}
          widthBase={widthBase}
          horizontalScale={horizontalScale}
          verticalOffset={verticalOffset}
          originX={originX}
          colorShiftR={colorShiftR}
          colorShiftG={colorShiftG}
          colorShiftB={colorShiftB}
          vignetteTop={vignetteTop}
          vignetteBottom={vignetteBottom}
          vignetteLeft={vignetteLeft}
          vignetteRight={vignetteRight}
          bloom={bloom}
          brightness={brightness}
          backgroundColor={backgroundColor}
          opacity={opacity}
          pointer={pointer}
          cursorInteraction={cursorInteraction}
        />
      </Canvas>
      {children && <div className="relative z-10">{children}</div>}
    </div>
  );
};

BlurredRays.displayName = "BlurredRays";

export default BlurredRays;
