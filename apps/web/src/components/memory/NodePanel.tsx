"use client";

// Side panel that opens when a graph node is clicked. Shows everything
// Aura knows + lets the user forget a memory.

export interface GraphNode {
  kind: "entity" | "memory";
  id: string;
  title: string;
  subtitle: string;
  entityKind?: string;
  memoryKind?: string;
  importance?: number;
  createdAt?: string;
}

interface Props {
  node: GraphNode | null;
  onClose: () => void;
  onDelete: (memoryId: string) => Promise<void>;
}

export function NodePanel({ node, onClose, onDelete }: Props) {
  if (!node) return null;

  return (
    <aside className="absolute top-0 right-0 h-full w-full max-w-md bg-black/80 backdrop-blur-md border-l border-white/10 p-6 overflow-y-auto z-20">
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white/40 hover:text-white/80 text-2xl leading-none"
      >
        ×
      </button>

      <div className="mt-6">
        <div className="text-xs uppercase tracking-widest text-white/40 mb-1">
          {node.kind === "entity" ? node.entityKind : node.memoryKind}
        </div>
        <h2 className="text-2xl text-white mb-2 break-words">{node.title}</h2>
        {node.subtitle && (
          <p className="text-sm text-white/60 mb-6 break-words">{node.subtitle}</p>
        )}

        {node.kind === "memory" && typeof node.importance === "number" && (
          <div className="mb-4">
            <div className="text-xs uppercase tracking-widest text-white/40 mb-1">
              importance
            </div>
            <div className="w-full bg-white/10 rounded-full h-2">
              <div
                className="bg-aura-purple h-2 rounded-full transition-all"
                style={{ width: `${node.importance * 100}%` }}
              />
            </div>
          </div>
        )}

        {node.createdAt && (
          <div className="mb-6">
            <div className="text-xs uppercase tracking-widest text-white/40 mb-1">
              learned
            </div>
            <div className="text-sm text-white/70">
              {new Date(node.createdAt).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </div>
          </div>
        )}

        {node.kind === "memory" && (
          <button
            onClick={() => {
              if (confirm("aura will forget this. you can't undo it (yet).")) {
                void onDelete(node.id);
              }
            }}
            className="mt-4 w-full bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 text-sm py-2 rounded-lg transition-colors"
          >
            forget this
          </button>
        )}
      </div>
    </aside>
  );
}
