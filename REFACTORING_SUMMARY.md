# HarMethodsTabPage Component Refactoring

## Overview
The original `HarMethodsTabPage.tsx` component was over 1000 lines long and contained multiple responsibilities. This refactoring breaks it down into smaller, more manageable and testable components.

## Latest Updates

### ✨ **Added Resizable Panels (NEW)**
- **Drag to Resize**: Users can now drag the divider between tables and detail panel
- **Smart Constraints**: Prevents panels from becoming too small (25% min) or too large (75% max)
- **Persistent Sizing**: User's preferred panel size is saved to localStorage
- **Visual Feedback**: Hover effects and dragging indicators
- **Keyboard Shortcuts**: 
  - `Ctrl+Shift+[` - Expand left panel
  - `Ctrl+Shift+]` - Expand right panel  
  - `Ctrl+Shift+\` - Reset to default (60/40 split)
- **Dark Mode Support**: Resizer adapts to current theme

## New Structure

### 1. Custom Hooks
- **`useRules.ts`** - Handles all rule-related state and logic
- **`useEditModal.ts`** - Manages edit modal state and JSON editing functionality

### 2. UI Components
- **`HeaderSection.tsx`** - Top header with controls, search, and stats
- **`NetworkTables.tsx`** - HTTP and WebSocket tables display
- **`EditModal.tsx`** - Modal for editing and re-triggering requests
- **`RuleModal.tsx`** - Modal for creating and editing rules
- **`MatchesModal.tsx`** - Modal for displaying rule matches
- **`ResizablePanels.tsx`** - Draggable panel resizer with persistence

### 3. Main Component
- **`HarMethodsTabPage.tsx`** - Now ~350 lines, orchestrates the other components

## Benefits

### 1. **Better Separation of Concerns**
- Each component has a single responsibility
- Logic is separated from UI presentation
- Custom hooks isolate complex state management

### 2. **Improved Testability**
- Smaller components are easier to unit test
- Custom hooks can be tested independently
- Mock props can be easily provided to components

### 3. **Enhanced Maintainability**
- Changes to specific features only affect relevant files
- Code is more readable and organized
- Easier to debug specific sections

### 4. **Reusability**
- Components can be reused in other parts of the application
- Custom hooks can be shared across components
- Modular design allows for easy feature additions

### 5. **Better Developer Experience**
- Smaller files are easier to navigate
- IDE performance improvements
- Reduced cognitive load when working on specific features

## Component Responsibilities

### HeaderSection
- Dark mode toggle
- Network activity stats
- Action buttons (reload, clear, rules, etc.)
- Search functionality
- WebSocket connection status

### NetworkTables
- HTTP requests table
- WebSocket messages table
- Empty state display
- Row selection and filtering

### EditModal
- JSON payload editing
- Request re-triggering
- Validation and error handling
- Reset functionality

### RuleModal
- Rule condition management
- Method name filtering
- Rule saving

### ResizablePanels
- Drag-to-resize functionality
- Width constraints and validation
- localStorage persistence
- Keyboard shortcuts
- Visual feedback and animations
- Dark/light theme adaptation

### useRules Hook
- Rule state management
- Rule evaluation logic
- Match counting and notification

### useEditModal Hook
- Edit modal state
- JSON parsing and validation
- Request payload management

## File Structure
```
src/
├── pages/
│   ├── HarMethodsTabPage.tsx (main component)
│   └── components/
│       ├── HeaderSection.tsx
│       ├── NetworkTables.tsx
│       ├── EditModal.tsx
│       ├── RuleModal.tsx
│       └── MatchesModal.tsx
└── hooks/
    ├── useRules.ts
    └── useEditModal.ts
```

## Testing Strategy
Now that the component is broken down, you can:

1. **Unit test individual components** with specific props
2. **Test custom hooks** independently with `@testing-library/react-hooks`
3. **Integration test** the main component with mocked child components
4. **Test specific user flows** by focusing on relevant components

## Migration Notes
- All existing functionality is preserved
- Props and callbacks are properly typed with TypeScript
- Dark mode support is maintained across all components
- No breaking changes to the parent component interface
