
export const timerModel = (duration, params = {}) => {
    const name = params.name || '';
    const remaining = typeof params.remaining !== 'undefined' ? params.remaining : duration;
    const running = params.running || false;
    const editing = params.editing || false;
    return {
        duration,
        name,
        remaining,
        running,
        editing, // TODO: or separate state, only one at a time? clear UI, fade others
        get remainingMinutes() { return Math.floor(remaining / 60); },
        get remainingSeconds() { return remaining % 60; },
        get pristine() { return duration == remaining; },
        get finished() { return remaining == 0; },
        start() {
            // TODO: how to call finished() and reset()?
            if (remaining > 0) {
                return timerModel(duration, {name, running: true, editing, remaining});
            } else {
                // If finished, reset before restarting
                return timerModel(duration, {name, running: true, editing, remaining: duration});
            }
        },
        pause() { return timerModel(duration, {name, running: false, editing, remaining}); },
        reset() { return timerModel(duration, {name, running: false, editing, remaining: duration}); },
        edit() { return timerModel(duration, {name, running: false, editing: true, remaining}); },
        editDone(newDuration, newName) { return timerModel(newDuration, {name: newName, running, editing: false, remaining: newDuration}); },
        decrement() {
            if (remaining > 0) {
                return timerModel(duration, {name, running, remaining: remaining - 1});
            } else {
                return timerModel(duration, {name, running: false, remaining: 0});
            }
        },
    };
};
