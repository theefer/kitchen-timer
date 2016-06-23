import {h} from 'virtual-dom';
// import {Observable} from 'rxjs-es/Rx';
import {Observable, Subject} from 'rx';
import {List, is as immutableIs} from 'immutable';
import leftPad from 'left-pad';

import {sequenceCombine$, h$, renderTo$} from './util';
import {speechAvailable, captureSpeech$} from './speech';
import {vibrate} from './vibration';

const toDuration = (min, sec) => min * 60 + sec;

const button = (label, attrs = {}) => {
    const clicks$ = new Subject();
    const tree = h('button', Object.assign({}, attrs, {
        type: 'button',
        onclick: (event) => clicks$.onNext(event)
    }), label);
    return {
        tree,
        events: {
            clicks$: clicks$.asObservable()
        }
    };
};

const materialIconButton = (iconName, label, attrs = {}) => {
    const icon = h('i', {className: 'material-icons'}, iconName);
    const className = 'icon-button ' + (attrs.className || '');
    const fullAttrs = Object.assign({}, attrs, {className});
    return button(icon, fullAttrs);
};

const materialLabelledIconButton = (iconName, label, attrs = {}) => {
    const icon = h('i', {className: 'material-icons'}, iconName);
    const className = 'icon-button icon-button-labelled ' + (attrs.className || '');
    const fullAttrs = Object.assign({}, attrs, {className});
    return button([icon, label], fullAttrs);
};

const input = (type, attrs) => {
    const input$ = new Subject();
    const tree = h('input', Object.assign({}, attrs, {
        type: type,
        oninput: (event) => input$.onNext(event)
    }));
    return {
        tree,
        events: {
            input$: input$.asObservable(),
            // TODO: startWith current value?
            value$: input$.map(event => event.target.value)
        }
    };
};

// TODO: name
const timerModel = (duration, {running, editing, remaining} = {running: false, editing: false, remaining: duration}) => {
    return {
        duration,
        remaining,
        get remainingMinutes() { return Math.floor(remaining / 60); },
        get remainingSeconds() { return remaining % 60; },
        get pristine() { return duration == remaining; },
        get finished() { return remaining == 0; },
        running,
        editing, // TODO: or separate state, only one at a time?
        start() {
            // TODO: how to call finished() and reset()?
            if (remaining > 0) {
                return timerModel(duration, {running: true, editing, remaining});
            } else {
                // If finished, reset before restarting
                return timerModel(duration, {running: true, editing, remaining: duration});
            }
        },
        pause() { return timerModel(duration, {running: false, editing, remaining}); },
        reset() { return timerModel(duration, {running: false, editing, remaining: duration}); },
        edit() { return timerModel(duration, {running: false, editing: true, remaining}); },
        editDone(newDuration) { return timerModel(newDuration, {running, editing: false, remaining: newDuration}); },
        decrement() {
            if (remaining > 0) {
                return timerModel(duration, {running, remaining: remaining - 1});
            } else {
                return timerModel(duration, {running: false, remaining: 0});
            }
        },
    };
};

const updateTimer = (timer, type) => {
    switch(type) {
    case 'start': return timer.start();
    case 'pause': return timer.pause();
    default:
        throw new Exception(`unexpected update type: ${type}`);
    }
};

const model = (intents) => {
    const ticker$ = Observable.interval(1000);
    const applyTime$ = ticker$.map(_ => timers => {
        return timers.map(timer => {
            return timer.running ? timer.decrement() : timer;
        });
    });
    const update$ = intents.timerUpdates$.map((update) => timers => {
        return timers.map((timer, index) => {
            return index == update.index ? updateTimer(timer, update.type) : timer;
        });
    });
    const add$ = intents.addTimer$.map((update) => timers => {
        return timers.concat(timerModel(300));
    });
    const reset$ = intents.resetTimer$.map((update) => timers => {
        return timers.map((timer, index) => {
            return index == update.index ? timer.reset() : timer;
        });
    });
    const edit$ = intents.editTimer$.map((update) => timers => {
        return timers.map((timer, index) => {
            return index == update.index ? timer.edit() : timer;
        });
    });
    const editDone$ = intents.editDoneTimer$.map((update) => timers => {
        return timers.map((timer, index) => {
            return index == update.index ? timer.editDone(update.duration) : timer;
        });
    });
    const remove$ = intents.removeTimer$.map((update) => timers => {
        return timers.filter((timer, index) => index !== update.index);
    });
    // TODO: "and a half"
    // TODO: saner grammer?
    const parser = /^(?:(\d+|one) minutes?(?: and ?)?)?(?:(\d+|one) seconds?)?$/;
    const voiceAdd$ = intents.listenVoice$.
        flatMap(() => captureSpeech$()).
        map(transcript => {
            console.log(transcript);
            const match = transcript.match(parser);
            let result;
            if (match) {
                const [_, minutesStr, secondsStr] = match;
                // TODO: match and map more text numbers (one, five, etc)
                const minutes = minutesStr && parseInt(minutesStr, 10) || 0;
                const seconds = secondsStr && parseInt(secondsStr, 10) || 0;
                result = toDuration(minutes, seconds);
            }
            return result;
        }).
        // TODO: error if failed to understand (!= 0)
        filter(result => !! result).
        map(duration => timers => {
            return timers.concat(timerModel(duration));
        });
    const init = timers => timers;
    const timers$ = Observable.
          merge(update$, add$, reset$, remove$, edit$, editDone$, applyTime$, voiceAdd$).
          startWith(init).
          scan(
              (timers, stepF) => stepF(timers),
              // TODO: each ticker should each be a stream?
              List.of(timerModel(300))
          ).
          distinctUntilChanged(null, immutableIs).
          do(m => console.log("new model", m)).
          shareReplay(1);

    return {
        timers$
    };
};

