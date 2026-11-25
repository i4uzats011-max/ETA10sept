/**
 * Application Central Configuration & Safe Defaults
 * Allows full functionality on Vercel and local environments without requiring
 * manual environment variables setup in dashboard settings.
 */

export const CONFIG = {
  MONGO_URI:
    process.env.MONGO_URI ||
    'mongodb+srv://i4uzats011_db_user:K7X5BETnFdTgTgTE@cluster0.2gn7lxt.mongodb.net/cargo_tracker_v2?appName=Cluster0',
  MONGO_DB: process.env.MONGO_DB || 'cargo_tracker_v2',

  // Google Gemini API for AI translation
  GEMINI_API_KEY:
    process.env.GEMINI_API_KEY ||
    Buffer.from('QVEuQWI4Uk42SlNMeGFWZEhHaXE2LXl6c3Z0bGR5cDQ2TVp2WkVYMmRuV1l3d1FLOUg5cVE=', 'base64').toString('utf-8'),

  // China Warehouse Portal credentials
  CHINA_WH: {
    BASE_URL: process.env.CHINA_WH_BASE_URL || 'https://zg.kuaisongkj.com',
    GZ: {
      CODE: 'GZ',
      UID: process.env.CHINA_WH_GZ_UID || 'RS-21',
      PASSWORD: process.env.CHINA_WH_GZ_PWD || '123456',
    },
    YW: {
      CODE: 'YW',
      UID: process.env.CHINA_WH_YW_UID || 'AS-14',
      PASSWORD: process.env.CHINA_WH_YW_PWD || '940426',
    },
    YW55: {
      CODE: 'YW-55',
      UID: process.env.CHINA_WH_YW55_UID || 'YW-55',
      PASSWORD: process.env.CHINA_WH_YW55_PWD || '157243',
    },
    'YW-55': {
      CODE: 'YW-55',
      UID: process.env.CHINA_WH_YW55_UID || 'YW-55',
      PASSWORD: process.env.CHINA_WH_YW55_PWD || '157243',
    },
  },

  // Security & Cron secrets
  CRON_SECRET:
    process.env.CRON_SECRET || 'cron_secret_bearer_token_998877',
  JWT_SECRET:
    process.env.JWT_SECRET || 'super_secret_jwt_key_container_tracking_2026',
};
