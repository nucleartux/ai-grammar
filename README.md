# ai-grammar

![Basic grammar check](./assets/1.png "Basic grammar check")

> Completely free and open source Chrome AI Grammar Check Extension

!! Works only on Dev and Canary versions of Chrome!

Instructions on how to enable AI in your browser - https://huggingface.co/blog/Xenova/run-gemini-nano-in-your-browser#installation

- Completely free. No subscriptions required. No ads.
- Absolutely safe. AI works on your machine. No data sent to the internet.
- Smart grammar check. Checks full sentences, not only individual words.

## Installing

1. Check if your `Node.js` version is >= **14**.
2. Change or configurate the name of your extension on `src/manifest`.
3. Run `npm install` to install the dependencies.

## Developing

run the command

```shell
$ cd ai-grammar

$ npm run dev
```

### Chrome Extension Developer Mode

1. set your Chrome browser 'Developer mode' up
2. click 'Load unpacked', and select `ai-grammar/build` folder

## Packing

After the development of your extension run the command

```shell
$ npm run build
```

Now, the content of `build` folder will be the extension ready to be submitted to the Chrome Web Store. Just take a look at the [official guide](https://developer.chrome.com/webstore/publish) to more infos about publishing.

---

Generated by [create-chrome-ext](https://github.com/guocaoyi/create-chrome-ext)