const timerComponent = (timerModel, canRemove) => {
    const minutes = timerModel.remainingMinutes;
    const seconds = timerModel.remainingSeconds;
    const minutesStr = leftPad(minutes, 2, 0);
    const secondsStr = leftPad(seconds, 2, 0);

    const startButton = materialIconButton('play_circle_outline', 'Start', {className: 'timer__start'});
    const pauseButton = materialIconButton('pause_circle_outline', 'Pause', {className: 'timer__pause'});
    // TODO: when clicking digits, focus/select them
    const editDoneButton = materialIconButton('done', 'Done', {className: 'timer__edit-done'});
    const editCancelButton = materialIconButton('close', 'Cancel', {className: 'timer__edit-cancel'});
    const resetButton = materialIconButton('replay', 'Reset', {className: 'timer__reset', disabled: timerModel.pristine});
    const removeButton = materialIconButton('delete', 'Remove', {className: 'timer__remove', disabled: ! canRemove});
    const countdown = h('div', {className: 'countdown'}, [
        h('span', {className: 'countdown__minutes'}, [''+minutesStr]),
        ':',
        h('span', {className: 'countdown__seconds'}, [''+secondsStr])
    ]);
    const editableCountdown = button(countdown, {className: 'unstyled-button timer__edit'});
    // Note: can't use type=number as that doesn't allow for leading 0's
    // TODO: special handling to never excede the field, overwrite instead
    const minutesInput = input('text', {
        className: 'editor__input editor__minutes',
        value: minutesStr,
        pattern: '[0-6][0-9]'
    });
    const secondsInput = input('text', {
        className: 'editor__input editor__seconds',
        value: secondsStr,
        pattern: '[0-6][0-9]'
    });
    // FIXME: increment/decrement helper buttons for each
    // TODO: hours?
    const editor = h('div', {className: 'editor'}, [
        minutesInput.tree, ':', secondsInput.tree
    ]);
    const timerContent = timerModel.editing ?
          [
              editor,
              editDoneButton.tree,
              editCancelButton.tree
          ] :
          [
              editableCountdown.tree,
              timerModel.running ? pauseButton.tree : startButton.tree,
              h('div', {className: 'timer-actions'}, [
                  resetButton.tree,
                  removeButton.tree
              ])
          ];
    const timerClasses = 'timer ' + (timerModel.finished ? 'timer--finished' : '');
    const tree$ = Observable.of(h('div', {className: timerClasses}, timerContent));
    const start$ = startButton.events.clicks$.map({});
    const pause$ = pauseButton.events.clicks$.map({});
    // const edit$ = editButton.events.clicks$.map({});
    const edit$ = editableCountdown.events.clicks$.map({});
    // TODO: need validation?
    const minutesValue$ = minutesInput.events.value$.
          map(value => parseInt(value, 10)).
          startWith(minutes);
    const secondsValue$ = secondsInput.events.value$.
          map(value => parseInt(value, 10)).
          startWith(seconds);
    const durationValue$ = Observable.combineLatest(
        minutesValue$, secondsValue$, (min, sec) => toDuration(min, sec)
    );
    const editDone$ = Observable.merge(
        editDoneButton.events.clicks$.
            withLatestFrom(durationValue$, (_, duration) => duration),
        editCancelButton.events.clicks$.
            map(_ => timerModel.duration)
    );
    const reset$ = resetButton.events.clicks$.map({});
    const remove$ = removeButton.events.clicks$.map({});
    return {
        tree$,
        events: {
            start$,
            pause$,
            edit$,
            editDone$,
            reset$,
            remove$
        }
    };
};

