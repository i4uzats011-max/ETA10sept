import { NextRequest } from 'next/server';

export interface GeoLocation {
  ip: string;
  country: string;
  countryCode: string;
  region: string;
  city: string;
  postal: string;
  latitude: number | null;
  longitude: number | null;
  isp: string;
  org: string;
  timezone: string;
}

// In-memory cache for GeoIP to prevent hammering APIs and eliminate latency
interface CacheEntry {
  data: GeoLocation;
  expiresAt: number;
}
const geoCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export function extractClientIp(req: NextRequest): string {
  // Check common reverse proxy headers
  const cfConnectingIp = req.headers.get('cf-connecting-ip');
  if (cfConnectingIp && isValidIp(cfConnectingIp)) return cfConnectingIp.trim();

  const xRealIp = req.headers.get('x-real-ip');
  if (xRealIp && isValidIp(xRealIp)) return xRealIp.trim();

  const xForwardedFor = req.headers.get('x-forwarded-for');
  if (xForwardedFor) {
    const ips = xForwardedFor.split(',').map((ip) => ip.trim());
    // Find the first public IP if possible
    for (const ip of ips) {
      if (isValidIp(ip) && !isPrivateIp(ip)) {
        return ip;
      }
    }
    // Otherwise fallback to first IP
    if (ips[0] && isValidIp(ips[0])) {
      return ips[0];
    }
  }

  const xClientIp = req.headers.get('x-client-ip');
  if (xClientIp && isValidIp(xClientIp)) return xClientIp.trim();

  // Next.js request IP
  if ((req as any).ip) {
    return (req as any).ip;
  }

  return '127.0.0.1';
}

function isValidIp(ip: string): boolean {
  if (!ip) return false;
  // Basic IPv4 or IPv6 check
  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Pattern = /^[0-9a-fA-F:]+$/;
  return ipv4Pattern.test(ip) || ipv6Pattern.test(ip);
}

export function isPrivateIp(ip: string): boolean {
  if (!ip) return true;
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return true;

  // IPv4 Private ranges
  // 10.0.0.0 - 10.255.255.255
  if (/^10\./.test(ip)) return true;
  // 172.16.0.0 - 172.31.255.255
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) return true;
  // 192.168.0.0 - 192.168.255.255
  if (/^192\.168\./.test(ip)) return true;
  // 169.254.0.0 - 169.254.255.255
  if (/^169\.254\./.test(ip)) return true;

  return false;
}

export async function lookupIpLocation(ip: string): Promise<GeoLocation> {
  const cleanIp = (ip || '').trim();

  // If local / private IP
  if (!cleanIp || isPrivateIp(cleanIp)) {
    return {
      ip: cleanIp || '127.0.0.1',
      country: 'Local Network',
      countryCode: 'DEV',
      region: 'Localhost',
      city: 'Development Server',
      postal: '',
      latitude: null,
      longitude: null,
      isp: 'Loopback / Private LAN',
      org: 'Local Environment',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    };
  }

  // Check in-memory cache
  const cached = geoCache.get(cleanIp);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  // Query ip-api.com
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    const res = await fetch(`http://ip-api.com/json/${cleanIp}?fields=status,message,country,countryCode,regionName,city,zip,lat,lon,timezone,isp,org`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.status === 'success') {
        const result: GeoLocation = {
          ip: cleanIp,
          country: data.country || 'Unknown',
          countryCode: data.countryCode || '',
          region: data.regionName || '',
          city: data.city || 'Unknown',
          postal: data.zip || '',
          latitude: typeof data.lat === 'number' ? data.lat : null,
          longitude: typeof data.lon === 'number' ? data.lon : null,
          isp: data.isp || '',
          org: data.org || '',
          timezone: data.timezone || '',
        };

        geoCache.set(cleanIp, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
        return result;
      }
    }
  } catch (error) {
    // Silently fall through to fallback
  }

  // Fallback if IP-API was unreachable
  const fallbackResult: GeoLocation = {
    ip: cleanIp,
    country: 'Unknown',
    countryCode: '',
    region: '',
    city: 'Unknown',
    postal: '',
    latitude: null,
    longitude: null,
    isp: 'Unknown ISP',
    org: '',
    timezone: '',
  };

  geoCache.set(cleanIp, { data: fallbackResult, expiresAt: Date.now() + 10 * 60 * 1000 });
  return fallbackResult;
}
