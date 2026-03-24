import React, { useState, useCallback, useMemo } from "react";

/**
 * Chrome DevTools–style JSON tree viewer with inline previews for collapsed nodes.
 * Collapsed objects show: {key1: "val", key2: 42, …}
 * Collapsed arrays show: [val1, val2, …]
 */

interface JsonTreeViewProps {
  src: any;
  name?: string | false;
  collapsed?: boolean | number;
  isDarkMode: boolean;
  indentWidth?: number;
}

interface Theme {
  key: string;
  string: string;
  number: string;
  boolean: string;
  null: string;
  bracket: string;
  preview: string;
  size: string;
  arrow: string;
  arrowHover: string;
}

const darkTheme: Theme = {
  key: "#60a5fa",
  string: "#34d399",
  number: "#fb923c",
  boolean: "#a78bfa",
  null: "#9ca3af",
  bracket: "#f3f4f6",
  preview: "#6b7280",
  size: "#6b7280",
  arrow: "#9ca3af",
  arrowHover: "#f3f4f6",
};

const lightTheme: Theme = {
  key: "#007bff",
  string: "#28a745",
  number: "#fd7e14",
  boolean: "#6f42c1",
  null: "#6c757d",
  bracket: "#212529",
  preview: "#6c757d",
  size: "#6c757d",
  arrow: "#495057",
  arrowHover: "#000",
};

const monoFont =
  "Menlo, Monaco, Consolas, 'SF Mono', 'Liberation Mono', monospace";

// Render a primitive value with color
function PrimitiveValue({
  value,
  theme,
}: {
  value: any;
  theme: Theme;
}) {
  if (value === null)
    return <span style={{ color: theme.null }}>null</span>;
  if (value === undefined)
    return <span style={{ color: theme.null }}>undefined</span>;
  if (typeof value === "string")
    return (
      <span style={{ color: theme.string }}>
        &quot;{value.length > 120 ? value.slice(0, 120) + "…" : value}&quot;
      </span>
    );
  if (typeof value === "number")
    return <span style={{ color: theme.number }}>{String(value)}</span>;
  if (typeof value === "boolean")
    return <span style={{ color: theme.boolean }}>{String(value)}</span>;
  return <span>{String(value)}</span>;
}

// Generate an inline preview string for a collapsed object/array
function InlinePreview({
  value,
  theme,
  maxItems,
}: {
  value: any;
  theme: Theme;
  maxItems?: number;
}) {
  const limit = maxItems ?? 3;

  if (Array.isArray(value)) {
    if (value.length === 0)
      return <span style={{ color: theme.preview }}>[]</span>;

    const items: React.ReactNode[] = [];
    const show = Math.min(value.length, limit);
    for (let i = 0; i < show; i++) {
      if (i > 0) items.push(<span key={`c${i}`} style={{ color: theme.preview }}>, </span>);
      items.push(<InlineValue key={i} value={value[i]} theme={theme} />);
    }
    if (value.length > limit)
      items.push(<span key="more" style={{ color: theme.preview }}>, …</span>);

    return (
      <span style={{ color: theme.preview }}>
        [<span>{items}</span>]
      </span>
    );
  }

  if (value && typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length === 0)
      return <span style={{ color: theme.preview }}>{"{}"}</span>;

    const items: React.ReactNode[] = [];
    const show = Math.min(keys.length, limit);
    for (let i = 0; i < show; i++) {
      if (i > 0) items.push(<span key={`c${i}`} style={{ color: theme.preview }}>, </span>);
      items.push(
        <span key={i}>
          <span style={{ color: theme.key }}>{keys[i]}</span>
          <span style={{ color: theme.preview }}>: </span>
          <InlineValue value={value[keys[i]]} theme={theme} />
        </span>
      );
    }
    if (keys.length > limit)
      items.push(<span key="more" style={{ color: theme.preview }}>, …</span>);

    return (
      <span style={{ color: theme.preview }}>
        {"{"}<span>{items}</span>{"}"}
      </span>
    );
  }

  return <PrimitiveValue value={value} theme={theme} />;
}

