import { useState, useEffect } from "react";

// Declare chrome API for TypeScript
declare const chrome: any;

export const useEditModal = (origin: string) => {
  const [editPayload, setEditPayload] = useState<any>(null);
  const [originalPayload, setOriginalPayload] = useState<any>(null);
  const [editMethod, setEditMethod] = useState("");
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [jsonValue, setJsonValue] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [resendUrl, setResendUrl] = useState<string>("");

  // Update jsonValue when editPayload changes
  useEffect(() => {
    if (editPayload) {
      setJsonValue(JSON.stringify(editPayload, null, 2));
      setJsonError(null);
    }
  }, [editPayload]);

  const handleEditRequest = (payload: any, method: string) => {
    // Extract the URL from the payload if it has _resendUrl
    const url = payload?._resendUrl || (origin ? `${origin}/apexremote` : "");
    setResendUrl(url);
    setEditPayload(payload);
    setOriginalPayload(payload);
    setEditMethod(method);
    setEditModalOpen(true);
  };

  const handleJsonChange = (value: string) => {
    setJsonValue(value);
    try {
      const parsed = JSON.parse(value);
      setEditPayload(parsed);
      setJsonError(null);
    } catch (error) {
      setJsonError("Invalid JSON format");
    }
  };

  const resetToOriginal = () => {
    if (originalPayload) {
      const originalJson = JSON.stringify(originalPayload, null, 2);
      setJsonValue(originalJson);
      setEditPayload(originalPayload);
      setJsonError(null);
    }
  };

  const handleSendRequest = () => {
    if (jsonError) return;

    // Get current tab ID from chrome.devtools
    const currentTabId = (window as any).chrome?.devtools?.inspectedWindow?.tabId;

    const retriggerMessage = {
      source: "HAR_EXTRACTOR",
      type: "HAR_RETRIGGER",
      url: resendUrl,
      method: editPayload?._method || 'POST',
      payload: editPayload,
      tabId: currentTabId, // Include the tab ID in the message
    };
    
    console.log("[useEditModal] Sending HAR_RETRIGGER message for tab:", currentTabId, retriggerMessage);

    // Use chrome.runtime.sendMessage to communicate with devtools.ts
    if (chrome?.runtime?.sendMessage) {
      chrome.runtime.sendMessage(retriggerMessage);
    } else {
      console.error("[useEditModal] chrome.runtime.sendMessage not available");
    }
    
    setEditModalOpen(false);
  };

  return {
    editPayload,
    setEditPayload,
    editMethod,
    editModalOpen,
    setEditModalOpen,
    jsonValue,
    jsonError,
    handleEditRequest,
    handleJsonChange,
    resetToOriginal,
    handleSendRequest,
  };
};
