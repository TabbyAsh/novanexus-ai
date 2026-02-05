/**
 * NOVA NEXUS STATE LATTICE
 * =========================
 * Time-indexed world state graph - the grounding layer that makes
 * abstract concepts concrete through typed nodes and relationships.
 * 
 * AXIOM 1: Everything Must Ground
 * - Every node resolves to data, logic, artifact, action, output, or value
 * - Floating concepts are automatically expired
 * 
 * AXIOM 4: Memory Is Sacred
 * - Nothing is overwritten - all states are versioned
 * - Everything is replayable
 */

import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// NODE TYPES - What exists in the world state
// ============================================================================

export enum NodeType {
  // Market Reality
  MARKET = 'MARKET',
  ASSET = 'ASSET',
  PRICE = 'PRICE',
  VOLUME = 'VOLUME',
  
  // Attention & Social
  ATTENTION = 'ATTENTION',
  SENTIMENT = 'SENTIMENT',
  NARRATIVE = 'NARRATIVE',
  
  // Risk & Regime
  RISK = 'RISK',
  REGIME = 'REGIME',
  VOLATILITY = 'VOLATILITY',
  
  // Structural
  CORRELATION = 'CORRELATION',
  LIQUIDITY = 'LIQUIDITY',
  MOMENTUM = 'MOMENTUM',
  
  // Decision Artifacts
  SIGNAL = 'SIGNAL',
  DECISION = 'DECISION',
  POSITION = 'POSITION',
  
  // System State
  CONSTRAINT = 'CONSTRAINT',
  CAPABILITY = 'CAPABILITY',
  EVENT = 'EVENT',
}

export interface LatticeNode {
  id: string;
  type: NodeType;
  
  /** Human-readable label */
  label: string;
  
  /** The actual data this node represents */
  data: unknown;
  
  /** Confidence in this node's accuracy (0-1) */
  confidence: number;
  
  /** Time-decay parameters */
  decay: {
    /** Half-life in milliseconds */
    halfLife: number;
    /** When decay started */
    decayStart: number;
    /** Minimum confidence floor */
    floor: number;
  };
  
  /** When this node was created */
  createdAt: number;
  
  /** When this node was last updated */
  updatedAt: number;
  
  /** Source of this node (data feed, calculation, user, etc.) */
  source: string;
  
  /** Tags for filtering/grouping */
  tags: string[];
  
  /** Is this node still valid? */
  active: boolean;
  
  /** Why was this node deactivated? */
  deactivationReason?: string;
  
  /** Version for tracking changes */
  version: number;
  
  /** Previous version ID for history traversal */
  previousVersionId?: string;
}

// ============================================================================
// EDGE TYPES - How nodes relate
// ============================================================================

export enum EdgeType {
  // Temporal relationships
  TEMPORAL = 'TEMPORAL',           // A happened before B
  LEADS = 'LEADS',                 // A leads B (predictive)
  LAGS = 'LAGS',                   // A lags B
  
  // Causal relationships
  CAUSES = 'CAUSES',               // A causes B
  INFLUENCES = 'INFLUENCES',       // A influences B (softer than causes)
  DEPENDS_ON = 'DEPENDS_ON',       // A depends on B
  
  // Structural relationships
  CORRELATES = 'CORRELATES',       // A correlates with B
  ANTI_CORRELATES = 'ANTI_CORRELATES', // A inversely correlates with B
  CONTAINS = 'CONTAINS',           // A contains B (hierarchical)
  BELONGS_TO = 'BELONGS_TO',       // A belongs to B
  
  // Signal relationships
  SUPPORTS = 'SUPPORTS',           // A supports signal B
  CONTRADICTS = 'CONTRADICTS',     // A contradicts signal B
  TRIGGERS = 'TRIGGERS',           // A triggers B
  INVALIDATES = 'INVALIDATES',     // A invalidates B
}

export interface LatticeEdge {
  id: string;
  type: EdgeType;
  
  /** Source node ID */
  fromNodeId: string;
  
  /** Target node ID */
  toNodeId: string;
  
  /** Strength of relationship (0-1) */
  weight: number;
  
  /** Confidence in this relationship (0-1) */
  confidence: number;
  
