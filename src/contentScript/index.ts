import { computePosition, flip, offset, Rect } from "@floating-ui/dom";
import { diffWords } from "diff";
import type {
  GenerateResponse,
  GenerateRequest,
  ListResponse,
} from "ollama/browser";

const buttonSize = 24;
const buttonPadding = 8;

const checkIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.801 10A10 10 0 1 1 17 3.335"/><path d="m9 11 3 3L22 4"/></svg>`;

const infoIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>`;

const powerIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v4"/><path d="M7.998 9.003a5 5 0 1 0 8-.005"/><circle cx="12" cy="12" r="10"/></svg>`;

const loadingIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.1 2.182a10 10 0 0 1 3.8 0"/><path d="M13.9 21.818a10 10 0 0 1-3.8 0"/><path d="M17.609 3.721a10 10 0 0 1 2.69 2.7"/><path d="M2.182 13.9a10 10 0 0 1 0-3.8"/><path d="M20.279 17.609a10 10 0 0 1-2.7 2.69"/><path d="M21.818 10.1a10 10 0 0 1 0 3.8"/><path d="M3.721 6.391a10 10 0 0 1 2.7-2.69"/><path d="M6.391 20.279a10 10 0 0 1-2.69-2.7"/></svg>`;

type Result<T> = { ok: true; value: T } | { ok: false; error: unknown };

const resultFromPromise = <T>(promise: Promise<T>): Promise<Result<T>> => {
  return promise.then(
    (value) => ({ ok: true, value }),
    (error) => ({ ok: false, error }),
  );
};

const isVisible = (el: HTMLElement, parent: HTMLElement) => {
  const rect = el.getBoundingClientRect();

  // check coords on the left of the button to handle cases with little textarea (twitter)
  const coords = [
    [rect.left - buttonSize - 1, rect.top + 4],
    [rect.right - buttonSize - 1, rect.top + 4],
    [rect.right - buttonSize - 1, rect.bottom - 4],
    [rect.left - buttonSize - 1, rect.bottom - 4],
  ];

  for (let coord of coords) {
    const other = document.elementFromPoint(coord[0], coord[1]);
    if (!(other && (parent === other || parent.contains(other)))) {
      return false;
    }
  }

  return true;
};

function createDiff(str1: string, str2: string) {
  const diff = diffWords(str1, str2);
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < diff.length; i++) {
    if (diff[i].added && diff[i + 1] && diff[i + 1].removed) {
      const swap = diff[i];
      diff[i] = diff[i + 1];
      diff[i + 1] = swap;
    }

    let node: HTMLElement | Text;
    if (diff[i].removed) {
      node = document.createElement("del");
      node.style.background = "#ffe6e6";
      node.style.color = "#c00";
      node.appendChild(document.createTextNode(diff[i].value));
    } else if (diff[i].added) {
      node = document.createElement("ins");
      node.style.background = "#e6ffe6";
      node.style.color = "#0c0";
      node.appendChild(document.createTextNode(diff[i].value));
    } else {
      node = document.createTextNode(diff[i].value);
    }
    fragment.appendChild(node);
  }

  return fragment;
}

interface Provider {
  isSupported: () => Promise<boolean>;
  fixGrammar: (text: string) => Promise<string>;
}

class GeminiProvider implements Provider {
  #abortController = new AbortController();

  async isSupported() {
    try {
      const result = await self.ai.assistant.capabilities();
      return result.available === "readily";
    } catch (e) {
      console.warn(e);
      return false;
    }
  }

