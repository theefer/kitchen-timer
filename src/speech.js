import {Observable} from 'rx';

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
        recognition.addEventListener('result', (event) => observer.onNext(event));
        recognition.addEventListener('error',  (error) => observer.onError(error));
        // recognition.addEventListener('end',    ()      => recognition.start());
        recognition.addEventListener('end',    () => {
            console.log("END, restart", stopped);
            if (! stopped)
                recognition.start()
        });

        // TODO: re-start if still listened to?

        // FIXME: not cancelled on unsubscribe?

        recognition.start();
        return () => {
            stopped = true
            console.log("dispose, stop");
            recognition.stop();
        };
    });
}

function getResultTranscripts(result) {
    return Array.from(result).map(alt => alt.transcript.trim());
}

function aggregateResults$(speech$) {
    const speechResults$ = speech$
          .map(events => Array.from(events.results))
          .share();

    const finalSeen$ = speechResults$
          .map(results => results.filter(res => res.isFinal).length)
          .filter(len => len > 0)
          .distinctUntilChanged();

    const out$ = speechResults$.map(results => {
        const lastResult = results.slice(-1)[0];
        if (lastResult.isFinal) {
            // Return final result
            return getResultTranscripts(lastResult);
        } else {
            // Concatenate sequence of non-final results
            const nonFinalResults = results.filter(res => !res.isFinal);
            const nonFinalTranscripts = nonFinalResults.map(getResultTranscripts);
            return [nonFinalTranscripts.join(' ')];
        }
    }).window(finalSeen$);
    return out$
}

// Exposed for testing
export const _aggregateResults$ = aggregateResults$;


export function captureSpeech$() {
    const recognition = createSpeechRecognition();
    if (! recognition) {
        console.log('captureSpeech$ called but no speech available');
        return Observable.never();
    }

    return aggregateResults$(listenSpeech$(recognition));

    /*
      - several non-final results
      - one final result, multiple alternatives
      - final result doesn't change
      - new final result on subsequent listens w same speech recog

      [intermediate segments] (final alternatives) <stream>
      [a ]                => < <[a]-: :
      [b ][u ]            => < <[a]-[b,u]: :
      [bu]                => < <[a]-[b,u]-[bu]: :
      <c|xF>              => < <[a]-[b,u]-[bu]-(c,x)> :
      <c|xF>[r ]          => < <[a]-[b,u]-[bu]-(c,x)>-<[r]: :
      <c|xF>[s ][j ]      => < <[a]-[b,u]-[bu]-(c,x)>-<[r]-[s,j]: :
      <c|xF><v|y|zF>      => < <[a]-[b,u]-[bu]-(c,x)>-<[r]-[s,j]-(v,y,z)> :
      <c|xF><v|y|zF>[o ]  => < <[a]-[b,u]-[bu]-(c,x)>-<[r]-[s,j]-(v,y,z)>-<[o]: :
      <c|xF><v|y|zF><oF>  => < <[a]-[b,u]-[bu]-(c,x)>-<[r]-[s,j]-(v,y,z)>-<[o]-(o)> :
    */
}

captureSpeech$().takeUntil(Observable.timer(500)).subscribe(
    phrases$ => {
        phrases$.subscribe(
            phrases => console.log('phrase', phrases, phrases),
            e => console.log('phrase ERR', e),
            _ => console.log('phrase END')
        )
    },
    e => console.log('captured ERR', e),
    _ => console.log('captured END')
)