// Single inline value (truncated for nested objects)
function InlineValue({ value, theme }: { value: any; theme: Theme }) {
  if (value === null) return <span style={{ color: theme.null }}>null</span>;
  if (value === undefined) return <span style={{ color: theme.null }}>undefined</span>;
  if (typeof value === "string") {
    const display = value.length > 40 ? value.slice(0, 40) + "…" : value;
    return <span style={{ color: theme.string }}>&quot;{display}&quot;</span>;
  }
  if (typeof value === "number")
    return <span style={{ color: theme.number }}>{String(value)}</span>;
  if (typeof value === "boolean")
    return <span style={{ color: theme.boolean }}>{String(value)}</span>;
  if (Array.isArray(value)) {
    if (value.length === 0) return <span style={{ color: theme.preview }}>[]</span>;
    return <span style={{ color: theme.preview }}>Array({value.length})</span>;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length === 0) return <span style={{ color: theme.preview }}>{"{}"}</span>;
    return <span style={{ color: theme.preview }}>{"{…}"}</span>;
  }
  return <span>{String(value)}</span>;
}

// A single node in the tree
const JsonNode: React.FC<{
  keyName: string | number | null;
  value: any;
  theme: Theme;
  depth: number;
  indent: number;
  defaultCollapsed: boolean | number;
  isLast: boolean;
}> = ({ keyName, value, theme, depth, indent, defaultCollapsed, isLast }) => {
  const isExpandable =
    value !== null && typeof value === "object";

  const shouldStartCollapsed = useMemo(() => {
    if (typeof defaultCollapsed === "boolean") return defaultCollapsed;
    // number: collapse nodes deeper than this level
    return depth >= defaultCollapsed;
  }, [defaultCollapsed, depth]);

  const [collapsed, setCollapsed] = useState(shouldStartCollapsed);

  const toggle = useCallback(() => setCollapsed((c) => !c), []);

  const comma = isLast ? "" : ",";
  const paddingLeft = depth * indent;
  const isArray = Array.isArray(value);

  if (!isExpandable) {
    // Leaf node
    return (
      <div style={{ paddingLeft, fontFamily: monoFont, fontSize: "11px", lineHeight: "1.5" }}>
        <span style={{ display: "inline-block", width: 14 }} />
        {keyName !== null && (
          <>
            <span style={{ color: theme.key }}>
              {typeof keyName === "number" ? keyName : `"${keyName}"`}
            </span>
            <span style={{ color: theme.preview }}>: </span>
          </>
        )}
        <PrimitiveValue value={value} theme={theme} />
        <span style={{ color: theme.preview }}>{comma}</span>
      </div>
    );
  }

  const entries = isArray ? value : Object.entries(value);
  const count = isArray ? value.length : Object.keys(value).length;
  const openBracket = isArray ? "[" : "{";
  const closeBracket = isArray ? "]" : "}";

  return (
    <div>
      {/* Header line with toggle arrow */}
      <div
        style={{ paddingLeft, fontFamily: monoFont, fontSize: "11px", lineHeight: "1.5", cursor: "pointer" }}
        onClick={toggle}
      >
        <span
          style={{
            display: "inline-block",
            width: 14,
            textAlign: "center",
            color: theme.arrow,
            fontSize: "9px",
            userSelect: "none",
            transition: "transform 0.1s",
            transform: collapsed ? "rotate(0deg)" : "rotate(90deg)",
          }}
        >
          ▶
        </span>
        {keyName !== null && (
          <>
            <span style={{ color: theme.key }}>
              {typeof keyName === "number" ? keyName : `"${keyName}"`}
            </span>
            <span style={{ color: theme.preview }}>: </span>
          </>
        )}
        {collapsed ? (
          <>
            <span style={{ color: theme.bracket }}>{openBracket}</span>
            <span style={{ marginLeft: 4, marginRight: 4 }}>
              <InlinePreview value={value} theme={theme} maxItems={3} />
            </span>
            {/* Show item count */}
            <span style={{ color: theme.size, fontSize: "10px", marginLeft: 2 }}>
              {count} {count === 1 ? "item" : "items"}
            </span>
            <span style={{ color: theme.preview }}>{comma}</span>
          </>
        ) : (
          <span style={{ color: theme.bracket }}>{openBracket}</span>
        )}
      </div>

      {/* Children (shown when expanded) */}
      {!collapsed && (
        <>
          {isArray
            ? value.map((item: any, idx: number) => (
                <JsonNode
                  key={idx}
                  keyName={idx}
                  value={item}
                  theme={theme}
                  depth={depth + 1}
                  indent={indent}
                  defaultCollapsed={defaultCollapsed}
                  isLast={idx === value.length - 1}
                />
              ))
            : Object.entries(value).map(([k, v], idx, arr) => (
                <JsonNode
                  key={k}
                  keyName={k}
                  value={v}
                  theme={theme}
                  depth={depth + 1}
                  indent={indent}
                  defaultCollapsed={defaultCollapsed}
                  isLast={idx === arr.length - 1}
                />
              ))}
          <div style={{ paddingLeft, fontFamily: monoFont, fontSize: "11px", lineHeight: "1.5" }}>
            <span style={{ display: "inline-block", width: 14 }} />
            <span style={{ color: theme.bracket }}>{closeBracket}</span>
            <span style={{ color: theme.preview }}>{comma}</span>
          </div>
        </>
      )}
    </div>
  );
};