  /** Time lag in milliseconds (for temporal edges) */
  lag?: number;
  
  /** Decay parameters */
  decay: {
    halfLife: number;
    decayStart: number;
    floor: number;
  };
  
  /** Evidence supporting this edge */
  evidence: {
    observationCount: number;
    lastObserved: number;
    strengthHistory: Array<{ timestamp: number; value: number }>;
  };
  
  createdAt: number;
  updatedAt: number;
  active: boolean;
}

// ============================================================================
// STATE SNAPSHOT - Point-in-time world state
// ============================================================================

export interface StateSnapshot {
  id: string;
  timestamp: number;
  
  /** Node IDs active at this snapshot */
  activeNodes: string[];
  
  /** Edge IDs active at this snapshot */
  activeEdges: string[];
  
  /** Regime classification at this moment */
  regime: string;
  
  /** Overall confidence in world state */
  confidence: number;
  
  /** Key metrics summary */
  metrics: {
    totalNodes: number;
    totalEdges: number;
    avgNodeConfidence: number;
    avgEdgeConfidence: number;
    decayedNodes: number;
  };
  
  /** Trigger for snapshot (scheduled, event, manual) */
  trigger: 'scheduled' | 'event' | 'manual' | 'decision';
  
  /** Optional decision ID this snapshot is tied to */
  decisionId?: string;
}

// ============================================================================
// QUERY TYPES
// ============================================================================

export interface LatticeQuery {
  /** Filter by node types */
  nodeTypes?: NodeType[];
  
  /** Filter by edge types */
  edgeTypes?: EdgeType[];
  
  /** Minimum confidence threshold */
  minConfidence?: number;
  
  /** Time range */
  timeRange?: {
    start: number;
    end: number;
  };
  
  /** Tags to include */
  tags?: string[];
  
  /** Maximum depth for graph traversal */
  maxDepth?: number;
  
  /** Starting node IDs for traversal */
  startNodes?: string[];
}

export interface LatticeQueryResult {
  nodes: LatticeNode[];
  edges: LatticeEdge[];
  
  /** Confidence-weighted summary */
  summary: {
    avgConfidence: number;
    dominantRegime?: string;
    keySignals: string[];
  };
}

// ============================================================================
// STATE LATTICE ENGINE
// ============================================================================

export class StateLattice {
  private nodes: Map<string, LatticeNode> = new Map();
  private edges: Map<string, LatticeEdge> = new Map();
  private snapshots: Map<string, StateSnapshot> = new Map();
  
  /** Index: nodeId -> edge IDs (outgoing) */
  private outgoingEdges: Map<string, Set<string>> = new Map();
  
  /** Index: nodeId -> edge IDs (incoming) */
  private incomingEdges: Map<string, Set<string>> = new Map();
  
  /** Index: NodeType -> node IDs */
  private nodesByType: Map<NodeType, Set<string>> = new Map();
  
  private lastSnapshotTime: number = 0;
  private snapshotInterval: number = 60000; // 1 minute default

  constructor() {
    // Initialize type indexes
    for (const type of Object.values(NodeType)) {
      this.nodesByType.set(type as NodeType, new Set());
    }
  }

  // ==========================================================================
  // NODE OPERATIONS
  // ==========================================================================

