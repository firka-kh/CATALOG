export interface Product {
    id: string;
    code?: string;
    name: string;
    description: string;
    category: string;
    price?: number;
    priceSupplier1?: number;
    priceSupplier2?: number;
    priceSupplier3?: number;
    priceSupplier4?: number;
    prices?: {
      [supplierKey: string]: Record<string, number> | undefined;
      supplier1?: Record<string, number>;
      supplier2?: Record<string, number>;
      supplier3?: Record<string, number>;
      supplier4?: Record<string, number>;
    };
    imageBase64: string;
    mimeType: string;
    sphere?: string;
    spheres?: string[];
    regions?: string[];
    unit?: string;
    createdAt?: number;
}

export interface GlobalDictionary {
    regions: string[];
    districtsByRegion?: Record<string, string[]>;
    spheres: string[];
    suppliers: string[];
    pricingRules?: Record<string, Record<string, number>>;
    supplierCodes?: Record<string, string>;
    logisticsCosts?: Record<string, number>;
    supplierPhones?: Record<string, string>;
    supplierLegalNames?: Record<string, string>;
    supplierSpheres?: Record<string, string[]>;
    supplierAllRegions?: Record<string, boolean>;
    supplierRegions?: Record<string, string[]>;
    supplierDistricts?: Record<string, string[]>;
    supplierAssignedCodes?: Record<string, string>;
    facilitators?: string[];
    facilitatorLegalNames?: Record<string, string>;
    facilitatorRepresentatives?: Record<string, string>;
    facilitatorPhones?: Record<string, string>;
    facilitatorEmails?: Record<string, string>;
    facilitatorRegions?: Record<string, string>;
    facilitatorCodes?: Record<string, string>;
}

export type { DeviceAuditInfo } from "./lib/deviceFingerprint";
