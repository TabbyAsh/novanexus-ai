const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="12" fill="#141713"/>
  <path d="M16 47V17h8l16 19V17h8v30h-8L24 28v19z" fill="#b9ef9a"/>
</svg>`;

export const dynamic = 'force-static';

export function GET() {
  return new Response(favicon, {
    headers: {
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      'Content-Type': 'image/svg+xml; charset=utf-8',
    },
  });
}