  /**
   * Add a new node to the lattice
   */
  addNode(
    type: NodeType,
    label: string,
    data: unknown,
    options: {
      confidence?: number;
      halfLife?: number;
      source?: string;
      tags?: string[];
    } = {}
  ): LatticeNode {
    const node: LatticeNode = {
      id: uuidv4(),
      type,
      label,
      data,
      confidence: options.confidence ?? 0.8,
      decay: {
        halfLife: options.halfLife ?? 3600000, // 1 hour default
        decayStart: Date.now(),
        floor: 0.1,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      source: options.source ?? 'system',
      tags: options.tags ?? [],
      active: true,
      version: 1,
    };

    this.nodes.set(node.id, node);
    this.nodesByType.get(type)?.add(node.id);
    this.outgoingEdges.set(node.id, new Set());
    this.incomingEdges.set(node.id, new Set());

    return node;
  }

  /**
   * Update an existing node (creates new version)
   */
  updateNode(
    nodeId: string,
    updates: Partial<Pick<LatticeNode, 'data' | 'confidence' | 'tags'>>
  ): LatticeNode | null {
    const existing = this.nodes.get(nodeId);
    if (!existing || !existing.active) return null;

    // Create new version
    const updated: LatticeNode = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
      version: existing.version + 1,
      previousVersionId: existing.id,
      decay: {
        ...existing.decay,
        decayStart: Date.now(), // Reset decay on update
      },
    };

    // Generate new ID for versioned node
    updated.id = uuidv4();
    
    // Deactivate old node
    existing.active = false;
    existing.deactivationReason = 'superseded';

    // Add new node
    this.nodes.set(updated.id, updated);
    this.nodesByType.get(updated.type)?.add(updated.id);
    this.nodesByType.get(existing.type)?.delete(existing.id);
    
    // Transfer edge connections
    this.transferEdges(existing.id, updated.id);

    return updated;
  }

  /**
   * Deactivate a node
   */
  deactivateNode(nodeId: string, reason: string): boolean {
    const node = this.nodes.get(nodeId);
    if (!node) return false;

    node.active = false;
    node.deactivationReason = reason;
    node.updatedAt = Date.now();

    // Deactivate connected edges
    const outgoing = this.outgoingEdges.get(nodeId);
    const incoming = this.incomingEdges.get(nodeId);
    
    outgoing?.forEach(edgeId => {
      const edge = this.edges.get(edgeId);
      if (edge) edge.active = false;
    });
    
    incoming?.forEach(edgeId => {
      const edge = this.edges.get(edgeId);
      if (edge) edge.active = false;
    });

    return true;
  }

  /**
   * Get a node by ID
   */
  getNode(nodeId: string): LatticeNode | undefined {
    return this.nodes.get(nodeId);
  }

  /**
   * Get nodes by type
   */
  getNodesByType(type: NodeType, activeOnly = true): LatticeNode[] {
    const ids = this.nodesByType.get(type) ?? new Set();
    return Array.from(ids)
      .map(id => this.nodes.get(id)!)
      .filter(n => n && (!activeOnly || n.active));
  }

  // ==========================================================================
  // EDGE OPERATIONS
  // ==========================================================================

