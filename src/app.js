import {h} from 'virtual-dom';
// TODO: use RxJS 5
// import {Observable} from 'rxjs-es/Rx';
import {Observable, Subject} from 'rx';
import {List, is as immutableIs} from 'immutable';
import NoSleep from 'nosleep.js';
import leftPad from 'left-pad';

import {sequenceCombine$, h$, renderTo$} from './rx-util';
import {toDuration} from './util';
import {parseVoiceCommand} from './commands';
import {speechAvailable, captureSpeech$} from './speech';
import {vibrate} from './vibration';
import {beep} from './beep';

const button = (content, attrs = {}) => {
    const clicks$ = new Subject();
    const tree = h('button', Object.assign({}, attrs, {
        type: 'button',
        onclick: (event) => clicks$.onNext(event)
    }), content);
    return {
        tree,
        events: {
            clicks$: clicks$.asObservable()
        }
    };
};

const materialIcon = (iconName, attrs = {}) => {
    const className = 'material-icons ' + (attrs.className || '');
    return h('i', {className: className}, iconName);
};

const materialIconButton = (iconName, label, attrs = {}) => {
    const icon = materialIcon(iconName);
    const className = 'icon-button ' + (attrs.className || '');
    const fullAttrs = Object.assign({title: label}, attrs, {className});
    return button(icon, fullAttrs);
};

const materialLabelledIconButton = (iconName, label, attrs = {}) => {
    const icon = materialIcon(iconName);
    const className = 'icon-button icon-button-labelled ' + (attrs.className || '');
    const fullAttrs = Object.assign({}, attrs, {className});
    return button([icon, label], fullAttrs);
};

const input = (type, value, attrs, options = {}) => {
    const input$ = new Subject();
    const focus$ = new Subject();
    const keypress$ = new Subject();
    const tree = h('input', Object.assign({}, attrs, {
        type: type,
        value: value,
        onkeypress: (event) => {
            if (options.preventDefault) {
                event.preventDefault();
            }
            keypress$.onNext(event);
        },
        oninput:    (event) => input$.onNext(event)
    }));
    return {
        tree,
        events: {
            focus$: focus$.asObservable(),
            keypress$: keypress$.asObservable(),
            input$: input$.asObservable(),
            value$: input$.map(event => event.target.value).startWith(value)
        }
    };
};

