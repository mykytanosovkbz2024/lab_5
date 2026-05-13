(function () {
  "use strict";

  const Config = {
    storageKeys: {
      runtime: "lab4.runtime.snapshot",
      theme: "lab4.theme.preference",
      modalDismissed: "lab4.feedback.dismissed",
    },
    comments: {
      endpoint: "https://jsonplaceholder.typicode.com/posts",
      defaultVariant: 1,
    },
    themeModes: ["auto", "light", "dark"],
    modalDelayMs: 60_000,
    dayThemeHours: {
      start: 7,
      end: 21,
    },
    feedback: {
      // In production this value should come from the server or build-time env,
      // not be hardcoded in a browser bundle.
      formspreeEndpoint: "https://formspree.io/f/xrejdewq",
      minimumHumanDelayMs: 1500,
    },
    formspreePlaceholder: "your-endpoint",
  };

  const Utils = {
    capitalize(value) {
      return value.charAt(0).toUpperCase() + value.slice(1);
    },

    humanizeKey(key) {
      return key
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (char) => char.toUpperCase());
    },

    escapeHtml(value) {
      return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    },
  };

  const Storage = {
    get(key) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },

    set(key, value) {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        return false;
      }

      return true;
    },
  };

  const Dom = {
    nodes: {},

    init() {
      const byId = (id) => document.getElementById(id);

      this.nodes = {
        root: document.documentElement,
        themeLight: byId("theme-light"),
        themeDark: byId("theme-dark"),
        themeToggleGroup: byId("theme-toggle-group"),
        scheduleIndicator: byId("schedule-indicator"),
        variantBadge: byId("comment-variant-badge"),
        commentsStatus: byId("comments-status"),
        commentList: byId("comment-list"),
        runtimeGrid: byId("runtime-grid"),
        feedbackOpen: byId("feedback-open"),
        feedbackDialog: byId("feedback-dialog"),
        feedbackForm: byId("feedback-form"),
        feedbackClose: byId("feedback-close"),
        feedbackLater: byId("feedback-later"),
        feedbackOpenedAt: byId("feedback-opened-at"),
        feedbackCompany: byId("feedback-company"),
        formStatus: byId("form-status"),
        nameInput: byId("feedback-name"),
        emailInput: byId("feedback-email"),
        phoneInput: byId("feedback-phone"),
        messageInput: byId("feedback-message"),
      };

      this.validate();
    },

    validate() {
      for (const [key, value] of Object.entries(this.nodes)) {
        if (!value) {
          throw new Error(`Missing required DOM node: ${key}`);
        }
      }
    },

    setStatus(node, text, state) {
      node.textContent = text;
      node.dataset.state = state;
    },
  };

  const Theme = {
    state: {
      mode: "auto",
      active: "light",
      scheduled: "light",
    },

    init() {
      this.state.mode = this.readPreference();
      this.apply();
      this.bindEvents();
      this.scheduleRefresh();
    },

    bindEvents() {
      Dom.nodes.themeLight.addEventListener("click", () => {
        this.activate("light");
      });

      Dom.nodes.themeDark.addEventListener("click", () => {
        this.activate("dark");
      });
    },

    scheduleRefresh() {
      window.setInterval(() => {
        this.apply();
      }, 60_000);
    },

    activate(theme) {
      const nextMode = this.state.mode === theme ? "auto" : theme;

      this.state.mode = nextMode;
      Storage.set(Config.storageKeys.theme, nextMode);
      this.runTransition(() => {
        this.apply();
      });
    },

    runTransition(update) {
      if (typeof document.startViewTransition === "function") {
        document.startViewTransition(update);
        return;
      }

      update();
    },

    apply() {
      this.state.scheduled = this.resolveScheduled();
      this.state.active = this.resolveActive();
      Dom.nodes.root.dataset.theme = this.state.active;
      this.render();
    },

    resolveScheduled() {
      const hours = new Date().getHours();
      const { start, end } = Config.dayThemeHours;

      return hours >= start && hours < end ? "light" : "dark";
    },

    resolveActive() {
      if (this.state.mode === "light" || this.state.mode === "dark") {
        return this.state.mode;
      }

      return this.state.scheduled;
    },

    render() {
      const isAuto = this.state.mode === "auto";
      const scheduledLabel = Utils.capitalize(this.state.scheduled);
      const activeLabel = Utils.capitalize(this.state.active);
      const statusText = isAuto
        ? `Scheduled now: ${scheduledLabel}. Active: ${activeLabel}.`
        : `Scheduled now: ${scheduledLabel}. Active override: ${activeLabel}.`;

      Dom.nodes.scheduleIndicator.textContent = statusText;
      Dom.nodes.scheduleIndicator.dataset.mode = isAuto ? "auto" : "manual";
      Dom.nodes.themeToggleGroup.dataset.activeTheme = this.state.active;
      Dom.nodes.themeLight.setAttribute("aria-pressed", String(this.state.active === "light"));
      Dom.nodes.themeDark.setAttribute("aria-pressed", String(this.state.active === "dark"));
      Dom.nodes.themeLight.title = this.state.mode === "light" ? "Click again to return to scheduled mode" : "Activate light theme";
      Dom.nodes.themeDark.title = this.state.mode === "dark" ? "Click again to return to scheduled mode" : "Activate dark theme";
    },

    readPreference() {
      const saved = Storage.get(Config.storageKeys.theme);
      return this.isValidMode(saved) ? saved : "auto";
    },

    isValidMode(value) {
      return typeof value === "string" && Config.themeModes.includes(value);
    },
  };

  const Runtime = {
    init() {
      this.persistSnapshot()
        .then(() => {
          this.render();
        })
        .catch(() => {
          this.render();
        });
    },

    persistSnapshot() {
      return this.createSnapshot().then((snapshot) => {
        Storage.set(Config.storageKeys.runtime, JSON.stringify(snapshot));
      });
    },

    createSnapshot() {
      const connection = navigator.connection ?? navigator.mozConnection ?? navigator.webkitConnection ?? null;

      return this.readUserAgentData().then((userAgentData) => {
        return {
          capturedAt: new Date().toISOString(),
          platform: navigator.platform || "Unknown",
          userAgent: navigator.userAgent || "Unknown",
          browserLanguage: navigator.language || "Unknown",
          languages: Array.isArray(navigator.languages) ? navigator.languages.join(", ") : "Unknown",
          cookiesEnabled: typeof navigator.cookieEnabled === "boolean" ? String(navigator.cookieEnabled) : "Unknown",
          online: typeof navigator.onLine === "boolean" ? String(navigator.onLine) : "Unknown",
          hardwareConcurrency: Number.isFinite(navigator.hardwareConcurrency) ? String(navigator.hardwareConcurrency) : "Unknown",
          deviceMemory: Number.isFinite(navigator.deviceMemory) ? `${navigator.deviceMemory} GB` : "Unknown",
          vendor: navigator.vendor || "Unknown",
          screenResolution: window.screen ? `${window.screen.width}x${window.screen.height}` : "Unknown",
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Unknown",
          colorSchemePreference: window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
          connectionType: connection?.effectiveType ?? "Unknown",
          connectionDownlink: Number.isFinite(connection?.downlink) ? `${connection.downlink} Mb/s` : "Unknown",
          userAgentBrands: userAgentData.brands,
          userAgentMobile: userAgentData.mobile,
          userAgentPlatform: userAgentData.platform,
          userAgentArchitecture: userAgentData.architecture,
          userAgentBitness: userAgentData.bitness,
          userAgentVersion: userAgentData.version,
        };
      });
    },

    readUserAgentData() {
      const defaults = {
        brands: "Unavailable",
        mobile: "Unavailable",
        platform: "Unavailable",
        architecture: "Unavailable",
        bitness: "Unavailable",
        version: "Unavailable",
      };

      if (!("userAgentData" in navigator) || typeof navigator.userAgentData?.getHighEntropyValues !== "function") {
        return Promise.resolve(defaults);
      }

      return navigator.userAgentData
        .getHighEntropyValues(["architecture", "bitness", "platformVersion", "uaFullVersion"])
        .then((entropy) => {
          return {
            brands: Array.isArray(navigator.userAgentData.brands)
              ? navigator.userAgentData.brands.map(({ brand, version }) => `${brand} ${version}`).join(", ")
              : defaults.brands,
            mobile: String(Boolean(navigator.userAgentData.mobile)),
            platform: navigator.userAgentData.platform || defaults.platform,
            architecture: entropy.architecture || defaults.architecture,
            bitness: entropy.bitness || defaults.bitness,
            version: entropy.uaFullVersion || defaults.version,
          };
        })
        .catch(() => defaults);
    },

    render() {
      const rawSnapshot = Storage.get(Config.storageKeys.runtime);
      const snapshot = this.parseSnapshot(rawSnapshot);

      if (!snapshot) {
        Dom.nodes.runtimeGrid.innerHTML = `<p class="status-box" data-state="error">Runtime snapshot is unavailable.</p>`;
        return;
      }

      const markup = Object.entries(snapshot)
        .map(([key, value]) => {
          const label = Utils.humanizeKey(key);
          const content = Utils.escapeHtml(String(value ?? "Unknown"));

          return `
            <dl class="runtime-entry">
              <dt>${label}</dt>
              <dd>${content}</dd>
            </dl>
          `;
        })
        .join("");

      Dom.nodes.runtimeGrid.innerHTML = markup;
    },

    parseSnapshot(value) {
      if (typeof value !== "string" || value.length === 0) {
        return null;
      }

      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" ? parsed : null;
      } catch {
        return null;
      }
    },
  };

  const Comments = {
    init() {
      this.load();
    },

    load() {
      const variant = this.readVariant();
      const endpoint = `${Config.comments.endpoint}/${variant}/comments`;

      Dom.nodes.variantBadge.textContent = `Variant ${variant}`;
      Dom.setStatus(Dom.nodes.commentsStatus, "Loading comments...", "loading");

      fetch(endpoint, {
        headers: {
          Accept: "application/json",
        },
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Request failed with status ${response.status}`);
          }

          return response.json();
        })
        .then((payload) => {
          const comments = this.validatePayload(payload);
          this.render(comments);
          Dom.setStatus(Dom.nodes.commentsStatus, `Loaded ${comments.length} comments.`, "success");
        })
        .catch((error) => {
          Dom.nodes.commentList.innerHTML = "";
          Dom.setStatus(
            Dom.nodes.commentsStatus,
            `Could not load comments. ${error instanceof Error ? error.message : "Unknown error."}`,
            "error"
          );
        });
    },

    readVariant() {
      const params = new URLSearchParams(window.location.search);
      const rawVariant = params.get("variant");
      const parsedVariant = Number(rawVariant ?? Config.comments.defaultVariant);

      if (!Number.isInteger(parsedVariant) || parsedVariant < 1 || parsedVariant > 100) {
        return Config.comments.defaultVariant;
      }

      return parsedVariant;
    },

    validatePayload(payload) {
      if (!Array.isArray(payload)) {
        throw new Error("Comments payload is not an array.");
      }

      const comments = payload.filter((item) => {
        return (
          item &&
          typeof item === "object" &&
          Number.isInteger(item.id) &&
          typeof item.name === "string" &&
          typeof item.email === "string" &&
          typeof item.body === "string"
        );
      });

      if (comments.length === 0) {
        throw new Error("Comments payload is empty or malformed.");
      }

      return comments;
    },

    render(comments) {
      const markup = comments
        .map((comment) => {
          const title = Utils.escapeHtml(comment.name);
          const email = Utils.escapeHtml(comment.email);
          const body = Utils.escapeHtml(comment.body);

          return `
            <li class="comment-item">
              <h3>${title}</h3>
              <p class="comment-item__email">${email}</p>
              <p class="comment-item__body">${body}</p>
            </li>
          `;
        })
        .join("");

      Dom.nodes.commentList.innerHTML = markup;
    },
  };

  const Feedback = {
    state: {
      modalTimerId: 0,
      dialogOpenedAt: 0,
    },

    init() {
      this.configureForm();
      this.bindEvents();
      this.scheduleAutoOpen();
    },

    configureForm() {
      Dom.nodes.feedbackForm.setAttribute("action", Config.feedback.formspreeEndpoint);
      Dom.nodes.feedbackForm.setAttribute("accept-charset", "UTF-8");
      Dom.nodes.feedbackForm.setAttribute("data-form-ready", "true");
    },

    bindEvents() {
      Dom.nodes.feedbackClose.addEventListener("click", () => {
        this.closeDialog(true);
      });

      Dom.nodes.feedbackOpen.addEventListener("click", () => {
        this.openDialog();
      });

      Dom.nodes.feedbackLater.addEventListener("click", () => {
        this.closeDialog(true);
      });

      Dom.nodes.feedbackDialog.addEventListener("cancel", () => {
        this.rememberDismissal();
      });

      Dom.nodes.feedbackForm.addEventListener("submit", (event) => {
        this.handleSubmit(event);
      });

      this.getFields().forEach((field) => {
        field.addEventListener("input", () => {
          this.validateField(field);
        });
      });
    },

    scheduleAutoOpen() {
      if (this.isDismissed()) {
        return;
      }

      this.state.modalTimerId = window.setTimeout(() => {
        this.openDialog();
      }, Config.modalDelayMs);
    },

    openDialog() {
      this.state.dialogOpenedAt = Date.now();
      Dom.nodes.feedbackOpenedAt.value = new Date(this.state.dialogOpenedAt).toISOString();

      if (!Dom.nodes.feedbackDialog.open) {
        Dom.nodes.feedbackDialog.showModal();
      }
    },

    closeDialog(rememberDismissal) {
      if (rememberDismissal) {
        this.rememberDismissal();
      }

      if (Dom.nodes.feedbackDialog.open) {
        Dom.nodes.feedbackDialog.close();
      }
    },

    rememberDismissal() {
      Storage.set(Config.storageKeys.modalDismissed, "true");
    },

    isDismissed() {
      return Storage.get(Config.storageKeys.modalDismissed) === "true";
    },

    handleSubmit(event) {
      const fields = this.getFields();
      let isFormValid = true;

      fields.forEach((field) => {
        if (!this.validateField(field)) {
          isFormValid = false;
        }
      });

      if (!isFormValid) {
        event.preventDefault();
        Dom.setStatus(Dom.nodes.formStatus, "Please fix the validation errors before sending.", "error");
        Dom.nodes.feedbackForm.reportValidity();
        return;
      }

      if (this.isBotTrapTriggered()) {
        event.preventDefault();
        Dom.setStatus(Dom.nodes.formStatus, "Submission blocked by anti-spam protection.", "error");
        return;
      }

      const action = Dom.nodes.feedbackForm.getAttribute("action") ?? "";

      if (!this.hasConfiguredEndpoint(action)) {
        event.preventDefault();
        Dom.setStatus(
          Dom.nodes.formStatus,
          "Replace the Formspree placeholder endpoint in the form action before sending.",
          "error"
        );
        return;
      }

      Dom.setStatus(Dom.nodes.formStatus, "Sending message...", "success");
    },

    getFields() {
      return [
        Dom.nodes.nameInput,
        Dom.nodes.emailInput,
        Dom.nodes.phoneInput,
        Dom.nodes.messageInput,
      ];
    },

    isBotTrapTriggered() {
      const honeypotValue = Dom.nodes.feedbackCompany.value.trim();
      const openedAtValue = Dom.nodes.feedbackOpenedAt.value;
      const openedAtTime = Date.parse(openedAtValue);
      const elapsed = Number.isFinite(openedAtTime) ? Date.now() - openedAtTime : 0;

      if (honeypotValue.length > 0) {
        return true;
      }

      if (!Number.isFinite(openedAtTime) || elapsed < Config.feedback.minimumHumanDelayMs) {
        return true;
      }

      return false;
    },

    validateField(field) {
      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) {
        return false;
      }

      const value = field.value.trim();
      let message = "";

      switch (field.name) {
        case "name":
          if (value.length < 2) {
            message = "Name must contain at least 2 characters.";
          }
          break;
        case "email":
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            message = "Enter a valid email address.";
          }
          break;
        case "phone":
          if (!/^[+\d][\d\s().-]{6,}$/.test(value)) {
            message = "Enter a valid phone number.";
          }
          break;
        case "message":
          if (value.length < 10) {
            message = "Message must contain at least 10 characters.";
          }
          break;
        default:
          break;
      }

      field.setCustomValidity(message);
      return message.length === 0;
    },

    hasConfiguredEndpoint(action) {
      return (
        typeof action === "string" &&
        action === Config.feedback.formspreeEndpoint &&
        action.startsWith("https://formspree.io/f/") &&
        !action.endsWith(`/${Config.formspreePlaceholder}`) &&
        !action.endsWith(Config.formspreePlaceholder)
      );
    },
  };

  const App = {
    init() {
      Dom.init();
      Theme.init();
      Runtime.init();
      Comments.init();
      Feedback.init();
    },
  };

  App.init();
})();
