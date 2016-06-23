import virtualize from 'vdom-virtualize';
import {h, diff, patch} from 'virtual-dom';
import {Observable} from 'rx';

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

export function h$(tagName, attributes, children) {
  if (! children) {
    children = attributes;
  }
  return sequenceCombine$(children).
    map(views => h(tagName, attributes, [...views]));
}

export function renderTo$(tree$, node) {
    const initialDom = virtualize(node);

    return tree$.
        startWith(initialDom).
        bufferWithCount(2, 1).
        filter(pair => pair.length === 2).
        map(([last, current]) => diff(last, current)).
        reduce((out, patches) => patch(out, patches), node);
}
