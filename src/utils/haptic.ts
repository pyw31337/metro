/**
 * Cross-platform haptic feedback utility.
 * Uses Vibration API (Android) with no-op fallback on iOS/desktop.
 */
export function hapticLight() {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(10);
    }
}

export function hapticMedium() {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(25);
    }
}

export function hapticError() {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([20, 50, 20]);
    }
}

export function hapticSuccess() {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([10, 30, 10]);
    }
}
