import {parseVoiceCommand} from 'kitchen-timer/commands';

function minute(n) {
    return n * 60;
}

chai.use(function (_chai, utils) {
    utils.addMethod(chai.Assertion.prototype, 'command', function ({type, name, duration}) {
        var obj = utils.flag(this, 'object');
        new chai.Assertion(obj.type).to.be.equal(type, 'type');
        new chai.Assertion(obj.name).to.be.equal(name, 'name');
        new chai.Assertion(obj.duration).to.be.equal(duration, 'duration');
    });
});

describe('Commands', () => {
    describe('Create', () => {
        const checks = {
            '1 minute':                 {duration: minute(1)},
            'one minute':               {duration: minute(1)},
            '2 minutes':                {duration: minute(2)},
            '2 minutes and a half':     {duration: minute(2.5)},
            '2 and a half minutes':     {duration: minute(2.5)},
            '2 minutes 45 seconds':     {duration: minute(2) + 45},
            '2 minutes and 45 seconds': {duration: minute(2) + 45},
            '2 minute timer':           {duration: minute(2)},
            'new 2 minute timer':       {duration: minute(2)},
            '10 minutes for eggs':      {duration: minute(10), name: 'Eggs'},
            '10 minutes for the eggs':  {duration: minute(10), name: 'Eggs'},
        };

        Object.keys(checks).forEach(input => {
            const expected = Object.assign({name: ''}, checks[input], {type: 'create'});
            it(`parses "${input}"`, () => {
                const cmd = parseVoiceCommand(input);
                expect(cmd).to.be.command(expected);
            });
        });
    });

    describe('Start', () => {
        const checks = {
            'start':          {},
            'start eggs':     {name: 'eggs'},
            'start the eggs': {name: 'eggs'},
        };

        Object.keys(checks).forEach(input => {
            const expected = Object.assign({}, checks[input], {type: 'start'});
            it(`parses "${input}"`, () => {
                const cmd = parseVoiceCommand(input);
                expect(cmd).to.be.command(expected);
            });
        });
    });

    describe('Stop', () => {
        const checks = {
            'stop':          {},
            'pause':         {},
            'stop eggs':     {name: 'eggs'},
            'stop the eggs': {name: 'eggs'},
        };

        Object.keys(checks).forEach(input => {
            const expected = Object.assign({}, checks[input], {type: 'stop'});
            it(`parses "${input}"`, () => {
                const cmd = parseVoiceCommand(input);
                expect(cmd).to.be.command(expected);
            });
        });
    });
});
