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
import { DocumentVerificationView } from './components/DocumentVerificationView';
import './index.css';

// Clean up legacy Service Workers and CacheStorage
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

// Check if verification page requested via QR code link
const verifyParam =
  params.get('verify') ||
  params.get('verifyQuote') ||
  (pathname.startsWith('/verify')
    ? decodeURIComponent(pathname.replace(/^\/verify\/?/, '').split('?')[0])
    : null) ||
  (window.location.hash.includes('verify=')
    ? decodeURIComponent(window.location.hash.split('verify=')[1]?.split('&')[0] || '')
    : null);

const verifyQuoteId = verifyParam && verifyParam.trim() ? verifyParam.trim() : null;

// Check if user is already authenticated as Administrator to prevent getting trapped in portal views
const isMainAdminAuth = typeof window !== 'undefined' && (
  sessionStorage.getItem("main_admin_auth") === "true" ||
  sessionStorage.getItem("current_role") === "admin"
);

// Recover facilitator key from sessionStorage to protect against query param stripping on browser reload
const savedFacilitatorKey = typeof window !== 'undefined' && !isMainAdminAuth && (
  sessionStorage.getItem("current_role") === "facilitator"
    ? (sessionStorage.getItem("auth_facilitator_key") || undefined)
    : undefined
);
const effectivePortalFacilitator = (!isMainAdminAuth && portalSupplier && portalSupplier.startsWith('facilitator'))
  ? portalSupplier
  : savedFacilitatorKey;

// Immediately set document.title for clear browser tab visibility (ФАСИЛИТАТОР / ПОСТАВЩИК / АДМИНИСТРАТОР)
if (typeof document !== 'undefined') {
  if (verifyQuoteId) {
    document.title = `ПРОВЕРКА КП #${verifyQuoteId} — Аудит`;
  } else if (!isMainAdminAuth && portalSupplier && portalSupplier.startsWith('supplier')) {
    document.title = 'ПОСТАВЩИК — Региональный Каталог';
  } else if (!isMainAdminAuth && effectivePortalFacilitator && effectivePortalFacilitator.startsWith('facilitator')) {
    document.title = 'ФАСИЛИТАТОР — Региональный Каталог';
  } else if (isMainAdminAuth) {
    document.title = 'АДМИНИСТРАТОР — Региональный Каталог';
  } else {
    const savedRole = sessionStorage.getItem("current_role");
    if (savedRole === 'supplier') {
      document.title = 'ПОСТАВЩИК — Региональный Каталог';
    } else if (savedRole === 'facilitator') {
      document.title = 'ФАСИЛИТАТОР — Региональный Каталог';
    }
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {verifyQuoteId ? (
      <DocumentVerificationView
        quoteId={verifyQuoteId}
        onNavigateHome={() => {
          window.location.href = window.location.origin;
        }}
      />
    ) : !isMainAdminAuth && portalSupplier && portalSupplier.startsWith('supplier') ? (
      <SupplierPortal supplierId={portalSupplier as any} />
    ) : !isMainAdminAuth && effectivePortalFacilitator && effectivePortalFacilitator.startsWith('facilitator') ? (
      <App portalFacilitator={effectivePortalFacilitator} />
    ) : (
      <App />
    )}
  </StrictMode>,
);
