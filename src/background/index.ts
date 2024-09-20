import ollama, { Ollama } from "ollama/browser";

let abortController = new AbortController();

const fetchWithSignal = (...args: Parameters<typeof fetch>) => {
  return fetch(args[0], {
    ...args[1],
    signal: abortController.signal,
  });
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "ollama.list") {
    ollama
      .list()
      .then((result) => sendResponse(result))
      .catch(() => sendResponse(null));
    return true;
  }
  if (request.type === "ollama.generate") {
    abortController.abort();
    abortController = new AbortController();
    const ollama = new Ollama({
      fetch: fetchWithSignal,
    });
    ollama
      .generate(request.data)
      .then((result) => sendResponse(result))
      .catch((e) => {
        console.warn(e);
        return sendResponse(null);
      });
    return true;
  }
});
