// Storage keys
export const STORAGE_KEY = 'domains';

// Default values
export const DEFAULT_INVERT_VALUE = 0.88;
export const MIN_INVERT_VALUE = 0;
export const MAX_INVERT_VALUE = 1;
export const INVERT_STEP = 0.01;

// CSS
export const STYLE_ID = 'nox-style';
export const HUE_ROTATE_DEGREE = 180;
export const NOX_SAFE_COLOR = '#ffffff';

// Known custom elements that should preserve original colors
export const PRESERVE_ELEMENTS = [
  'smp-toucan-player',
  // Add more custom elements here as needed
] as const;

// Element IDs
export const ELEMENT_IDS = {
  domainInput: 'domain-input',
  invertInput: 'invert-input',
  invertRange: 'invert-range',
  subdomainsCheckbox: 'subdomains-checkbox',
  addDomainForm: 'add-domain-form',
  useCurrentBtn: 'use-current-btn',
  domainsList: 'domains-list'
} as const;

// CSS Classes
export const CSS_CLASSES = {
  domainCard: 'domain-card',
  domainHeader: 'domain-header',
  domainInfo: 'domain-info',
  domainMeta: 'domain-meta',
  domainControls: 'domain-controls',
  domainEdit: 'domain-edit',
  toggleBtn: 'toggle-btn',
  deleteBtn: 'delete-btn',
  rangeInputGroup: 'range-input-group',
  checkboxGroup: 'checkbox-group',
  editLabel: 'edit-label',
  emptyState: 'empty-state'
} as const;