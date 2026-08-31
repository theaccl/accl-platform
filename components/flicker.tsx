"use client";

import React, { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export interface FlickerProps {
  /** Additional CSS classes */
  className?: string;
  /** Spacing between particle centers in pixels */
  spacing?: number;
  /** Base size of each particle in pixels */
  particleSize?: number;
  /** Base particle color */
  color?: string;
  /** Array of colors to randomly assign to particles (overrides color) */
  colorPalette?: string[];
  /** Glow color for bright particles */
  glowColor?: string;
  /** Overall opacity of the effect */
  alpha?: number;
  /** Background overlay darkness (0-1) */
  overlay?: number;
  /** Overlay color (hex or rgb) */
  overlayColor?: string;
  /** Minimum flicker frequency */
  minFrequency?: number;
  /** Maximum flicker frequency */
  maxFrequency?: number;
  /** Overall animation rate multiplier */
  rate?: number;
  /** Shape of the particles */
  shape?: "circle" | "square";
  /** Whether to randomly offset particles from the grid */
  jitter?: boolean;
  /** Probability that a particle will flicker (0-1). 0 = static, 1 = all flicker */
  flickerChance?: number;
  /** Whether mouse proximity affects particles */
  mouseEffect?: boolean;
}

export const Flicker = ({
  className,
  spacing = 20,
  particleSize = 1.5,
  color = "#5A4B81",
  colorPalette,
  glowColor = "#FF9FFC",
  alpha = 1,
  overlay = 1,
  overlayColor = "#0a0a0a",
  minFrequency = 0.3,
  maxFrequency = 1.5,
  rate = 1,
  shape = "circle",
  jitter = false,
  flickerChance = 1.0,
  mouseEffect = false,
}: FlickerProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mouseRef = useRef({ x: -9999, y: -9999 });

  const propsRef = useRef({
    spacing,
    particleSize,
    color,
    colorPalette,
    glowColor,
    alpha,
    overlay,
    overlayColor,
    minFrequency,
    maxFrequency,
    rate,
    shape,
    jitter,
    flickerChance,
    mouseEffect,
  });

  useEffect(() => {
    propsRef.current = {
      spacing,
      particleSize,
      color,
      colorPalette,
      glowColor,
      alpha,
      overlay,
      overlayColor,
      minFrequency,
      maxFrequency,
      rate,
      shape,
      jitter,
      flickerChance,
      mouseEffect,
    };
  }, [
    spacing,
    particleSize,
    color,
    colorPalette,
    glowColor,
    alpha,
    overlay,
    overlayColor,
    minFrequency,
    maxFrequency,
    rate,
    shape,
    jitter,
    flickerChance,
    mouseEffect,
  ]);

  type Particle = {
    x: number;
    y: number;
    timeOffset: number;
    frequency: number;
    color: string;
    isFlickering: boolean;
  };

  const particlesRef = useRef<Particle[]>([]);

  const regenerateParticlesRef = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // ACCL accessibility contract: decorative motion is entirely optional.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;

    const initParticles = () => {
      const { width, height } = container.getBoundingClientRect();
      const {
        spacing,
        minFrequency,
        maxFrequency,
        jitter,
        colorPalette,
        color,
        flickerChance,
      } = propsRef.current;

      const particles: Particle[] = [];
      const columns = Math.ceil(width / spacing) + 4;
      const rows = Math.ceil(height / spacing) + 4;
      const minFreq = Math.min(minFrequency, maxFrequency);
      const maxFreq = Math.max(minFrequency, maxFrequency);
      const freqRange = Math.max(maxFreq - minFreq, 0);

      for (let col = -2; col < columns; col++) {
        for (let row = -2; row < rows; row++) {
          let x = col * spacing + (row % 2 === 0 ? 0 : spacing * 0.5);
          let y = row * spacing;

          if (jitter) {
            x += (Math.random() - 0.5) * spacing * 0.5;
            y += (Math.random() - 0.5) * spacing * 0.5;
          }

          const timeOffset = Math.random() * Math.PI * 2;
          const frequency = minFreq + Math.random() * freqRange;

          const pColor =
            colorPalette && colorPalette.length > 0
              ? colorPalette[Math.floor(Math.random() * colorPalette.length)]
              : color;

          const isFlickering = Math.random() < flickerChance;

          particles.push({
            x,
            y,
            timeOffset,
            frequency,
            color: pColor,
            isFlickering,
          });
        }
      }
      particlesRef.current = particles;
    };

    regenerateParticlesRef.current = initParticles;

    const resize = () => {
      const { width, height } = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);

      initParticles();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    resize();

    let lastTime = performance.now();
    const render = (time: number) => {
      lastTime = time;

      const {
        rate,
        mouseEffect,
        particleSize,
        shape,
        alpha,
        glowColor,
        overlay,
        overlayColor,
      } = propsRef.current;

      const { width, height } = container.getBoundingClientRect();
      ctx.clearRect(0, 0, width, height);

      ctx.save();

      const elapsed = (time / 1000) * Math.max(rate, 0);
      const particles = particlesRef.current;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        let brightness = 0.2;

        if (p.isFlickering) {
          const cycle = (elapsed * p.frequency + p.timeOffset) % 2;
          const linearValue = cycle < 1 ? cycle : 2 - cycle;
          brightness = 0.2 + 0.6 * linearValue;
        } else {
          brightness = 0.3 + Math.sin(p.timeOffset) * 0.1;
        }

        if (mouseEffect) {
          const dx = p.x - mouseRef.current.x;
          const dy = p.y - mouseRef.current.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const radius = 150;

          if (dist < radius) {
            const influence = 1 - dist / radius;
            brightness = Math.min(1, brightness + influence * 0.8);
          }
        }

        if (brightness > 0.65) {
          const glowIntensity = (brightness - 0.65) / 0.35;
          ctx.shadowColor = glowColor;
          ctx.shadowBlur = 7 * glowIntensity;
        } else {
          ctx.shadowColor = "transparent";
          ctx.shadowBlur = 0;
        }

        ctx.fillStyle = p.color;
        ctx.globalAlpha = brightness * alpha;

        if (shape === "circle") {
          ctx.beginPath();
          ctx.arc(p.x, p.y, particleSize, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(
            p.x - particleSize,
            p.y - particleSize,
            particleSize * 2,
            particleSize * 2,
          );
        }
      }
      ctx.restore();

      if (overlay > 0) {
        ctx.save();
        ctx.globalAlpha = 1;

        let r = 0,
          g = 0,
          b = 0;
        const hex = overlayColor.replace("#", "");
        if (hex.length === 6) {
          r = parseInt(hex.substring(0, 2), 16);
          g = parseInt(hex.substring(2, 4), 16);
          b = parseInt(hex.substring(4, 6), 16);
        } else if (hex.length === 3) {
          r = parseInt(hex[0] + hex[0], 16);
          g = parseInt(hex[1] + hex[1], 16);
          b = parseInt(hex[2] + hex[2], 16);
        }

        const centerX = width * 0.5;
        const centerY = height * 0.5;
        const maxDim = Math.max(width, height);
        const minRadius = maxDim * 0.1;
        const maxRadius = maxDim * 0.8;
        const gradient = ctx.createRadialGradient(
          centerX,
          centerY,
          minRadius,
          centerX,
          centerY,
          maxRadius,
        );
        const overlayAlpha = Math.min(Math.max(overlay, 0), 1);
        gradient.addColorStop(0, `rgba(${r},${g},${b},0)`);
        gradient.addColorStop(
          0.4,
          `rgba(${r},${g},${b},${overlayAlpha * 0.5})`,
        );
        gradient.addColorStop(
          0.7,
          `rgba(${r},${g},${b},${overlayAlpha * 0.9})`,
        );
        gradient.addColorStop(1, `rgba(${r},${g},${b},${overlayAlpha})`);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render(lastTime);

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    const handleMouseLeave = () => {
      mouseRef.current = { x: -9999, y: -9999 };
    };

    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, []);

  useEffect(() => {
    regenerateParticlesRef.current();
  }, [
    spacing,
    minFrequency,
    maxFrequency,
    jitter,
    colorPalette,
    color,
    flickerChance,
  ]);

  return (
    <div ref={containerRef} className={cn("absolute inset-0", className)}>
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
};

export default Flicker;