  async fixGrammar(text: string) {
    this.#abortController.abort();
    this.#abortController = new AbortController();
    const session = await self.ai.assistant.create({
      signal: this.#abortController.signal,
      systemPrompt: "correct grammar in text, don't add explanations",
    });

    const prompt =
      // @prettier-ignore
      `correct grammar:
  ${text}
  `;

    const result = (
      await session.prompt(prompt, { signal: this.#abortController.signal })
    ).trim();

    session.destroy();

    return result;
  }
}

class OllamaProvider implements Provider {
  async isSupported() {
    try {
      const result: ListResponse | null = await chrome.runtime.sendMessage({
        type: "ollama.list",
      });

      if (!result) {
        return false;
      }

      return result.models.length > 0;
    } catch (e) {
      console.warn(e);
      return false;
    }
  }

  async fixGrammar(text: string) {
    const prompt =
      // @prettier-ignore
      `correct grammar:
  ${text}
  `;

    const response: GenerateResponse | null = await chrome.runtime.sendMessage({
      type: "ollama.generate",
      data: {
        model: "llama3.1",
        prompt,
        system: "correct grammar in text, don't add explanations",
      } satisfies GenerateRequest,
    });

    if (!response) {
      throw new Error("Make sure that Ollama is installed and running.");
    }

    return response.response;
  }
}

const isTextArea = (
  node: Node | EventTarget,
): node is HTMLTextAreaElement | HTMLElement => {
  return (
    ((node instanceof HTMLElement && node.contentEditable === "true") ||
      node instanceof HTMLTextAreaElement) &&
    node.spellcheck
  );
};

const recursivelyFindAllTextAreas = (node: Node) => {
  const inputs: (HTMLTextAreaElement | HTMLElement)[] = [];
  if (isTextArea(node)) {
    inputs.push(node);
  } else {
    for (let child of node.childNodes) {
      inputs.push(...recursivelyFindAllTextAreas(child));
    }
  }
  return inputs;
};

class Tooltip {
  #tooltip: HTMLDivElement;
  #button: HTMLButtonElement;
  #text: HTMLParagraphElement;
  #hint: HTMLParagraphElement;

  constructor(zIndex: number, button: HTMLButtonElement) {
    this.#button = button;
    this.#tooltip = document.createElement("div");
    this.#text = document.createElement("p");
    this.#hint = document.createElement("p");

    Object.assign(this.#tooltip.style, {
      display: "none",
      flexDirection: "column",
      gap: "4px",
      position: "absolute",
      background: "#fff",
      borderRadius: "4px",
      padding: "8px",
      whiteSpace: "pre-wrap",
      width: "max-content",
      maxWidth: "300px",
      maxHeight: "300px",
      overflow: "hidden",
      textOverflow: "ellipsis",
      fontFamily: "system-ui, Arial, sans-serif",
      boxShadow: "0 0 4px rgba(0, 0, 0, 0.2)",
      zIndex: `${zIndex}`,
    });

    this.#text.textContent = "Loading...";

    Object.assign(this.#text.style, {
      color: "#000",
      fontSize: "max(16px,1rem)",
      margin: "0",
    });

    Object.assign(this.#hint.style, {
      display: "none",
      fontSize: "max(12px,0.75rem)",
      color: "#666",
      margin: "0",
    });

    this.#tooltip.appendChild(this.#hint);
    this.#tooltip.appendChild(this.#text);

    document.body.appendChild(this.#tooltip);
  }

  show() {
    this.#tooltip.style.display = "flex";

    this.#updateTooltipPosition();
  }

  hide() {
    this.#tooltip.style.display = "none";
  }

  set text(text: string | DocumentFragment) {
    if (text instanceof DocumentFragment) {
      this.#text.textContent = "";
      this.#text.appendChild(text);
    } else {
      this.#text.textContent = text;
    }
    this.#updateTooltipPosition();
  }

  set hint(text: string | null) {
    if (text) {
      this.#hint.textContent = text;
      this.#hint.style.display = "block";
    } else {
      this.#hint.textContent = "";
      this.#hint.style.display = "none";
    }
    this.#updateTooltipPosition();
  }

  #updateTooltipPosition() {
    computePosition(this.#button, this.#tooltip, {
      placement: "bottom",
      middleware: [flip(), offset({ mainAxis: 2 })],
    }).then(({ x, y }) => {
      Object.assign(this.#tooltip.style, {
        left: `${x}px`,
        top: `${y}px`,
      });
    });
  }

  destroy() {
    this.#tooltip.remove();
  }
}

