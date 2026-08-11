import { onUnmounted } from 'vue';

export interface LongPressOptions {
  /** Delay in ms before auto-repeat kicks in (default: 300ms) */
  initialDelayMs?: number;
  /** Initial interval between steps in ms (default: 120ms) */
  initialIntervalMs?: number;
  /** Minimum interval speed cap in ms (default: 25ms) */
  minIntervalMs?: number;
  /** Acceleration factor per tick (default: 0.88 -> speeds up interval each tick) */
  accelerationFactor?: number;
}

/**
 * OOP Class `AutoRepeatStepper`
 * Encapsulates press-and-hold timer, recursive acceleration, progressive step multipliers,
 * and safety cleanup listeners.
 */
export class AutoRepeatStepper {
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private tickCount = 0;
  private currentInterval: number;
  private activeAction: ((stepMultiplier: number) => void) | null = null;
  private options: Required<LongPressOptions>;

  constructor(options?: LongPressOptions) {
    this.options = {
      initialDelayMs: options?.initialDelayMs ?? 300,
      initialIntervalMs: options?.initialIntervalMs ?? 120,
      minIntervalMs: options?.minIntervalMs ?? 25,
      accelerationFactor: options?.accelerationFactor ?? 0.88,
    };
    this.currentInterval = this.options.initialIntervalMs;
  }

  /**
   * Start pressing action (mouse down / touch start)
   */
  public start(action: (stepMultiplier: number) => void): void {
    this.stop();
    this.activeAction = action;
    this.tickCount = 1;
    this.currentInterval = this.options.initialIntervalMs;

    // Trigger immediate single step on click/tap
    this.activeAction(1);

    // After initial delay, begin auto-accelerating repeat loop
    this.timerId = setTimeout(() => {
      this.runLoop();
    }, this.options.initialDelayMs);
  }

  /**
   * Recursive loop with exponential acceleration and progressive step multipliers
   */
  private runLoop(): void {
    if (!this.activeAction) return;

    this.tickCount++;
    const stepMultiplier = this.calculateStepMultiplier();

    this.activeAction(stepMultiplier);

    // Speed acceleration: decrease interval duration
    this.currentInterval = Math.max(
      this.options.minIntervalMs,
      Math.floor(this.currentInterval * this.options.accelerationFactor)
    );

    this.timerId = setTimeout(() => {
      this.runLoop();
    }, this.currentInterval);
  }

  /**
   * Calculate step multiplier based on hold duration (ticks)
   * e.g. 1x for short hold, 2x after 10 ticks, 5x after 20 ticks, 10x after 35 ticks
   */
  private calculateStepMultiplier(): number {
    if (this.tickCount > 35) return 10;
    if (this.tickCount > 20) return 5;
    if (this.tickCount > 10) return 2;
    return 1;
  }

  /**
   * Stop pressing action immediately
   */
  public stop(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.activeAction = null;
    this.tickCount = 0;
  }
}

/**
 * Vue 3 Composable `useLongPressStep`
 * Exposes OOP Stepper instance and Vue event binding helper `getHoldProps`.
 */
export function useLongPressStep(options?: LongPressOptions) {
  const stepper = new AutoRepeatStepper(options);

  onUnmounted(() => {
    stepper.stop();
  });

  /**
   * Returns Vue template event listeners for mouse & touch interaction
   */
  function getHoldProps(stepAction: (stepMultiplier: number) => void) {
    const onStart = (e: Event) => {
      if (e.cancelable && e.type === 'touchstart') e.preventDefault();
      stepper.start(stepAction);
    };

    const onStop = () => {
      stepper.stop();
    };

    return {
      onMousedown: onStart,
      onMouseup: onStop,
      onMouseleave: onStop,
      onTouchstart: onStart,
      onTouchend: onStop,
      onTouchcancel: onStop,
    };
  }

  return {
    stepper,
    getHoldProps,
    startPress: (action: (stepMultiplier: number) => void) => stepper.start(action),
    stopPress: () => stepper.stop(),
  };
}
