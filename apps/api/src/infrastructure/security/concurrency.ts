/** Non-blocking counting semaphore: excess callers are rejected, not queued. */
export function createSlotLimiter(max: number) {
  let active = 0;
  return {
    tryAcquire(): (() => void) | null {
      if (active >= max) return null;
      active += 1;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        active -= 1;
      };
    },
    active: () => active,
  };
}
export type SlotLimiter = ReturnType<typeof createSlotLimiter>;
