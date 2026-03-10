// Haptic feedback utilities for mobile devices

export function vibrateLight(): void {
  if ("vibrate" in navigator) {
    navigator.vibrate(50);
  }
}

export function vibrateSuccess(): void {
  if ("vibrate" in navigator) {
    navigator.vibrate([100, 50, 100]);
  }
}

export function vibrateError(): void {
  if ("vibrate" in navigator) {
    navigator.vibrate([200, 100, 200]);
  }
}

export function vibratePattern(pattern: number[]): void {
  if ("vibrate" in navigator) {
    navigator.vibrate(pattern);
  }
}
