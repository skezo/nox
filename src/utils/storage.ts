import { DomainConfig, StorageData } from '../types.js';
import { STORAGE_KEY } from '../constants.js';

export async function getDomains(): Promise<DomainConfig[]> {
  const result = await chrome.storage.sync.get(STORAGE_KEY) as StorageData;
  return result.domains || [];
}

export async function saveDomains(domains: DomainConfig[]): Promise<void> {
  await chrome.storage.sync.set({ [STORAGE_KEY]: domains });
}

export async function updateDomain(
  index: number,
  updates: Partial<DomainConfig>
): Promise<void> {
  const domains = await getDomains();
  if (domains[index]) {
    Object.assign(domains[index], updates);
    await saveDomains(domains);
  }
}

export async function deleteDomain(index: number): Promise<void> {
  const domains = await getDomains();
  domains.splice(index, 1);
  await saveDomains(domains);
}

export async function toggleDomain(index: number): Promise<void> {
  const domains = await getDomains();
  if (domains[index]) {
    domains[index].enabled = !domains[index].enabled;
    await saveDomains(domains);
  }
}

export async function addOrUpdateDomain(newConfig: DomainConfig): Promise<void> {
  const domains = await getDomains();
  const existingIndex = domains.findIndex(d => d.domain === newConfig.domain);

  if (existingIndex !== -1) {
    domains[existingIndex] = { ...domains[existingIndex], ...newConfig, enabled: true };
  } else {
    domains.push(newConfig);
  }

  await saveDomains(domains);
}