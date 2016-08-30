import {h} from 'virtual-dom';
import {Subject} from 'rx';

export function button(content, attrs = {}) {
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
}

export function input(type, value, attrs, options = {}) {
    const input$ = new Subject();
    const focus$ = new Subject();
    const keypress$ = new Subject();
    const tree = h('input', Object.assign({}, attrs, {
        type: type,
        value: value,
        oninput:    (event) => input$.onNext(event),
        onkeypress: (event) => {
            if (options.preventDefault) {
                event.preventDefault();
            }
            keypress$.onNext(event);
        }
    }));
    return {
        tree,
        events: {
            input$: input$.asObservable(),
            focus$: focus$.asObservable(),
            keypress$: keypress$.asObservable(),
            value$: input$.map(event => event.target.value).startWith(value)
        }
    };
}
