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

const parser = /^(?:(\d+|one|two|three|four|five|six|seven|eight|nine)( and a half)? minutes?)?(?:(?: and ?)?(\d+|one) seconds?|( and a half))?(?: (?:for )?(?:the )?(.+))?$/;
export const parseVoiceCommand = (transcript) => {
    const match = transcript.match(parser);
    let result;
    if (match) {
        const [_, minutesStr, half1, secondsStr, half2, name] = match;
        const minutes = parseNumber(minutesStr) || 0;
        const seconds = parseNumber(secondsStr) ||
            ((half1 || half2) && 30) || 0;
        result = {
            name: name && capitalize(name) || '',
            duration: toDuration(minutes, seconds)
        };
    }
    return result;
};
