/**
 * Music album collections model (2026-08-09 owner ask — the "01 — Cover Flow"
 * redesign of the Music section; SECOND PASS same day: the owner supplied TWO
 * REAL album lists and wants MULTIPLE titled collections, each its own Cover
 * Flow row, with more collections to come).
 *
 * The Music section renders one Cover-Flow selector PER COLLECTION in
 * MUSIC_COLLECTIONS — adding a future collection is adding one entry here
 * (title {es,en} + albums), zero component change. This module is the DATA +
 * pure helpers for that view (rendering lives in PageBody.astro; the runtime
 * enhancement in src/components/music/cover-flow.ts).
 *
 * WHAT IS REAL (P3 — no fabricated content): every album below IS the owner's
 * curation — the two lists supplied 2026-08-09 ("70s-80s english albums" +
 * "albums in english - 90s"). The tidalUrl values are the owner's URLs
 * VERBATIM; title/artist/cover were resolved ONCE from each Tidal album
 * page's own OpenGraph tags (og:title "Artist - Album", og:description
 * disambiguating the split, og:image = the 640×640 CDN cover) and baked here
 * as literals — the site build performs NO network fetch, and covers are the
 * official resources.tidal.com renditions Tidal serves for shares/embeds. A
 * cover that ever fails at view time falls back to the generated placeholder
 * art (cover-flow.ts stamps data-cover-failed). Collection titles are the
 * owner's list names, ES half a faithful translation (the competencies-module
 * bilingual pattern — gate:i18n does not walk TS modules, keep both halves
 * filled by construction).
 *
 * DEMO (dormant while real collections exist): DEMO_ALBUMS render ONLY when
 * MUSIC_COLLECTIONS is empty AND SHOW_DEMO_ALBUMS is true — a preview of the
 * component with self-evident placeholders ("Album 01", no covers, no links).
 * With real collections present (today) the demo set never renders; an empty
 * MUSIC_COLLECTIONS with the flag off renders the honest `music.albumsPending`
 * message.
 *
 * REAL-ALBUM CONTRACT: `tidalUrl` MUST be a real Tidal ALBUM page
 * (tidal.com/album/<numeric id>, /browse/ + listen. variants, trailing share
 * suffixes like /u fine). A URL that does not match TIDAL_ALBUM_URL is
 * DROPPED at build (with a warning) rather than guessed or string-patched
 * (P3 — and the mechanical guard that a PLAYLIST url can never ship as an
 * album link); the album then renders as link-pending instead of a broken or
 * fake anchor.
 */

export interface MusicAlbumCover {
  /** Absolute image URL (the Tidal CDN 640×640 cover). */
  src: string;
  /** Alt text. Optional — the cover sits beside the visible title/artist in
   *  every state, so the image is decorative-adjacent (alt="" at render). */
  alt?: string;
  width?: number;
  height?: number;
}

export interface MusicAlbum {
  /** Stable identifier (the Tidal numeric album id for real entries — never
   *  the array index; order may be re-curated). */
  id: string;
  title: string;
  artist: string;
  cover?: MusicAlbumCover;
  /** Real Tidal ALBUM page URL. Absent → the album renders as link-pending
   *  (explicit text, never an <a href="#"> or a dead link). */
  tidalUrl?: string;
  /** True → a placeholder preview entry, not the owner's real collection. */
  isDemo?: boolean;
}

/** One titled shelf of albums — renders as its own Cover Flow row. */
export interface MusicCollection {
  /** Stable slug (DOM ids, anchors). */
  id: string;
  /** Bilingual display title (owner's list name; ES a faithful translation). */
  title: { es: string; en: string };
  albums: readonly MusicAlbum[];
}

/**
 * Tidal ALBUM page URLs only — numeric album id on tidal.com/listen.tidal.com,
 * optional /browse/ prefix, optional trailing path/query (share links carry
 * /u or ?u). Playlist URLs (uuid ids on /playlist/) deliberately do NOT match.
 */