const timerModel = (duration, params = {}) => {
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

const updateTimer = (timer, type) => {
    switch(type) {
    case 'start': return timer.start();
    case 'pause': return timer.pause();
    default:
        throw new Exception(`unexpected update type: ${type}`);
    }
};

const updateTimerByName = (name, func) => {
    // TODO: better matching / best matching, not all
    return timers => timers.map(timer => {
        if ((timer.name || '').toLowerCase().includes(name)) {
            return func(timer);
        } else {
            return timer;
        }
    });
}

const model = (intents, initialValue) => {
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
            console.log(update);
        return timers.map((timer, index) => {
            return index == update.index ? timer.editDone(update.duration, update.name) : timer;
        });
    });
    const remove$ = intents.removeTimer$.map((update) => timers => {
        return timers.filter((timer, index) => index !== update.index);
    });
    // const voiceCapture$ = intents.listenVoice$.
    //     // Capture speech until done or finish voice triggered
    //     // Need .first() to only wait for a single signal
    //     flatMap(() => captureSpeech$().amb(intents.finishVoice$.map('').first())).
    //     // TODO: handle speech error?
    //     // catch(() => '').
    //     do(transcript => console.log('Heard:', transcript)).
    //     // TODO: saner grammer? (PEG)
    //     // TODO: understand more commands: help, reset, delete, change, rename
    //     map(parseVoiceCommand).
    //     share();
    const voice$ = intents.listenVoice$.
        // Capture speech until done or finish voice triggered
        // Need .first() to only wait for a single signal
        // flatMap(() => captureSpeech$().amb(intents.finishVoice$.map(Observable.never()).first())).share();
        flatMap(() => captureSpeech$().takeUntil(intents.finishVoice$.map(Observable.never()))).share();
    const voiceCapture$ = voice$.
        flatMap(phrases$ => phrases$.last()).
        // TODO: handle speech error?
        // catch(() => '').
        do(transcripts => console.log('Heard:', transcripts)).
        // TODO: saner grammer? (PEG)
        // TODO: understand more commands: help, reset, delete, change, rename
        map(transcripts => transcripts.map(parseVoiceCommand).filter(x => x)[0]).
        do(res => console.log(res)).
        share();
    // const voiceHeard$ = voice$.flatMap(phrases$ => phrases$).do(console.log.bind(console));
    const voiceHeard$ = voice$.flatMap(phrases$ => phrases$).distinctUntilChanged().do(console.log.bind(console));
    const voiceAdd$ = voiceCapture$.
        // TODO: error if failed to understand (!= 0)
        filter(result => !!result).
        map(({type, duration, name}) => {
            if (type === 'create') {
                return timers => timers.concat(timerModel(duration, {name}));
            } else if (type === 'start') {
                if (name) {
                    return updateTimerByName(name, timer => timer.start());
                } else {
                    // FIXME: apply to latest targeted
                    return timers => timers.update(-1, timer => timer.start());
                }
            } else if (type === 'stop') {
                if (name) {
                    return updateTimerByName(name, timer => timer.pause());
                } else {
                    // FIXME: apply to latest targeted
                    return timers => timers.update(-1, timer => timer.pause());
                }
            }
        });
    const voiceError$ = voiceCapture$.
        // TODO: error if failed to understand (!= 0)
        filter(result => ! (result && result.duration > 0));
    const singleListening$ = Observable.merge(
        intents.listenVoice$.map(true),
        intents.finishVoice$.map(false)
    ).startWith(false);
    const init = timers => timers;
    const timers$ = Observable.
          merge(update$, add$, reset$, remove$, edit$, editDone$, applyTime$, voiceAdd$).
          startWith(init).
          scan(
              (timers, stepF) => stepF(timers),
              // TODO: each ticker should each be a stream?
              initialValue
          ).
          distinctUntilChanged(null, immutableIs).
          do(m => console.log("new model", m)).
          shareReplay(1);

    const hasTimerRunning$ = timers$.
          map(timers => timers.some(timer => timer.running)).
          distinctUntilChanged().
          shareReplay(1);

    return {
        timers$,
        hasTimerRunning$,
        singleListening$,
        voiceHeard$,
    };
};

const numberInput = (initialValue, attrs = {}) => {
    const width = 2;

    const valueProxy$ = Observable.defer(() => value$);

    const inputElement$ = valueProxy$.map(value => {
        const valueStr = leftPad(value, width, 0);
        // Note: can't use type=number as that doesn't allow for leading 0's
        const inputElement = input('text', valueStr, Object.assign({}, attrs, {
            pattern: '[0-6][0-9]'
        }), {preventDefault: true});
        return inputElement;
    }).
          shareReplay(1);

    // FIXME: special handling to never excede the field, overwrite
    // instead, then move to next field
    const keypress$ = inputElement$.flatMap(el => el.events.keypress$);
    const value$ = keypress$.
          filter(event => event.key.match(/[0-9]/)).
          map(event => {
              const {key, target} = event;
              const {selectionStart, selectionEnd, value} = target;
              return value.slice(0, selectionStart) + key + value.slice(selectionEnd);
          }).
          map(str => parseInt(str, 10)).
          startWith(initialValue).
          shareReplay(1);

    // FIXME: on focus, move caret to very start (or even hidden?)
    const focus$ = inputElement$.flatMap(el => el.events.focus$);

    const tree$ = inputElement$.map(el => el.tree);

    return {tree$, value$};
};

const countdownComponent = (model) => {
    const minutes = model.remainingMinutes;
    const seconds = model.remainingSeconds;
    const minutesStr = leftPad(minutes, 2, 0);
    const secondsStr = leftPad(seconds, 2, 0);
    const tree = h('div', {className: 'countdown'}, [
        h('span', {className: 'countdown__minutes'}, [''+minutesStr]),
        ':',
        h('span', {className: 'countdown__seconds'}, [''+secondsStr])
    ]);
    return {tree};
};

