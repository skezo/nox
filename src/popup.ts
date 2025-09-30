import { DomainConfig } from './types.js';
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
  syncInputs
} from './utils/dom.js';
import {
  DEFAULT_INVERT_VALUE,
  ELEMENT_IDS,
  CSS_CLASSES
} from './constants.js';

// Get DOM elements
const domainInput = document.getElementById(ELEMENT_IDS.domainInput) as HTMLInputElement;
const invertInput = document.getElementById(ELEMENT_IDS.invertInput) as HTMLInputElement;
const invertRange = document.getElementById(ELEMENT_IDS.invertRange) as HTMLInputElement;
const subdomainsCheckbox = document.getElementById(ELEMENT_IDS.subdomainsCheckbox) as HTMLInputElement;
const addDomainForm = document.getElementById(ELEMENT_IDS.addDomainForm) as HTMLFormElement;
const useCurrentBtn = document.getElementById(ELEMENT_IDS.useCurrentBtn) as HTMLButtonElement;
const domainsList = document.getElementById(ELEMENT_IDS.domainsList) as HTMLDivElement;

// Sync form inputs and enable live preview
syncInputs(invertRange, invertInput);

// Live preview as user adjusts invert value
let previewTimeout: number;
const enableLivePreview = () => {
  clearTimeout(previewTimeout);
  previewTimeout = window.setTimeout(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.id) {
      const invertValue = parseFloat(invertInput.value);
      await chrome.tabs.sendMessage(tab.id, {
        action: 'preview',
        invertValue
      }).catch(() => {
        // Ignore errors if content script not ready
      });
    }
  }, 100); // Debounce by 100ms for smooth sliding
};

invertRange.addEventListener('input', enableLivePreview);
invertInput.addEventListener('input', enableLivePreview);

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

  const domainMeta = createElement('p', {
    className: CSS_CLASSES.domainMeta,
    textContent: `Invert: ${config.invertValue}${config.includeSubdomains ? ' • Includes subdomains' : ''}`
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
    value: config.invertValue,
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

  editSection.appendChild(rangeLabel);
  editSection.appendChild(rangeGroup);
  editSection.appendChild(subdomainsGroup);

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
  const invertValue = parseFloat(invertInput.value);
  const includeSubdomains = subdomainsCheckbox.checked;

  if (!domain) return;

  await addOrUpdateDomain({
    domain,
    invertValue,
    includeSubdomains,
    enabled: true
  });

  // Refresh current tab immediately
  await refreshCurrentTab();

  // Reset form
  domainInput.value = '';
  invertInput.value = String(DEFAULT_INVERT_VALUE);
  invertRange.value = String(DEFAULT_INVERT_VALUE);
  subdomainsCheckbox.checked = false;

  await loadDomains();
});

// Initial load
loadDomains();