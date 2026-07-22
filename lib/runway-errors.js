export function isRunwayCapacityError(error) {
  const status = Number(error?.status ?? error?.statusCode ?? error?.response?.status ?? 0);
  const details = [
    error?.message,
    error?.code,
    error?.type,
    error?.error?.message,
    error?.error?.code,
  ].filter(Boolean).join(" ");
  return status === 429 || /\b429\b|too many requests|maximum daily|daily generations|generation limit|quota|you do not have enough credits|not enough credits|insufficient credits|credit balance/i.test(details);
}
