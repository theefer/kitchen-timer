import {Record} from 'immutable';

export const StartCommand  = Record({timerName: ''}, 'StartCommand');
export const StopCommand   = Record({timerName: ''}, 'StopCommand');
export const Duration      = Record({minutes: 0, seconds: 0}, 'Duration');
export const CreateCommand = Record({duration: Duration, name: ''}, 'CreateCommand');