const JsonTreeView: React.FC<JsonTreeViewProps> = ({
  src,
  name = false,
  collapsed = 2,
  isDarkMode,
  indentWidth = 14,
}) => {
  const theme = isDarkMode ? darkTheme : lightTheme;

  // Wrap primitive root values
  const rootValue = useMemo(() => {
    if (src === null || src === undefined || typeof src !== "object") {
      return { value: src };
    }
    return src;
  }, [src]);

  const isArray = Array.isArray(rootValue);
  const entries = isArray ? rootValue : Object.entries(rootValue);
  const openBracket = isArray ? "[" : "{";
  const closeBracket = isArray ? "]" : "}";

  // Determine if root itself should be collapsed
  const rootCollapsed = useMemo(() => {
    if (typeof collapsed === "boolean") return collapsed;
    return 0 >= collapsed; // depth 0 vs threshold
  }, [collapsed]);

  const [isRootCollapsed, setIsRootCollapsed] = useState(rootCollapsed);

  const count = isArray ? rootValue.length : Object.keys(rootValue).length;

  return (
    <div
      style={{
        fontFamily: monoFont,
        fontSize: "11px",
        lineHeight: "1.5",
        backgroundColor: "transparent",
        padding: 0,
        overflow: "visible",
      }}
    >
      {/* Root line */}
      <div
        style={{ cursor: "pointer" }}
        onClick={() => setIsRootCollapsed((c) => !c)}
      >
        <span
          style={{
            display: "inline-block",
            width: 14,
            textAlign: "center",
            color: theme.arrow,
            fontSize: "9px",
            userSelect: "none",
            transition: "transform 0.1s",
            transform: isRootCollapsed ? "rotate(0deg)" : "rotate(90deg)",
          }}
        >
          ▶
        </span>
        {name !== false && name !== undefined && (
          <>
            <span style={{ color: theme.key }}>{name}</span>
            <span style={{ color: theme.preview }}>: </span>
          </>
        )}
        {isRootCollapsed ? (
          <>
            <span style={{ color: theme.bracket }}>{openBracket}</span>
            <span style={{ marginLeft: 4, marginRight: 4 }}>
              <InlinePreview value={rootValue} theme={theme} maxItems={3} />
            </span>
            <span style={{ color: theme.size, fontSize: "10px", marginLeft: 2 }}>
              {count} {count === 1 ? "item" : "items"}
            </span>
          </>
        ) : (
          <span style={{ color: theme.bracket }}>{openBracket}</span>
        )}
      </div>

      {/* Children */}
      {!isRootCollapsed && (
        <>
          {isArray
            ? rootValue.map((item: any, idx: number) => (
                <JsonNode
                  key={idx}
                  keyName={idx}
                  value={item}
                  theme={theme}
                  depth={1}
                  indent={indentWidth}
                  defaultCollapsed={collapsed}
                  isLast={idx === rootValue.length - 1}
                />
              ))
            : Object.entries(rootValue).map(([k, v], idx, arr) => (
                <JsonNode
                  key={k}
                  keyName={k}
                  value={v}
                  theme={theme}
                  depth={1}
                  indent={indentWidth}
                  defaultCollapsed={collapsed}
                  isLast={idx === arr.length - 1}
                />
              ))}
          <div style={{ fontFamily: monoFont, fontSize: "11px", lineHeight: "1.5" }}>
            <span style={{ display: "inline-block", width: 14 }} />
            <span style={{ color: theme.bracket }}>{closeBracket}</span>
          </div>
        </>
      )}
    </div>
  );
};

export default JsonTreeView;
