import {Observable} from 'rx';
import {Subject} from 'rx';

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export const speechAvailable = !! SpeechRecognition;

export function captureSpeechSimple$() {
    if (! speechAvailable) {
        console.log('captureSpeech called but not available');
        return Observable.never();
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;
    recognition.continuous = true;

    const speech$ = Observable.create(observer => {
        recognition.addEventListener('result', (event) => {
            console.log(event.results);
            var transcript = event.results[event.results.length - 1][0].transcript.trim();
            observer.onNext(transcript);
            console.log("GOT", transcript);
        });
        recognition.addEventListener('error', () => observer.onError());
        recognition.addEventListener('end', () => observer.onCompleted());

        recognition.start();
        return () => {
            recognition.stop();
        };
    });

    return speech$;
}

function createSpeechRecognition() {
    if (! speechAvailable) {
        return;
    }

    const recognition = new SpeechRecognition();
    // recognition.lang = 'en-GB';
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 5;
    recognition.continuous = true;
    recognition.interimResults = true;

    return recognition;
}

function listenSpeech$(recognition) {
    return Observable.create(observer => {
        let stopped = false;
        let currentSubject = null;

        recognition.addEventListener('result', (event) => {
            if (! currentSubject) {
                currentSubject = new Subject();
                observer.onNext(currentSubject.asObservable());
            }
            const results = Array.from(event.results);
            const lastResult = results.slice(-1)[0];
            if (lastResult.isFinal) {
                // Return final result
                currentSubject.onNext(getResultTranscripts(lastResult));
                currentSubject.onCompleted();
                currentSubject = null;
            } else {
                // Concatenate sequence of non-final results
                const nonFinalResults = results.filter(res => !res.isFinal);
                const nonFinalTranscripts = nonFinalResults.map(getResultTranscripts);
                currentSubject.onNext([nonFinalTranscripts.join(' ')]);
            }
        });
        recognition.addEventListener('error',  (error) => observer.onError(error));
        recognition.addEventListener('end',    () => {
            if (stopped) {
                if (currentSubject) {
                    // Note: we don't complete the subject
                    currentSubject = null;
                }
                observer.onCompleted();
            } else {
                recognition.start();
            }
        });

        recognition.start();
        return () => {
            stopped = true;
            recognition.stop();
        };
    });
}

function getResultTranscripts(result) {
    return Array.from(result).map(alt => alt.transcript.trim());
}

export function captureSpeech$() {
    const recognition = createSpeechRecognition();
    if (! recognition) {
        console.log('captureSpeech$ called but no speech available');
        return Observable.never();
    }

    return listenSpeech$(recognition);
}

// captureSpeech$().takeUntil(Observable.timer(500)).subscribe(
//     phrases$ => {
//         phrases$.subscribe(
//             phrases => console.log('phrase', phrases, phrases),
//             e => console.log('phrase ERR', e),
//             _ => console.log('phrase END')
//         )
//     },
//     e => console.log('captured ERR', e),
//     _ => console.log('captured END')
// )
