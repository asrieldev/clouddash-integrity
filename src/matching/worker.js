import { matchVideo } from './alignment.js';
self.onmessage = ({ data }) => {
  try { self.postMessage({ results: data.references.map(reference => matchVideo(data.query, reference, data.options)) }); }
  catch(error) { self.postMessage({ error: error.message }); }
};
