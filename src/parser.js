import {Record, List, Set, Map} from 'immutable';
import {parse as parseGrammar} from 'kitchen-timer-grammar/grammar.js';
import {StartCommand, StopCommand, Duration, CreateCommand} from './model/commands';

const numberMap = {
    one:   1,
    two:   2,
    three: 3,
    four:  4,
    five:  5,
    six:   6,
    seven: 7,
    eight: 8,
    nine:  9
};

function extractModel(node) {
    if (typeof node.model === 'function') {
        const value = node.model();
        console.log('extract Model', node, value);
        if (typeof value === 'string' || typeof value === 'number') return [value];
        else return value;
    } else {
    console.log('extract plain', node);
        const models = List(node.elements).flatMap(extractModel);
        if (models.size == 1) return models.get(0);
        else return models;
    }
}

function mapRecord(recordClass) {
    return function() {
        if (recordClass == Duration) {
            console.log("DURATION", this.elements);
        } else {
            console.log("OTHER", recordClass.prototype, this.elements, this.elements[1].model());
        }
        const models = List(this.elements).map(element => {
            const submodelNames = Set(Object.keys(element)).subtract(['elements', 'text', 'offset']);
            return Map(submodelNames.map(name => [name, extractModel(element[name])]));
        }).reduce((acc, map) => acc.merge(map)).toJS();
        console.log(models);
        return recordClass(models);
    };
}

function parse(input) {
    const types = {
        StartCommand: {
            model: mapRecord(StartCommand)
        },
        StopCommand: {
            model: mapRecord(StopCommand)
        },
        CreateCommand: {
            model: mapRecord(CreateCommand)
        },
        Duration: {
            model: mapRecord(Duration)
        },
        data: {
            model: function() {
                const text = this.elements.map(el => el.text).join('');
                // console.log("CAPTURE", text);
                return text;
            }
        },
        number: {
            model: function() {
                const text = this.elements.map(el => el.text).join('');
                // console.log("CAPTURE NUM", parseInt(text, 10));
                return parseInt(text, 10);
            }
        },
        digitWord: {
            model: function() {
                const text = this.elements.map(el => el.text).join('');
                return numberMap[text];
            }
        }
    };
    const actions = {
        d: function(input, start, end, elements) {
            console.log('d', input, start, end, elements)
        }
    };
    return parseGrammar(input, {actions, types});
}


export function parseVoiceCommand(input) {
    return parse(input).model();
}
