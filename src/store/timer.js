import {List} from 'immutable';

import {timerModel} from '../model/timer';

export const TimerStore = (storage) => {
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
