import {h} from 'virtual-dom';
// import {Observable} from 'rxjs-es/Rx';
import {Observable, Subject} from 'rx';
import leftPad from 'left-pad';

const button = (label, klass) => {
    const clicks$ = new Subject();
    const tree = h('button', {
        type: 'button',
        class: klass,
        onclick: (event) => clicks$.onNext(event)
    }, label);
    return {
        tree,
        events: {
            clicks$: clicks$.asObservable()
        }
    };
};

let NEXT_TIMER_ID = 1;
const nextId = () => {
    return NEXT_TIMER_ID++;
};

const timerModel = (duration, {running = false, id = nextId()} = {}) => {
    // const id = nextId();
    // const running = false;
    const editing = false;
    return {
        id,
        duration,
        remaining$: null, // FIXME: ?
        running,
        editing, // TODO: or separate state, only one at a time?
        get start() { return timerModel(duration, {running: true, id}); },
        get pause() { return timerModel(duration, {running: false, id}); },
    };
};

const model = (intents) => {
    const timers$ = intents.timerUpdates$.scan(
        (timers, update) => {
            console.log("SCAN", timers);
            return timers.map(timer => {
                return timer.id == update.id ? update.updated : timer
            });
        },
        [timerModel(300)]
    ).startWith([timerModel(300)]).do(x => console.log("X", x));

    return {
        timers$
    };
};

const timerComponent = (timerModel) => {
    const minutes = leftPad(Math.floor(timerModel.duration / 60), 2, 0);
    const seconds = leftPad(timerModel.duration % 60, 2, 0);

    const startButton = button('Start', 'timer__start');
    const pauseButton = button('Pause', 'timer__pause');
    const editButton = button('Edit', 'timer__edit');
    const editDoneButton = button('Edit done', 'timer__edit-done');
    // TODO: reset (if not already)
    const removeButton = button('Remove', 'timer__remove');
    const tree$ = Observable.of(h('div', {class: 'timer'}, [
        h('div', {class: 'countdown'}, [
            h('span', {class: 'countdown__minutes'}, [''+minutes]),
            ':',
            h('span', {class: 'countdown__seconds'}, [''+seconds])
        ]),
        timerModel.running ? pauseButton.tree : startButton.tree,
        timerModel.editing ? editDoneButton.tree : editButton.tree,
        removeButton.tree
    ]));
    const start$ = startButton.events.clicks$.map({});
    const pause$ = pauseButton.events.clicks$.map({});
    const edit$ = editButton.events.clicks$;
    const editDone$ = editDoneButton.events.clicks$;
    const setEdit$ = Observable.merge(
        edit$.map(true),
        editDone$.map(false)
    );
    const remove$ = removeButton.events.clicks$.map({});
    return {
        tree$,
        events: {
            start$,
            pause$,
            setEdit$,
            remove$
        }
    };
};

const mainComponent = (model) => {
    const timerList$ = model.timers$.
          map((timers) => timers.map((timer) => timerComponent(timer))).
          shareReplay(1);
    // const timerListTree$ = timerList$.flatMap(timers => h$('div', {class: 'timer-list'}, timers.map(t => t.tree$)));
    const timerListTree$ = timerList$.flatMap(timers => h$('div', timers.map(t => t.tree$)));
    const timerUpdates$ = timerList$.flatMap(timers => {
        console.log(timers);
        return Observable.merge(timers.map(t => {
            return Observable.merge(
                t.events.start$.map(() => ({id: t.id, updated: t.start()})),
                t.events.pause$.map(() => ({id: t.id, updated: t.pause()}))
            );
        }));
    });
    const tree$ = h$('main', [
        timerListTree$,
        button('New timer', 'add-timer').tree
    ]);
    return {
        tree$,
        events$: {
            timerUpdates$
        }
    };
};



export function sequenceCombine$(observables$) {
  // Work around odd behaviour of combineLatest with empty Array
  // (never yields a value)
  if (observables$.length === 0) {
    return Observable.return([]);
  } else {
      const obs$ = observables$.map(obs => typeof obs.subscribe == 'function' ? obs : Observable.return(obs));
    return Observable.combineLatest(obs$, (...all) => all);
  }
}

export function h$(tagName, children) {
  return sequenceCombine$(children).
    map(views => h(tagName, [...views]));
}


import virtualize from 'vdom-virtualize';
import {diff, patch} from 'virtual-dom';

const out = document.querySelector('main');
const initialDom = virtualize(out);

const proxy = {
    timerUpdates$: new Subject()
};

const theView = mainComponent(model(proxy));

theView.events$.timerUpdates$.subscribe(
    (value) => proxy.timerUpdates$.onNext(value)
)

theView.tree$.
    startWith(initialDom).
    bufferWithCount(2, 1).
    filter(pair => pair.length === 2).
    map(([last, current]) => diff(last, current)).
    reduce((out, patches) => patch(out, patches), out).
    subscribeOnError(err => console.error(err));

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

// if (SpeechRecognition) {
//     const recognition = new SpeechRecognition();
//     //recognition.continuous = false;
//     // recognition.lang = 'en-GB';
//     recognition.lang = 'en-US';
//     // recognition.interimResults = false;
//     // recognition.maxAlternatives = 1;
//     // recognition.continuous = true;
//     recognition.interimResults = true;

//     const editButton = document.querySelector('.timer__edit');
//     const editDoneButton = document.querySelector('.timer__edit-done');
//     editButton.style.display = 'initial';
//     editDoneButton.style.display = 'none';

//     recognition.addEventListener('result', (event) => {
//         console.log(event);
//         console.log(event.results);
//         var trans = event.results[0][0].transcript;
//         console.log(trans);
//     });
//     recognition.addEventListener('start', (event) => {
//         console.log('START', event);
//         editButton.style.display = 'none';
//         editDoneButton.style.display = 'initial';
//     });
//     recognition.addEventListener('end', (event) => {
//         console.log('END', event);
//         editButton.style.display = 'initial';
//         editDoneButton.style.display = 'none';
//     });
//     recognition.addEventListener('error', (event) => {
//         console.log('END', event);
//     });

//     editButton.addEventListener('click', (event) => {
//         recognition.start();
//     });

//     // TODO: show stop button or say 'please'
//     editDoneButton.addEventListener('click', (event) => {
//         recognition.stop();
//     });

// } else {
//     console.log("No speech recognition support");
// }
