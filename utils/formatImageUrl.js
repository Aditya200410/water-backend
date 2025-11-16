function formatImageUrl(url, req) {
  if (!url) return url;
  // If it's already an absolute URL, return as-is
  if (url.startsWith('http://') || url.startsWith('https://')) return url;

  // Clean parts
  const cleanUrl = url.replace(/^\/+/, '');

  // Always prefer explicit BACKEND_URL when available
  if (process.env.BACKEND_URL) {
    return `${process.env.BACKEND_URL.replace(/\/+$/,'')}/${cleanUrl}`;
  }

  // Fallback to request host if available (development)
  if (req && req.get) {
    const proto = req.protocol || 'http';
    const host = req.get('host');
    if (host) {
      return `${proto}://${host}/${cleanUrl}`;
    }
  }

  // Final fallback: just return the path
  return `/${cleanUrl}`;
}

module.exports = formatImageUrl;
