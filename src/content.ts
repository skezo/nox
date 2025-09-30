// Content scripts cannot use ES module imports - constants are inlined from src/constants.ts
// TODO: Clean this up
interface DomainConfig {
  domain: string;
  invertValue: number;
  includeSubdomains: boolean;
  enabled: boolean;
}

const STORAGE_KEY = 'domains';
const STYLE_ID = 'nox-style';
const HUE_ROTATE_DEGREE = 180;
const NOX_SAFE_COLOR = '#ffffff';
const PRESERVE_ELEMENTS = [
  'smp-toucan-player',
  // Add more custom elements here as needed
] as const;

// Cache for instant application on subsequent loads
let domainsCache: DomainConfig[] | null = null;

async function getDomains(): Promise<DomainConfig[]> {
  const result = await chrome.storage.sync.get(STORAGE_KEY);
  domainsCache = (result[STORAGE_KEY] as DomainConfig[]) || [];
  return domainsCache;
}

function getCurrentDomain(): string {
  return window.location.hostname;
}

function domainMatches(configDomain: string, currentDomain: string, includeSubdomains: boolean): boolean {
  if (configDomain === currentDomain) {
    return true;
  }

  if (includeSubdomains) {
    return currentDomain.endsWith(`.${configDomain}`);
  }

  return false;
}

function createFilterCSS(invertValue: number): string {
  return `invert(${invertValue}) hue-rotate(${HUE_ROTATE_DEGREE}deg)`;
}

function getOrCreateStyleElement(): HTMLStyleElement {
  let styleElement = document.getElementById(STYLE_ID) as HTMLStyleElement;

  if (!styleElement) {
    styleElement = document.createElement('style');
    styleElement.id = STYLE_ID;
    // Insert at the beginning of head for highest priority
    (document.head || document.documentElement).insertBefore(
      styleElement,
      (document.head || document.documentElement).firstChild
    );
  }

  return styleElement;
}

function applyDarkMode(invertValue: number): void {
  const styleElement = getOrCreateStyleElement();
  const filterCSS = createFilterCSS(invertValue);
  const preserveSelectors = [
    'img',
    'picture',
    'video',
    'canvas',
    'svg',
    '[style*="background-image"]',
    '[data-nox-preserve]',
    ...PRESERVE_ELEMENTS
  ].join(',\n      ');

  styleElement.textContent = `
    :root {
      --nox-c-safe: ${NOX_SAFE_COLOR};
    }

    html {
      filter: ${filterCSS};
      background: var(--nox-c-safe);
    }

    /* Preserve original colors for media and custom elements */
    :is(
      ${preserveSelectors}
    ) {
      filter: ${filterCSS};
      color: var(--nox-c-safe);
    }
  `;
}

function removeDarkMode(): void {
  const styleElement = document.getElementById(STYLE_ID);
  if (styleElement) {
    styleElement.remove();
  }
}

function findMatchingConfig(domains: DomainConfig[], currentDomain: string): DomainConfig | undefined {
  return domains.find(config =>
    config.enabled && domainMatches(config.domain, currentDomain, config.includeSubdomains)
  );
}

async function checkAndApplyDarkMode(): Promise<void> {
  const domains = await getDomains();
  const currentDomain = getCurrentDomain();
  const matchedConfig = findMatchingConfig(domains, currentDomain);

  if (matchedConfig) {
    applyDarkMode(matchedConfig.invertValue);
  } else {
    removeDarkMode();
  }
}

function applyFilterToBackgroundImages(invertValue: number): void {
  const filterCSS = createFilterCSS(invertValue);
  const elements = document.querySelectorAll('[style*="background-image"]');

  elements.forEach(element => {
    if (element instanceof HTMLElement) {
      const currentFilter = getComputedStyle(element).filter;
      if (!currentFilter || currentFilter === 'none') {
        element.style.filter = filterCSS;
      }
    }
  });
}

// Synchronously check cache first for instant application
if (domainsCache) {
  const currentDomain = getCurrentDomain();
  const matchedConfig = findMatchingConfig(domainsCache, currentDomain);
  if (matchedConfig) {
    applyDarkMode(matchedConfig.invertValue);
  }
}

// Then do full async check (will update if storage changed)
checkAndApplyDarkMode();

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && changes.domains) {
    checkAndApplyDarkMode();
  }
});

// Listen for messages from popup to refresh immediately
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'refresh') {
    checkAndApplyDarkMode();
    sendResponse({ success: true });
  } else if (message.action === 'preview') {
    // Apply preview without saving to storage
    applyDarkMode(message.invertValue);
    sendResponse({ success: true });
  }
  return true;
});

// Observe DOM changes to catch dynamically added elements with background images
const observer = new MutationObserver(() => {
  const styleElement = document.getElementById(STYLE_ID);
  if (styleElement) {
    const match = styleElement.textContent?.match(/invert\(([\d.]+)\)/);
    if (match) {
      const invertValue = parseFloat(match[1]);
      applyFilterToBackgroundImages(invertValue);
    }
  }
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['style']
});