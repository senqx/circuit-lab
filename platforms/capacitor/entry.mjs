import { platform } from './platform.mjs';

// Native packages contain the complete app; updates arrive with the package.
platform.prepareOffline = async () => {};
// Blob downloads need a native sharing adapter before the mobile release.
platform.exportFile = async () => {
  throw new Error('Circuit export is not available in this mobile preview yet.');
};
await import('./app.js');
