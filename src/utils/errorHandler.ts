export function hasHttpPageMessages(contentText: string): boolean {
  try {
    const parsed = JSON.parse(contentText);
    const pageErrors = parsed?.pageErrors;
    if (!pageErrors || typeof pageErrors !== "object") return false;

    return (
      (pageErrors.errorMessages?.length ?? 0) > 0 ||
      (pageErrors.warningMessages?.length ?? 0) > 0 ||
      (pageErrors.infoMessages?.length ?? 0) > 0 ||
      (pageErrors.successMessages?.length ?? 0) > 0
    );
  } catch {
    return false;
  }
}

export function hasWsErrorDetails(payload: any): boolean {
  try {
    const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
    return (
      parsed?.PayLoad?.ErrorDetails &&
      Object.keys(parsed.PayLoad.ErrorDetails).length > 0
    );
  } catch {
    return false;
  }
}
