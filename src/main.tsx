// Suppress benign Firestore clock drift console warnings/errors
const originalWarn = console.warn;
const originalError = console.error;

const shouldSuppressFirestoreClockWarning = (args: any[]) => {
  return args.some(arg => {
    if (!arg) return false;
    const str = typeof arg === 'string' ? arg : (arg.message || String(arg));
    return typeof str === 'string' && str.includes('Detected an update time');
  });
};

console.warn = function (...args: any[]) {
  if (shouldSuppressFirestoreClockWarning(args)) return;
  originalWarn.apply(console, args);
};

console.error = function (...args: any[]) {
  if (shouldSuppressFirestoreClockWarning(args)) return;
  originalError.apply(console, args);
};

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import SupplierPortal from './SupplierPortal.tsx';
import MiniApp from './MiniApp.tsx';
import './index.css';

// Clean up legacy Service Workers and CacheStorage to prevent Telegram Webview from serving stale cached app versions
if (typeof window !== 'undefined') {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister();
      }
    }).catch(() => {});
  }
  if ('caches' in window) {
    caches.keys().then((names) => {
      for (const name of names) {
        caches.delete(name);
      }
    }).catch(() => {});
  }
}

const params = new URLSearchParams(window.location.search);
const portalSupplier = params.get('portal');
const pathname = window.location.pathname;

// Check if specifically requested mini-app via path, query param, or Telegram WebApp hash
const isMiniAppPath = pathname.startsWith('/mini-app') || params.get('miniapp') === '1';
const isTelegramWebAppWithData = typeof window !== 'undefined' && Boolean(
  ((window as any).Telegram?.WebApp?.initData && (window as any).Telegram.WebApp.initData.length > 0) ||
  window.location.hash.includes('tgWebAppData') ||
  window.location.search.includes('tgWebApp')
);

// Only route to MiniApp if explicitly requested via /mini-app, miniapp=1, or within Telegram mini-app context
const isMiniApp = isMiniAppPath || (isTelegramWebAppWithData && isMiniAppPath);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isMiniApp ? (
      <MiniApp portalFacilitator={portalSupplier && portalSupplier.startsWith('facilitator') ? portalSupplier : undefined} />
    ) : portalSupplier && portalSupplier.startsWith('supplier') ? (
      <SupplierPortal supplierId={portalSupplier as any} />
    ) : portalSupplier && portalSupplier.startsWith('facilitator') ? (
      <App portalFacilitator={portalSupplier} />
    ) : (
      <App />
    )}
  </StrictMode>,
);
