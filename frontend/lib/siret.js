export const normalizeSiret = (value) => String(value || "").replace(/\D/g, "");

export const isValidSiret = (value) => {
  const normalized = normalizeSiret(value);

  if (!/^\d{14}$/.test(normalized)) {
    return false;
  }

  let sum = 0;
  let shouldDouble = false;

  for (let index = normalized.length - 1; index >= 0; index -= 1) {
    let digit = Number(normalized[index]);

    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
};
