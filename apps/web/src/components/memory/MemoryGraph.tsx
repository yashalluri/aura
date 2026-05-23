"use client";

// The /you 3D memory-graph client component.
//
// Uses react-three-fiber for a force-directed 3D scene. Nodes coloured by
// kind, sized by importance + recency. Click any node to open the side
// panel with provenance + edit/delete.

import { useMemo, useRef, useState, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Text, Line } from "@react-three/drei";
import * as THREE from "three";
import { forceSimulation, forceLink, forceManyBody, forceCenter } from "d3-force-3d";
import { NodePanel, type GraphNode } from "./NodePanel";

interface Entity {
  id: string;
  kind: string;
  canonical: string;
  aliases: string[];
}
interface Memory {
  id: string;
  kind: string;
  content: string;
  importance: number;
  confidence: number;
  source: string;
  createdAt: string;
  lastRecalledAt: string | null;
}

interface Props {
  userId: string;
  initialEntities: Entity[];
  initialMemories: Memory[];
}

// Colour per node kind. Picks are slightly desaturated so the glow is the
// emphasis layer, not the hue.
const COLOR: Record<string, string> = {
  person: "#a78bfa",      // purple — your people
  place: "#5eead4",       // teal — places
  project: "#fbbf24",     // amber — projects
  topic: "#f472b6",       // pink — topics
  habit: "#34d399",       // green — habits
  media: "#60a5fa",       // blue — media
  org: "#94a3b8",         // grey — orgs
  // memory kinds:
  fact: "#e5e7eb",
  preference: "#fcd34d",
  event: "#fb923c",
  relationship: "#c084fc",
  goal: "#22d3ee",
  value: "#f9a8d4",
  pattern: "#a3e635",
};

interface SimNode {
  id: string;
  kind: string;
  label: string;
  size: number;
  color: string;
  raw: GraphNode;
  // d3-force-3d will mutate these
  x?: number;
  y?: number;
  z?: number;
  fx?: number;
  fy?: number;
  fz?: number;
}
interface SimLink {
  source: string;
  target: string;
}

function buildGraph(entities: Entity[], memories: Memory[]): { nodes: SimNode[]; links: SimLink[] } {
  const nodes: SimNode[] = [];
  const links: SimLink[] = [];

  for (const e of entities) {
    nodes.push({
      id: `e:${e.id}`,
      kind: e.kind,
      label: e.canonical,
      size: e.kind === "person" ? 0.65 : 0.45,
      color: COLOR[e.kind] ?? "#9ca3af",
      raw: {
        kind: "entity",
        entityKind: e.kind,
        id: e.id,
        title: e.canonical,
        subtitle: e.aliases.length ? `aka ${e.aliases.slice(0, 3).join(", ")}` : "",
      },
    });
  }

  for (const m of memories) {
    // Importance fades to opacity-ish via size; recency boosts brightness later.
    const size = 0.18 + Math.min(0.35, m.importance * 0.4);
    nodes.push({
      id: `m:${m.id}`,
      kind: m.kind,
      label: m.content.length > 32 ? m.content.slice(0, 32) + "…" : m.content,
      size,
      color: COLOR[m.kind] ?? "#9ca3af",
      raw: {
        kind: "memory",
        memoryKind: m.kind,
        id: m.id,
        title: m.content,
        subtitle: `importance ${(m.importance * 100).toFixed(0)}% · ${m.kind} · ${m.source}`,
        importance: m.importance,
        createdAt: m.createdAt,
      },
    });

    // Best-effort: link memory to any entity whose canonical/alias appears
    // in the content. Cheap substring match; the embedding-grounded link
    // model is Phase-5+ polish.
    const contentLower = m.content.toLowerCase();
    for (const e of entities) {
      const aliasHit = [e.canonical, ...e.aliases].some((a) =>
        contentLower.includes(a.toLowerCase()),
      );
      if (aliasHit) {
        links.push({ source: `m:${m.id}`, target: `e:${e.id}` });
        break;
      }
    }
  }

  return { nodes, links };
}

interface SimulationState {
  nodes: SimNode[];
  links: SimLink[];
}

