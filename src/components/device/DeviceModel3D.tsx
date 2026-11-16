"use client";

import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";

/*
 * 기기 사진 한 장으로 만드는 CSS 3D 연출.
 *
 * - 앞면: 사진 그대로
 * - 옆면: 사진의 실루엣(mask)을 뒤로 여러 겹 쌓아 두께를 만든다.
 *   좌우로 돌면 이 겹들이 측면처럼 보인다.
 * - 움직임은 Web Animations API로 처리한다. 상태가 바뀌는 순간의
 *   실제 각도에서 다음 자세로 이어지게 해 회전이 툭 끊기지 않는다.
 */

export type DeviceMotion = "idle" | "spin" | "front";

const IDLE_POSE = "rotateX(0deg) rotateY(0deg) translateY(0px)";
const FRONT_POSE = "rotateX(0deg) rotateY(0deg) translateY(0px)";

const SPIN_KEYFRAMES: Keyframe[] = [
  { transform: IDLE_POSE },
  { transform: "rotateX(6deg) rotateY(-36deg) translateY(-8px)", offset: 0.3 },
  { transform: "rotateX(10deg) rotateY(34deg) translateY(-3px)", offset: 0.72 },
  { transform: IDLE_POSE },
];

const SPIN_DURATION_MS = 3200;
const EASE_OUT = "cubic-bezier(.22, 1, .36, 1)";
const DEPTH_LAYERS = 14;
const LAYER_GAP_PX = 1.25;

export default function DeviceModel3D({ motion }: { motion: DeviceMotion }) {
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const body = bodyRef.current;

    if (!body) {
      return;
    }

    /*
     * 진행 중인 애니메이션을 멈추기 전에 현재 각도를 읽는다.
     * 이전 effect의 cleanup에서 멈추면 이 값이 사라지므로
     * cleanup 없이 여기서 직접 정리한다.
     */
    const current = getComputedStyle(body).transform;

    for (const animation of body.getAnimations()) {
      animation.cancel();
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    if (motion === "spin") {
      body.animate(SPIN_KEYFRAMES, {
        duration: SPIN_DURATION_MS,
        easing: "ease-in-out",
        iterations: Infinity,
      });

      return;
    }

    body.animate(
      [
        { transform: current },
        { transform: motion === "front" ? FRONT_POSE : IDLE_POSE },
      ],
      {
        duration: motion === "front" ? 900 : 600,
        easing: EASE_OUT,
      },
    );
  }, [motion]);

  return (
    <div className="device-stage" data-motion={motion} aria-hidden="true">
      <span className="device-floor" />

      <div
        ref={bodyRef}
        className="device-body"
        style={{ transform: motion === "front" ? FRONT_POSE : IDLE_POSE }}
      >
        {Array.from({ length: DEPTH_LAYERS }, (_, index) => (
          <span
            key={index}
            className="device-edge"
            style={{ "--depth": `${-(index + 1) * LAYER_GAP_PX}px` } as CSSProperties}
          />
        ))}

        <span className="device-face" />
        <span className="device-glint" />
      </div>
    </div>
  );
}
