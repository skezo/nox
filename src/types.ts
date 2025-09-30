export type Mode = 'filter' | 'smart' | 'off';

export interface DomainConfig {
  domain: string;
  enabled: boolean;
  includeSubdomains: boolean;
  mode: Mode;                        // default: 'smart'
  invertValue?: number;              // filter mode only (0-1)
  customSelectors?: string[];        // additional elements to preserve/seed
  thresholds?: {
    dark?: number;                   // override darkThreshold
    bright?: number;                 // override brightThreshold
  };
}

export interface StorageData {
  domains: DomainConfig[];
}

// Smart Mode Types
export interface NoxConfig {
  darkThreshold?: number;           // default: 0.10
  brightThreshold?: number;          // default: 0.85
  readBudgetMs?: number;             // default: 4
  writeBudgetMs?: number;            // default: 4
  maxQueue?: number;                 // default: 5000
  observeResizeMinChildren?: number; // default: 10
  debug?: boolean;                   // default: false
}

export interface NoxMetrics {
  reads: number;
  writes: number;
  cacheHits: number;
  avgReadNs: number;
  avgWriteNs: number;
  queuedVisible: number;
  queuedHidden: number;
}