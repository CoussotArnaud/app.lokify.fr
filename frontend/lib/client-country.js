const LEGACY_COUNTRY_VALUE_PREFIX = "__legacy_country__:";

export const DEFAULT_CLIENT_COUNTRY = "France";
export const DEFAULT_CLIENT_COUNTRY_CODE = "+33";

export const clientCountryOptions = [
  { label: "France", code: "+33" },
  { label: "Belgique", code: "+32" },
  { label: "Suisse", code: "+41" },
  { label: "Espagne", code: "+34" },
  { label: "Portugal", code: "+351" },
  { label: "Allemagne", code: "+49" },
  { label: "Italie", code: "+39" },
  { label: "Royaume-Uni", code: "+44" },
  { label: "Luxembourg", code: "+352" },
  { label: "Pays-Bas", code: "+31" },
  { label: "Autriche", code: "+43" },
  { label: "Irlande", code: "+353" },
  { label: "Monaco", code: "+377" },
  { label: "Andorre", code: "+376" },
  { label: "Canada", code: "+1" },
  { label: "Etats-Unis", code: "+1" },
  { label: "Maroc", code: "+212" },
  { label: "Algerie", code: "+213" },
  { label: "Tunisie", code: "+216" },
];

const countryByLabel = new Map();
const countryByCode = new Map();

clientCountryOptions.forEach((option) => {
  countryByLabel.set(option.label, option);

  if (!countryByCode.has(option.code)) {
    countryByCode.set(option.code, option);
  }
});
const countryCodesByLength = [...countryByCode.keys()].sort((left, right) => right.length - left.length);

const normalizeWhitespace = (value) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

const escapeForRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const normalizeCountryCode = (value) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits ? `+${digits}` : "";
};

export const getCountryOptionByName = (value) => countryByLabel.get(normalizeWhitespace(value)) || null;

export const getCountryOptionByCode = (value) => countryByCode.get(normalizeCountryCode(value)) || null;

const splitPhoneWithKnownCountryCode = (value) => {
  const phone = normalizeWhitespace(value);

  if (!phone) {
    return { country_code: "", phone_number: "" };
  }

  for (const code of countryCodesByLength) {
    const escapedCode = escapeForRegExp(code);
    const digitsCode = code.replace(/\D/g, "");
    const explicitMatch = phone.match(new RegExp(`^${escapedCode}(?:[\\s./-]+)?(.*)$`));

    if (explicitMatch) {
      return {
        country_code: code,
        phone_number: normalizeWhitespace(explicitMatch[1]),
      };
    }

    const delimitedMatch = phone.match(new RegExp(`^${digitsCode}(?:[\\s./-]+)(.*)$`));

    if (delimitedMatch) {
      return {
        country_code: code,
        phone_number: normalizeWhitespace(delimitedMatch[1]),
      };
    }
  }

  const genericMatch = phone.match(/^(\+\d{1,4})(?=[\s./-]|$)(?:[\s./-]+)?(.*)$/);

  if (genericMatch) {
    return {
      country_code: normalizeCountryCode(genericMatch[1]),
      phone_number: normalizeWhitespace(genericMatch[2]),
    };
  }

  return {
    country_code: "",
    phone_number: phone,
  };
};

export const resolveClientPhoneFields = ({ country, country_code, phone } = {}) => {
  const normalizedPhone = normalizeWhitespace(phone);
  const normalizedCode = normalizeCountryCode(country_code);
  const parsedPhone = splitPhoneWithKnownCountryCode(normalizedPhone);
  const resolvedCountry =
    getCountryOptionByName(country) ||
    getCountryOptionByCode(normalizedCode) ||
    getCountryOptionByCode(parsedPhone.country_code);

  return {
    country: resolvedCountry?.label || "",
    country_code: resolvedCountry?.code || normalizedCode || parsedPhone.country_code || DEFAULT_CLIENT_COUNTRY_CODE,
    phone_number: parsedPhone.country_code ? parsedPhone.phone_number : normalizedPhone,
  };
};

export const formatClientPhone = (countryCode, phoneNumber) => {
  const normalizedPhone = normalizeWhitespace(phoneNumber);

  if (!normalizedPhone) {
    return "";
  }

  return [normalizeCountryCode(countryCode), normalizedPhone].filter(Boolean).join(" ").trim();
};

export const getCountrySelectValue = (country, countryCode) => {
  const resolvedCountry = getCountryOptionByName(country) || getCountryOptionByCode(countryCode);

  if (resolvedCountry) {
    return resolvedCountry.label;
  }

  const normalizedCode = normalizeCountryCode(countryCode);
  return normalizedCode ? `${LEGACY_COUNTRY_VALUE_PREFIX}${normalizedCode}` : "";
};

export const getCountrySelectOptions = (countryCode) => {
  const normalizedCode = normalizeCountryCode(countryCode);

  if (!normalizedCode || getCountryOptionByCode(normalizedCode)) {
    return clientCountryOptions.map((option) => ({
      ...option,
      value: option.label,
    }));
  }

  return [
    {
      label: `Autre pays (${normalizedCode})`,
      value: `${LEGACY_COUNTRY_VALUE_PREFIX}${normalizedCode}`,
      code: normalizedCode,
      isLegacy: true,
    },
    ...clientCountryOptions.map((option) => ({
      ...option,
      value: option.label,
    })),
  ];
};

export const isLegacyCountryValue = (value) => String(value || "").startsWith(LEGACY_COUNTRY_VALUE_PREFIX);
