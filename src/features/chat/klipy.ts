// KLIPY GIF search — called directly from the client. The app key ships in the
// bundle via EXPO_PUBLIC_KLIPY_KEY (a rate-limited key, like INVITE_CODE);
// restrict it in the KLIPY partner panel. We only ever keep the CDN url +
// dimensions of a picked GIF — never the image bytes.
//
// API: https://api.klipy.com/api/v1/<KEY>/gifs/{trending,search}
//   key is a PATH segment; results at data.data[], each with
//   file.{xs,sm,md,hd}.gif.{url,width,height}  (note: "file", singular).

export type Gif = {
  id: string;
  /** Small looping preview for the picker grid. */
  previewUrl: string;
  previewWidth: number;
  previewHeight: number;
  /** Larger GIF used in the sent message. */
  url: string;
  width: number;
  height: number;
  description: string;
};

const KEY = process.env.EXPO_PUBLIC_KLIPY_KEY ?? '';
const BASE = 'https://api.klipy.com/api/v1';
// SFW-ish for a friends league; 24 per page (min 8, max 50).
const COMMON = 'per_page=24&rating=pg-13';

export function klipyConfigured(): boolean {
  return KEY.length > 0;
}

type Variant = { url?: string; width?: number; height?: number };
// KLIPY nests the media under "file" (singular): file.{xs,sm,md,hd}.{gif,webp,mp4,...}
type KlipyItem = {
  id?: string | number;
  title?: string;
  file?: Record<string, { gif?: Variant } | undefined>;
};

/** First available gif variant across the given size preference order. */
function pickVariant(file: KlipyItem['file'], order: string[]): Variant | null {
  if (!file) return null;
  for (const size of order) {
    const g = file[size]?.gif;
    if (g?.url) return g;
  }
  for (const key of Object.keys(file)) {
    const g = file[key]?.gif;
    if (g?.url) return g;
  }
  return null;
}

function mapItems(items: KlipyItem[]): Gif[] {
  const out: Gif[] = [];
  for (const it of items) {
    const full = pickVariant(it.file, ['md', 'hd', 'sm']);
    const preview = pickVariant(it.file, ['sm', 'xs', 'md', 'hd']) ?? full;
    if (!full?.url || !preview?.url) continue; // skips ad / non-gif entries
    out.push({
      id: String(it.id ?? full.url),
      previewUrl: preview.url,
      previewWidth: preview.width || 1,
      previewHeight: preview.height || 1,
      url: full.url,
      width: full.width || 1,
      height: full.height || 1,
      description: it.title ?? 'GIF',
    });
  }
  return out;
}

async function fetchKlipy(kind: 'trending' | 'search', qs: string): Promise<Gif[]> {
  if (!KEY) throw new Error('GIFs are not configured (missing EXPO_PUBLIC_KLIPY_KEY).');
  const res = await fetch(`${BASE}/${encodeURIComponent(KEY)}/gifs/${kind}?${qs}`);
  if (!res.ok) throw new Error(`KLIPY ${res.status}`);
  const json = (await res.json()) as { data?: { data?: KlipyItem[] } };
  return mapItems(json?.data?.data ?? []);
}

/** Trending GIFs (shown when the search box is empty). */
export function trendingGifs(): Promise<Gif[]> {
  return fetchKlipy('trending', COMMON);
}

export function searchGifs(query: string): Promise<Gif[]> {
  const q = query.trim();
  if (!q) return trendingGifs();
  return fetchKlipy('search', `q=${encodeURIComponent(q)}&${COMMON}`);
}
