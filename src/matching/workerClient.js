export function matchReferences(query, references, options) {
  return new Promise((resolve,reject) => {
    const worker = new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
    worker.onmessage = ({data}) => { worker.terminate(); data.error ? reject(new Error(data.error)) : resolve(data.results); };
    worker.onerror = event => { worker.terminate(); reject(new Error(event.message || 'Matching worker failed')); };
    worker.postMessage({query,references,options});
  });
}
