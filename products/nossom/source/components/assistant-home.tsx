'use client';
import Assistant from './assistant';
import type { Operation } from '@/lib/presets';
export default function AssistantHome({
  onUpload,
  onDrop,
  fileName,
  disabled,
  context,
  onPlan,
}: {
  onOpen?: () => void;
  onUpload: () => void;
  onDrop: (file: File) => void;
  fileName?: string;
  disabled: boolean;
  context?: Record<string, number | null>;
  onPlan: (operation: Operation, intensity?: number, eq?: string) => void;
}) {
  return (
    <section
      className="assistant-home assistant-start"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && !disabled) onDrop(file);
      }}
    >
      <Assistant
        embedded
        onUpload={onUpload}
        fileName={fileName}
        disabled={disabled}
        context={context}
        onPlan={onPlan}
      />
    </section>
  );
}
