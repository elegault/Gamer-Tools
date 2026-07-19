import type { JSX } from 'react'
import { useEditorStore } from '../store/editorStore'

type CursorPosition = {
  x: number
  y: number
} | null

function formatCoordinate(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export function HistoryToolbar({ cursorPosition }: { cursorPosition: CursorPosition }): JSX.Element {
  const canUndo = useEditorStore((state) => state.undoStack.length > 0)
  const canRedo = useEditorStore((state) => state.redoStack.length > 0)
  const undo = useEditorStore((state) => state.undo)
  const redo = useEditorStore((state) => state.redo)

  return (
    <div className="history-toolbar" aria-label="Edit history controls">
      <div className="history-toolbar-readout" aria-live="polite">
        <span>Cursor X</span>
        <strong>{cursorPosition ? formatCoordinate(cursorPosition.x) : '—'}</strong>
        <span>Cursor Y</span>
        <strong>{cursorPosition ? formatCoordinate(cursorPosition.y) : '—'}</strong>
      </div>
      <button type="button" className="fit-button history-button" onClick={undo} disabled={!canUndo}>
        Undo
      </button>
      <button type="button" className="fit-button history-button" onClick={redo} disabled={!canRedo}>
        Redo
      </button>
    </div>
  )
}
