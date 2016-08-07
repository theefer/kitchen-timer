import {toDuration} from './util';

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

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

const parseNumber = (str) => {
    return str && numberMap[str] || parseInt(str, 10);
};

const createParser = /^(?:new )?(?:(\d+|one|two|three|four|five|six|seven|eight|nine)( and a half)? minutes?)?(?:(?: and?)?( \d+|one|two|three|four|five|six|seven|eight|nine) seconds?|( and a half))?(?: timer)?(?: (?:for )?(?:the )?(.+))?$/;
const parseCreate = (transcript) => {
    const match = transcript.match(createParser);
    let result;
    if (match) {
        const [_, minutesStr, half1, secondsStr, half2, name] = match;
        const minutes = parseNumber(minutesStr) || 0;
        const seconds = parseNumber(secondsStr) ||
              ((half1 || half2) && 30) || 0;
        const duration = toDuration(minutes, seconds);
        if (duration > 0) {
            result = {
                type: 'create',
                name: name && capitalize(name) || '',
                duration: duration
            };
        }
    }
    return result;
};

const startParser = /^start(?:(?: the)? (.+))?$/;
const parseStart = (transcript) => {
    const match = transcript.match(startParser);
    if (match) {
        const [_, name] = match;
        return {
            type: 'start',
            name: name
        };
    }
}

const stopParser = /^(?:stop|pause)(?:(?: the)? (.+))?$/;
const parseStop = (transcript) => {
    const match = transcript.match(stopParser);
    if (match) {
        const [_, name] = match;
        return {
            type: 'stop',
            name: name
        };
    }
}

export const parseVoiceCommand = (transcript) => {
    // TODO: use grammar
    return parseCreate(transcript) || parseStart(transcript) || parseStop(transcript);
};
