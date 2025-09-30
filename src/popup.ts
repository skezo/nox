import { DomainConfig, Mode } from './types.js';
import {
  getDomains,
  addOrUpdateDomain,
  toggleDomain as toggleDomainStorage,
  deleteDomain as deleteDomainStorage,
  updateDomain
} from './utils/storage.js';
import {
  createElement,
  createButton,
  createRangeInputGroup,
  createCheckboxGroup,
  createTextareaGroup,
  syncInputs
} from './utils/dom.js';
import {
  DEFAULT_INVERT_VALUE,
  ELEMENT_IDS,
  CSS_CLASSES
} from './constants.js';

// Get DOM elements
const domainInput = document.getElementById(ELEMENT_IDS.domainInput) as HTMLInputElement;
const modeSelect = document.getElementById('mode-select') as HTMLSelectElement;
const invertGroup = document.getElementById('invert-group') as HTMLDivElement;
const invertInput = document.getElementById(ELEMENT_IDS.invertInput) as HTMLInputElement;
const invertRange = document.getElementById(ELEMENT_IDS.invertRange) as HTMLInputElement;
const subdomainsCheckbox = document.getElementById(ELEMENT_IDS.subdomainsCheckbox) as HTMLInputElement;
const customSelectorsInput = document.getElementById(ELEMENT_IDS.customSelectorsInput) as HTMLTextAreaElement;
const addDomainForm = document.getElementById(ELEMENT_IDS.addDomainForm) as HTMLFormElement;
const useCurrentBtn = document.getElementById(ELEMENT_IDS.useCurrentBtn) as HTMLButtonElement;
const clearPreviewBtn = document.getElementById(ELEMENT_IDS.clearPreviewBtn) as HTMLButtonElement;
const domainsList = document.getElementById(ELEMENT_IDS.domainsList) as HTMLDivElement;

// Sync form inputs and enable live preview
syncInputs(invertRange, invertInput);

// Toggle invert controls based on mode
function updateInvertVisibility(): void {
  const mode = modeSelect.value as Mode;
  invertGroup.style.display = mode === 'filter' ? 'block' : 'none';
}

modeSelect.addEventListener('change', () => {
  updateInvertVisibility();
  enableLivePreview();
});

updateInvertVisibility();

// Parse custom selectors from textarea
function parseCustomSelectors(input: string): string[] {
  return input
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

// Live preview as user adjusts settings
let previewTimeout: number;
const enableLivePreview = () => {
  clearTimeout(previewTimeout);
  previewTimeout = window.setTimeout(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.id) {
      const mode = modeSelect.value as Mode;
      const invertValue = parseFloat(invertInput.value);
      const customSelectors = parseCustomSelectors(customSelectorsInput.value);
      await chrome.tabs.sendMessage(tab.id, {
        action: 'preview',
        mode,
        invertValue,
        customSelectors
      }).catch(() => {
        // Ignore errors if content script not ready
      });
    }
  }, 100); // Debounce by 100ms for smooth sliding
};

invertRange.addEventListener('input', enableLivePreview);
invertInput.addEventListener('input', enableLivePreview);
customSelectorsInput.addEventListener('input', enableLivePreview);

// Get current tab domain
useCurrentBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab.url) {
    try {
      const url = new URL(tab.url);
      domainInput.value = url.hostname;
      // Enable preview when clicking "Use Current"
      enableLivePreview();
    } catch (error) {
      console.error('Invalid URL:', error);
    }
  }
});

// Clear preview and reset form
clearPreviewBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab.id) {
    // Refresh tab to restore original state
    await chrome.tabs.sendMessage(tab.id, { action: 'refresh' }).catch(() => {
      // Ignore errors if content script not ready
    });
  }

  // Reset form to defaults
  domainInput.value = '';
  modeSelect.value = 'smart';
  invertInput.value = String(DEFAULT_INVERT_VALUE);
  invertRange.value = String(DEFAULT_INVERT_VALUE);
  subdomainsCheckbox.checked = false;
  customSelectorsInput.value = '';
  updateInvertVisibility();
});

// Load and display domains
async function loadDomains(): Promise<void> {
  const domains = await getDomains();

  if (domains.length === 0) {
    domainsList.innerHTML = `<p class="${CSS_CLASSES.emptyState}">No domains added yet</p>`;
    return;
  }

  domainsList.innerHTML = '';
  domains.forEach((config, index) => {
    const domainCard = createDomainCard(config, index);
    domainsList.appendChild(domainCard);
  });
}

function createDomainCard(config: DomainConfig, index: number): HTMLElement {
  const card = createElement('div', {
    className: CSS_CLASSES.domainCard,
    attributes: { role: 'listitem' }
  });

  // Header section
  const header = createElement('div', { className: CSS_CLASSES.domainHeader });
  const domainInfo = createDomainInfo(config);
  const controls = createDomainControls(config, index);

  header.appendChild(domainInfo);
  header.appendChild(controls);

  // Edit section
  const editSection = createEditSection(config, index);

  card.appendChild(header);
  card.appendChild(editSection);

  return card;
}

