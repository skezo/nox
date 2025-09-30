/**
 * Nox Content Script
 * Runs at document_start to prevent white flash
 * Supports both smart mode (OKLCH) and filter mode (fallback)
 */

import { NoxScheduler } from './smart-mode';
import type { DomainConfig, Mode, NoxConfig } from './types';
import { STORAGE_KEY } from './constants';

// ============================================================================
// Phase 0: Anti-Flash
// ============================================================================

// Apply Phase 0 immediately
const html = document.documentElement;
html.classList.add('nox-dark', 'nox-boot');

// Remove boot class after two frames
requestAnimationFrame(() =>
  requestAnimationFrame(() => html.classList.remove('nox-boot'))
);

// ============================================================================
// Storage & Domain Matching
// ============================================================================

async function getDomains(): Promise<DomainConfig[]> {
  const result = await chrome.storage.sync.get(STORAGE_KEY);
  return (result[STORAGE_KEY] as DomainConfig[]) || [];
}

function getCurrentDomain(): string {
  return window.location.hostname;
}

function domainMatches(
  configDomain: string,
  currentDomain: string,
  includeSubdomains: boolean
): boolean {
  if (configDomain === currentDomain) {
    return true;
  }

  if (includeSubdomains) {
    return currentDomain.endsWith(`.${configDomain}`);
  }

  return false;
}

function findMatchingConfig(
  domains: DomainConfig[],
  currentDomain: string
): DomainConfig | undefined {
  return domains.find(
    (config) =>
      config.enabled &&
      domainMatches(config.domain, currentDomain, config.includeSubdomains)
  );
}

// ============================================================================
// Mode Handlers
// ============================================================================

let scheduler: NoxScheduler | null = null;

/**
 * Initialize smart mode with NoxScheduler
 */
function initSmartMode(config: DomainConfig): void {
  const noxConfig: NoxConfig = {
    debug: false,
    ...(config.thresholds && {
      darkThreshold: config.thresholds.dark,
      brightThreshold: config.thresholds.bright,
    }),
  };

  scheduler = new NoxScheduler(document, noxConfig);

  // Seed on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      scheduler?.seed();
      scheduler?.runCycle(false);
    });
  } else {
    scheduler.seed();
    scheduler.runCycle(false);
  }

  console.log('[NOX] Smart mode initialized');
}

/**
 * Initialize filter mode (fallback)
 */
function initFilterMode(config: DomainConfig): void {
  html.classList.add('nox-filter');

  const invertValue = config.invertValue ?? 0.88;
  html.style.setProperty('--nox-invert', invertValue.toString());
  html.style.setProperty('--nox-hue', '180deg');

  console.log(`[NOX] Filter mode initialized (invert=${invertValue})`);
}

/**
 * Clean up any active mode
 */
function cleanup(): void {
  // Destroy scheduler
  scheduler?.destroy();
  scheduler = null;

  // Remove classes
  html.classList.remove('nox-dark', 'nox-filter', 'nox-boot');

  // Remove CSS variables
  html.style.removeProperty('--nox-invert');
  html.style.removeProperty('--nox-hue');

  console.log('[NOX] Cleaned up');
}

/**
 * Apply configuration based on mode
 */
function applyConfig(config: DomainConfig): void {
  cleanup();

  // Re-add nox-dark for Phase 0 styles
  html.classList.add('nox-dark');

  const mode: Mode = config.mode || 'smart';

  switch (mode) {
    case 'smart':
      initSmartMode(config);
      break;

    case 'filter':
      initFilterMode(config);
      break;

    case 'off':
      cleanup();
      break;
  }
}

// ============================================================================
// Initialization
// ============================================================================

async function init(): Promise<void> {
  const domains = await getDomains();
  const currentDomain = getCurrentDomain();
  const matchingConfig = findMatchingConfig(domains, currentDomain);

  if (matchingConfig) {
    applyConfig(matchingConfig);
  } else {
    // No config found, remove Phase 0 styles
    cleanup();
  }
}

// Run init
init();

// ============================================================================
// Message Passing (from popup)
// ============================================================================

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'refresh') {
    init();
    sendResponse({ success: true });
  } else if (message.action === 'preview') {
    // Preview mode for popup adjustments
    const previewConfig: DomainConfig = {
      domain: getCurrentDomain(),
      enabled: true,
      includeSubdomains: false,
      mode: message.mode || 'filter',
      invertValue: message.invertValue ?? 0.88,
      customSelectors: message.customSelectors || [],
    };
    applyConfig(previewConfig);
    sendResponse({ success: true });
  }

  return true; // Keep message channel open for async response
});

// ============================================================================
// Storage Change Listener
// ============================================================================

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && changes[STORAGE_KEY]) {
    init();
  }
});