  /**
   * Add an edge between nodes
   */
  addEdge(
    type: EdgeType,
    fromNodeId: string,
    toNodeId: string,
    options: {
      weight?: number;
      confidence?: number;
      lag?: number;
      halfLife?: number;
    } = {}
  ): LatticeEdge | null {
    // Verify nodes exist
    const fromNode = this.nodes.get(fromNodeId);
    const toNode = this.nodes.get(toNodeId);
    if (!fromNode || !toNode) return null;

    const edge: LatticeEdge = {
      id: uuidv4(),
      type,
      fromNodeId,
      toNodeId,
      weight: options.weight ?? 0.5,
      confidence: options.confidence ?? 0.7,
      lag: options.lag,
      decay: {
        halfLife: options.halfLife ?? 7200000, // 2 hours default
        decayStart: Date.now(),
        floor: 0.05,
      },
      evidence: {
        observationCount: 1,
        lastObserved: Date.now(),
        strengthHistory: [{ timestamp: Date.now(), value: options.weight ?? 0.5 }],
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      active: true,
    };

    this.edges.set(edge.id, edge);
    this.outgoingEdges.get(fromNodeId)?.add(edge.id);
    this.incomingEdges.get(toNodeId)?.add(edge.id);

    return edge;
  }

  /**
   * Strengthen an edge (observed relationship again)
   */
  strengthenEdge(edgeId: string, observedStrength: number): LatticeEdge | null {
    const edge = this.edges.get(edgeId);
    if (!edge || !edge.active) return null;

    // Bayesian update of weight
    const oldWeight = edge.weight;
    const newWeight = (oldWeight * edge.evidence.observationCount + observedStrength) / 
                      (edge.evidence.observationCount + 1);

    edge.weight = newWeight;
    edge.confidence = Math.min(1, edge.confidence + 0.05); // Increase confidence
    edge.evidence.observationCount++;
    edge.evidence.lastObserved = Date.now();
    edge.evidence.strengthHistory.push({ timestamp: Date.now(), value: observedStrength });
    edge.decay.decayStart = Date.now(); // Reset decay
    edge.updatedAt = Date.now();

    // Keep history bounded
    if (edge.evidence.strengthHistory.length > 100) {
      edge.evidence.strengthHistory = edge.evidence.strengthHistory.slice(-100);
    }

    return edge;
  }

  /**
   * Get edges from a node
   */
  getOutgoingEdges(nodeId: string, activeOnly = true): LatticeEdge[] {
    const ids = this.outgoingEdges.get(nodeId) ?? new Set();
    return Array.from(ids)
      .map(id => this.edges.get(id)!)
      .filter(e => e && (!activeOnly || e.active));
  }

  /**
   * Get edges to a node
   */
  getIncomingEdges(nodeId: string, activeOnly = true): LatticeEdge[] {
    const ids = this.incomingEdges.get(nodeId) ?? new Set();
    return Array.from(ids)
      .map(id => this.edges.get(id)!)
      .filter(e => e && (!activeOnly || e.active));
  }

  // ==========================================================================
  // GRAPH TRAVERSAL
  // ==========================================================================

  /**
   * Find all nodes connected to a starting node within depth
   */
  traverse(
    startNodeId: string,
    maxDepth: number = 3,
    edgeTypes?: EdgeType[]
  ): { nodes: LatticeNode[]; edges: LatticeEdge[] } {
    const visitedNodes = new Set<string>();
    const visitedEdges = new Set<string>();
    const resultNodes: LatticeNode[] = [];
    const resultEdges: LatticeEdge[] = [];

    const queue: Array<{ nodeId: string; depth: number }> = [
      { nodeId: startNodeId, depth: 0 }
    ];

    while (queue.length > 0) {
      const { nodeId, depth } = queue.shift()!;
      
      if (visitedNodes.has(nodeId) || depth > maxDepth) continue;
      visitedNodes.add(nodeId);

      const node = this.nodes.get(nodeId);
      if (!node || !node.active) continue;
      
      resultNodes.push(node);

      // Get connected edges
      const outgoing = this.getOutgoingEdges(nodeId);
      const incoming = this.getIncomingEdges(nodeId);
      
      for (const edge of [...outgoing, ...incoming]) {
        if (visitedEdges.has(edge.id)) continue;
        if (edgeTypes && !edgeTypes.includes(edge.type)) continue;
        
        visitedEdges.add(edge.id);
        resultEdges.push(edge);

        // Queue connected node
        const nextNodeId = edge.fromNodeId === nodeId ? edge.toNodeId : edge.fromNodeId;
        if (!visitedNodes.has(nextNodeId)) {
          queue.push({ nodeId: nextNodeId, depth: depth + 1 });
        }
      }
    }

    return { nodes: resultNodes, edges: resultEdges };
  }

  /**
   * Find causal ancestors of a node
   */
  findCausalAncestors(nodeId: string, maxDepth: number = 5): LatticeNode[] {
    const causalTypes = [EdgeType.CAUSES, EdgeType.INFLUENCES, EdgeType.TRIGGERS];
    const visited = new Set<string>();
    const ancestors: LatticeNode[] = [];

    const search = (currentId: string, depth: number) => {
      if (depth > maxDepth || visited.has(currentId)) return;
      visited.add(currentId);

      const incoming = this.getIncomingEdges(currentId)
        .filter(e => causalTypes.includes(e.type));

      for (const edge of incoming) {
        const ancestorNode = this.nodes.get(edge.fromNodeId);
        if (ancestorNode && ancestorNode.active) {
          ancestors.push(ancestorNode);
          search(edge.fromNodeId, depth + 1);
        }
      }
    };

    search(nodeId, 0);
    return ancestors;
  }

  /**
   * Find supporting/contradicting signals for a node
   */
  findSignalContext(nodeId: string): {
    supporting: LatticeNode[];
    contradicting: LatticeNode[];
    confidence: number;
  } {
    const supporting: LatticeNode[] = [];
    const contradicting: LatticeNode[] = [];

    const incoming = this.getIncomingEdges(nodeId);
    
    for (const edge of incoming) {
      const sourceNode = this.nodes.get(edge.fromNodeId);
      if (!sourceNode || !sourceNode.active) continue;

      if (edge.type === EdgeType.SUPPORTS) {
        supporting.push(sourceNode);
      } else if (edge.type === EdgeType.CONTRADICTS) {
        contradicting.push(sourceNode);
      }
    }

    // Calculate net confidence
    const supportWeight = supporting.reduce((sum, n) => sum + n.confidence, 0);
    const contradictWeight = contradicting.reduce((sum, n) => sum + n.confidence, 0);
    const total = supportWeight + contradictWeight;
    const confidence = total > 0 ? (supportWeight - contradictWeight * 0.5) / total : 0.5;

    return { supporting, contradicting, confidence: Math.max(0, Math.min(1, confidence)) };
  }

  // ==========================================================================
  // QUERY ENGINE
  // ==========================================================================

  /**
   * Query the lattice with filters
   */
  query(q: LatticeQuery): LatticeQueryResult {
    let nodes = Array.from(this.nodes.values()).filter(n => n.active);
    let edges = Array.from(this.edges.values()).filter(e => e.active);

    // Apply node type filter
    if (q.nodeTypes && q.nodeTypes.length > 0) {
      nodes = nodes.filter(n => q.nodeTypes!.includes(n.type));
    }

    // Apply edge type filter
    if (q.edgeTypes && q.edgeTypes.length > 0) {
      edges = edges.filter(e => q.edgeTypes!.includes(e.type));
    }

    // Apply confidence filter
    if (q.minConfidence !== undefined) {
      const minConf = q.minConfidence;
      nodes = nodes.filter(n => this.getCurrentConfidence(n) >= minConf);
      edges = edges.filter(e => this.getEdgeCurrentConfidence(e) >= minConf);
    }

    // Apply time range filter
    if (q.timeRange) {
      const { start, end } = q.timeRange;
      nodes = nodes.filter(n => n.createdAt >= start && n.createdAt <= end);
      edges = edges.filter(e => e.createdAt >= start && e.createdAt <= end);
    }

    // Apply tag filter
    if (q.tags && q.tags.length > 0) {
      nodes = nodes.filter(n => q.tags!.some(t => n.tags.includes(t)));
    }

    // If starting nodes specified, do traversal
    if (q.startNodes && q.startNodes.length > 0) {
      const traversalResults = q.startNodes.map(id => 
        this.traverse(id, q.maxDepth ?? 3, q.edgeTypes)
      );
      
      const traversedNodeIds = new Set(traversalResults.flatMap(r => r.nodes.map(n => n.id)));
      const traversedEdgeIds = new Set(traversalResults.flatMap(r => r.edges.map(e => e.id)));
      
      nodes = nodes.filter(n => traversedNodeIds.has(n.id));
      edges = edges.filter(e => traversedEdgeIds.has(e.id));
    }

    // Filter edges to only include those connecting returned nodes
    const nodeIds = new Set(nodes.map(n => n.id));
    edges = edges.filter(e => nodeIds.has(e.fromNodeId) && nodeIds.has(e.toNodeId));

    // Build summary
    const avgConfidence = nodes.length > 0 
      ? nodes.reduce((sum, n) => sum + this.getCurrentConfidence(n), 0) / nodes.length 
      : 0;

    const regimeNodes = nodes.filter(n => n.type === NodeType.REGIME);
    const dominantRegime = regimeNodes.length > 0
      ? regimeNodes.sort((a, b) => b.confidence - a.confidence)[0].label
      : undefined;

    const signalNodes = nodes.filter(n => n.type === NodeType.SIGNAL);
    const keySignals = signalNodes
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5)
      .map(n => n.label);

    return {
      nodes,
      edges,
      summary: {
        avgConfidence,
        dominantRegime,
        keySignals,
      },
    };
  }

