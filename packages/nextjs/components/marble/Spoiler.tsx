"use client";

import { useState } from "react";

/**
 * Hides a result until the race has actually been run.
 *
 * The finish order is known the instant the VRF word lands — before the first
 * lap is drawn — so the podium and the fairness columns are fully populated
 * while the marbles are still rolling. Left visible, the audience reads the
 * winner off the panel and stops watching. Blurring is not decoration: it is
 * what makes the animation worth looking at.
 *
 * CSS only. `revealed` auto-clears the blur when the race ends; hover (or tap,
 * for phones) peeks for anyone who cannot wait.
 */
export const Spoiler = ({
  revealed,
  children,
  label = "Se revela al terminar la carrera — pasá el mouse para espiar",
}: {
  revealed: boolean;
  children: React.ReactNode;
  label?: string;
}) => {
  // Hover alone would leave this permanently hidden on touch devices.
  const [peeked, setPeeked] = useState(false);
  const open = revealed || peeked;

  return (
    <div className="relative">
      <div
        onClick={() => !revealed && setPeeked(p => !p)}
        className={`transition-[filter] duration-300 ${
          open ? "" : "blur-md select-none cursor-pointer hover:blur-none"
        }`}
        // Hidden from assistive tech only while blurred, so a screen reader is
        // not spoiled either — but never when it is legitimately revealed.
        aria-hidden={!open}
      >
        {children}
      </div>

      {!open && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="badge badge-neutral badge-sm opacity-90">{label}</span>
        </div>
      )}
    </div>
  );
};
