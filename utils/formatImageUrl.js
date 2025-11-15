function formatImageUrl(url, req) {
  if (!url) return url;
  // If it's already an absolute URL, return as-is
  if (url.startsWith('http://') || url.startsWith('https://')) return url;

  // Clean parts
  const cleanUrl = url.replace(/^\/+/, '');

  // Prefer explicit BACKEND_URL in production
  if (process.env.NODE_ENV === 'production' && process.env.BACKEND_URL) {
    return `${process.env.BACKEND_URL.replace(/\/+$/,'')}/${cleanUrl}`;
  }

  // Fallback to request host (development or when BACKEND_URL not set)
  if (req && req.get) {
    const proto = req.protocol || 'http';
    const host = req.get('host');
    return `${proto}://${host}/${cleanUrl}`;
  }

  // Last resort, return the cleaned path
  return `/${cleanUrl}`;
}

module.exports = formatImageUrl;