function createDomainInfo(config: DomainConfig): HTMLElement {
  const domainInfo = createElement('div', { className: CSS_CLASSES.domainInfo });

  const domainName = createElement('h3', { textContent: config.domain });

  const mode = config.mode || 'smart';
  const metaParts = [`Mode: ${mode}`];

  if (mode === 'filter') {
    metaParts.push(`Invert: ${config.invertValue ?? 0.88}`);
  }

  if (config.includeSubdomains) metaParts.push('Includes subdomains');
  if (config.customSelectors && config.customSelectors.length > 0) {
    metaParts.push(`${config.customSelectors.length} custom selector${config.customSelectors.length > 1 ? 's' : ''}`);
  }

  const domainMeta = createElement('p', {
    className: CSS_CLASSES.domainMeta,
    textContent: metaParts.join(' • ')
  });

  domainInfo.appendChild(domainName);
  domainInfo.appendChild(domainMeta);

  return domainInfo;
}

function createDomainControls(config: DomainConfig, index: number): HTMLElement {
  const controls = createElement('div', { className: CSS_CLASSES.domainControls });

  const toggleBtn = createButton(
    config.enabled ? 'Enabled' : 'Disabled',
    CSS_CLASSES.toggleBtn,
    `${config.enabled ? 'Disable' : 'Enable'} dark mode for ${config.domain}`,
    async () => {
      await toggleDomainStorage(index);
      await refreshCurrentTab();
      await loadDomains();
    }
  );
  toggleBtn.dataset.enabled = String(config.enabled);

  const deleteBtn = createButton(
    'Delete',
    CSS_CLASSES.deleteBtn,
    `Delete ${config.domain}`,
    async () => {
      await deleteDomainStorage(index);
      await refreshCurrentTab();
      await loadDomains();
    }
  );

  controls.appendChild(toggleBtn);
  controls.appendChild(deleteBtn);

  return controls;
}

function createEditSection(config: DomainConfig, index: number): HTMLElement {
  const editSection = createElement('div', { className: CSS_CLASSES.domainEdit });

  // Invert value label
  const rangeLabel = createElement('label', {
    textContent: 'Invert Value:',
    className: CSS_CLASSES.editLabel
  });

  // Range input group
  const { container: rangeGroup } = createRangeInputGroup({
    value: config.invertValue ?? DEFAULT_INVERT_VALUE,
    ariaLabelPrefix: `Invert value for ${config.domain}`,
    onChange: async (value) => {
      await updateDomain(index, { invertValue: value });
      await refreshCurrentTab();
    }
  });

  // Subdomain checkbox
  const subdomainsGroup = createCheckboxGroup({
    id: `subdomains-${index}`,
    label: 'Include subdomains',
    checked: config.includeSubdomains,
    onChange: async (checked) => {
      await updateDomain(index, { includeSubdomains: checked });
      await refreshCurrentTab();
      await loadDomains();
    }
  });

  // Custom selectors textarea
  const customSelectorsGroup = createTextareaGroup({
    id: `custom-selectors-${index}`,
    label: 'Custom Selectors:',
    value: config.customSelectors?.join(', ') || '',
    placeholder: 'e.g., .video-player, #banner',
    helpText: 'Comma-separated CSS selectors to preserve',
    onChange: async (selectors) => {
      await updateDomain(index, { customSelectors: selectors.length > 0 ? selectors : undefined });
      await refreshCurrentTab();
      await loadDomains();
    }
  });

  editSection.appendChild(rangeLabel);
  editSection.appendChild(rangeGroup);
  editSection.appendChild(subdomainsGroup);
  editSection.appendChild(customSelectorsGroup);

  return editSection;
}

// Helper to trigger content script refresh on current tab
async function refreshCurrentTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab.id) {
    await chrome.tabs.sendMessage(tab.id, { action: 'refresh' }).catch(() => {
      // Ignore errors if content script not ready
    });
  }
}

// Add new domain
addDomainForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const domain = domainInput.value.trim().toLowerCase();
  const mode = modeSelect.value as Mode;
  const invertValue = parseFloat(invertInput.value);
  const includeSubdomains = subdomainsCheckbox.checked;
  const customSelectors = parseCustomSelectors(customSelectorsInput.value);

  if (!domain) return;

  const newConfig: DomainConfig = {
    domain,
    enabled: true,
    includeSubdomains,
    mode,
    ...(mode === 'filter' && { invertValue }),
    ...(customSelectors.length > 0 && { customSelectors })
  };

  await addOrUpdateDomain(newConfig);

  // Refresh current tab immediately
  await refreshCurrentTab();

  // Reset form
  domainInput.value = '';
  modeSelect.value = 'smart';
  invertInput.value = String(DEFAULT_INVERT_VALUE);
  invertRange.value = String(DEFAULT_INVERT_VALUE);
  subdomainsCheckbox.checked = false;
  customSelectorsInput.value = '';
  updateInvertVisibility();

  await loadDomains();
});

// Initial load
loadDomains();