export interface ParsedDeviceInfo {
  deviceType: 'mobile' | 'tablet' | 'desktop' | 'bot' | 'unknown';
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  brand: string;
  model: string;
  os: string;
  osVersion: string;
  browser: string;
  browserVersion: string;
}

export function parseUserAgent(uaString: string = '', screenRes: string = ''): ParsedDeviceInfo {
  const ua = uaString || '';

  // Default values
  let deviceType: 'mobile' | 'tablet' | 'desktop' | 'bot' | 'unknown' = 'unknown';
  let isMobile = false;
  let isTablet = false;
  let isDesktop = false;
  let brand = 'Unknown';
  let model = 'Unknown';
  let os = 'Unknown';
  let osVersion = '';
  let browser = 'Unknown';
  let browserVersion = '';

  // 1. Detect Bots & Crawlers
  if (/bot|crawl|spider|slurp|facebookexternalhit|whatsapp|google-read-aloud|preview/i.test(ua) && !/mobile safari|chrome/i.test(ua)) {
    deviceType = 'bot';
    brand = 'Bot';
    model = 'Web Crawler';
  }

  // 2. Detect Operating System & OS Version
  if (/iPhone|iPad|iPod/i.test(ua)) {
    os = 'iOS';
    const match = ua.match(/OS (\d+[_\.]\d+)/i);
    if (match) osVersion = match[1].replace(/_/g, '.');
  } else if (/Android/i.test(ua)) {
    os = 'Android';
    const match = ua.match(/Android\s+([\d\.]+)/i);
    if (match) osVersion = match[1];
  } else if (/Windows NT/i.test(ua)) {
    os = 'Windows';
    if (/Windows NT 10.0/i.test(ua)) osVersion = '10 / 11';
    else if (/Windows NT 6.3/i.test(ua)) osVersion = '8.1';
    else if (/Windows NT 6.2/i.test(ua)) osVersion = '8';
    else if (/Windows NT 6.1/i.test(ua)) osVersion = '7';
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    os = 'macOS';
    const match = ua.match(/Mac OS X (\d+[_\.]\d+)/i);
    if (match) osVersion = match[1].replace(/_/g, '.');
  } else if (/CrOS/i.test(ua)) {
    os = 'Chrome OS';
  } else if (/Linux/i.test(ua)) {
    os = 'Linux';
  }

  // 3. Detect Tablet vs Mobile vs Desktop
  if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile/i.test(ua)) || /Tablet|PlayBook|Silk|SM-T|GT-P|Tab/i.test(ua)) {
    deviceType = 'tablet';
    isTablet = true;
  } else if (/Mobile|iPhone|iPod|Android.*Mobile|webOS|BlackBerry|IEMobile|Opera Mini|WPDesktop/i.test(ua)) {
    deviceType = 'mobile';
    isMobile = true;
  } else if (/Windows|Macintosh|Linux|CrOS/i.test(ua) && !/Mobile/i.test(ua)) {
    deviceType = 'desktop';
    isDesktop = true;
  } else if (deviceType === 'unknown') {
    // If unknown, default to desktop or mobile based on screen resolution if available
    deviceType = 'desktop';
    isDesktop = true;
  }

  // 4. Detect Brand & Model
  if (/iPhone/i.test(ua)) {
    brand = 'Apple';
    model = 'Apple iPhone';

    // Estimate iPhone model by screen resolution if provided
    if (screenRes) {
      const [w, h] = screenRes.split('x').map((n) => parseInt(n.trim(), 10)).sort((a, b) => a - b);
      if (w === 430 && h === 932) model = 'iPhone 15 / 14 Pro Max';
      else if (w === 393 && h === 852) model = 'iPhone 15 / 15 Pro / 14 Pro';
      else if (w === 390 && h === 844) model = 'iPhone 14 / 13 / 12';
      else if (w === 428 && h === 926) model = 'iPhone 13 / 12 Pro Max';
      else if (w === 414 && h === 896) model = 'iPhone 11 / XR / XS Max';
      else if (w === 375 && h === 812) model = 'iPhone X / XS / 11 Pro / 12 mini';
      else if (w === 414 && h === 736) model = 'iPhone 8 Plus / 7 Plus / 6s Plus';
      else if (w === 375 && h === 667) model = 'iPhone SE / 8 / 7';
    }
  } else if (/iPad/i.test(ua)) {
    brand = 'Apple';
    model = 'Apple iPad';
  } else if (/Macintosh/i.test(ua)) {
    brand = 'Apple';
    model = 'Mac Desktop / MacBook';
  } else if (/Samsung|SM-|GT-|SCH-|SGH-|SPH-/i.test(ua)) {
    brand = 'Samsung';
    const match = ua.match(/Build\/([a-zA-Z0-9_\-]+)|\b(SM-[a-zA-Z0-9]+)\b|\b(GT-[a-zA-Z0-9]+)\b/i);
    const smMatch = ua.match(/\b(SM-[A-Z0-9]+)\b/i);
    if (smMatch) {
      const code = smMatch[1].toUpperCase();
      model = `Samsung ${formatSamsungModel(code)}`;
    } else {
      model = 'Samsung Galaxy Device';
    }
  } else if (/Pixel/i.test(ua)) {
    brand = 'Google';
    const match = ua.match(/Pixel\s*([0-9a-zA-Z\s]+?)(?:\s+Build|\)|;)/i);
    model = match ? `Google Pixel ${match[1].trim()}` : 'Google Pixel';
  } else if (/Redmi|POCO|Mi\s|Xiaomi/i.test(ua)) {
    brand = 'Xiaomi';
    const match = ua.match(/\b(POCO[\s\w]+|Redmi[\s\w]+|Mi[\s\w]+)\b/i);
    if (match) {
      model = `Xiaomi ${match[1].trim()}`;
    } else {
      const buildMatch = ua.match(/;\s*([A-Za-z0-9_\-]+)\s+Build/i);
      model = buildMatch ? `Xiaomi (${buildMatch[1]})` : 'Xiaomi Redmi / Mi';
    }
  } else if (/OnePlus|ONEPLUS/i.test(ua)) {
    brand = 'OnePlus';
    const match = ua.match(/OnePlus\s*([a-zA-Z0-9\s]+?)(?:\s+Build|\)|;)/i);
    model = match ? `OnePlus ${match[1].trim()}` : 'OnePlus Device';
  } else if (/vivo|V2\d{3}|V1\d{3}/i.test(ua)) {
    brand = 'Vivo';
    const match = ua.match(/\b(vivo[\s\w]+)\b/i) || ua.match(/\b(V2\d{3}[A-Z]*)\b/i);
    model = match ? `Vivo ${match[1].trim()}` : 'Vivo Phone';
  } else if (/OPPO|CPH\d{4}|Reno/i.test(ua)) {
    brand = 'OPPO';
    const match = ua.match(/\b(OPPO[\s\w]+)\b/i) || ua.match(/\b(CPH\d{4})\b/i);
    model = match ? `OPPO ${match[1].trim()}` : 'OPPO Device';
  } else if (/Realme|RMX\d{4}/i.test(ua)) {
    brand = 'Realme';
    const match = ua.match(/\b(RMX\d{4})\b/i);
    model = match ? `Realme (${match[1]})` : 'Realme Device';
  } else if (/moto|motorola/i.test(ua)) {
    brand = 'Motorola';
    const match = ua.match(/moto\s+([a-zA-Z0-9\s]+?)(?:\s+Build|\)|;)/i);
    model = match ? `Motorola Moto ${match[1].trim()}` : 'Motorola Device';
  } else if (/Huawei|Honor/i.test(ua)) {
    brand = 'Huawei';
    model = 'Huawei / Honor Device';
  } else if (/Nothing/i.test(ua)) {
    brand = 'Nothing';
    model = 'Nothing Phone';
  } else if (os === 'Windows') {
    brand = 'PC';
    model = 'Windows PC';
  } else if (os === 'Linux') {
    brand = 'Linux';
    model = 'Linux Computer';
  }

  // 5. Detect Browser & Browser Version
  if (/SamsungBrowser/i.test(ua)) {
    browser = 'Samsung Internet';
    const match = ua.match(/SamsungBrowser\/([\d\.]+)/i);
    if (match) browserVersion = match[1];
  } else if (/Instagram/i.test(ua)) {
    browser = 'Instagram In-App';
  } else if (/WhatsApp/i.test(ua)) {
    browser = 'WhatsApp In-App';
  } else if (/FBAN|FBAV/i.test(ua)) {
    browser = 'Facebook In-App';
  } else if (/Edg\/|Edge\//i.test(ua)) {
    browser = 'Microsoft Edge';
    const match = ua.match(/Edg(?:e)?\/([\d\.]+)/i);
    if (match) browserVersion = match[1];
  } else if (/OPR\/|Opera/i.test(ua)) {
    browser = 'Opera';
    const match = ua.match(/OPR\/([\d\.]+)/i);
    if (match) browserVersion = match[1];
  } else if (/Chrome\/|CriOS\//i.test(ua)) {
    browser = isMobile ? 'Chrome Mobile' : 'Google Chrome';
    const match = ua.match(/(?:Chrome|CriOS)\/([\d\.]+)/i);
    if (match) browserVersion = match[1];
  } else if (/Firefox\/|FxiOS\//i.test(ua)) {
    browser = isMobile ? 'Firefox Mobile' : 'Mozilla Firefox';
    const match = ua.match(/(?:Firefox|FxiOS)\/([\d\.]+)/i);
    if (match) browserVersion = match[1];
  } else if (/Safari/i.test(ua) && !/Chrome|CriOS/i.test(ua)) {
    browser = isMobile ? 'Mobile Safari' : 'Apple Safari';
    const match = ua.match(/Version\/([\d\.]+)/i);
    if (match) browserVersion = match[1];
  } else if (/UCBrowser/i.test(ua)) {
    browser = 'UC Browser';
  }

  return {
    deviceType,
    isMobile,
    isTablet,
    isDesktop,
    brand,
    model,
    os,
    osVersion,
    browser,
    browserVersion,
  };
}

function formatSamsungModel(modelCode: string): string {
  // Common Samsung Galaxy model code patterns
  if (/SM-S92/i.test(modelCode)) return `Galaxy S24 (${modelCode})`;
  if (/SM-S91/i.test(modelCode)) return `Galaxy S23 (${modelCode})`;
  if (/SM-S90/i.test(modelCode)) return `Galaxy S22 (${modelCode})`;
  if (/SM-G99/i.test(modelCode)) return `Galaxy S21 (${modelCode})`;
  if (/SM-G98/i.test(modelCode)) return `Galaxy S20 (${modelCode})`;
  if (/SM-G97/i.test(modelCode)) return `Galaxy S10 (${modelCode})`;
  if (/SM-A\d{2}/i.test(modelCode)) return `Galaxy A-Series (${modelCode})`;
  if (/SM-M\d{2}/i.test(modelCode)) return `Galaxy M-Series (${modelCode})`;
  if (/SM-F\d{3}/i.test(modelCode)) return `Galaxy Z Fold / Flip (${modelCode})`;
  return `Galaxy (${modelCode})`;
}