  // ==========================================================================
  // DECAY & CONFIDENCE
  // ==========================================================================

  /**
   * Get current confidence with decay applied
   */
  getCurrentConfidence(node: LatticeNode): number {
    const elapsed = Date.now() - node.decay.decayStart;
    const halfLives = elapsed / node.decay.halfLife;
    const decayed = node.confidence * Math.pow(0.5, halfLives);
    return Math.max(node.decay.floor, decayed);
  }

  /**
   * Get current edge confidence with decay
   */
  getEdgeCurrentConfidence(edge: LatticeEdge): number {
    const elapsed = Date.now() - edge.decay.decayStart;
    const halfLives = elapsed / edge.decay.halfLife;
    const decayed = edge.confidence * Math.pow(0.5, halfLives);
    return Math.max(edge.decay.floor, decayed);
  }

  /**
   * Apply decay to all nodes and edges, deactivating those below threshold
   */
  applyDecay(deactivationThreshold: number = 0.1): {
    deactivatedNodes: number;
    deactivatedEdges: number;
  } {
    let deactivatedNodes = 0;
    let deactivatedEdges = 0;

    for (const node of this.nodes.values()) {
      if (!node.active) continue;
      
      const currentConfidence = this.getCurrentConfidence(node);
      if (currentConfidence < deactivationThreshold) {
        node.active = false;
        node.deactivationReason = 'decayed';
        deactivatedNodes++;
      }
    }

    for (const edge of this.edges.values()) {
      if (!edge.active) continue;
      
      const currentConfidence = this.getEdgeCurrentConfidence(edge);
      if (currentConfidence < deactivationThreshold) {
        edge.active = false;
        deactivatedEdges++;
      }
    }

    return { deactivatedNodes, deactivatedEdges };
  }

