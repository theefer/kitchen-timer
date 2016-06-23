
const navigator = window.navigator;

export function vibrate() {
    // TODO: as stream (cancellable)
    if (navigator.vibrate) {
        navigator.vibrate([200, 100, 200]);
    } else {
        // Noop - can't vibrate
    }
}
