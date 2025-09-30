/**
 * Nox Smart Mode - OKLCH-based Intelligent Dark Mode
 *
 * Two-phase boot system:
 * - Phase 0: Anti-flash CSS (color-scheme: dark)
 * - Phase 1: Progressive refinement with frame-budgeted scheduler
 */

import type { NoxConfig, NoxMetrics } from './types';

// ============================================================================
// Configuration
// ============================================================================

const DEFAULTS: Required<NoxConfig> = {
  darkThreshold: 0.10,
  brightThreshold: 0.85,
  readBudgetMs: 4,
  writeBudgetMs: 4,
  maxQueue: 5000,
  observeResizeMinChildren: 10,
  debug: false,
};

// ============================================================================
// Internal Types
// ============================================================================

type Classification = 'already-dark' | 'bright-bg' | 'mid';

interface CacheEntry {
  classification: Classification;
  styleKey: string;
}

// ============================================================================
// Luminance & Classification
// ============================================================================

/**
 * Calculate linearized sRGB luminance (Y)
 * Uses official ITU-R BT.709 coefficients
 */
function luma(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map(v => {
    v /= 255;
    return v <= 0.04045
      ? v / 12.92
      : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Parse CSS color to RGB tuple
 */
function parseColor(color: string): [number, number, number] | null {
  // Handle rgb()/rgba()
  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    return [parseInt(rgbMatch[1]), parseInt(rgbMatch[2]), parseInt(rgbMatch[3])];
  }

  // Handle hex colors
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    if (hex.length === 3) {
      return [
        parseInt(hex[0] + hex[0], 16),
        parseInt(hex[1] + hex[1], 16),
        parseInt(hex[2] + hex[2], 16),
      ];
    }
    if (hex.length === 6) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
      ];
    }
  }

  return null;
}

/**
 * Generate cache key from tone-affecting properties
 */
function styleKeyForTone(cs: CSSStyleDeclaration): string {
  const bgImg = cs.backgroundImage !== 'none' ? 'img' : '';
  return `${cs.backgroundColor}|${bgImg}|o${cs.opacity}|f${cs.filter}|m${cs.mixBlendMode}`;
}

// ============================================================================
// NoxScheduler
// ============================================================================

export class NoxScheduler {
  private config: Required<NoxConfig>;

  // Queues
  private qVisible = new Set<Element>();
  private qHidden = new Set<Element>();

  // Cache
  private cache = new WeakMap<Element, CacheEntry>();

  // Observers
  private io: IntersectionObserver;
  private mo: MutationObserver;
  private ro?: ResizeObserver;
  private shadowObservers = new Map<ShadowRoot, MutationObserver>();

  // State
  private frameId?: number;
  private idleId?: number;
  private backpressure = false;
  private microtaskScheduled = false;
  private consecutiveFrames = 0;

  // Metrics
  private metrics: NoxMetrics = {
    reads: 0,
    writes: 0,
    cacheHits: 0,
    avgReadNs: 0,
    avgWriteNs: 0,
    queuedVisible: 0,
    queuedHidden: 0,
  };

