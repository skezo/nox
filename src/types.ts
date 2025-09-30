export interface DomainConfig {
  domain: string;
  invertValue: number;
  includeSubdomains: boolean;
  enabled: boolean;
}

export interface StorageData {
  domains: DomainConfig[];
}