/** Mock service providers (mobile operators, ISPs, utilities). Real ones plug into a billing aggregator. */
export const SERVICE_PROVIDERS: Record<"MOBILE" | "INTERNET" | "UTILITIES" | "QR", string[]> = {
  MOBILE: ["Ucell", "Beeline", "Mobiuz", "Uzmobile", "Humans"],
  INTERNET: ["Uztelecom", "Turon Telecom", "Sarkor Telecom", "Comnet"],
  UTILITIES: ["Elektr energiya", "Tabiiy gaz", "Sovuq suv", "Issiqlik", "Chiqindi"],
  QR: ["QR"],
};