  // ==========================================================================
  // SNAPSHOTS
  // ==========================================================================

  /**
   * Create a state snapshot
   */
  createSnapshot(
    trigger: StateSnapshot['trigger'],
    decisionId?: string
  ): StateSnapshot {
    const activeNodes = Array.from(this.nodes.values())
      .filter(n => n.active)
      .map(n => n.id);
    
    const activeEdges = Array.from(this.edges.values())
      .filter(e => e.active)
      .map(e => e.id);

    const nodeConfidences = activeNodes
      .map(id => this.getCurrentConfidence(this.nodes.get(id)!));
    
    const edgeConfidences = activeEdges
      .map(id => this.getEdgeCurrentConfidence(this.edges.get(id)!));

    const avgNodeConfidence = nodeConfidences.length > 0
      ? nodeConfidences.reduce((a, b) => a + b, 0) / nodeConfidences.length
      : 0;
    
    const avgEdgeConfidence = edgeConfidences.length > 0
      ? edgeConfidences.reduce((a, b) => a + b, 0) / edgeConfidences.length
      : 0;

    // Find current regime
    const regimeNodes = this.getNodesByType(NodeType.REGIME);
    const currentRegime = regimeNodes.length > 0
      ? regimeNodes.sort((a, b) => this.getCurrentConfidence(b) - this.getCurrentConfidence(a))[0].label
      : 'unknown';

    const snapshot: StateSnapshot = {
      id: uuidv4(),
      timestamp: Date.now(),
      activeNodes,
      activeEdges,
      regime: currentRegime,
      confidence: avgNodeConfidence,
      metrics: {
        totalNodes: activeNodes.length,
        totalEdges: activeEdges.length,
        avgNodeConfidence,
        avgEdgeConfidence,
        decayedNodes: Array.from(this.nodes.values()).filter(n => !n.active && n.deactivationReason === 'decayed').length,
      },
      trigger,
      decisionId,
    };

    this.snapshots.set(snapshot.id, snapshot);
    this.lastSnapshotTime = Date.now();

    // Keep only last 1000 snapshots
    const snapshotList = Array.from(this.snapshots.values())
      .sort((a, b) => b.timestamp - a.timestamp);
    
    if (snapshotList.length > 1000) {
      for (let i = 1000; i < snapshotList.length; i++) {
        this.snapshots.delete(snapshotList[i].id);
      }
    }

    return snapshot;
  }

  /**
   * Get snapshot by ID
   */
  getSnapshot(snapshotId: string): StateSnapshot | undefined {
    return this.snapshots.get(snapshotId);
  }

