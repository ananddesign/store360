import { readdir } from 'fs/promises';
import { join } from 'path';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Lists equirectangular images present in /public/vr/panoramas so the tester
 * (/vr?test=true) can offer them without any code changes — drop a file in that
 * folder and it appears. Dev/testing convenience; the production experience is
 * driven by data/scenes.ts, not this route.
 */
export async function GET() {
  const dir = join(process.cwd(), 'public', 'vr', 'panoramas');
  try {
    const entries = await readdir(dir);
    const images = entries
      .filter((f) => /\.(jpe?g|png|webp|avif)$/i.test(f))
      .sort()
      // Encode the filename so spaces/parentheses/etc. load reliably; keep the
      // raw name for display.
      .map((f) => ({ name: f, url: `/vr/panoramas/${encodeURIComponent(f)}` }));
    return NextResponse.json({ images });
  } catch {
    return NextResponse.json({ images: [] });
  }
}
