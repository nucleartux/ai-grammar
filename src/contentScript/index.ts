import { computePosition, flip, shift } from "@floating-ui/dom";
import { diffWords } from "diff";

const checkIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.801 10A10 10 0 1 1 17 3.335"/><path d="m9 11 3 3L22 4"/></svg>`;

const infoIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>`;

const powerIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v4"/><path d="M7.998 9.003a5 5 0 1 0 8-.005"/><circle cx="12" cy="12" r="10"/></svg>`;

const loadingIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.1 2.182a10 10 0 0 1 3.8 0"/><path d="M13.9 21.818a10 10 0 0 1-3.8 0"/><path d="M17.609 3.721a10 10 0 0 1 2.69 2.7"/><path d="M2.182 13.9a10 10 0 0 1 0-3.8"/><path d="M20.279 17.609a10 10 0 0 1-2.7 2.69"/><path d="M21.818 10.1a10 10 0 0 1 0 3.8"/><path d="M3.721 6.391a10 10 0 0 1 2.7-2.69"/><path d="M6.391 20.279a10 10 0 0 1-2.69-2.7"/></svg>`;

type AISession = {
  prompt: (prompt: string) => Promise<string>;
};

declare const ai: {
  createTextSession: () => Promise<AISession>;
  canCreateTextSession: () => Promise<"readily" | "no" | "after-download">;
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

const fixGrammar = async (text: string) => {
  const session = await ai.createTextSession();

  const prompt = `prompt user: correct grammar, output only corrected sentence:${text}<ctrl23>
  assistant: `;

  const result = (await session.prompt(prompt)).trim();

  return result;
};

let supported = true;

const isSupported = async () => {
  if (!supported) {
    return false;
  }
  try {
    const result = await ai.canCreateTextSession();
    supported = result === "readily";
    return supported;
  } catch {
    return false;
  }
};

const isTextArea = (node: Node): node is HTMLTextAreaElement => {
  return node instanceof HTMLTextAreaElement && node.spellcheck;
};

const recursivelyFindAllTextAreas = (node: Node) => {
  const inputs: HTMLTextAreaElement[] = [];
  if (isTextArea(node)) {
    inputs.push(node);
  } else {
    for (let child of node.childNodes) {
      inputs.push(...recursivelyFindAllTextAreas(child));
    }
  }
  return inputs;
};

const idle = () => {
  return new Promise((resolve) => {
    requestIdleCallback(resolve);
  });
};

class Control {
  #button: HTMLButtonElement;
  #tooltip: HTMLDivElement;

  #text: string = "";
  #result: string = "";

  constructor(public textArea: HTMLTextAreaElement) {
    this.#button = document.createElement("button");
    this.#button.innerHTML = loadingIcon;
    this.#button.addEventListener("click", this.#onClick);
    this.#button.style.position = "absolute";
    this.#button.style.zIndex = "99999998";
    this.#button.style.padding = "0";
    this.#button.style.border = "0";
    this.#button.style.background = "transparent";
    this.#button.style.cursor = "pointer";
    document.body.appendChild(this.#button);
    this.#tooltip = document.createElement("div");
    this.#tooltip.style.display = "none";
    this.#tooltip.style.position = "absolute";
    this.#tooltip.style.background = "#fff";
    this.#tooltip.style.borderRadius = "4px";
    this.#tooltip.style.padding = "8px";
    this.#tooltip.style.fontSize = "16px";
    this.#tooltip.style.whiteSpace = "pre-wrap";
    this.#tooltip.style.width = "max-content";
    this.#tooltip.style.maxWidth = "300px";
    this.#tooltip.style.maxHeight = "300px";
    this.#tooltip.style.overflow = "hidden";
    this.#tooltip.style.textOverflow = "ellipsis";
    this.#tooltip.style.fontFamily = "system-ui, Arial, sans-serif";
    this.#tooltip.style.boxShadow = "0 0 4px rgba(0, 0, 0, 0.2)";
    this.#tooltip.style.zIndex = "99999999";
    this.#tooltip.textContent = "Loading...";
    document.body.appendChild(this.#tooltip);

    new ResizeObserver(() => this.updatePosition()).observe(textArea);

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
    this.#tooltip.style.display = "block";

    this.#updateTooltipPosition();
  }

  #hideTooltip() {
    this.#tooltip.style.display = "none";
  }

  public async update(t: string) {
    const text = t.trim();
    this.#text = text;

    this.updatePosition();

    if (text.length < 4) {
      this.#hide();
      return;
    }

    await idle();

    if (!(await isSupported())) {
      this.#button.style.display = "block";
      this.#tooltip.textContent =
        "AI is not supported. Please enable it in your browser settings.";
      this.#button.innerHTML = powerIcon;
      this.#updateTooltipPosition();
      this.updatePosition();
      return;
    }

    this.#button.style.display = "block";
    this.#button.innerHTML = loadingIcon;
    this.#tooltip.textContent = "Loading...";
    this.#updateTooltipPosition();

    try {
      const result = await fixGrammar(text);
      if (this.#text !== text) {
        return;
      }
      this.#result = result;

      this.#button.innerHTML = this.#isCorrect ? checkIcon : infoIcon;
      if (this.#isCorrect) {
        this.#hideTooltip();
      }

      this.#tooltip.textContent = "";
      this.#tooltip.appendChild(createDiff(text, result));

      this.#updateTooltipPosition();
    } catch {
      this.#tooltip.textContent = "Something went wrong. Please try again.";
      this.#button.innerHTML = powerIcon;
      this.#updateTooltipPosition();
    }
  }

  public updatePosition() {
    const rect = this.textArea.getBoundingClientRect();
    this.#button.style.top = `${getPageOffsetTop(this.textArea) + rect.top + rect.height - 24 - 8}px`;
    this.#button.style.left = `${getPageOffsetLeft(this.textArea) + rect.left + rect.width - 24 - 8}px`;
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

  #onClick = async () => {
    if (!this.#result || this.#isCorrect) {
      return;
    }
    this.textArea.value = this.#result;
    this.#hide();
  };

  #hide() {
    this.#button.style.display = "none";
  }

  get #isCorrect() {
    return this.#text === this.#result;
  }

  destroy() {
    this.#button.remove();
    this.#tooltip.remove();
  }
}

const inputsMap = new Map<HTMLTextAreaElement, Control>();

const listener = async (e: Event) => {
  if (!(e.target instanceof HTMLTextAreaElement)) {
    return;
  }

  const target = e.target as HTMLTextAreaElement;
  const text = target.value;

  let control = inputsMap.get(target);
  if (!control) {
    control = new Control(target);
    inputsMap.set(target, control);
  }
  control.update(text);
};

const recursivelyAddInputs = (node: Node) => {
  const inputs = recursivelyFindAllTextAreas(node);
  for (let input of inputs) {
    let control = inputsMap.get(input);
    if (!control) {
      control = new Control(input);
      inputsMap.set(input, control);
      control.update(input.value);
    }
  }
};

const main = async () => {
  let observer = new MutationObserver((mutations) => {
    inputsMap.forEach((control) => control.updatePosition());

    for (let mutation of mutations) {
      for (let addedNode of mutation.addedNodes) {
        recursivelyAddInputs(addedNode);
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

  recursivelyAddInputs(document);

  document.addEventListener("input", listener);

  window.onresize = () => {
    inputsMap.forEach((control) => control.updatePosition());
  };
};

main();
