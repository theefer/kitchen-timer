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
    recognition.maxAlternatives = 1;
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

export function captureSpeech2$() {
    if (! speechAvailable) {
        console.log('captureSpeech called but not available');
        return Observable.never();
    }

    const recognition = new SpeechRecognition();
    // recognition.lang = 'en-GB';
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 5;
    recognition.continuous = true;
    recognition.interimResults = true;

    const speech$ = Observable.create(observer => {
        recognition.addEventListener('result', (event) => {
            observer.onNext(event.results);
        });
        recognition.addEventListener('error', () => observer.onError());
        recognition.addEventListener('end', () => observer.onCompleted());
        // FIXME: restart on end if not end requested

        recognition.start();
        return () => {
            recognition.stop();
        };
    }).map(results => Array.from(results)).share()

    const finalSeen$ = speech$
          .map(results => results.filter(res => res.isFinal).length)
          .filter(len => len > 0)
          .distinctUntilChanged()
          // .do(x => console.log(`final! ${x}`))

    const out$ = speech$.map(results => {
        const x = results.map(alt => Array.from(alt).map(a => a.transcript.trim()))
        // console.log('OUT', results);
        return x
    }).window(finalSeen$).map(arr$ => arr$.map(arr => arr.slice(-1)[0]))
    return out$
    // const out$ = speech$.scan((speeches, results) => {
    //     const lastResult = results[results.length - 1];
    //     if (lastResult && lastResult.isFinal) {

    //     } else {
    //     }
    // });

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

captureSpeech2$().subscribe(
    phrases$ => {
        phrases$.subscribe(
            phrases => console.log('phrase', phrases),
            e => console.log('phrase ERR', e),
            _ => console.log('phrase END')
        )
    },
    e => console.log('captured ERR', e),
    _ => console.log('captured END')
)


// const recognition = new SpeechRecognition();
// // recognition.lang = 'en-GB';
// recognition.lang = 'en-US';
// // recognition.interimResults = false;
// recognition.maxAlternatives = 3;
// recognition.continuous = true;
// recognition.interimResults = true;

// recognition.addEventListener('result', (event) => {
//     const all = Array.from(event.results).map(res => {
//         const alternatives = Array.from(res).map(alt => alt.transcript).join(' | ');
//         return `<${alternatives}> (${res.isFinal})`;
//     });
//     console.log(all.join('  '));
//     // var transcript = event.results[event.results.length - 1][0].transcript.trim();
//     // console.log("GOT", transcript);
// });
// recognition.addEventListener('error', (err) => console.log('ERR', err));
// recognition.addEventListener('end', (end) => {
//     console.log('END');
//     // recognition.start()
// });

// recognition.start();
