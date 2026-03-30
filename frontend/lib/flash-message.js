const FLASH_MESSAGE_KEY = "lokify:flash-message";

const normalizeFlashMessage = (value) => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const type = value.type === "error" ? "error" : "success";
  const message = String(value.message || "").trim();

  if (!message) {
    return null;
  }

  return { type, message };
};

export const setFlashMessage = (value) => {
  if (typeof window === "undefined") {
    return;
  }

  const payload = normalizeFlashMessage(value);
  if (!payload) {
    return;
  }

  window.sessionStorage.setItem(FLASH_MESSAGE_KEY, JSON.stringify(payload));
};

export const consumeFlashMessage = () => {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.sessionStorage.getItem(FLASH_MESSAGE_KEY);
  if (!rawValue) {
    return null;
  }

  window.sessionStorage.removeItem(FLASH_MESSAGE_KEY);

  try {
    return normalizeFlashMessage(JSON.parse(rawValue));
  } catch (_error) {
    return null;
  }
};
