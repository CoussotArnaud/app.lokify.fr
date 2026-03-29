export const normalizeSiret = (value) => String(value || "").replace(/\D/g, "");

const isValidLuhn = (digits) => {
  let sum = 0;
  let shouldDouble = false;

  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);

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

export const isValidSiret = (value) => {
  const normalized = normalizeSiret(value);

  if (!/^\d{14}$/.test(normalized)) {
    return false;
  }

  return isValidLuhn(normalized);
};
