import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.creativecmj.hazeatlas',
  appName: 'Haze Atlas',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
};

export default config;