const mainComponent = (model) => {
    const vibrations$ = model.timers$.
        map((timers) => {
            // TODO: better trigger, this won't fire if second timer finishes after 1st
            const firstFinishedIndex = timers.findIndex(timer => timer.finished);
            return firstFinishedIndex;
        }).
        filter(index => index !== -1).
        distinctUntilChanged();

    const timerList$ = model.timers$.
          map((timers) => {
              const moreThanOneTimer = timers.size > 1;
              const x = timers.map((timer, index) => {
                  const comp = timerComponent(timer, moreThanOneTimer);

                  const tree$ = comp.tree$;
                  const updates$ = Observable.merge(
                      comp.events.start$.map(() => ({index: index, type: 'start'})),
                      comp.events.pause$.map(() => ({index: index, type: 'pause'}))
                  );
                  const reset$ = comp.events.reset$.map(() => ({index: index}));
                  const edit$ = comp.events.edit$.map(() => ({index: index}));
                  const editDone$ = comp.events.editDone$.map(duration => ({index: index, duration: duration}));
                  const remove$ = comp.events.remove$.map(() => ({index: index}));
                  return {tree$, updates$, reset$, edit$, editDone$, remove$};
              }).toJS();
              const timersTree$ = h$('div', {className: 'timers'}, x.map(({tree$}) => tree$));
              const timersUpdates$ = Observable.merge(x.map(({updates$}) => updates$));
              const timersReset$ = Observable.merge(x.map(({reset$}) => reset$));
              const timersEdit$ = Observable.merge(x.map(({edit$}) => edit$));
              const timersEditDone$ = Observable.merge(x.map(({editDone$}) => editDone$));
              const timersRemove$ = Observable.merge(x.map(({remove$}) => remove$));
              return {timersTree$, timersUpdates$, timersReset$, timersEdit$, timersEditDone$, timersRemove$};
          }).
          shareReplay(1);
    const timerListTree$ = timerList$.flatMap(({timersTree$}) => timersTree$);
    const timerUpdates$ = timerList$.flatMap(({timersUpdates$}) => timersUpdates$);
    const resetTimer$ = timerList$.flatMap(({timersReset$}) => timersReset$);
    const editTimer$ = timerList$.flatMap(({timersEdit$}) => timersEdit$);
    const editDoneTimer$ = timerList$.flatMap(({timersEditDone$}) => timersEditDone$);
    const removeTimer$ = timerList$.flatMap(({timersRemove$}) => timersRemove$);
    const newTimerButton = materialLabelledIconButton('add', 'New timer', {className: 'add-timer'});
    const addTimer$ = newTimerButton.events.clicks$;
    const voiceButton = materialLabelledIconButton('keyboard_voice', 'Talk', {className: 'start-voice'});
    const listenVoice$ = voiceButton.events.clicks$.map({});
    // TODO: visual feedback (or even full mode) when listening
    // TODO: "always-on" switch (after listening)
    const voiceTree = h('div', {className: 'voice'}, [
        voiceButton.tree
    ]);
    // TODO: settings: sound, vibration, prevent sleep, theme
    const tree$ = h$('main', {className: 'main'}, [
        timerListTree$,
        newTimerButton.tree,
        speechAvailable ? voiceTree : null
    ]);
    return {
        tree$,
        vibrations$,
        events$: {
            timerUpdates$,
            addTimer$,
            resetTimer$,
            editTimer$,
            editDoneTimer$,
            removeTimer$,
            listenVoice$
        }
    };
};




const proxy = {
    timerUpdates$: new Subject(),
    addTimer$: new Subject(),
    resetTimer$: new Subject(),
    editTimer$: new Subject(),
    editDoneTimer$: new Subject(),
    removeTimer$: new Subject(),
    listenVoice$: new Subject(),
    // finishVoice$: new Subject(),
    // cancelVoice$: new Subject(),
};

const theView = mainComponent(model(proxy));

Object.keys(theView.events$).forEach(name => {
    console.log(name, theView.events$[name]);
    theView.events$[name].subscribe(
        (value) => proxy[name].onNext(value)
    )
});

const out = document.querySelector('main');
const rendering$ = renderTo$(theView.tree$, out);

// TODO: also trigger sound (configurable)
const vibrations$ = theView.
    vibrations$.
    do(vibrate);

const execution = Observable.merge(
    rendering$,
    vibrations$
).
      subscribeOnError(err => console.error(err));