  /**
   * Get snapshots in time range
   */
  getSnapshotsInRange(start: number, end: number): StateSnapshot[] {
    return Array.from(this.snapshots.values())
      .filter(s => s.timestamp >= start && s.timestamp <= end)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  // ==========================================================================
  // UTILITY
  // ==========================================================================

  /**
   * Transfer edges from old node to new node
   */
  private transferEdges(oldNodeId: string, newNodeId: string): void {
    // Initialize edge sets for new node if needed
    if (!this.outgoingEdges.has(newNodeId)) {
      this.outgoingEdges.set(newNodeId, new Set());
    }
    if (!this.incomingEdges.has(newNodeId)) {
      this.incomingEdges.set(newNodeId, new Set());
    }

    // Transfer outgoing edges
    const outgoing = this.outgoingEdges.get(oldNodeId);
    if (outgoing) {
      for (const edgeId of outgoing) {
        const edge = this.edges.get(edgeId);
        if (edge && edge.active) {
          edge.fromNodeId = newNodeId;
          this.outgoingEdges.get(newNodeId)?.add(edgeId);
        }
      }
    }

    // Transfer incoming edges
    const incoming = this.incomingEdges.get(oldNodeId);
    if (incoming) {
      for (const edgeId of incoming) {
        const edge = this.edges.get(edgeId);
        if (edge && edge.active) {
          edge.toNodeId = newNodeId;
          this.incomingEdges.get(newNodeId)?.add(edgeId);
        }
      }
    }
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Get lattice statistics
   */
  getStats(): {
    totalNodes: number;
    activeNodes: number;
    totalEdges: number;
    activeEdges: number;
    nodesByType: Record<NodeType, number>;
    snapshotCount: number;
    lastSnapshot: number;
    avgActiveConfidence: number;
  } {
    const allNodes = Array.from(this.nodes.values());
    const activeNodes = allNodes.filter(n => n.active);
    const allEdges = Array.from(this.edges.values());
    const activeEdges = allEdges.filter(e => e.active);

    const nodesByType: Record<NodeType, number> = {} as Record<NodeType, number>;
    for (const type of Object.values(NodeType)) {
      nodesByType[type as NodeType] = this.getNodesByType(type as NodeType).length;
    }

    const avgActiveConfidence = activeNodes.length > 0
      ? activeNodes.reduce((sum, n) => sum + this.getCurrentConfidence(n), 0) / activeNodes.length
      : 0;

    return {
      totalNodes: allNodes.length,
      activeNodes: activeNodes.length,
      totalEdges: allEdges.length,
      activeEdges: activeEdges.length,
      nodesByType,
      snapshotCount: this.snapshots.size,
      lastSnapshot: this.lastSnapshotTime,
      avgActiveConfidence,
    };
  }

  /**
   * Get current world state summary
   */
  getWorldState(): {
    regime: string;
    confidence: number;
    activeSignals: number;
    topSignals: Array<{ label: string; confidence: number }>;
    riskLevel: number;
  } {
    const regimeNodes = this.getNodesByType(NodeType.REGIME);
    const regime = regimeNodes.length > 0
      ? regimeNodes.sort((a, b) => this.getCurrentConfidence(b) - this.getCurrentConfidence(a))[0].label
      : 'unknown';

    const signalNodes = this.getNodesByType(NodeType.SIGNAL);
    const topSignals = signalNodes
      .map(n => ({ label: n.label, confidence: this.getCurrentConfidence(n) }))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5);

    const riskNodes = this.getNodesByType(NodeType.RISK);
    const riskLevel = riskNodes.length > 0
      ? riskNodes.reduce((sum, n) => sum + this.getCurrentConfidence(n) * (n.data as number || 0.5), 0) / riskNodes.length
      : 0.5;

    const activeNodes = Array.from(this.nodes.values()).filter(n => n.active);
    const avgConfidence = activeNodes.length > 0
      ? activeNodes.reduce((sum, n) => sum + this.getCurrentConfidence(n), 0) / activeNodes.length
      : 0;

    return {
      regime,
      confidence: avgConfidence,
      activeSignals: signalNodes.length,
      topSignals,
      riskLevel,
    };
  }
}

export default StateLattice;
