import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import SupplierPortal from './SupplierPortal.tsx';
import MiniApp from './MiniApp.tsx';
import './index.css';

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
