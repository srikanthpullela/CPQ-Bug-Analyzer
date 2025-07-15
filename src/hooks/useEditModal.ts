import { useState, useEffect } from "react";

export const useEditModal = (origin: string) => {
  const [editPayload, setEditPayload] = useState<any>(null);
  const [originalPayload, setOriginalPayload] = useState<any>(null);
  const [editMethod, setEditMethod] = useState("");
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [jsonValue, setJsonValue] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Update jsonValue when editPayload changes
  useEffect(() => {
    if (editPayload) {
      setJsonValue(JSON.stringify(editPayload, null, 2));
      setJsonError(null);
    }
  }, [editPayload]);

  const handleEditRequest = (payload: any, method: string) => {
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

    window.postMessage(
      {
        source: "HAR_EXTRACTOR",
        type: "HAR_RETRIGGER",
        url: origin ? `${origin}/apexremote` : "",
        payload: editPayload,
      },
      "*"
    );
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
