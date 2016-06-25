import {Observable} from 'rx';

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export const speechAvailable = !! SpeechRecognition;

export function captureSpeech$() {
    if (! speechAvailable) {
        console.log('captureSpeech called but not available');
        return Observable.never();
    }

    const recognition = new SpeechRecognition();
    // recognition.lang = 'en-GB';
    recognition.lang = 'en-US';
    // recognition.interimResults = false;
    // recognition.maxAlternatives = 1;
    recognition.continuous = true;
    // recognition.interimResults = true;

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
