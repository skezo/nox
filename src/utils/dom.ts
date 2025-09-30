import {
  MIN_INVERT_VALUE,
  MAX_INVERT_VALUE,
  INVERT_STEP
} from '../constants.js';

export function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: {
    className?: string;
    textContent?: string;
    id?: string;
    attributes?: Record<string, string>;
  } = {}
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);

  if (options.className) element.className = options.className;
  if (options.textContent) element.textContent = options.textContent;
  if (options.id) element.id = options.id;
  if (options.attributes) {
    Object.entries(options.attributes).forEach(([key, value]) => {
      element.setAttribute(key, value);
    });
  }

  return element;
}

export function createButton(
  text: string,
  className: string,
  ariaLabel: string,
  onClick: () => void
): HTMLButtonElement {
  const button = createElement('button', {
    className,
    textContent: text,
    attributes: { 'aria-label': ariaLabel }
  });
  button.addEventListener('click', onClick);
  return button;
}

export function createRangeInputGroup(config: {
  value: number;
  ariaLabelPrefix: string;
  onChange: (value: number) => void;
}): { container: HTMLDivElement; rangeInput: HTMLInputElement; numberInput: HTMLInputElement } {
  const container = createElement('div', { className: 'range-input-group' });

  const rangeInput = createElement('input', {
    attributes: {
      type: 'range',
      min: String(MIN_INVERT_VALUE),
      max: String(MAX_INVERT_VALUE),
      step: String(INVERT_STEP),
      value: String(config.value),
      'aria-label': `${config.ariaLabelPrefix} slider`
    }
  }) as HTMLInputElement;

  const numberInput = createElement('input', {
    attributes: {
      type: 'number',
      min: String(MIN_INVERT_VALUE),
      max: String(MAX_INVERT_VALUE),
      step: String(INVERT_STEP),
      value: String(config.value),
      'aria-label': `${config.ariaLabelPrefix} number input`
    }
  }) as HTMLInputElement;

  syncInputs(rangeInput, numberInput, config.onChange);

  container.appendChild(rangeInput);
  container.appendChild(numberInput);

  return { container, rangeInput, numberInput };
}

export function syncInputs(
  rangeInput: HTMLInputElement,
  numberInput: HTMLInputElement,
  onChange?: (value: number) => void
): void {
  rangeInput.addEventListener('input', () => {
    numberInput.value = rangeInput.value;
  });

  numberInput.addEventListener('input', () => {
    rangeInput.value = numberInput.value;
  });

  if (onChange) {
    const changeHandler = (e: Event) => {
      const target = e.target as HTMLInputElement;
      onChange(parseFloat(target.value));
    };

    rangeInput.addEventListener('change', changeHandler);
    numberInput.addEventListener('change', changeHandler);
  }
}

export function createCheckboxGroup(config: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}): HTMLDivElement {
  const container = createElement('div', { className: 'checkbox-group' });

  const checkbox = createElement('input', {
    id: config.id,
    attributes: { type: 'checkbox' }
  }) as HTMLInputElement;
  checkbox.checked = config.checked;
  checkbox.addEventListener('change', () => config.onChange(checkbox.checked));

  const label = createElement('label', {
    textContent: config.label,
    attributes: { for: config.id }
  });

  container.appendChild(checkbox);
  container.appendChild(label);

  return container;
}