const getButtonVerticalPadding = (rect: Rect) => {
  if (rect.height < buttonSize + buttonPadding * 2) {
    return Math.max(0, rect.height - buttonSize) / 2;
  }

  return buttonPadding;
};

type State =
  | { type: "empty" }
  | { type: "loading" }
  | { type: "correct" }
  | { type: "wrong"; text: DocumentFragment }
  | { type: "error"; text: string };

class Control {
  #button: HTMLButtonElement;
  #tooltip: Tooltip;

  #text: string = "";
  #result: string = "";
  #provider: Provider | null;
  #updateInterval: ReturnType<typeof setInterval> | null = null;
  #isVisible: boolean = false;
  #showButton: boolean = false;

  constructor(
    public textArea: HTMLTextAreaElement | HTMLElement,
    provider: Provider | null,
  ) {
    this.#provider = provider;
    this.#button = document.createElement("button");
    this.#button.innerHTML = loadingIcon;
    Object.assign(this.#button.style, {
      position: "absolute",
      zIndex: `${99999999999}`,
      padding: "0",
      border: "0",
      background: "transparent",
      cursor: "pointer",
      outline: "none",
    });
    document.body.appendChild(this.#button);
    this.#tooltip = new Tooltip(99999999999, this.#button);

    this.updatePosition();

    this.#button.addEventListener("mouseenter", () => this.#showTooltip());
    this.#button.addEventListener("mouseleave", () => this.#hideTooltip());
    this.#button.addEventListener("focus", () => this.#showTooltip());
    this.#button.addEventListener("blur", () => this.#hideTooltip());

    this.#updateInterval = setInterval(() => {
      control?.updatePosition();
    }, 60);
  }

  #showTooltip() {
    if (this.#isCorrect) {
      return;
    }
    this.#tooltip.show();
  }

  #hideTooltip() {
    this.#tooltip.hide();
  }

  #setState(state: State) {
    switch (state.type) {
      case "empty":
        this.#hide();
        this.#tooltip.hint = null;
        this.#button.removeEventListener("click", this.#handleWrongClick);
        this.#button.removeEventListener("click", this.#handleErrorClick);
        return;
      case "loading":
        this.#show();
        this.#button.innerHTML = loadingIcon;
        this.#tooltip.text = "Loading...";
        this.#tooltip.hint = null;
        this.#button.style.cursor = "wait";
        this.#button.removeEventListener("click", this.#handleWrongClick);
        this.#button.removeEventListener("click", this.#handleErrorClick);
        return;
      case "correct":
        this.#show();
        this.#button.innerHTML = checkIcon;
        this.#tooltip.hint = null;
        this.#button.style.cursor = "default";
        this.#button.removeEventListener("click", this.#handleWrongClick);
        this.#button.removeEventListener("click", this.#handleErrorClick);

        this.#hideTooltip();

        return;
      case "wrong":
        this.#show();
        this.#button.innerHTML = infoIcon;
        this.#tooltip.text = state.text;
        this.#tooltip.hint =
          this.textArea instanceof HTMLTextAreaElement
            ? "Click to replace"
            : "Click to copy";
        this.#button.style.cursor = "pointer";

        this.#button.addEventListener("click", this.#handleWrongClick);
        this.#button.removeEventListener("click", this.#handleErrorClick);
        return;
      case "error":
        this.#show();
        this.#tooltip.hint = "Click to open documentation";
        this.#button.innerHTML = powerIcon;
        this.#tooltip.text = state.text;
        this.#button.style.cursor = "pointer";
        this.#button.removeEventListener("click", this.#handleWrongClick);
        this.#button.addEventListener("click", this.#handleErrorClick);
        return;
    }
  }

  public async update() {
    const text =
      this.textArea instanceof HTMLTextAreaElement
        ? this.textArea.value
        : this.textArea.innerText;

    this.#text = text;

    this.updatePosition();

    if (!this.#provider) {
      this.#setState({
        type: "error",
        text: "AI is not supported. Please enable it in your browser settings.",
      });
      return;
    }

    // rarely works with single words
    if (text.trim().split(/\s+/).length < 2) {
      this.#setState({ type: "empty" });
      return;
    }

    this.#setState({ type: "loading" });

    const result = await resultFromPromise(this.#provider.fixGrammar(text));

    if (this.#text !== text) {
      return;
    }

    if (!result.ok) {
      const error = result.error as any;
      console.warn(error);
      const message = error?.message ?? error?.toString();
      this.#setState({
        type: "error",
        text:
          "Something went wrong. Please try again." +
          (message ? ` (${message})` : ""),
      });
      return;
    }

    this.#result = result.value;

    if (this.#isCorrect) {
      this.#setState({ type: "correct" });
    } else {
      this.#setState({ type: "wrong", text: createDiff(text, result.value) });
    }
  }

  public updatePosition() {
    computePosition(this.textArea, this.#button, {
      placement: "bottom-end",
      middleware: [
        offset((state) => ({
          mainAxis:
            -getButtonVerticalPadding(state.rects.reference) - buttonSize,
          crossAxis: -buttonPadding,
        })),
      ],
    }).then(({ x, y }) => {
      Object.assign(this.#button.style, {
        left: `${x}px`,
        top: `${y}px`,
      });
    });

    this.#isVisible = isVisible(this.#button, this.textArea);
    this.#updateButtonVisibility();
  }

  #handleErrorClick = () => {
    window
      .open(
        "https://github.com/nucleartux/ai-grammar?tab=readme-ov-file#ai-grammar",
        "_blank",
      )
      ?.focus();
  };

  #handleWrongClick = async () => {
    if (!this.#result || this.#isCorrect) {
      return;
    }
    if (this.textArea instanceof HTMLTextAreaElement) {
      this.textArea.value = this.#result;
      this.#hide();
    } else {
      const type = "text/plain";
      const blob = new Blob([this.#result], { type });
      const data = [new ClipboardItem({ [type]: blob })];
      await navigator.clipboard.write(data);
      this.#tooltip.hint = "Copied to clipboard";
    }
  };

  #updateButtonVisibility() {
    if (this.#isVisible && this.#showButton) {
      this.#button.style.opacity = "1";
    } else {
      this.#button.style.opacity = "0";
    }
  }

  #show() {
    this.#showButton = true;
    this.#updateButtonVisibility();
  }

  #hide() {
    this.#showButton = false;
    this.#updateButtonVisibility();
  }

  get #isCorrect() {
    return this.#text === this.#result;
  }

  destroy() {
    this.#button.remove();
    this.#tooltip.destroy();
    if (this.#updateInterval) {
      clearInterval(this.#updateInterval);
    }
  }

  isSameElement(el: EventTarget | null) {
    return this.textArea === el || this.#button == el;
  }
}

let control: Control | null = null;

const inputListener = (provider: Provider | null) => async (e: Event) => {
  const target = e.target;

  if (!target || !isTextArea(target)) {
    return;
  }

  if (target === control?.textArea) {
    control.update();
    return;
  }

  control?.destroy();

  control = new Control(target, provider);
  control.update();
};

const focusListener = (provider: Provider | null) => async (e: Event) => {
  const target = e.target;

  if (control?.isSameElement(target)) {
    return;
  }

  if (!target || !isTextArea(target)) {
    return;
  }

  control?.destroy();

  control = new Control(target, provider);
  control.update();
};

const main = async () => {
  const providers = [new OllamaProvider(), new GeminiProvider()];

  let provider: Provider | null = null;

  for (let p of providers) {
    if (await p.isSupported()) {
      provider = p;
      break;
    }
  }

  const observer = new MutationObserver(() => {
    if (control?.textArea && !document.body.contains(control?.textArea)) {
      control?.destroy();
      control = null;
    }
  });
  observer.observe(document, { childList: true, subtree: true });

  document.addEventListener("input", inputListener(provider));
  document.addEventListener("focus", focusListener(provider), true);
};

main();
