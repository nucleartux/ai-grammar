import ollama from "ollama/browser";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "ollama.list") {
    ollama
      .list()
      .then((result) => sendResponse(result))
      .catch(() => sendResponse(null));
    return true;
  }
  if (request.type === "ollama.generate") {
    ollama.abort();
    ollama
      .generate(request.data)
      .then((result) => sendResponse(result))
      .catch(() => sendResponse(null));
    return true;
  }
});
