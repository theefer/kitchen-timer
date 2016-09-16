import {h} from 'virtual-dom';
// TODO: use RxJS 5
// import {Observable} from 'rxjs-es/Rx';
import {Observable, Subject} from 'rx';
import {List, is as immutableIs} from 'immutable';
import NoSleep from 'nosleep.js';
import leftPad from 'left-pad';

import {h$, renderTo$, proxyObservableMap} from './rx-util';
import {toDuration} from './util';
import {parseVoiceCommand} from './parser';
import {speechAvailable, captureSpeech$} from './speech';
import {vibrate} from './vibration';
import {beep} from './beep';

import {button, input} from './components/base';
import {materialIcon, materialIconButton, materialLabelledIconButton} from './components/material';

import {StartCommand, StopCommand, CreateCommand} from './model/commands';
import {timerModel} from './model/timer';
import {LocalStorage} from './storage/local';
import {TimerStore} from './store/timer';

// FIXME: UX when timer ends
// FIXME: UX when elapsed

function between$(start$, end$, betweenValue, otherwiseValue) {
    return Observable.merge(
        start$.map(betweenValue),
        end$.map(otherwiseValue)
    ).startWith(otherwiseValue);
}

function isBetween$(start$, end$) {
    return between$(start$, end$, true, false);
}

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const updateTimer = (timer, type, update) => {
    switch(type) {
    case 'start':     return timer.start();
    case 'pause':     return timer.pause();
    case 'edit':      return timer.edit();
    case 'edit-done': return timer.editDone(update.duration, update.name);
    case 'reset':     return timer.reset();
    default:
        throw new Exception(`unexpected update type: ${type}`);
    }
};

const updateTimerByName = (name, func) => {
    // TODO: better matching / best matching, not all
    // TODO: error if none matched?
    return timers => timers.map(timer => {
        if ((timer.name || '').toLowerCase().includes(name)) {
            return func(timer);
        } else {
            return timer;
        }
    });
}


// Capture speech on start$ until finish$ triggered
function captureVoice$$(start$, finish$) {
    return start$.flatMap(() => captureSpeech$().takeUntil(finish$));
}