const countdownEditorComponent = (model) => {
    const minutes = model.remainingMinutes;
    const seconds = model.remainingSeconds;
    const secondsStr = leftPad(seconds, 2, 0);
    const minutesInput = numberInput(minutes, {
        className: 'editor__input editor__minutes'
    });
    const secondsInput = input('text', secondsStr, {
        className: 'editor__input editor__seconds',
        pattern: '[0-6][0-9]'
    });
    // TODO: onscreen number pad?
    // TODO: hours?
    const tree$ = h$('div', {className: 'editor'}, [
        minutesInput.tree$,
        h('span', {className: 'editor__separator'}, ':'),
        secondsInput.tree
    ]);
    const minutesValue$ = minutesInput.value$;
    // TODO: same with seconds
    const secondsValue$ = secondsInput.events.value$.
          map(value => parseInt(value, 10));
    return {
        tree$,
        minutesValue$,
        secondsValue$
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
    const countdown = countdownComponent(timerModel).tree;
    const editableCountdown = button(countdown, {className: 'unstyled-button timer__edit'});
    const editor = countdownEditorComponent(timerModel);
    const editableName = button(timerModel.name || ' ', {className: 'unstyled-button'});
    const nameInput = input('text', timerModel.name, {
        className: 'timer-name-input',
        placeholder: 'Enter name…'
    });
    const nameValue$ = nameInput.events.value$;
    const timerContent$ = timerModel.editing ?
          [
              h('div', {className: 'timer-name'}, nameInput.tree),
              h$('div', {className: 'timer-main'}, [
                  editor.tree$,
                  editDoneButton.tree,
                  editCancelButton.tree
              ])
          ] :
          [
              h('div', {className: 'timer-name timer-name--display'}, editableName.tree),
              h('div', {className: 'timer-main'}, [
                  editableCountdown.tree,
                  timerModel.running ? pauseButton.tree : startButton.tree,
                  h('div', {className: 'timer-actions'}, [
                      resetButton.tree,
                      removeButton.tree
                  ])
              ])
          ];
    const timerClasses = 'timer ' + (timerModel.finished ? 'timer--finished' : '');
    const tree$ = h$('div', {className: timerClasses}, timerContent$);
    const start$ = startButton.events.clicks$.map({});
    const pause$ = pauseButton.events.clicks$.map({});
    const edit$ = Observable.merge(
        editableName.events.clicks$,
        editableCountdown.events.clicks$
    ).map({});
    // TODO: need validation?
    // const minutesValue$ = minutesInput.events.value$.
    //       map(value => parseInt(value, 10));
    // TODO: loop value back into input, allowing custom field update even if event is cancelled
    // const minutesValue$ = minutesInput.events.keypress$.
    //       filter(event => event.key.match(/[0-9]/)).
    //       map(event => {
    //           const {key, target} = event;
    //           const {selectionStart, selectionEnd, value} = target;
    //           return value.slice(0, selectionStart) + key + value.slice(selectionEnd);
    //       }).
    //       map(value => parseInt(value, 10)).
    //       startWith(minutes);
    const minutesValue$ = editor.minutesValue$;
    const secondsValue$ = editor.secondsValue$;
    const durationValue$ = Observable.combineLatest(
        minutesValue$, secondsValue$, (min, sec) => toDuration(min, sec)
    );
    const editDone$ = Observable.merge(
        editDoneButton.events.clicks$.
            withLatestFrom(durationValue$, nameValue$,
                           (_, duration, name) => ({duration, name})),
        editCancelButton.events.clicks$.
            map(_ => ({duration: timerModel.duration, name: timerModel.name}))
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
                  const editDone$ = comp.events.editDone$.map(({name, duration}) => ({index: index, duration, name}));
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
    const voiceButton = materialLabelledIconButton('keyboard_voice', 'Tell me what you need', {
        className: 'start-voice'
    });
    const listenVoice$ = voiceButton.events.clicks$.map({});

    const listeningStarted$ = model.singleListening$.filter(listen => listen);
    const voiceHeard$ = model.voiceHeard$.
          map(phrases => phrases[0]).
          filter(x => x).
          startWith('').
          // TODO: fix filter above to let through empty phrase w/o breaking everything
          merge(listeningStarted$.map(''));
    const voiceHeardText$ = h$('div', {className: 'flex align-left'}, [voiceHeard$]);
    const voiceActiveStopButton$ = voiceHeardText$.map(voiceHeard => button([
        materialIcon('keyboard_voice', {className: 'stop-voice'}),
        voiceHeard,
        materialIcon('cancel'),
    ], {
        className: 'icon-button layout horizontal fill-width'
    })).shareReplay(1);
    // need to share-replay to ensure the same v-dom is passed down

    // FIXME: show errors
    const finishVoice$ = voiceActiveStopButton$.
          flatMapLatest(b => b.events.clicks$).
          map({});
    const voiceStopTree$ = voiceActiveStopButton$.pluck('tree');
    const voiceTree$ = h$('div', {className: 'voice fill-width'}, [
        model.singleListening$.
            flatMapLatest(listening => listening ? voiceStopTree$ : Observable.return(voiceButton.tree))
    ]);

    // TODO: settings: sound, vibration, prevent sleep, theme
    const tree$ = h$('main', {className: 'main'}, [
        speechAvailable ? voiceTree$ : null,
        timerListTree$,
        newTimerButton.tree,
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
            listenVoice$,
            finishVoice$
        }
    };
};


// TODO: generic helper to proxy any object of observables
const eventsProxy = new Proxy({}, {
    get(target, name) {
        return Observable.defer(() => {
            const source = theView && theView.events$;
            if (! source) {
                throw new Error('Proxied object not available yet');
            } else if (! source[name]) {
                throw new Error(`No such proxied property: ${name}`);
            } else {
                return source[name];
            }
        });
    }
});


const Storage = (key) => {
    const localStorage = window.localStorage;

    const parseJson = (string) => {
        try {
            return JSON.parse(string);
        } catch (e) {
            // TODO: Option?
            return undefined;
        }
    };

    const restore = () => {
        const stringValue = localStorage.getItem(key);
        return parseJson(stringValue);
    };

    const persist = (value) => {
        const jsonValue = JSON.stringify(value);
        localStorage.setItem(key, jsonValue);
    };

    return {
        restore,
        persist
    };
};

const TimerStorage = (storage) => {
    const restore = () => {
        const list = List(storage.restore() || []);
        return list.map(props => timerModel(props.duration, {name: props.name}));
    };

    const persist = (timers) => {
        const list = timers.
              map(timer => ({duration: timer.duration, name: timer.name || ''})).
              toJS();
        storage.persist(list);
    };

    return {
        restore,
        persist
    };
};

const timerStorage = TimerStorage(Storage('kitchen-timer'));
const defaultTimers = List.of(timerModel(300, {name: 'Default'}));
const storedTimers = timerStorage.restore();
const initialTimers = storedTimers.isEmpty() ? defaultTimers : storedTimers;

const theModel = model(eventsProxy, initialTimers);
const theView = mainComponent(theModel);

const out = document.querySelector('main');
const rendering$ = renderTo$(theView.tree$, out);

const vibrations$ = theView.
    vibrations$.
    do(vibrate);

// TODO: nicer sound
const beeps$ = theView.
    vibrations$.
    do(() => beep(700, 900, 0.5));

const noSleep = new NoSleep();
const preventSleep$ = theModel.
      hasTimerRunning$.
      do(hasTimerRunning => hasTimerRunning ? noSleep.enable() : noSleep.disable());

const persist$ = theModel.
      timers$.
      do(timerStorage.persist);

// TODO: manifest, add to Homescreen, theme (android url bar)
// TODO: usage analytics
// TODO: use notifications to trigger alarm when backgrounded (??)
const execution = Observable.merge(
    rendering$,
    vibrations$,
    beeps$,
    preventSleep$,
    persist$
).
      subscribeOnError(err => console.error(err));
