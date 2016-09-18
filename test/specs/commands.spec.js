import {parseVoiceCommand} from 'kitchen-timer/parser';
import {StartCommand, StopCommand, Duration, CreateCommand, HelpCommand} from 'kitchen-timer/model/commands';

function duration(minutes = 0, seconds = 0) {
    return Duration({minutes, seconds});
}

chai.use(function (_chai, utils) {
    utils.addMethod(chai.Assertion.prototype, 'command', function (expected) {
        var obj = utils.flag(this, 'object');
        new chai.Assertion(obj).to.be.instanceof(expected.constructor, 'type');
        new chai.Assertion(obj.name).to.be.equal(expected.name, 'name');
        if (obj.duration) {
            new chai.Assertion(obj.duration.minutes).to.be.equal(expected.duration.minutes, 'duration minutes');
            new chai.Assertion(obj.duration.seconds).to.be.equal(expected.duration.seconds, 'duration seconds');
        } else {
            new chai.Assertion(obj.duration).to.be.equal(expected.duration, 'duration');
        }
    });
});

describe('Commands', () => {
    describe('Create', () => {
        const checks = {
            '15 seconds':               CreateCommand({duration: duration(0, 15)}),
            '1 minute':                 CreateCommand({duration: duration(1)}),
            'one minute':               CreateCommand({duration: duration(1)}),
            '2 minutes':                CreateCommand({duration: duration(2)}),
            '2 minutes and a half':     CreateCommand({duration: duration(2, 30)}),
            '2 and a half minutes':     CreateCommand({duration: duration(2, 30)}),
            '2 minutes 45 seconds':     CreateCommand({duration: duration(2, 45)}),
            '2 minutes and 45 seconds': CreateCommand({duration: duration(2, 45)}),
            '2 minute timer':           CreateCommand({duration: duration(2)}),
            'add 2 minute timer':       CreateCommand({duration: duration(2)}),
            'create 2 minute timer':    CreateCommand({duration: duration(2)}),
            'new 2 minute timer':       CreateCommand({duration: duration(2)}),
            'add new 2 minute timer':   CreateCommand({duration: duration(2)}),
            '10 minutes for eggs':      CreateCommand({duration: duration(10), name: 'eggs'}),
            '10 minutes for the eggs':  CreateCommand({duration: duration(10), name: 'eggs'}),
        };

        Object.keys(checks).forEach(input => {
            const expected = checks[input];
            it(`parses "${input}"`, () => {
                const cmd = parseVoiceCommand(input);
                expect(cmd).to.be.command(expected);
            });
        });
    });

    describe('Start', () => {
        const checks = {
            'start':          StartCommand(),
            'start eggs':     StartCommand({name: 'eggs'}),
            'start the eggs': StartCommand({name: 'eggs'}),
        };

        Object.keys(checks).forEach(input => {
            const expected = checks[input];
            it(`parses "${input}"`, () => {
                const cmd = parseVoiceCommand(input);
                expect(cmd).to.be.command(expected);
            });
        });
    });

    describe('Stop', () => {
        const checks = {
            'stop':          StopCommand(),
            'pause':         StopCommand(),
            'stop eggs':     StopCommand({name: 'eggs'}),
            'stop the eggs': StopCommand({name: 'eggs'}),
        };

        Object.keys(checks).forEach(input => {
            const expected = checks[input];
            it(`parses "${input}"`, () => {
                const cmd = parseVoiceCommand(input);
                expect(cmd).to.be.command(expected);
            });
        });
    });

    describe('Help', () => {
        const checks = {
            'help':                     HelpCommand(),
            'help me':                  HelpCommand(),
            'how do i use this thing?': HelpCommand(),
            'how can I add a timer?':   HelpCommand(),
        };

        Object.keys(checks).forEach(input => {
            const expected = checks[input];
            it(`parses "${input}"`, () => {
                const cmd = parseVoiceCommand(input);
                expect(cmd).to.be.command(expected);
            });
        });
    });

    describe('No match', () => {
        it(`doesn't parse "foo"`, () => {
            const cmd = parseVoiceCommand('foo');
            expect(cmd).to.be.undefined;
        });
    });
});
