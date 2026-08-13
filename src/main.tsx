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

// Unregister legacy Service Workers to prevent Telegram Webview from serving stale cached app versions
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister();
    }
  }).catch(() => {});
}

const params = new URLSearchParams(window.location.search);
const portalSupplier = params.get('portal');
const isMiniApp = window.location.pathname.startsWith('/mini-app') || params.get('miniapp') === '1';

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
