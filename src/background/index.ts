import ollama, { GenerateResponse, Ollama } from "ollama/browser";

let abortController = new AbortController();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchWithSignal = (...args: Parameters<typeof fetch>) => {
  return fetch(args[0], {
    ...args[1],
    signal: abortController.signal,
  });
};

const ollamaGenerate = (
  args: Parameters<typeof ollama.generate>[0],
): Promise<GenerateResponse> => {
  const ollama = new Ollama({
    fetch: fetchWithSignal,
  });
  return ollama.generate(args).catch((e) => {
    console.warn(e);
    const message: string | undefined = (e as any)?.message;
    if (message === "unexpected server status: llm server loading model") {
      return sleep(3000).then(() => {
        if (abortController.signal.aborted) {
          throw new Error("Aborted");
        }
        return ollamaGenerate(args);
      });
    }
    throw e;
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
    ollamaGenerate(request.data)
      .then((result) => sendResponse(result))
      .catch(() => sendResponse(null));

    return true;
  }

  if (request.type === "gemini.supported") {
    LanguageModel.availability()
      .then(() => {
        sendResponse(true);
      })
      .catch(() => {
        sendResponse(false);
      });
    return true;
  }

  if (request.type === "gemini.generate") {
    abortController.abort();
    abortController = new AbortController();
    LanguageModel.create({
      signal: abortController.signal,
    }).then((session) => {
      session
        .prompt(request.data.text, {
          signal: abortController.signal,
          ...request.data,
        })
        .then((data) => {
          sendResponse(data);
        })
        .catch((e) => {
          console.warn(e);
          sendResponse(null);
        });
    });

    return true;
  }
});