function useForceSimulation(nodes: SimNode[], links: SimLink[]): SimulationState {
  const stateRef = useRef<SimulationState>({ nodes, links });

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const linkForce = (forceLink(links) as any)
      .id((d: { id?: string }) => d.id ?? "")
      .distance(2)
      .strength(0.3);
    const sim = forceSimulation(nodes, 3)
      .force("charge", forceManyBody().strength(-1.5))
      .force("link", linkForce)
      .force("center", forceCenter(0, 0, 0))
      .stop();

    for (let i = 0; i < 200; i++) sim.tick();
    stateRef.current = { nodes, links };
  }, [nodes, links]);

  return stateRef.current;
}

function Node({
  node,
  onClick,
  selected,
}: {
  node: SimNode;
  onClick: () => void;
  selected: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const pos = useMemo<[number, number, number]>(
    () => [node.x ?? 0, node.y ?? 0, node.z ?? 0],
    [node.x, node.y, node.z],
  );

  useFrame(({ clock }) => {
    if (meshRef.current && selected) {
      const pulse = 1 + 0.08 * Math.sin(clock.elapsedTime * 3);
      meshRef.current.scale.setScalar(pulse);
    } else if (meshRef.current) {
      meshRef.current.scale.setScalar(1);
    }
  });

  return (
    <group position={pos}>
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "default";
        }}
      >
        <sphereGeometry args={[node.size, 16, 16]} />
        <meshStandardMaterial
          color={node.color}
          emissive={node.color}
          emissiveIntensity={selected ? 0.8 : 0.3}
          roughness={0.4}
        />
      </mesh>
      <Text
        position={[0, node.size + 0.2, 0]}
        fontSize={0.18}
        color={selected ? "#ffffff" : "#cbd5e1"}
        anchorX="center"
        anchorY="middle"
        outlineColor="#0f172a"
        outlineWidth={0.01}
      >
        {node.label}
      </Text>
    </group>
  );
}

function Edge({ a, b }: { a: SimNode; b: SimNode }) {
  // Use Drei's <Line>: handles buffer init on first render (avoids the
  // "buffer has no position attribute" crash that bare <bufferGeometry>
  // can hit).
  return (
    <Line
      points={[
        [a.x ?? 0, a.y ?? 0, a.z ?? 0],
        [b.x ?? 0, b.y ?? 0, b.z ?? 0],
      ]}
      color="#475569"
      lineWidth={1}
      transparent
      opacity={0.4}
    />
  );
}

export function MemoryGraph({ userId, initialEntities, initialMemories }: Props) {
  const [memories, setMemories] = useState(initialMemories);
  const [selected, setSelected] = useState<GraphNode | null>(null);

  const { nodes, links } = useMemo(
    () => buildGraph(initialEntities, memories),
    [initialEntities, memories],
  );
  useForceSimulation(nodes, links);

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  async function handleDelete(memoryId: string) {
    const res = await fetch(`/api/settings/memories/${memoryId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setMemories((prev) => prev.filter((m) => m.id !== memoryId));
      setSelected(null);
    }
  }

  if (nodes.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-white/50">
        <div className="text-center">
          <p className="text-2xl mb-2">your mind, currently empty</p>
          <p className="text-sm">text aura something memorable to seed the graph</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Canvas
        camera={{ position: [0, 0, 18], fov: 55 }}
        gl={{ antialias: true, alpha: false }}
        style={{ background: "#0a0a0f" }}
      >
        <ambientLight intensity={0.4} />
        <pointLight position={[10, 10, 10]} intensity={0.6} />
        <pointLight position={[-10, -10, -10]} intensity={0.3} color="#a78bfa" />

        {links.map((l, i) => {
          const a = byId.get(l.source as string);
          const b = byId.get(l.target as string);
          if (!a || !b) return null;
          return <Edge key={i} a={a} b={b} />;
        })}

        {nodes.map((n) => (
          <Node
            key={n.id}
            node={n}
            selected={selected?.id === n.raw.id}
            onClick={() => setSelected(n.raw)}
          />
        ))}

        <OrbitControls
          enablePan
          enableZoom
          enableRotate
          rotateSpeed={0.6}
          zoomSpeed={0.8}
        />
      </Canvas>

      <div className="absolute top-4 left-4 text-white/80 text-xs uppercase tracking-widest pointer-events-none">
        <div>your aura · /you</div>
        <div className="text-white/40 mt-0.5">
          {nodes.length} nodes · {links.length} edges · drag to rotate · scroll to zoom
        </div>
      </div>

      <NodePanel node={selected} onClose={() => setSelected(null)} onDelete={handleDelete} />
    </>
  );
}
