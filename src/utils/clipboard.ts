// src/utils/clipboard.ts

export async function safeCopyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    console.warn("Clipboard.writeText failed, falling back to execCommand", e);

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "absolute";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
    } catch (fallbackError) {
      console.error("execCommand fallback also failed:", fallbackError);
    }
    document.body.removeChild(textarea);
  }
}
