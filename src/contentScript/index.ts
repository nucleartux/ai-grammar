import { computePosition, flip, shift } from "@floating-ui/dom";
import { diffWords } from "diff";
import type {
  GenerateResponse,
  GenerateRequest,
  ListResponse,
} from "ollama/browser";

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

function getPageOffsetTop(elem: HTMLElement | null) {
  let offset = 0;

  while (elem != document.documentElement) {
    elem = elem?.parentElement ?? null;
    offset += elem?.scrollTop ?? 0;
  }

  return offset;
}

function getPageOffsetLeft(elem: HTMLElement | null) {
  let offset = 0;

  while (elem != document.documentElement) {
    elem = elem?.parentElement ?? null;
    offset += elem?.scrollLeft ?? 0;
  }

  return offset;
}

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

const parseNumber = (value: string) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
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
      fontSize: "16px",
      margin: "0",
    });

    Object.assign(this.#hint.style, {
      display: "none",
      fontSize: "12px",
      color: "#666",
      margin: "0",
    });

    this.#tooltip.appendChild(this.#hint);
    this.#tooltip.appendChild(this.#text);

    document.body.appendChild(this.#tooltip);
  }

  show() {
    this.hint = null;
    this.#tooltip.style.display = "flex";

    this.#updateTooltipPosition();
  }

  hide() {
    this.#tooltip.style.display = "none";
    this.hint = null;
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
  }

  #updateTooltipPosition() {
    computePosition(this.#button, this.#tooltip, {
      placement: "bottom",
      middleware: [flip(), shift({ padding: 5 })],
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

class Control {
  #button: HTMLButtonElement;
  #tooltip: Tooltip;

  #text: string = "";
  #result: string = "";
  #provider: Provider | null;

  constructor(
    public textArea: HTMLTextAreaElement | HTMLElement,
    provider: Provider | null,
  ) {
    this.#provider = provider;
    const textAreaStyle = getComputedStyle(textArea);
    this.#button = document.createElement("button");
    this.#button.innerHTML = loadingIcon;
    this.#button.addEventListener("click", this.#onClick);
    this.#button.style.position = "absolute";
    this.#button.style.zIndex = `${Math.max(parseNumber(textAreaStyle.zIndex), 0) + 1}`;
    this.#button.style.padding = "0";
    this.#button.style.border = "0";
    this.#button.style.background = "transparent";
    this.#button.style.cursor = "pointer";
    document.body.appendChild(this.#button);
    this.#tooltip = new Tooltip(
      Math.max(parseNumber(textAreaStyle.zIndex), 0) + 2,
      this.#button,
    );

    this.updatePosition();

    this.#button.addEventListener("mouseenter", () => this.#showTooltip());
    this.#button.addEventListener("mouseleave", () => this.#hideTooltip());
    this.#button.addEventListener("focus", () => this.#showTooltip());
    this.#button.addEventListener("blur", () => this.#hideTooltip());
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

  public async update() {
    const text =
      this.textArea instanceof HTMLTextAreaElement
        ? this.textArea.value
        : this.textArea.innerText;

    this.#text = text;

    this.updatePosition();

    // rarely works with single words
    if (text.trim().split(/\s+/).length < 2) {
      this.#hide();
      return;
    }

    if (!this.#provider) {
      this.#button.style.display = "block";
      this.#button.innerHTML = powerIcon;
      this.updatePosition();

      this.#tooltip.text =
        "AI is not supported. Please enable it in your browser settings.";
      return;
    }

    this.#button.style.display = "block";
    this.#button.innerHTML = loadingIcon;
    this.#tooltip.text = "Loading...";

    const result = await resultFromPromise(this.#provider.fixGrammar(text));
    if (this.#text !== text) {
      return;
    }

    if (result.ok) {
      this.#result = result.value;

      this.#button.innerHTML = this.#isCorrect ? checkIcon : infoIcon;
      if (this.#isCorrect) {
        this.#hideTooltip();
      }

      this.#tooltip.text = createDiff(text, result.value);
    } else {
      const error = result.error as any;
      console.warn(error);
      const message = error?.message ?? error?.toString();
      this.#tooltip.text =
        "Something went wrong. Please try again." +
        (message ? ` (${message})` : "");
      this.#button.innerHTML = powerIcon;
    }
  }

  public updatePosition() {
    const rect = this.textArea.getBoundingClientRect();
    this.#button.style.top = `${getPageOffsetTop(this.textArea) + rect.top + rect.height - 24 - 8}px`;
    this.#button.style.left = `${getPageOffsetLeft(this.textArea) + rect.left + rect.width - 24 - 8}px`;
  }

  #onClick = async () => {
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

  #hide() {
    this.#button.style.display = "none";
  }

  get #isCorrect() {
    return this.#text === this.#result;
  }

  destroy() {
    this.#button.remove();
    this.#tooltip.destroy();
  }
}

const inputsMap = new Map<HTMLTextAreaElement | HTMLElement, Control>();

const listener = (provider: Provider | null) => async (e: Event) => {
  const target = e.target;

  if (!target || !isTextArea(target)) {
    return;
  }

  let control = inputsMap.get(target);
  if (!control) {
    control = new Control(target, provider);
    inputsMap.set(target, control);
  }
  control.update();
};

const recursivelyAddInputs = (node: Node, provider: Provider | null) => {
  const inputs = recursivelyFindAllTextAreas(node);
  for (let input of inputs) {
    let control = inputsMap.get(input);
    if (!control) {
      control = new Control(input, provider);
      inputsMap.set(input, control);
      control.update();
    }
  }
};

let changed = false;

const main = async () => {
  const providers = [new OllamaProvider(), new GeminiProvider()];

  let provider: Provider | null = null;

  for (let p of providers) {
    if (await p.isSupported()) {
      provider = p;
      break;
    }
  }

  let observer = new MutationObserver((mutations) => {
    changed = true;
    for (let mutation of mutations) {
      for (let addedNode of mutation.addedNodes) {
        recursivelyAddInputs(addedNode, provider);
      }

      for (let removedNode of mutation.removedNodes) {
        const inputs = recursivelyFindAllTextAreas(removedNode);
        for (let input of inputs) {
          const control = inputsMap.get(input);
          if (control) {
            control.destroy();
            inputsMap.delete(input);
          }
        }
      }
    }
  });
  observer.observe(document, { childList: true, subtree: true });

  recursivelyAddInputs(document, provider);

  document.addEventListener("input", listener(provider));

  setInterval(() => {
    if (changed) {
      changed = false;
      inputsMap.forEach((control) => control.updatePosition());
    }
  }, 60);
};

main();
