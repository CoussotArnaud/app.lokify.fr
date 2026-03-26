const BRAND_LOGO_SRC = "/assets/logos/logo.png?v=20260324";

export default function BrandLogo({
  alt = "Lokify Logo",
  className = "",
}) {
  return (
    <img
      src={BRAND_LOGO_SRC}
      alt={alt}
      className={`main-logo ${className}`.trim()}
    />
  );
}