function processVoice(phrases$$, finish$) {
    const capture$ = phrases$$.
        flatMap(phrases$ => phrases$.last()).
        do(transcripts => console.log('Heard:', transcripts)).
        // FIXME: understand more commands: help, reset, delete, change, rename, stop listening
        // FIXME: also return the transcript that parsed successfully
        map(transcripts => transcripts.map(parseVoiceCommand).filter(x => x)[0]).
        do(res => console.log(res && res.toJS())).
        share();
    // FIXME: highlight command if matched
    // TODO: show error if no command matched
    const commands$ = capture$.
        filter(result => !!result).
        map(command => {
            const {name, duration} = command;
            switch (command.constructor) {
            case CreateCommand:
                const durationSeconds = toDuration(duration.minutes, duration.seconds);
                const capitalizedName = capitalize(name);
                return timers => timers.concat(timerModel(durationSeconds, {name: capitalizedName}));
                break;
            case StartCommand:
                if (name) {
                    return updateTimerByName(name, timer => timer.start());
                } else {
                    // TODO: apply to latest targeted
                    return timers => {
                        if (timers.isEmpty()) {
                            // TODO: surface error if no timer?
                            return timers;
                        } else {
                            return timers.update(-1, timer => timer.start());
                        }
                    };
                }
                break;
            case StopCommand:
                if (name) {
                    return updateTimerByName(name, timer => timer.pause());
                } else {
                    // TODO: apply to latest targeted
                    return timers => {
                        if (timers.isEmpty()) {
                            // TODO: surface error if no timer?
                            return timers;
                        } else {
                            return timers.update(-1, timer => timer.pause());
                        }
                    };
                }
                break;
            }
        });
    const errors$ = capture$.filter(result => !result);
    return {commands$, errors$};
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
            return index == update.index ? updateTimer(timer, update.type, update) : timer;
        });
    });
    const add$ = intents.addTimer$.map((update) => timers => {
        return timers.concat(timerModel(300));
    });
    const remove$ = intents.removeTimer$.map((update) => timers => {
        return timers.filter((timer, index) => index !== update.index);
    });

    const phrases$$ = captureVoice$$(intents.listenVoice$, intents.finishVoice$).share();
    const voiceHeard$ = phrases$$
          .flatMap(phrases$ => phrases$)
          .distinctUntilChanged() // TODO: array deep comparison
          .merge(intents.finishVoice$.map([]));
    const voiceResults = processVoice(phrases$$, intents.finishVoice$);
    const commands$ = voiceResults.commands$.share();
    const isListening$ = isBetween$(intents.listenVoice$, intents.finishVoice$);
    const voiceUnderstood$ = commands$.map({});
    const voiceFailed$ = voiceResults.errors$.map({});

    const init = timers => timers;
    const timers$ = Observable.
          merge(update$, add$, remove$, applyTime$, commands$).
          startWith(init).
          scan(
              (timers, stepF) => stepF(timers),
              // FIXME: each timer should each be a stream?
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
        isListening$,
        voiceHeard$,
        voiceUnderstood$,
        voiceFailed$,
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

    // TODO: special handling to never excede the field, overwrite
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

    // TODO: on focus, move caret to very start (or even hidden?)
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
    // TODO: onscreen number pad? modal editing (if touch screen)?
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

const timerComponent = (timerModel) => {
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
    const removeButton = materialIconButton('delete', 'Remove', {className: 'timer__remove'});
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

const helpPaneComponent = () => {
    const helpCommand = (text) => h('div', {className: 'help-pane-command'}, `“${text}”`);
    return h('div', {className: 'help-pane'}, [
        h('div', {className: 'help-pane-title'}, 'Speak to manage your timers:'),
        helpCommand('5 minutes for the chickpeas'),
        helpCommand('start the chickpeas'),
        helpCommand('pause the chickpeas'),
        helpCommand('help'),
    ]);
};

const getStartedComponent = (isListening$) => {
    const timersTree$ = isListening$.map(isListening => {
        return isListening ?
            helpPaneComponent() :
            // TODO: toggle local state to warn if tapped this text
            h('div', {className: 'get-started'}, [
                'Tap the ',
                materialIcon('keyboard_voice'),
                ' above to start'
            ]);
    });
    // TODO: shouldn't have to do this...
    const timersUpdates$ = Observable.never();
    const timersReset$ = Observable.never();
    const timersEdit$ = Observable.never();
    const timersEditDone$ = Observable.never();
    const timersRemove$ = Observable.never();
    return {timersTree$, timersUpdates$, timersReset$, timersEdit$, timersEditDone$, timersRemove$};
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
              if (timers.isEmpty()) {
                  return getStartedComponent(model.isListening$);
              } else {
                  const x = timers.map((timer, index) => {
                      const comp = timerComponent(timer);

                      const tree$ = comp.tree$;
                      const updates$ = Observable.merge(
                          comp.events.start$.map(() => ({index: index, type: 'start'})),
                          comp.events.pause$.map(() => ({index: index, type: 'pause'})),
                          comp.events.edit$.map( () => ({index: index, type: 'edit'})),
                          comp.events.editDone$.map(({name, duration}) => ({index: index, type: 'edit-done', duration, name})),
                          comp.events.reset$.map(() => ({index: index, type: 'reset'}))
                      );
                      const remove$ = comp.events.remove$.map(() => ({index: index}));
                      return {tree$, updates$, remove$};
                  }).toJS();
                  const timersTree$ = h$('div', {className: 'timers'}, x.map(({tree$}) => tree$));
                  const timersUpdates$ = Observable.merge(x.map(({updates$}) => updates$));
                  const timersRemove$ = Observable.merge(x.map(({remove$}) => remove$));
                  return {timersTree$, timersUpdates$, timersRemove$};
              }
          }).
          shareReplay(1);
    const timerListTree$ = timerList$.flatMap(({timersTree$}) => timersTree$);
    const timerUpdates$ = timerList$.flatMap(({timersUpdates$}) => timersUpdates$);
    const removeTimer$ = timerList$.flatMap(({timersRemove$}) => timersRemove$);
    const newTimerButton = materialLabelledIconButton('add', 'New timer', {className: 'add-timer'});
    const addTimer$ = newTimerButton.events.clicks$;
    const voiceButton = materialLabelledIconButton('keyboard_voice', 'Tell me what you need', {
        className: 'start-voice'
    });
    const listenVoice$ = voiceButton.events.clicks$.map({});

    const listeningFeedbackDuration = 2000;
    const listeningFeedbackDone$ = Observable.merge(
        model.voiceUnderstood$,
        model.voiceFailed$
    ).delay(listeningFeedbackDuration);
    const voiceHeard$ = model.voiceHeard$.
          map(phrases => phrases[0]).
          filter(x => x).
          startWith('').
          // TODO: fix filter above to let through empty phrase w/o breaking everything
          merge(listeningFeedbackDone$.map(''));
    // TODO: randomize help message
    const voicePlaceholder = () => h('span', {className: 'voice-placeholder'}, '“4 minute timer for the eggs”');
    const voiceHeardText$ = h$('div', {className: 'flex align-left'}, [
        voiceHeard$.map(voiceHeard => {
            return voiceHeard !== '' ? voiceHeard : voicePlaceholder();
        })
    ]);
    const voiceIcon = materialIcon('keyboard_voice', {className: 'stop-voice'});
    const voiceUnderstoodIcon = materialIcon('done', {className: 'stop-voice'});
    const voiceFailedIcon = materialIcon('error_outline', {className: 'stop-voice'});
    const mainIcon$ = Observable.merge(
        listeningFeedbackDone$.map(voiceIcon),
        model.voiceUnderstood$.map(voiceUnderstoodIcon),
        model.voiceFailed$.map(voiceFailedIcon)
    ).startWith(voiceIcon);
    const listenVoiceButton = (mainIcon, text) => button([
        mainIcon,
        text,
        materialIcon('cancel'),
    ], {
        className: 'icon-button layout horizontal fill-width'
    });
    const voiceActiveStopButton$ = Observable.combineLatest(
        mainIcon$, voiceHeardText$,
        (mainIcon, voiceHeardText) => listenVoiceButton(mainIcon, voiceHeardText)
    ).shareReplay(1);
    // need to share-replay to ensure the same v-dom is passed down

    const finishVoice$ = voiceActiveStopButton$.
          flatMapLatest(b => b.events.clicks$).
          map({});
    const voiceStopTree$ = voiceActiveStopButton$.pluck('tree');
    const voiceTree$ = h$('div', {className: 'voice fill-width'}, [
        model.isListening$.
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
            removeTimer$,
            listenVoice$,
            finishVoice$
        }
    };
};


const intents = proxyObservableMap(() => theView.events$);

const timerStore = TimerStore(LocalStorage('kitchen-timer'));
const storedTimers = timerStore.restore();

const theModel = model(intents, storedTimers);
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
      do(timerStore.persist);

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