  constructor(
    private root: Document | ShadowRoot,
    config: NoxConfig = {}
  ) {
    this.config = { ...DEFAULTS, ...config };

    // Setup IntersectionObserver for visibility prioritization
    this.io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            // Move from hidden to visible queue
            this.qHidden.delete(entry.target);
            this.qVisible.add(entry.target);
          } else {
            // Move from visible to hidden queue
            this.qVisible.delete(entry.target);
            this.qHidden.add(entry.target);
          }
        }
        this.scheduleWork();
      },
      { threshold: 0 }
    );

    // Setup MutationObserver for DOM changes
    this.mo = new MutationObserver((mutations) => this.onMutate(mutations));
    this.mo.observe(this.root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style'],
    });

    // Setup ResizeObserver for large containers
    if ('ResizeObserver' in window) {
      this.ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const el = entry.target;
          if (el.children.length >= this.config.observeResizeMinChildren) {
            this.enqueue(el);
          }
        }
      });
    }

    // Hook attachShadow for future shadow roots
    this.hookAttachShadow();

    // Find existing shadow roots
    this.findExistingShadows();

    if (this.config.debug) {
      console.log('[NOX] Scheduler initialized');
    }
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Seed the scheduler with high-impact elements
   */
  seed(): void {
    const seedStart = performance.now();
    const selectors = [
      'body',
      'main',
      'header',
      'footer',
      'article',
      'section',
      'nav',
      'aside',
      '[role="main"]',
      '[style*="background"]',
      '.modal',
      '.dialog',
      '[role="dialog"]',
    ];

    for (const selector of selectors) {
      try {
        this.root.querySelectorAll(selector).forEach((el) => this.enqueue(el));
      } catch (e) {
        // Invalid selector, skip
      }
    }

    const seedDuration = performance.now() - seedStart;
    if (this.config.debug) {
      console.log(`[NOX] Seed: ${this.qVisible.size + this.qHidden.size} elements in ${seedDuration.toFixed(2)}ms`);
    }
  }

  /**
   * Run one scheduler cycle
   */
  runCycle(seed: boolean): void {
    // Circuit breaker: detect infinite loops
    if (this.consecutiveFrames++ > 60) {
      console.error('[NOX] Infinite loop detected, shutting down');
      this.destroy();
      return;
    }

    if (this.qVisible.size === 0 && !seed) {
      this.consecutiveFrames = 0;
      return;
    }

    if (seed) {
      this.seed();
    }

    // READ PHASE
    const readStart = performance.now();
    const toWrite: Array<[Element, Classification]> = [];

    for (const el of this.qVisible) {
      if (performance.now() - readStart > this.config.readBudgetMs) break;

      const classification = this.classify(el);
      toWrite.push([el, classification]);
      this.qVisible.delete(el);
      this.metrics.reads++;
    }

    const readDuration = performance.now() - readStart;

    // WRITE PHASE
    const writeStart = performance.now();

    for (const [el, classification] of toWrite) {
      if (performance.now() - writeStart > this.config.writeBudgetMs) break;

      this.applyStable(el, classification);
      this.metrics.writes++;
    }

    const writeDuration = performance.now() - writeStart;

    // Update metrics
    this.metrics.avgReadNs = readDuration / this.metrics.reads || 0;
    this.metrics.avgWriteNs = writeDuration / this.metrics.writes || 0;
    this.metrics.queuedVisible = this.qVisible.size;
    this.metrics.queuedHidden = this.qHidden.size;

    if (this.config.debug && (this.metrics.reads % 100 === 0)) {
      console.log(
        `[NOX] Frame: ${this.metrics.reads} reads, ${this.metrics.writes} writes, ` +
        `${readDuration.toFixed(2)}ms read, ${writeDuration.toFixed(2)}ms write, ` +
        `cache hit rate: ${((this.metrics.cacheHits / this.metrics.reads) * 100).toFixed(1)}%`
      );
    }

    // Schedule next frame if work remains
    if (this.qVisible.size > 0) {
      this.frameId = requestAnimationFrame(() => this.runCycle(false));
    } else {
      this.consecutiveFrames = 0;
      this.scheduleIdleWork();
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): NoxMetrics {
    return { ...this.metrics };
  }

  /**
   * Destroy scheduler and clean up observers
   */
  destroy(): void {
    this.io.disconnect();
    this.mo.disconnect();
    this.ro?.disconnect();

    for (const observer of this.shadowObservers.values()) {
      observer.disconnect();
    }
    this.shadowObservers.clear();

    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
    }
    if (this.idleId) {
      cancelIdleCallback(this.idleId);
    }

    if (this.config.debug) {
      console.log('[NOX] Scheduler destroyed');
    }
  }

  // ==========================================================================
  // Internal Methods
  // ==========================================================================

  /**
   * Classify element based on background luminance
   */
  private classify(el: Element): Classification {
    if (!(el instanceof HTMLElement)) return 'mid';

    // Check cache first
    const cs = getComputedStyle(el);
    const styleKey = styleKeyForTone(cs);
    const cached = this.cache.get(el);

    if (cached && cached.styleKey === styleKey) {
      this.metrics.cacheHits++;
      return cached.classification;
    }

    // Parse background color
    const bgColor = parseColor(cs.backgroundColor);
    if (!bgColor) {
      // Transparent or invalid, assume mid
      const classification: Classification = 'mid';
      this.cache.set(el, { classification, styleKey });
      return classification;
    }

    // Calculate luminance
    const Y = luma(bgColor);

    // Classify
    let classification: Classification;
    if (Y < this.config.darkThreshold) {
      classification = 'already-dark';
    } else if (Y > this.config.brightThreshold) {
      classification = 'bright-bg';
    } else {
      classification = 'mid';
    }

    // Cache result
    this.cache.set(el, { classification, styleKey });

    return classification;
  }

  /**
   * Apply classification to element
   */
  private applyStable(el: Element, classification: Classification): void {
    if (!(el instanceof HTMLElement)) return;

    switch (classification) {
      case 'already-dark':
        el.classList.add('nox-no-filter');
        break;

      case 'bright-bg':
        el.classList.add('nox-bright');
        // Apply dark background via custom property
        el.style.setProperty('background', 'var(--nox-surface, oklch(0.22 0 0))', 'important');
        el.style.setProperty('color', 'var(--nox-text, oklch(0.92 0 0))', 'important');
        break;

      case 'mid':
        // Leave as-is, site may have custom styling
        break;
    }
  }

  /**
   * Enqueue element for processing
   */
  private enqueue(el: Element): void {
    // Check if already queued
    if (this.qVisible.has(el) || this.qHidden.has(el)) return;

    // Add to appropriate queue based on visibility
    this.io.observe(el);

    // Schedule work
    this.scheduleWork();
  }

  /**
   * Schedule work via micro-batch debouncing
   */
  private scheduleWork(): void {
    if (this.microtaskScheduled) return;
    this.microtaskScheduled = true;

    queueMicrotask(() => {
      this.microtaskScheduled = false;

      // Check back-pressure
      const totalQueued = this.qVisible.size + this.qHidden.size;
      if (totalQueued > this.config.maxQueue) {
        if (!this.backpressure) {
          this.mo.disconnect();
          this.backpressure = true;
          if (this.config.debug) {
            console.warn(`[NOX] Back-pressure engaged: ${totalQueued} elements queued`);
          }
        }
      } else if (this.backpressure && totalQueued < this.config.maxQueue * 0.8) {
        this.mo.observe(this.root, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ['class', 'style'],
        });
        this.backpressure = false;
        if (this.config.debug) {
          console.log('[NOX] Back-pressure released');
        }
      }

      // Schedule frame if not already scheduled
      if (!this.frameId && this.qVisible.size > 0) {
        this.frameId = requestAnimationFrame(() => this.runCycle(false));
      }
    });
  }

  /**
   * Schedule idle work for hidden elements
   */
  private scheduleIdleWork(): void {
    if (this.idleId || this.qHidden.size === 0) return;

    const rIC = window.requestIdleCallback ?? ((cb: IdleRequestCallback) => {
      const start = Date.now();
      return setTimeout(() => {
        cb({
          didTimeout: false,
          timeRemaining: () => Math.max(0, 50 - (Date.now() - start)),
        });
      }, 0) as unknown as number;
    });

    this.idleId = rIC(() => {
      this.idleId = undefined;

      // Promote 100 hidden elements to visible queue
      const toPromote = Array.from(this.qHidden).slice(0, 100);
      for (const el of toPromote) {
        this.qHidden.delete(el);
        this.qVisible.add(el);
      }

      if (this.qVisible.size > 0) {
        this.scheduleWork();
      } else if (this.qHidden.size > 0) {
        this.scheduleIdleWork();
      }
    });
  }

  /**
   * Handle mutations
   */
  private onMutate = (mutations: MutationRecord[]): void => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof Element) {
            this.enqueue(node);
            // Enqueue descendants
            node.querySelectorAll('*').forEach((el) => this.enqueue(el));
          }
        });
      } else if (mutation.type === 'attributes') {
        if (mutation.target instanceof Element) {
          // Invalidate cache on style changes
          this.cache.delete(mutation.target);
          this.enqueue(mutation.target);
        }
      }
    }
  };

  /**
   * Patch shadow root with dark styles and observer
   */
  patchShadow(root: ShadowRoot): void {
    const baseCSS = `
      :host {
        color-scheme: dark;
      }
      :host, :host * {
        --nox-bg: oklch(0.17 0 0);
        --nox-surface: oklch(0.22 0 0);
        --nox-text: oklch(0.92 0 0);
      }
      .nox-bright {
        background: var(--nox-surface) !important;
        color: var(--nox-text) !important;
      }
      .nox-no-filter {
        filter: none !important;
      }
    `;

    // Try constructable stylesheets first
    if ('adoptedStyleSheets' in root && 'CSSStyleSheet' in window) {
      try {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(baseCSS);
        root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
      } catch (e) {
        // Fallback to <style> tag
        this.injectStyleTag(root, baseCSS);
      }
    } else {
      // Fallback: <style> tag
      this.injectStyleTag(root, baseCSS);
    }

    // Observe mutations inside shadow
    const mo = new MutationObserver((mutations) => this.onMutate(mutations));
    mo.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style'],
    });
    this.shadowObservers.set(root, mo);

    // Seed shadow elements
    const shadowSelectors = [
      ':host',
      'main, article, section',
      '[style*="background"]',
      '.modal, .dialog, [role="dialog"]',
    ];

    for (const sel of shadowSelectors) {
      try {
        root.querySelectorAll(sel).forEach((el) => this.enqueue(el));
      } catch (e) {
        // Invalid selector
      }
    }

    if (this.config.debug) {
      console.log('[NOX] Patched shadow root');
    }
  }

  /**
   * Inject <style> tag as fallback
   */
  private injectStyleTag(root: ShadowRoot, css: string): void {
    const style = document.createElement('style');
    style.setAttribute('data-nox', '');
    style.textContent = css;
    root.prepend(style);
  }

  /**
   * Hook Element.prototype.attachShadow to catch future shadows
   */
  private hookAttachShadow(): void {
    const scheduler = this;
    const orig = Element.prototype.attachShadow;

    Element.prototype.attachShadow = function(init: ShadowRootInit): ShadowRoot {
      const root = orig.call(this, init);
      if (init.mode === 'open') {
        scheduler.patchShadow(root);
      }
      return root;
    };
  }

  /**
   * Find existing shadow roots on page
   */
  private findExistingShadows(root: Document | ShadowRoot = this.root): void {
    root.querySelectorAll('*').forEach((el) => {
      if (el.shadowRoot && el.shadowRoot.mode === 'open') {
        this.patchShadow(el.shadowRoot);
        this.findExistingShadows(el.shadowRoot); // Recurse
      }
    });
  }
}
