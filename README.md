# ai-grammar

| ![Basic grammar check](./assets/1.png "Basic grammar check") | ![Complex Sentences](./assets/2.png "Complex Sentences") |
| :----------------------------------------------------------: | :------------------------------------------------------: |

> Completely free and open source Chrome AI Grammar Check Extension

- Completely free. No subscriptions required. No ads.
- Absolutely safe. AI works on your machine. No data sent to the internet.
- Smart grammar check. Checks full sentences, not only individual words.

[Download from Chrome Web Store](https://chromewebstore.google.com/detail/free-ai-grammar-checker/jnkjkpapplndagboidnhphaciphgjeca)

## Installing

For installation you have two options (you need to choose **only one**):

**First option: Using Built-in AI in Chrome 138+:**

1. Install Chrome 138 or above
2. That's all. Use the extension. You might need to wait the first time while the model is loading, but further interactions should be almost instant (although it depends on your hardware, of course).

If something goes wrong reload the page, if it doesn't work please [open an issue](https://github.com/nucleartux/ai-grammar/issues/new).

**Second option (more advanced): Using local installed Ollama server (you need 16GB RAM or more):**

1. Install [Ollama](https://ollama.com/download)
2. Install `ollama3.1` model:

Open terminal and run:

```shell
ollama run llama3.1
```

3. Set CORS headers:

For macOS open terminal and run:

```shell
launchctl setenv OLLAMA_ORIGINS "*"
```

For other OS please check [this](https://medium.com/dcoderai/how-to-handle-cors-settings-in-ollama-a-comprehensive-guide-ee2a5a1beef0)

4. Restart Ollama server:

for macOS: click on the Ollama icon in the menu bar and click "Quit Ollama" and then run Ollama from the Launchpad (or Applications folder) again.

---



## Developing

run the command

```shell
$ cd ai-grammar

$ npm install
$ npm run build
```

### Chrome Extension Developer Mode

1. set your Chrome browser 'Developer mode' up
2. click 'Load unpacked', and select `ai-grammar/build` folder