export const TIDAL_ALBUM_URL =
  /^https:\/\/(?:www\.|listen\.)?tidal\.com\/(?:browse\/)?album\/\d+(?:[/?#].*)?$/;

/**
 * THE PRODUCTION COLLECTIONS — the owner's real curation (2026-08-09 lists).
 * To add a collection: append { id, title: {es,en}, albums: [...] }.
 */
export const MUSIC_COLLECTIONS: readonly MusicCollection[] = [
  {
    id: 'en-70s-80s',
    title: { es: 'Álbumes en inglés · 70s–80s', en: 'English Albums · 70s–80s' },
    albums: [
      { id: '55391439', title: 'Animals', artist: 'Pink Floyd',
        cover: { src: 'https://resources.tidal.com/images/4b31d18a/f92d/400c/a974/e84f2548eaef/640x640.jpg' },
        tidalUrl: 'https://tidal.com/album/55391439/u' },
      { id: '55391447', title: 'The Wall', artist: 'Pink Floyd',
        cover: { src: 'https://resources.tidal.com/images/60aca6f0/ea5c/4c81/9a6e/c1f7192c8480/640x640.jpg' },
        tidalUrl: 'https://tidal.com/album/55391447/u' },
      { id: '55391786', title: 'The Dark Side of the Moon', artist: 'Pink Floyd',
        cover: { src: 'https://resources.tidal.com/images/05ccaf43/2f3f/4de2/8d4b/23e9dc56d831/640x640.jpg' },
        tidalUrl: 'https://tidal.com/album/55391786/u' },
      { id: '55391524', title: 'The Division Bell', artist: 'Pink Floyd',
        cover: { src: 'https://resources.tidal.com/images/74471283/2914/44fa/8318/be8f77e8215e/640x640.jpg' },
        tidalUrl: 'https://tidal.com/album/55391524/u' },
      { id: '622353', title: 'Dire Straits', artist: 'Dire Straits',
        cover: { src: 'https://resources.tidal.com/images/0b0c0036/fedb/4b15/a4a0/443433b3b588/640x640.jpg' },
        tidalUrl: 'https://tidal.com/album/622353/u' },
      { id: '182388811', title: 'Brothers In Arms (Remastered 1996)', artist: 'Dire Straits',
        cover: { src: 'https://resources.tidal.com/images/2e3e22d1/ea76/4b90/be90/d9fabf5a9ded/640x640.jpg' },
        tidalUrl: 'https://tidal.com/album/182388811/u' },
      { id: '3254283', title: 'Electric Ladyland', artist: 'Jimi Hendrix',
        cover: { src: 'https://resources.tidal.com/images/bfb64fdf/9bee/441a/91a0/14a6857caabc/640x640.jpg' },
        tidalUrl: 'https://tidal.com/album/3254283/u' },
      { id: '104116946', title: 'Axis: Bold As Love', artist: 'Jimi Hendrix',
        cover: { src: 'https://resources.tidal.com/images/0ad6c0b9/1546/4e80/b4a0/a99d6c8b8fcf/640x640.jpg' },
        tidalUrl: 'https://tidal.com/album/104116946' },
      { id: '68699083', title: 'Led Zeppelin III (Remaster)', artist: 'Led Zeppelin',
        cover: { src: 'https://resources.tidal.com/images/dd6d79f2/decf/48ac/baaa/7810ed4cad35/640x640.jpg' },
        tidalUrl: 'https://tidal.com/album/68699083/u' },
      { id: '5279294', title: 'Surfing With The Alien', artist: 'Joe Satriani',
        cover: { src: 'https://resources.tidal.com/images/c656e9e6/f0c9/4ca0/a6e1/b791757c8a6f/640x640.jpg' },
        tidalUrl: 'https://tidal.com/album/5279294/u' },
      { id: '79142322', title: 'Creedence Clearwater Revival', artist: 'Creedence Clearwater Revival',
        cover: { src: 'https://resources.tidal.com/images/a8566f50/c425/431f/b591/b77797d6ced8/640x640.jpg' },
        tidalUrl: 'https://tidal.com/album/79142322' },
      { id: '296094048', title: 'Bayou Country', artist: 'Creedence Clearwater Revival',
        cover: { src: 'https://resources.tidal.com/images/c43f7a2a/d032/4b53/8f6a/1aa1fdecd56d/640x640.jpg' },
        tidalUrl: 'https://tidal.com/album/296094048/u' },
      { id: '490883005', title: 'Master of Reality', artist: 'Black Sabbath',
        cover: { src: 'https://resources.tidal.com/images/e6324b22/b7e7/43a6/9e46/d5e62bb3e3e0/640x640.jpg' },
        tidalUrl: 'https://tidal.com/album/490883005' },
      { id: '491295253', title: 'Vol. 4', artist: 'Black Sabbath',
        cover: { src: 'https://resources.tidal.com/images/94f82ea7/bb56/4fa7/bce6/d0e8dc2d6ace/640x640.jpg' },
        tidalUrl: 'https://tidal.com/album/491295253' },
      { id: '196435443', title: 'Metallica (Remastered 2021)', artist: 'Metallica',
        cover: { src: 'https://resources.tidal.com/images/b48d21ef/2b65/4f2f/b41e/1223481fa6bf/640x640.jpg' },
        tidalUrl: 'https://tidal.com/album/196435443/u' },
      { id: '59178486', title: "Kill 'Em All (Deluxe / Remastered)", artist: 'Metallica',
        cover: { src: 'https://resources.tidal.com/images/aa209579/038b/4e1b/a53c/19dfa1f5303a/640x640.jpg' },
        tidalUrl: 'https://tidal.com/album/59178486/u' },
      { id: '177678449', title: "Apostrophe(')", artist: 'Frank Zappa',
        cover: { src: 'https://resources.tidal.com/images/36c2eaf5/5ec3/4b27/8275/74a762a18bdc/640x640.jpg' },
        tidalUrl: 'https://tidal.com/album/177678449/u' },
      { id: '493065198', title: 'Ace of Spades (Expanded Edition)', artist: 'Motörhead',
        cover: { src: 'https://resources.tidal.com/images/724477e0/626b/43bd/8a48/5f89613bbd29/640x640.jpg' },
        tidalUrl: 'https://tidal.com/album/493065198/u' },
      { id: '76117642', title: '13 Songs', artist: 'Fugazi',
        cover: { src: 'https://resources.tidal.com/images/84833cdf/f437/4486/b308/5c49b242e48f/640x640.jpg' },
        tidalUrl: 'https://tidal.com/album/76117642' },
      { id: '17014210', title: 'Hot Rats', artist: 'Frank Zappa',
        cover: { src: 'https://resources.tidal.com/images/9a4b24ee/8e68/4476/a63a/cf131e224db7/640x640.jpg' },
        tidalUrl: 'https://tidal.com/album/17014210' },
    ],
  },
  {
    id: 'en-90s',
    title: { es: 'Álbumes en inglés · 90s', en: 'English Albums · 90s' },
    albums: [
      { id: '580874', title: 'Blues for the Red Sun', artist: 'Kyuss',
        cover: { src: 'https://resources.tidal.com/images/f1452504/321c/4150/869f/8c7fa2b753b7/640x640.jpg' },
        tidalUrl: 'https://tidal.com/album/580874/u' },
      { id: '1626341', title: 'Wretch', artist: 'Kyuss',
        cover: { src: 'https://resources.tidal.com/images/d60b3620/d5de/41c3/b3dc/5915f32b0fbe/640x640.jpg' },
        tidalUrl: 'https://tidal.com/album/1626341/u' },
      { id: '655112', title: 'Jar Of Flies', artist: 'Alice In Chains',
        cover: { src: 'https://resources.tidal.com/images/1e39ce6f/ec03/4ff9/b85e/2d4757fcf43c/640x640.jpg' },
        tidalUrl: 'https://tidal.com/album/655112' },
      { id: '5120022', title: 'Ten', artist: 'Pearl Jam',
        cover: { src: 'https://resources.tidal.com/images/0d51300c/4d64/4750/994b/b135a5fbd37d/640x640.jpg' },
        tidalUrl: 'https://tidal.com/album/5120022' },
      { id: '23688033', title: 'Dirt (2022 Remaster)', artist: 'Alice In Chains',
        cover: { src: 'https://resources.tidal.com/images/20c41448/11c7/4312/a05e/c8938d9a2e6d/640x640.jpg' },
        tidalUrl: 'https://tidal.com/album/23688033' },
      { id: '79279089', title: 'Mellon Collie And The Infinite Sadness', artist: 'Smashing Pumpkins',
        cover: { src: 'https://resources.tidal.com/images/5d989f15/8415/436e/98ce/ad84ea9e85e1/640x640.jpg' },
        tidalUrl: 'https://tidal.com/album/79279089' },
      { id: '77610844', title: 'In Utero', artist: 'Nirvana',
        cover: { src: 'https://resources.tidal.com/images/e680f7cf/f8af/421b/a2ac/3b0b074e3866/640x640.jpg' },
        tidalUrl: 'https://tidal.com/album/77610844' },
      { id: '35369064', title: 'Siamese Dream (Deluxe Edition)', artist: 'Smashing Pumpkins',
        cover: { src: 'https://resources.tidal.com/images/61865403/f121/4044/ac25/8376dcac42d3/640x640.jpg' },
        tidalUrl: 'https://tidal.com/album/35369064' },
      { id: '77647353', title: 'Superunknown (20th Anniversary)', artist: 'Soundgarden',
        cover: { src: 'https://resources.tidal.com/images/79bbdb0f/8fcf/4993/b034/e1efc3c27140/640x640.jpg' },
        tidalUrl: 'https://tidal.com/album/77647353' },
      { id: '58990510', title: 'OK Computer', artist: 'Radiohead',
        cover: { src: 'https://resources.tidal.com/images/e77e4cc0/6cd0/4522/807d/88aeac488065/640x640.jpg' },
        tidalUrl: 'https://tidal.com/album/58990510' },
      { id: '77610756', title: 'Nevermind', artist: 'Nirvana',
        cover: { src: 'https://resources.tidal.com/images/4e4aec29/deff/466e/9ea1/c47916d5960b/640x640.jpg' },
        tidalUrl: 'https://tidal.com/album/77610756' },
      { id: '33958245', title: 'System Of A Down', artist: 'System Of A Down',
        cover: { src: 'https://resources.tidal.com/images/77f0764d/6618/4524/b692/19d0a695e9ab/640x640.jpg' },
        tidalUrl: 'https://tidal.com/album/33958245' },
      { id: '304802', title: 'Californication (Deluxe Edition)', artist: 'Red Hot Chili Peppers',
        cover: { src: 'https://resources.tidal.com/images/543575fc/ad02/419b/ae61/671558dc019d/640x640.jpg' },
        tidalUrl: 'https://tidal.com/album/304802' },
      { id: '23653053', title: 'Rage Against The Machine', artist: 'Rage Against The Machine',
        cover: { src: 'https://resources.tidal.com/images/aff2630e/f5a0/409f/a010/7ce2d5aadab8/640x640.jpg' },
        tidalUrl: 'https://tidal.com/album/23653053' },
      { id: '5120094', title: 'Evil Empire', artist: 'Rage Against The Machine',
        cover: { src: 'https://resources.tidal.com/images/54a78cd3/813f/46f1/8ade/b0d1ce8ea0ac/640x640.jpg' },
        tidalUrl: 'https://tidal.com/album/5120094' },
      { id: '23682768', title: 'The Battle Of Los Angeles', artist: 'Rage Against The Machine',
        cover: { src: 'https://resources.tidal.com/images/a20632f0/d68a/4c06/b71e/98559e7bdc9d/640x640.jpg' },
        tidalUrl: 'https://tidal.com/album/23682768' },
      { id: '67367258', title: 'Americana', artist: 'The Offspring',
        cover: { src: 'https://resources.tidal.com/images/9c5fbb56/10ac/4ba1/bf64/41d55922d649/640x640.jpg' },
        tidalUrl: 'https://tidal.com/album/67367258' },
      { id: '11343605', title: 'Make Yourself', artist: 'Incubus',
        cover: { src: 'https://resources.tidal.com/images/fd1c7189/4a99/4a99/98b0/6bfc23ca9407/640x640.jpg' },
        tidalUrl: 'https://tidal.com/album/11343605' },
      { id: '62096428', title: 'Sublime', artist: 'Sublime',
        cover: { src: 'https://resources.tidal.com/images/b97a7d8c/26a6/4894/9afd/47c6d69fea2e/640x640.jpg' },
        tidalUrl: 'https://tidal.com/album/62096428' },
      { id: '90822276', title: 'Appetite For Destruction', artist: "Guns N' Roses",
        cover: { src: 'https://resources.tidal.com/images/42a16e0e/c99f/4c7f/8dc4/989709856610/640x640.jpg' },
        tidalUrl: 'https://tidal.com/album/90822276/u' },
      { id: '258410209', title: 'Use Your Illusion II', artist: "Guns N' Roses",
        cover: { src: 'https://resources.tidal.com/images/88102c5f/fc94/41d9/a74f/47fbaf86670d/640x640.jpg' },
        tidalUrl: 'https://tidal.com/album/258410209' },
      { id: '326001', title: 'Cure for Pain', artist: 'Morphine',
        cover: { src: 'https://resources.tidal.com/images/4dae3cd7/e7de/42b3/bdd6/3e4013e3649c/640x640.jpg' },
        tidalUrl: 'https://tidal.com/album/326001' },
      { id: '326015', title: 'Good', artist: 'Morphine',
        cover: { src: 'https://resources.tidal.com/images/17be8a9e/59a7/47d5/ba89/2828dd746bfa/640x640.jpg' },
        tidalUrl: 'https://tidal.com/album/326015' },
      { id: '541062', title: 'White Light White Heat White Trash', artist: 'Social Distortion',
        cover: { src: 'https://resources.tidal.com/images/37daf85b/70ab/4047/8bb8/1d6a986f4d3f/640x640.jpg' },
        tidalUrl: 'https://tidal.com/album/541062' },
      { id: '35749813', title: 'Significant Other', artist: 'Limp Bizkit',
        cover: { src: 'https://resources.tidal.com/images/7778c138/fc35/43f6/ab97/15823e0290ee/640x640.jpg' },
        tidalUrl: 'https://tidal.com/album/35749813' },
      { id: '530640', title: 'Sailing The Seas Of Cheese', artist: 'Primus',
        cover: { src: 'https://resources.tidal.com/images/86b4bfaf/92f6/42e5/95d9/47d60e9ddac5/640x640.jpg' },
        tidalUrl: 'https://tidal.com/album/530640' },
      { id: '35421019', title: 'Antipop', artist: 'Primus',
        cover: { src: 'https://resources.tidal.com/images/e1892b34/5df0/4c1d/a7e5/2b252463c4b3/640x640.jpg' },
        tidalUrl: 'https://tidal.com/album/35421019' },
    ],
  },
];

/**
 * Ship the demo preview while MUSIC_COLLECTIONS is empty? Dormant today (real
 * collections exist). Set to false to render the honest `music.albumsPending`
 * message on an empty production list instead.
 */
export const SHOW_DEMO_ALBUMS = true;

/** Placeholder preview entries — NOT real albums (P3; see the module header). */
export const DEMO_ALBUMS: readonly MusicAlbum[] = [
  { id: 'demo-01', title: 'Album 01', artist: 'Artist 01', isDemo: true },
  { id: 'demo-02', title: 'Album 02', artist: 'Artist 02', isDemo: true },
  { id: 'demo-03', title: 'Album 03', artist: 'Artist 03', isDemo: true },
  { id: 'demo-04', title: 'Album 04', artist: 'Artist 04', isDemo: true },
  { id: 'demo-05', title: 'Album 05', artist: 'Artist 05', isDemo: true },
];

const DEMO_COLLECTION: MusicCollection = {
  id: 'demo',
  title: { es: 'Colección de muestra', en: 'Sample collection' },
  albums: DEMO_ALBUMS,
};

/**
 * Build the render list: the real collections (each album's tidalUrl checked
 * against TIDAL_ALBUM_URL — a non-album URL is dropped + warned, never
 * guessed; empty collections are dropped), else the flagged demo preview,
 * else empty (→ the pending message).
 */
export function buildMusicCollections(): MusicCollection[] {
  const real = MUSIC_COLLECTIONS.map((collection) => ({
    ...collection,
    albums: collection.albums.map((album) => {
      if (album.tidalUrl && !TIDAL_ALBUM_URL.test(album.tidalUrl)) {
        console.warn(
          `[music-albums] "${album.id}" tidalUrl is not a Tidal ALBUM page URL — link dropped, ` +
            'album renders as link-pending (P3: playlists/guesses never ship as album links).',
        );
        const { tidalUrl: _dropped, ...rest } = album;
        return rest;
      }
      return album;
    }),
  })).filter((collection) => collection.albums.length > 0);
  if (real.length > 0 || !SHOW_DEMO_ALBUMS) return real;
  return [DEMO_COLLECTION];
}

/**
 * Generated placeholder cover art — the fallback face for albums with a
 * missing or failed cover image, and the demo entries' whole visual. Five
 * abstract geometric compositions (the concept mock's language) that cycle by
 * collection index; every fill is an inline `style` reading the --note-* ramp
 * (P7 — inline because the strings render via set:html, which receives no
 * Astro scoped cid, the US-607 rule), so the art re-tunes with theme.css.
 * Decorative only: the rendering span is aria-hidden.
 */
const ART_BG = 'fill:color-mix(in srgb, var(--note-far) 45%, var(--note-void))';
export const COVER_PLACEHOLDER_ART: readonly string[] = [
  // v0 — diagonal signal
  `<svg viewBox="0 0 64 64" preserveAspectRatio="xMidYMid slice" focusable="false"><rect width="64" height="64" style="${ART_BG}"/><path d="M0 20 44 64H0Z" style="fill:color-mix(in srgb, var(--note-mid) 55%, var(--note-void))"/><path d="M0 64 64 0v12L12 64Z" style="fill:var(--note-mid)"/><path d="M0 64 64 0v3L3 64Z" style="fill:var(--note-head)"/><rect x="46" y="8" width="10" height="10" style="fill:var(--note-accent)"/></svg>`,
  // v1 — moon over quarter arc
  `<svg viewBox="0 0 64 64" preserveAspectRatio="xMidYMid slice" focusable="false"><rect width="64" height="64" style="${ART_BG}"/><path d="M64 0v40A64 64 0 0 0 24 0Z" style="fill:color-mix(in srgb, var(--note-mid) 60%, var(--note-void))"/><circle cx="22" cy="20" r="12" style="fill:var(--note-head)"/><rect x="36" y="36" width="20" height="20" style="fill:var(--note-accent)"/></svg>`,
  // v2 — pinwheel
  `<svg viewBox="0 0 64 64" preserveAspectRatio="xMidYMid slice" focusable="false"><rect width="64" height="64" style="${ART_BG}"/><path d="M32 32 8 8h32Z" style="fill:var(--note-accent)"/><path d="M32 32 56 8v32Z" style="fill:var(--note-mid)"/><path d="M32 32 56 56H24Z" style="fill:var(--note-head)"/><path d="M32 32 8 56V24Z" style="fill:color-mix(in srgb, var(--note-mid) 45%, var(--note-void))"/></svg>`,
  // v3 — ascending bars
  `<svg viewBox="0 0 64 64" preserveAspectRatio="xMidYMid slice" focusable="false"><rect width="64" height="64" style="${ART_BG}"/><rect x="10" y="36" width="12" height="20" style="fill:color-mix(in srgb, var(--note-mid) 55%, var(--note-void))"/><rect x="26" y="24" width="12" height="32" style="fill:var(--note-mid)"/><rect x="42" y="12" width="12" height="44" style="fill:var(--note-accent)"/><rect x="10" y="8" width="8" height="8" style="fill:var(--note-head)"/></svg>`,
  // v4 — eclipse
  `<svg viewBox="0 0 64 64" preserveAspectRatio="xMidYMid slice" focusable="false"><rect width="64" height="64" style="fill:color-mix(in srgb, var(--note-mid) 40%, var(--note-void))"/><circle cx="20" cy="16" r="9" style="fill:var(--note-head)"/><circle cx="46" cy="52" r="26" style="fill:var(--note-void)"/><circle cx="46" cy="52" r="26" style="fill:color-mix(in srgb, var(--note-accent) 12%, var(--note-void))"/></svg>`,
];
