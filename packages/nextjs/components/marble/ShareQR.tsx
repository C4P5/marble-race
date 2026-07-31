"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

type Props = {
  /** Path to encode, e.g. "/" or "/carrera". Resolved against the live origin. */
  path?: string;
  title?: string;
  hint?: string;
  size?: number;
};

/**
 * QR pointing at this app, for the showcase: the audience scans and mints on
 * their phone instead of anyone typing a URL.
 *
 * The origin is read at runtime rather than configured, so the code always
 * points at wherever the page is actually being served — localhost while
 * iterating, the deployed host once it is deployed, with no constant to update
 * and no chance of projecting a stale URL.
 */
export const ShareQR = ({ path = "/", title = "Escaneá para mintear", hint, size = 180 }: Props) => {
  // window does not exist during SSR/static export, and rendering a different
  // value on the client would be a hydration mismatch — so render nothing until
  // mounted rather than guessing an origin.
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(new URL(path, window.location.origin).toString());
  }, [path]);

  // A phone cannot reach the operator's loopback address. Worth saying out loud:
  // the QR still scans, it just lands nowhere, which is a confusing failure to
  // debug in front of an audience.
  const unreachable = url ? /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(url) : false;

  return (
    <div className="card bg-base-100 shadow-xl w-full max-w-md">
      <div className="card-body items-center text-center gap-3">
        <h2 className="card-title text-base">{title}</h2>

        {url ? (
          // Always dark-on-white regardless of the app theme: inverting a QR or
          // dropping its contrast is the classic way to make it unscannable.
          <div className="bg-white p-3 rounded-xl">
            <QRCodeSVG value={url} size={size} level="M" bgColor="#ffffff" fgColor="#000000" />
          </div>
        ) : (
          <div className="skeleton rounded-xl" style={{ width: size + 24, height: size + 24 }} />
        )}

        <code className="text-xs break-all opacity-70">{url ?? "…"}</code>
        {hint && <p className="text-xs opacity-60 m-0">{hint}</p>}

        {unreachable && (
          <div className="alert alert-warning text-left text-xs py-2">
            <span>
              Este QR apunta a <code>localhost</code>: sirve en esta máquina, pero un teléfono no lo puede abrir. Para
              el showcase hay que servir la app en una URL pública o en la IP de la red local.
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
