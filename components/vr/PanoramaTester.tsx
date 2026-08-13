'use client';

import { useEffect, useRef, useState } from 'react';

interface PanoramaItem {
  name: string;
  url: string;
  /** true for user-uploaded (object URL) vs on-disk files. */
  uploaded?: boolean;
}

interface PanoramaTesterProps {
  /** Load a panorama into the live engine. */
  onLoad: (url: string, name: string) => void;
  /** Id of the currently-shown scene (e.g. "custom:beach.jpg"). */
  activeSceneId: string | null;
}

/**
 * Live 360° tester (shown at /vr?test=true).
 *
 * Two ways to feed it panoramas — both preview instantly in the running engine
 * (and Enter VR works to view them in a headset):
 *   1. Upload image files from your computer (loaded as object URLs, no repo
 *      changes, nothing uploaded to a server).
 *   2. Auto-listed images from /public/vr/panoramas (drop a file in that folder,
 *      hit Refresh).
 *
 * Images must be equirectangular (2:1) to map correctly.
 */
export function PanoramaTester({ onLoad, activeSceneId }: PanoramaTesterProps) {
  const [uploaded, setUploaded] = useState<PanoramaItem[]>([]);
  const [onDisk, setOnDisk] = useState<PanoramaItem[]>([]);
  const [open, setOpen] = useState(true);
  const objectUrls = useRef<string[]>([]);

  const refreshDisk = () => {
    fetch('/api/panoramas')
      .then((r) => r.json())
      .then((d: { images: PanoramaItem[] }) => setOnDisk(d.images ?? []))
      .catch(() => setOnDisk([]));
  };

  useEffect(() => {
    refreshDisk();
    const urls = objectUrls;
    return () => {
      urls.current.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const next: PanoramaItem[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      const url = URL.createObjectURL(file);
      objectUrls.current.push(url);
      next.push({ name: file.name, url, uploaded: true });
    }
    if (next.length) {
      setUploaded((prev) => [...prev, ...next]);
      // Auto-load the first newly added image.
      onLoad(next[0]!.url, next[0]!.name);
    }
  };

  const activeName = activeSceneId?.startsWith('custom:')
    ? activeSceneId.slice('custom:'.length)
    : null;

  return (
    <div className="pointer-events-auto absolute right-4 top-4 z-40 w-72 max-w-[80vw] font-sans">
      <div className="overflow-hidden rounded-xl border border-qween-line bg-black/75 backdrop-blur">
        {/* Header */}
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <span className="text-[11px] uppercase tracking-widest text-qween-gold-soft">
            360° Tester
          </span>
          <span className="text-qween-mist">{open ? '▾' : '▸'}</span>
        </button>

        {open && (
          <div className="max-h-[70vh] overflow-y-auto px-4 pb-4">
            {/* Upload */}
            <label className="block cursor-pointer rounded-lg border border-dashed border-qween-line px-3 py-3 text-center text-[12px] text-qween-diamond transition hover:bg-white/5">
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
              + Upload 360° image(s)
              <div className="mt-1 text-[10px] text-qween-mist">
                equirectangular 2:1 · jpg/png/webp
              </div>
            </label>

            {/* Uploaded list */}
            {uploaded.length > 0 && (
              <Section title="Uploaded">
                {uploaded.map((item) => (
                  <Row
                    key={item.url}
                    label={item.name}
                    active={activeName === item.name}
                    onClick={() => onLoad(item.url, item.name)}
                  />
                ))}
              </Section>
            )}

            {/* On-disk list */}
            <Section
              title="In /public/vr/panoramas"
              action={
                <button
                  onClick={refreshDisk}
                  className="text-[10px] uppercase tracking-wider text-qween-gold-soft hover:text-qween-gold"
                >
                  Refresh
                </button>
              }
            >
              {onDisk.length === 0 ? (
                <div className="py-1 text-[11px] text-qween-mist">
                  No image files found. Drop some in that folder and Refresh.
                </div>
              ) : (
                onDisk.map((item) => (
                  <Row
                    key={item.url}
                    label={item.name}
                    active={activeName === item.name}
                    onClick={() => onLoad(item.url, item.name)}
                  />
                ))
              )}
            </Section>

            <div className="mt-3 border-t border-white/10 pt-2 text-[10px] leading-relaxed text-qween-mist">
              Tip: drag to look around. Use{' '}
              <span className="text-qween-diamond">Enter VR</span> to view the
              current image in a headset. Leave{' '}
              <span className="text-qween-diamond">?test=true</span> off the URL
              for the real store.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4">
      <div className="mb-1 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-widest text-qween-mist">
          {title}
        </div>
        {action}
      </div>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

function Row({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`truncate rounded-md px-3 py-2 text-left text-[12px] transition ${
        active
          ? 'bg-qween-gold/20 text-qween-gold-soft'
          : 'text-qween-diamond hover:bg-white/5'
      }`}
      title={label}
    >
      {active ? '● ' : ''}
      {label}
    </button>
  );
}
