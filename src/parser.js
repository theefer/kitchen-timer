import {Record, List, Set, Map} from 'immutable';
import {parse as parseGrammar} from 'kitchen-timer-grammar/grammar.js';
import {StartCommand, StopCommand, Duration, CreateCommand} from './model/commands';

export function parseVoiceCommand(input) {
    try {
        const result = parseGrammar(input);
        const m = {
            // FIXME: cleanup?
            create: (obj) => CreateCommand({name: obj.name, duration: Duration({minutes: Math.floor(obj.duration / 60), seconds: obj.duration % 60})}),
            start: StartCommand,
            stop: StopCommand,
        }[result.type];
        if (m) {
            return m(result);
        }
    } catch (e) {
        return undefined;
    }
}
