import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force'
import PartyBadge from '../components/PartyBadge'
import { TopBarPortal } from '../lib/topbar'

// ── Types ─────────────────────────────────────────────────────────────────────

interface GraphNode {
  id: string; name: string
  type: 'donor' | 'committee' | 'candidate'
  party: string | null
  amount: number; state?: string; city?: string
  sharedCount?: number
  influenceScore?: number
  isDefector?: boolean; defectorFrom?: string; defectorTo?: string
  office?: string  // for candidates: H, S, P
  cycle?: number
  x?: number; y?: number; vx?: number; vy?: number
  fx?: number | null; fy?: number | null; index?: number
}
interface GraphLink {
  source: string | GraphNode; target: string | GraphNode
  amount: number; linkType?: 'donation' | 'candidate_link' | 'family'
  index?: number
}
interface CommitteeOption {
  committee_id: string; name: string; party: string | null
  state: string | null; committee_type_full: string | null
  source?: string
}
interface CommitteeStat { id: string; name: string; party: string | null; total: number; donors: number }
interface Defector { contributor_name: string; contributor_state: string; cycle_from: number; party_from: string; cycle_to: number; party_to: string }
interface Influencer { contributor_name: string; contributor_state: string; party: string; unique_committees: number; influence_score: number; dem_total: number; rep_total: number }
interface EmployerCluster { employer: string; committee_id?: string; committee_name?: string; party?: string; total_amount?: number; donor_count?: number; total?: number; donors?: number; committees?: number }
interface Snapshot { id: number; name: string; description: string; node_count: number; link_count: number; created_at: string }

// ── Constants ─────────────────────────────────────────────────────────────────

const PARTY_COLOR: Record<string, string> = { DEM: '#60a5fa', REP: '#ef4444', SPLIT: '#a78bfa' }
const CANDIDATE_COLOR: Record<string, string> = { DEM: '#93c5fd', REP: '#fca5a5', default: '#fde68a' }
const partyColor = (p: string | null) => PARTY_COLOR[p ?? ''] ?? '#444'
const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const VERA_TIPS = [
  { title: "Candidate Nodes", body: "Gold stars (★) are candidates linked to committees. Expand any committee diamond to reveal its candidate. Click a star to search the candidate's name." },
  { title: "Defectors Panel", body: "Open the INTEL tab → Defectors to see donors who switched party between 2020 and 2024. These are the most strategically interesting people in the database." },
  { title: "Influence Rankings", body: "INTEL → Influence shows the highest-value donors by network reach — donors who give to the most unique committees carry the most systemic influence." },
  { title: "Employer Clusters", body: "INTEL → Employers shows which companies fund which PACs most heavily. Search any employer name to see its pre-indexed PAC relationships instantly." },
  { title: "Graph Snapshots", body: "Hit SAVE GRAPH to bookmark the current network state. Snapshots are stored and restored with all nodes, links, and filters intact." },
  { title: "Committee Family", body: "Related committees (same treasurer) are shown with dotted white lines. These PAC families often coordinate spending across multiple entities." },
  { title: "Timeline / Cycle", body: "Use the CYCLE selector to switch between 2018, 2020, 2022, and 2024 election cycles. Compare how the network changed across cycles." },
  { title: "Zoom & Pan", body: "Scroll to zoom, drag to pan. Zoom out to see full network structure. Dense clusters indicate connected donor circles or PAC families." },
]

// ── Canvas helpers ────────────────────────────────────────────────────────────

const nodeRadius = (n: GraphNode) => {
  if (n.type === 'candidate') return 9
  if (n.type === 'committee') {
    if (n.amount > 0) return Math.min(24, Math.max(10, Math.log10(n.amount) * 4.5))
    return 11
  }
  const base = n.amount > 50000 ? 11 : n.amount > 10000 ? 8 : n.amount > 1000 ? 6 : 5
  const boost = Math.min(4, (n.influenceScore ?? 0) * 1.5)
  return base + boost
}

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  const spikes = 5; const inner = r * 0.42
  ctx.beginPath()
  for (let i = 0; i < spikes * 2; i++) {
    const radius = i % 2 === 0 ? r : inner
    const angle = (Math.PI / spikes) * i - Math.PI / 2
    if (i === 0) ctx.moveTo(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle))
    else ctx.lineTo(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle))
  }
  ctx.closePath()
}

// ── Committee stat helper ─────────────────────────────────────────────────────

function computeCommitteeStats(nodes: GraphNode[], links: GraphLink[]): CommitteeStat[] {
  const map = new Map<string, { name: string; party: string | null; total: number; donors: Set<string> }>()
  for (const n of nodes) {
    if (n.type === 'committee') map.set(n.id, { name: n.name, party: n.party, total: 0, donors: new Set() })
  }
  for (const l of links) {
    const tid = typeof l.target === 'string' ? l.target : (l.target as GraphNode).id
    const sid = typeof l.source === 'string' ? l.source : (l.source as GraphNode).id
    const e = map.get(tid)
    if (e && l.linkType !== 'candidate_link' && l.linkType !== 'family') {
      e.total += l.amount; e.donors.add(sid)
    }
  }
  return Array.from(map.entries())
    .map(([id, v]) => ({ id, name: v.name, party: v.party, total: v.total, donors: v.donors.size }))
    .filter(c => c.donors > 0).sort((a, b) => b.total - a.total)
}

// ── Main component ────────────────────────────────────────────────────────────

export default function NetworkGraphPage() {
  const navigate = useNavigate()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const nodesRef = useRef<GraphNode[]>([])
  const linksRef = useRef<GraphLink[]>([])
  const allNodesRef = useRef<GraphNode[]>([])
  const allLinksRef = useRef<GraphLink[]>([])
  const expandedRef = useRef<Set<string>>(new Set())
  const minAmountRef = useRef(0)
  const sharedOnlyRef = useRef(false)
  const transformRef = useRef({ x: 0, y: 0, scale: 1 })
  const hoveredRef = useRef<GraphNode | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const simRef = useRef<any>(null)
  const isDragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 })

  // UI state
  const [controlsOpen, setControlsOpen] = useState(false)
  const [veraOpen, setVeraOpen] = useState(false)
  const [veraTipIdx, setVeraTipIdx] = useState(0)
  const [mode, setMode] = useState<'search' | 'compare'>('search')
  const [intelTab, setIntelTab] = useState<'defectors' | 'influence' | 'employers' | 'snapshots'>('defectors')
  const [showIntel, setShowIntel] = useState(false)
  const [dims, setDims] = useState({ w: 800, h: 600 })
  const [stats, setStats] = useState<{ donors: number; committees: number; links: number; shared: number } | null>(null)
  const [committeeSidebar, setCommitteeSidebar] = useState<CommitteeStat[]>([])
  const [tooltip, setTooltip] = useState<{ node: GraphNode; x: number; y: number } | null>(null)
  const [form, setForm] = useState({ employer: '', zip: '', radius: '25' })
  const [minAmountInput, setMinAmountInput] = useState('')
  const [sharedOnly, setSharedOnly] = useState(false)
  const [loading, setLoading] = useState(false)
  const [expanding, setExpanding] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedCycle, setSelectedCycle] = useState(2024)

  // Compare mode
  const [committeeSearch, setCommitteeSearch] = useState('')
  const [committeeResults, setCommitteeResults] = useState<CommitteeOption[]>([])
  const [selectedCommittees, setSelectedCommittees] = useState<CommitteeOption[]>([])
  const [searchingCommittees, setSearchingCommittees] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)

  // Intel panel data
  const [defectors, setDefectors] = useState<Defector[]>([])
  const [influencers, setInfluencers] = useState<Influencer[]>([])
  const [employerQuery, setEmployerQuery] = useState('')
  const [employerClusters, setEmployerClusters] = useState<EmployerCluster[]>([])
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [snapshotName, setSnapshotName] = useState('')
  const [savingSnapshot, setSavingSnapshot] = useState(false)

  // Canvas resize
  useEffect(() => {
    const update = () => {
      const el = containerRef.current; if (!el) return
      const { width, height } = el.getBoundingClientRect()
      const w = Math.max(width, 400); const h = Math.max(height, 400)
      setDims({ w, h })
      if (canvasRef.current) { canvasRef.current.width = w; canvasRef.current.height = h }
    }
    update(); window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // Load intel data when panel opens
  useEffect(() => {
    if (!showIntel) return
    if (intelTab === 'defectors' && defectors.length === 0)
      fetch('/api/network/defectors').then(r => r.json()).then(d => setDefectors(d.results ?? [])).catch(() => {})
    if (intelTab === 'influence' && influencers.length === 0)
      fetch('/api/network/influence').then(r => r.json()).then(d => setInfluencers(d.results ?? [])).catch(() => {})
    if (intelTab === 'snapshots')
      fetch('/api/network/snapshots').then(r => r.json()).then(d => setSnapshots(d.results ?? [])).catch(() => {})
    if (intelTab === 'employers' && employerClusters.length === 0)
      fetch('/api/network/employer-clusters').then(r => r.json()).then(d => setEmployerClusters(d.results ?? [])).catch(() => {})
  }, [showIntel, intelTab])

  // ── Canvas draw ─────────────────────────────────────────────────────────────

  const draw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    const w = canvas.width; const h = canvas.height
    const { x: tx, y: ty, scale: s } = transformRef.current

    ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#0d0d0d'; ctx.fillRect(0, 0, w, h)
    ctx.save(); ctx.translate(tx + w / 2, ty + h / 2); ctx.scale(s, s)

    // Links
    for (const l of linksRef.current) {
      const a = l.source as GraphNode; const b = l.target as GraphNode
      if (a.x == null || b.x == null) continue
      ctx.beginPath(); ctx.moveTo(a.x, a.y!); ctx.lineTo(b.x, b.y!)
      if (l.linkType === 'family') {
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1 / s
        ctx.setLineDash([4 / s, 4 / s])
      } else if (l.linkType === 'candidate_link') {
        ctx.strokeStyle = '#fde68a'; ctx.lineWidth = 1.5 / s
        ctx.setLineDash([2 / s, 3 / s])
      } else {
        ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 1 / s
        ctx.setLineDash([])
      }
      ctx.stroke(); ctx.setLineDash([])
    }

    // Nodes
    for (const n of nodesRef.current) {
      if (n.x == null) continue
      const r = nodeRadius(n)
      const hovered = hoveredRef.current?.id === n.id
      const isExpanded = n.type === 'committee' && expandedRef.current.has(n.id.slice(2))
      const isShared = (n.sharedCount ?? 0) > 1
      const isDefector = n.isDefector

      // Defector ring (orange)
      if (isDefector) {
        ctx.beginPath(); ctx.arc(n.x, n.y!, r + 5, 0, Math.PI * 2)
        ctx.strokeStyle = '#f97316'; ctx.lineWidth = 2 / s; ctx.globalAlpha = 0.9; ctx.stroke()
        ctx.globalAlpha = 1
      }

      // Shared donor ring (red)
      if (isShared && !isDefector) {
        ctx.beginPath(); ctx.arc(n.x, n.y!, r + 4, 0, Math.PI * 2)
        ctx.strokeStyle = '#C8102E'; ctx.lineWidth = 2.5 / s; ctx.globalAlpha = 0.85; ctx.stroke()
        ctx.globalAlpha = 1
      }

      // Node shape
      ctx.beginPath()
      if (n.type === 'committee') {
        ctx.moveTo(n.x, n.y! - r); ctx.lineTo(n.x + r, n.y!)
        ctx.lineTo(n.x, n.y! + r); ctx.lineTo(n.x - r, n.y!); ctx.closePath()
        ctx.fillStyle = partyColor(n.party)
      } else if (n.type === 'candidate') {
        drawStar(ctx, n.x, n.y!, r)
        ctx.fillStyle = CANDIDATE_COLOR[n.party ?? 'default'] ?? CANDIDATE_COLOR.default
      } else {
        ctx.arc(n.x, n.y!, r, 0, Math.PI * 2)
        ctx.fillStyle = partyColor(n.party)
      }
      ctx.globalAlpha = hovered ? 1 : 0.8; ctx.fill()

      if (isExpanded) {
        ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 2 / s; ctx.globalAlpha = 0.9; ctx.stroke()
      }
      if (hovered) {
        ctx.strokeStyle = '#C8102E'; ctx.lineWidth = 2.5 / s; ctx.globalAlpha = 1; ctx.stroke()
      }
      ctx.globalAlpha = 1

      // Labels
      if (n.type === 'committee' && s >= 0.25) {
        const label = n.name.length > 22 ? n.name.slice(0, 21) + '…' : n.name
        ctx.fillStyle = hovered ? '#C8102E' : '#888'
        ctx.font = `${9 / s}px monospace`; ctx.textAlign = 'center'
        ctx.fillText(label, n.x, n.y! + r + 12 / s)
      } else if (n.type === 'candidate' && s >= 0.3) {
        const label = n.name.length > 20 ? n.name.slice(0, 19) + '…' : n.name
        ctx.fillStyle = '#fde68a'; ctx.font = `${8 / s}px monospace`; ctx.textAlign = 'center'
        ctx.fillText(label, n.x, n.y! + r + 11 / s)
      } else if (n.type === 'donor' && hovered) {
        ctx.fillStyle = '#c8c8c8'; ctx.font = `${11 / s}px monospace`; ctx.textAlign = 'center'
        ctx.fillText(n.name.slice(0, 28), n.x, n.y! + r + 13 / s)
      }
    }
    ctx.restore()
  }, [])

  const runSimulation = useCallback((nodes: GraphNode[], links: GraphLink[]) => {
    simRef.current?.stop()
    nodesRef.current = nodes; linksRef.current = links
    const sim = forceSimulation<GraphNode>(nodes)
      .force('link', forceLink<GraphNode, GraphLink>(links).id((d: GraphNode) => d.id).distance((l: GraphLink) => l.linkType === 'candidate_link' ? 50 : 75))
      .force('charge', forceManyBody<GraphNode>().strength(-140))
      .force('center', forceCenter<GraphNode>(0, 0))
      .force('collision', forceCollide<GraphNode>(15))
    sim.on('tick', draw); simRef.current = sim
  }, [draw])

  const applyFilter = useCallback(() => {
    const threshold = minAmountRef.current
    const onlyShared = sharedOnlyRef.current
    const allNodes = allNodesRef.current
    const allLinks = allLinksRef.current

    const passedDonors = new Set(
      allNodes.filter(n => {
        if (n.type !== 'donor') return false
        if (n.amount < threshold) return false
        if (onlyShared && (n.sharedCount ?? 0) < 2) return false
        return true
      }).map(n => n.id)
    )

    const filteredLinks = allLinks.filter(l => {
      if (l.linkType === 'candidate_link' || l.linkType === 'family') return true
      const sid = typeof l.source === 'string' ? l.source : (l.source as GraphNode).id
      const tid = typeof l.target === 'string' ? l.target : (l.target as GraphNode).id
      return passedDonors.has(sid) || passedDonors.has(tid)
    })
    const connectedIds = new Set<string>()
    for (const l of filteredLinks) {
      connectedIds.add(typeof l.source === 'string' ? l.source : (l.source as GraphNode).id)
      connectedIds.add(typeof l.target === 'string' ? l.target : (l.target as GraphNode).id)
    }
    const filteredNodes = allNodes.filter(n =>
      n.type === 'donor' ? passedDonors.has(n.id) : connectedIds.has(n.id)
    ).filter(n => connectedIds.has(n.id))

    const cTotals = new Map<string, number>()
    for (const l of filteredLinks) {
      if (l.linkType === 'donation' || !l.linkType) {
        const tid = typeof l.target === 'string' ? l.target : (l.target as GraphNode).id
        cTotals.set(tid, (cTotals.get(tid) || 0) + l.amount)
      }
    }
    for (const n of filteredNodes) {
      if (n.type === 'committee') n.amount = cTotals.get(n.id) || 0
    }

    runSimulation(filteredNodes, filteredLinks)
    const shared = filteredNodes.filter(n => n.type === 'donor' && (n.sharedCount ?? 0) > 1).length
    setStats({
      donors: filteredNodes.filter(n => n.type === 'donor').length,
      committees: filteredNodes.filter(n => n.type === 'committee').length,
      links: filteredLinks.filter(l => !l.linkType || l.linkType === 'donation').length,
      shared,
    })
    setCommitteeSidebar(computeCommitteeStats(filteredNodes, filteredLinks))
  }, [runSimulation])

  // Enrich donors with defector status from server data
  const enrichWithDefectors = useCallback((nodeMap: Map<string, GraphNode>) => {
    fetch('/api/network/defectors')
      .then(r => r.json())
      .then(d => {
        for (const def of (d.results ?? []) as Defector[]) {
          const key = `d_${def.contributor_name}|${def.contributor_state}`
          const node = nodeMap.get(key)
          if (node) {
            node.isDefector = true
            node.defectorFrom = def.party_from
            node.defectorTo = def.party_to
          }
        }
        draw()
      })
      .catch(() => {})
  }, [draw])

  // ── Append candidate nodes after expanding a committee ─────────────────────

  const appendCandidates = useCallback(async (committeeNodeId: string) => {
    const committeeId = committeeNodeId.slice(2)
    try {
      const res = await fetch(`/api/network/candidates/${committeeId}`)
      const data = await res.json()
      const nodeMap = new Map(allNodesRef.current.map(n => [n.id, n]))
      let added = 0
      for (const cand of data.results ?? []) {
        const nid = `cand_${cand.candidate_id}`
        if (!nodeMap.has(nid)) {
          const newNode: GraphNode = {
            id: nid, name: cand.name, type: 'candidate',
            party: cand.party ?? null, amount: 0,
            office: cand.office, cycle: cand.cycle, sharedCount: 0,
          }
          nodeMap.set(nid, newNode)
          allNodesRef.current.push(newNode)
          added++
        }
        const alreadyLinked = allLinksRef.current.some(l => {
          const sid = typeof l.source === 'string' ? l.source : (l.source as GraphNode).id
          const tid = typeof l.target === 'string' ? l.target : (l.target as GraphNode).id
          return sid === committeeNodeId && tid === `cand_${cand.candidate_id}`
        })
        if (!alreadyLinked) {
          allLinksRef.current.push({
            source: committeeNodeId, target: nid,
            amount: 0, linkType: 'candidate_link',
          })
        }
      }
      if (added > 0) applyFilter()
    } catch { /* silent */ }
  }, [applyFilter])

  // ── Append family (related committee) nodes ────────────────────────────────

  const appendFamily = useCallback(async (committeeNodeId: string) => {
    const committeeId = committeeNodeId.slice(2)
    try {
      const res = await fetch(`/api/network/family/${committeeId}`)
      const data = await res.json()
      const nodeMap = new Map(allNodesRef.current.map(n => [n.id, n]))
      for (const rel of data.results ?? []) {
        const relId = rel.committee_id === committeeId ? rel.related_id : rel.committee_id
        const relName = rel.committee_id === committeeId ? rel.related_name : undefined
        const nid = `c_${relId}`
        if (!nodeMap.has(nid) && relName) {
          const newNode: GraphNode = {
            id: nid, name: relName, type: 'committee',
            party: rel.party ?? null, amount: 0, sharedCount: 0,
          }
          nodeMap.set(nid, newNode)
          allNodesRef.current.push(newNode)
        }
        const alreadyLinked = allLinksRef.current.some(l => {
          const sid = typeof l.source === 'string' ? l.source : (l.source as GraphNode).id
          const tid = typeof l.target === 'string' ? l.target : (l.target as GraphNode).id
          return (sid === committeeNodeId && tid === nid) || (sid === nid && tid === committeeNodeId)
        })
        if (!alreadyLinked) {
          allLinksRef.current.push({ source: committeeNodeId, target: nid, amount: 0, linkType: 'family' })
        }
      }
      if (data.results?.length > 0) applyFilter()
    } catch { /* silent */ }
  }, [applyFilter])

  // ── Build graph from donors ────────────────────────────────────────────────

  const buildGraph = useCallback(async (donors: any[]) => {
    expandedRef.current.clear()
    const nodeMap = new Map<string, GraphNode>()
    const links: GraphLink[] = []
    const donorCommitteeCount = new Map<string, Set<string>>()

    for (const d of donors.slice(0, 60)) {
      const did = `d_${d.contributor_name}|${d.contributor_state}`
      if (!nodeMap.has(did)) {
        nodeMap.set(did, {
          id: did, name: d.contributor_name, type: 'donor',
          party: d.donor_party ?? d.result_lean, amount: d.total_amount,
          state: d.contributor_state, city: d.contributor_city, sharedCount: 0,
          influenceScore: d.influence_score ?? 0,
        })
        donorCommitteeCount.set(did, new Set())
      }
      for (const c of d.committees ?? []) {
        const cid = `c_${c.committee_id}`
        if (!nodeMap.has(cid)) nodeMap.set(cid, { id: cid, name: c.name, type: 'committee', party: c.party, amount: 0 })
        donorCommitteeCount.get(did)!.add(cid)
        links.push({ source: did, target: cid, amount: d.total_amount, linkType: 'donation' })
      }
    }
    for (const [did, cids] of donorCommitteeCount) {
      const node = nodeMap.get(did); if (node) node.sharedCount = cids.size
    }
    const cTotals = new Map<string, number>()
    for (const l of links) {
      const tid = typeof l.target === 'string' ? l.target : (l.target as GraphNode).id
      cTotals.set(tid, (cTotals.get(tid) || 0) + l.amount)
    }
    for (const n of nodeMap.values()) {
      if (n.type === 'committee') n.amount = cTotals.get(n.id) || 0
    }
    allNodesRef.current = Array.from(nodeMap.values())
    allLinksRef.current = links
    applyFilter()
    enrichWithDefectors(nodeMap)
  }, [applyFilter, enrichWithDefectors])

  // ── Compare mode ───────────────────────────────────────────────────────────

  const buildFromCommittees = useCallback(async () => {
    if (selectedCommittees.length < 1) return
    setLoading(true); setError(null); expandedRef.current.clear()
    try {
      const results = await Promise.all(
        selectedCommittees.map(c =>
          fetch(`/api/committees/${c.committee_id}/mo-donors?per_page=100`)
            .then(r => r.json()).then(d => ({ committee: c, donors: d.results ?? [] }))
        )
      )
      const nodeMap = new Map<string, GraphNode>()
      const links: GraphLink[] = []
      const donorCommitteeSet = new Map<string, Set<string>>()
      for (const { committee } of results) {
        const cid = `c_${committee.committee_id}`
        nodeMap.set(cid, { id: cid, name: committee.name, type: 'committee', party: committee.party, amount: 0 })
      }
      for (const { committee, donors } of results) {
        const cid = `c_${committee.committee_id}`
        for (const donor of donors) {
          const did = `d_${donor.contributor_name}|${donor.contributor_state || 'MO'}`
          if (!nodeMap.has(did)) {
            nodeMap.set(did, {
              id: did, name: donor.contributor_name, type: 'donor',
              party: donor.donor_party ?? null, amount: donor.contribution_receipt_amount || 0,
              state: donor.contributor_state || 'MO', city: donor.contributor_city ?? undefined, sharedCount: 0,
            })
            donorCommitteeSet.set(did, new Set())
          }
          donorCommitteeSet.get(did)!.add(cid)
          links.push({ source: did, target: cid, amount: donor.contribution_receipt_amount || 0, linkType: 'donation' })
        }
      }
      for (const [did, cids] of donorCommitteeSet) {
        const node = nodeMap.get(did); if (node) node.sharedCount = cids.size
      }
      const cTotals2 = new Map<string, number>()
      for (const l of links) {
        const tid = typeof l.target === 'string' ? l.target : (l.target as GraphNode).id
        cTotals2.set(tid, (cTotals2.get(tid) || 0) + l.amount)
      }
      for (const n of nodeMap.values()) {
        if (n.type === 'committee') n.amount = cTotals2.get(n.id) || 0
      }
      allNodesRef.current = Array.from(nodeMap.values())
      allLinksRef.current = links
      applyFilter()
      enrichWithDefectors(nodeMap)
    } catch (err) { setError(String(err)) }
    finally { setLoading(false) }
  }, [selectedCommittees, applyFilter, enrichWithDefectors])

  // ── Expand committee (load its donors + candidates + family) ───────────────

  const expandCommittee = useCallback(async (node: GraphNode) => {
    const committeeId = node.id.slice(2)
    if (expandedRef.current.has(committeeId)) return
    setExpanding(node.name)
    try {
      const res = await fetch(`/api/committees/${committeeId}/mo-donors?per_page=50`)
      if (!res.ok) throw new Error(`API ${res.status}`)
      const data = await res.json()
      const nodeMap = new Map(allNodesRef.current.map(n => [n.id, n]))
      for (const donor of data.results) {
        const did = `d_${donor.contributor_name}|${donor.contributor_state || 'MO'}`
        if (!nodeMap.has(did)) {
          const newNode: GraphNode = {
            id: did, name: donor.contributor_name, type: 'donor',
            party: donor.donor_party ?? null, amount: donor.contribution_receipt_amount || 0,
            state: donor.contributor_state || 'MO', city: donor.contributor_city ?? undefined, sharedCount: 1,
          }
          nodeMap.set(did, newNode); allNodesRef.current.push(newNode)
        }
        const alreadyLinked = allLinksRef.current.some(l => {
          const sid = typeof l.source === 'string' ? l.source : (l.source as GraphNode).id
          const tid = typeof l.target === 'string' ? l.target : (l.target as GraphNode).id
          return sid === did && tid === node.id
        })
        if (!alreadyLinked) allLinksRef.current.push({ source: did, target: node.id, amount: donor.contribution_receipt_amount || 0, linkType: 'donation' })
      }
      expandedRef.current.add(committeeId)
      applyFilter()
      enrichWithDefectors(nodeMap)
      // Load candidates + family in parallel
      await Promise.all([appendCandidates(node.id), appendFamily(node.id)])
    } catch (err) { setError(String(err)) }
    finally { setExpanding(null) }
  }, [applyFilter, enrichWithDefectors, appendCandidates, appendFamily])

  // ── Snapshot save/load ─────────────────────────────────────────────────────

  const saveSnapshot = async () => {
    if (!snapshotName.trim() || !allNodesRef.current.length) return
    setSavingSnapshot(true)
    try {
      const payload = {
        name: snapshotName,
        description: `Mode: ${mode} | Cycle: ${selectedCycle}`,
        data: JSON.stringify({ nodes: allNodesRef.current, links: allLinksRef.current }),
        node_count: allNodesRef.current.length,
        link_count: allLinksRef.current.length,
      }
      await fetch('/api/network/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      setSnapshotName('')
      const res = await fetch('/api/network/snapshots')
      const d = await res.json()
      setSnapshots(d.results ?? [])
    } finally { setSavingSnapshot(false) }
  }

  const loadSnapshot = async (id: number) => {
    try {
      const res = await fetch(`/api/network/snapshots/${id}`)
      const snap = await res.json()
      const { nodes, links } = JSON.parse(snap.data)
      expandedRef.current.clear()
      allNodesRef.current = nodes; allLinksRef.current = links
      applyFilter()
    } catch (e) { setError(String(e)) }
  }

  const deleteSnapshot = async (id: number) => {
    await fetch(`/api/network/snapshots/${id}`, { method: 'DELETE' })
    setSnapshots(prev => prev.filter(s => s.id !== id))
  }

  // ── Employer cluster search ────────────────────────────────────────────────

  const searchEmployerClusters = async () => {
    if (!employerQuery.trim()) return
    const res = await fetch(`/api/network/employer-clusters?employer=${encodeURIComponent(employerQuery)}`)
    const d = await res.json()
    setEmployerClusters(d.results ?? [])
  }

  // ── Committee search for compare mode ─────────────────────────────────────

  const searchCommittees = async () => {
    if (!committeeSearch.trim()) return
    setSearchingCommittees(true)
    try {
      const sp = new URLSearchParams({ q: committeeSearch, per_page: '15' })
      const res = await fetch(`/api/committees/?${sp}`)
      const data = await res.json()
      setCommitteeResults(data.results ?? []); setShowDropdown(true)
    } finally { setSearchingCommittees(false) }
  }
  const addCommittee = (c: CommitteeOption) => {
    if (!selectedCommittees.find(s => s.committee_id === c.committee_id))
      setSelectedCommittees(prev => [...prev, c])
    setCommitteeSearch(''); setCommitteeResults([]); setShowDropdown(false)
  }
  const removeCommittee = (id: string) => setSelectedCommittees(prev => prev.filter(c => c.committee_id !== id))

  // ── Canvas interaction ─────────────────────────────────────────────────────

  const handleMinAmount = (val: string) => {
    setMinAmountInput(val); minAmountRef.current = parseFloat(val) || 0
    if (allNodesRef.current.length > 0) applyFilter()
  }
  const handleSharedOnly = (val: boolean) => {
    setSharedOnly(val); sharedOnlyRef.current = val
    if (allNodesRef.current.length > 0) applyFilter()
  }

  const nodeAt = (cx: number, cy: number) => {
    const { x: tx, y: ty, scale: s } = transformRef.current
    const gx = (cx - dims.w / 2 - tx) / s; const gy = (cy - dims.h / 2 - ty) / s
    // Iterate in reverse so the topmost-drawn (last in array) node wins when nodes overlap
    for (let i = nodesRef.current.length - 1; i >= 0; i--) {
      const n = nodesRef.current[i]
      if (n.x == null) continue
      const r = nodeRadius(n) + Math.max(6, 8 / s)  // scale hit area with zoom
      if ((gx - n.x) ** 2 + (gy - n.y!) ** 2 <= r * r) return n
    }
    return null
  }

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDragging.current = true
    dragStart.current = { x: e.clientX, y: e.clientY, tx: transformRef.current.x, ty: transformRef.current.y }
  }
  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    if (isDragging.current) {
      transformRef.current.x = dragStart.current.tx + (e.clientX - dragStart.current.x)
      transformRef.current.y = dragStart.current.ty + (e.clientY - dragStart.current.y)
      draw()
    } else {
      const node = nodeAt(e.clientX - rect.left, e.clientY - rect.top)
      if (node !== hoveredRef.current) {
        hoveredRef.current = node; canvasRef.current!.style.cursor = node ? 'pointer' : 'default'; draw()
      }
      setTooltip(node ? { node, x: e.clientX, y: e.clientY } : null)
    }
  }
  const onMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const isClick = Math.abs(e.clientX - dragStart.current.x) + Math.abs(e.clientY - dragStart.current.y) < 10
    isDragging.current = false
    if (!isClick) return
    const rect = canvasRef.current!.getBoundingClientRect()
    const node = nodeAt(e.clientX - rect.left, e.clientY - rect.top)
    if (!node) return
    if (node.type === 'donor') {
      const [name, state] = node.id.slice(2).split('|')
      const params = new URLSearchParams({ name })
      if (state) params.set('state', state)
      if (node.city) params.set('city', node.city)
      navigate(`/donors/profile?${params}`)
    } else if (node.type === 'committee') {
      const committeeId = node.id.slice(2)
      if (expandedRef.current.has(committeeId)) {
        // Already expanded — navigate to MEC committee search for this committee
        navigate(`/committees?q=${encodeURIComponent(node.name)}`)
      } else {
        expandCommittee(node)
      }
    } else if (node.type === 'candidate') {
      navigate(`/donors?contributor_name=${encodeURIComponent(node.name)}`)
    }
  }
  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    transformRef.current.scale = Math.max(0.15, Math.min(6, transformRef.current.scale * (e.deltaY > 0 ? 0.9 : 1.1)))
    draw()
  }

  const isExpanded = (node: GraphNode) => node.type === 'committee' && expandedRef.current.has(node.id.slice(2))

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      <TopBarPortal>
      {/* Controls header */}
      <div className="px-4 py-3 border-b border-terminal-border bg-terminal-panel flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="text-terminal-accent text-xs font-bold tracking-widest">DONOR NETWORK GRAPH</div>
          <div className="flex items-center gap-2">
            {/* Cycle selector */}
            <select
              className="input-field text-xs py-0.5 w-20"
              value={selectedCycle}
              onChange={e => setSelectedCycle(Number(e.target.value))}
              title="Election cycle"
            >
              {[2024, 2022, 2020, 2018].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button
              onClick={() => { setShowIntel(v => !v); if (!showIntel) setIntelTab('defectors') }}
              className={`text-xs px-2 py-0.5 border tracking-wider transition-colors ${showIntel ? 'border-terminal-accent text-terminal-accent' : 'border-terminal-border text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent'}`}
            >
              INTEL ▾
            </button>
            <button
              className="md:hidden text-terminal-accent text-xs uppercase tracking-wider flex items-center gap-1 py-1"
              onClick={() => setControlsOpen(v => !v)}
            >
              GRAPH {controlsOpen ? '▲' : '▼'}
            </button>
          </div>
        </div>

        <div className={`md:block ${controlsOpen ? 'block' : 'hidden'}`}>
          {/* Mode tabs */}
          <div className="flex gap-0 mb-3 border border-terminal-border w-fit">
            {(['search', 'compare'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-3 py-1 text-xs uppercase tracking-wider transition-colors ${mode === m ? 'bg-terminal-accent text-terminal-bg font-bold' : 'text-terminal-muted hover:text-terminal-text'}`}>
                {m === 'search' ? 'Employer / ZIP' : 'Compare Committees'}
              </button>
            ))}
          </div>

          {mode === 'search' && (
            <form onSubmit={e => {
              e.preventDefault(); setLoading(true); setError(null)
              const params = new URLSearchParams({
                per_page: '50',
                two_year_transaction_period: String(selectedCycle),
                ...(form.employer && { contributor_employer: form.employer }),
                ...(form.zip && { contributor_zip: form.zip }),
                ...(form.zip && form.radius && { radius_miles: form.radius }),
              })
              fetch(`/api/donors/?${params}`).then(r => r.json()).then(d => buildGraph(d.results)).catch(err => setError(String(err))).finally(() => setLoading(false))
            }} className="flex gap-3 items-end flex-wrap">
              <div className="flex-1 min-w-48">
                <label className="label">Employer</label>
                <input className="input-field" value={form.employer} onChange={e => setForm(f => ({ ...f, employer: e.target.value }))} placeholder="Boeing, hospital, law firm…" />
              </div>
              <div className="w-24">
                <label className="label">ZIP</label>
                <input className="input-field" value={form.zip} onChange={e => setForm(f => ({ ...f, zip: e.target.value }))} placeholder="63101" maxLength={5} />
              </div>
              <div className="w-28">
                <label className="label">Radius</label>
                <select className="input-field" value={form.radius} onChange={e => setForm(f => ({ ...f, radius: e.target.value }))}>
                  <option value="10">10 mi</option><option value="25">25 mi</option><option value="50">50 mi</option>
                </select>
              </div>
              <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'LOADING…' : 'VISUALIZE'}</button>
            </form>
          )}

          {mode === 'compare' && (
            <div className="space-y-2">
              <div className="text-terminal-muted text-xs">Add 2+ committees — shared donors will appear with a red ring ◎ between them</div>
              <div className="flex gap-2 items-end relative">
                <div className="flex-1 max-w-sm">
                  <label className="label">Search Committee / PAC Name</label>
                  <input className="input-field" value={committeeSearch}
                    onChange={e => setCommitteeSearch(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), searchCommittees())}
                    placeholder="ActBlue, Hawley, NRCC…" />
                </div>
                <button onClick={searchCommittees} disabled={searchingCommittees} className="btn-primary">{searchingCommittees ? '…' : 'FIND'}</button>
                {showDropdown && committeeResults.length > 0 && (
                  <div className="absolute top-full left-0 z-50 bg-terminal-panel border border-terminal-border shadow-xl w-[500px] max-h-64 overflow-auto">
                    {committeeResults.map(c => (
                      <button key={c.committee_id} onClick={() => addCommittee(c)}
                        className="w-full text-left px-3 py-2 hover:bg-terminal-bg border-b border-terminal-border flex items-center gap-2 text-xs">
                        <PartyBadge party={c.party as any} />
                        <span className="text-terminal-accent flex-1">{c.name}</span>
                        {c.source === 'MEC' && <span className="text-yellow-400 border border-yellow-400/40 px-1 rounded-sm flex-shrink-0">MO</span>}
                        <span className="text-terminal-muted">{c.state}</span>
                        <span className="text-terminal-muted">{c.committee_id}</span>
                      </button>
                    ))}
                    <button onClick={() => setShowDropdown(false)} className="w-full text-center py-1 text-terminal-muted text-xs hover:text-terminal-text">✕ close</button>
                  </div>
                )}
              </div>
              {selectedCommittees.length > 0 && (
                <div className="flex gap-2 flex-wrap items-center">
                  {selectedCommittees.map(c => (
                    <div key={c.committee_id} className="flex items-center gap-1 border border-terminal-border px-2 py-0.5 text-xs">
                      <PartyBadge party={c.party as any} />
                      <span className="text-terminal-text">{c.name.slice(0, 35)}</span>
                      {c.source === 'MEC' && <span className="text-yellow-400 text-xs">MO</span>}
                      <button onClick={() => removeCommittee(c.committee_id)} className="text-terminal-muted hover:text-red-400 ml-1">✕</button>
                    </div>
                  ))}
                  <button onClick={buildFromCommittees} disabled={loading || selectedCommittees.length < 1} className="btn-primary">
                    {loading ? 'LOADING…' : 'VISUALIZE'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Shared filters */}
          <div className="flex gap-3 items-center mt-3 flex-wrap">
            <div className="w-28">
              <label className="label">Min $</label>
              <input className="input-field" type="number" placeholder="0" value={minAmountInput} onChange={e => handleMinAmount(e.target.value)} />
            </div>
            {stats && stats.shared > 0 && (
              <label className="flex items-center gap-2 cursor-pointer mt-4">
                <input type="checkbox" checked={sharedOnly} onChange={e => handleSharedOnly(e.target.checked)} className="accent-terminal-accent" />
                <span className="text-xs text-terminal-accent tracking-wider">SHARED DONORS ONLY ({stats.shared})</span>
              </label>
            )}
            {(stats || expanding) && (
              <div className="mt-4 text-terminal-muted text-xs flex gap-4 items-center flex-wrap ml-auto">
                {stats && (
                  <span>
                    {stats.donors} donors · {stats.committees} committees · {stats.links} connections
                    {stats.shared > 0 && <span className="text-terminal-accent ml-2">· {stats.shared} shared ◎</span>}
                  </span>
                )}
                {expanding && <span className="text-terminal-accent animate-pulse">↻ Expanding {expanding}…</span>}
                <div className="flex gap-2">
                  {(['DEM','REP','SPLIT'] as const).map(p => (
                    <span key={p}><span style={{ color: PARTY_COLOR[p] }}>●</span> {p}</span>
                  ))}
                  <span><span className="text-yellow-300">★</span> Candidate</span>
                  <span><span className="text-orange-400">◎</span> Defector</span>
                  <span><span className="text-terminal-accent">◎</span> Shared</span>
                </div>
                {/* Snapshot save */}
                {allNodesRef.current.length > 0 && (
                  <div className="flex gap-1 items-center">
                    <input
                      className="input-field text-xs py-0.5 w-28"
                      placeholder="snapshot name…"
                      value={snapshotName}
                      onChange={e => setSnapshotName(e.target.value)}
                    />
                    <button onClick={saveSnapshot} disabled={savingSnapshot || !snapshotName.trim()}
                      className="border border-terminal-border text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent text-xs px-2 py-0.5 disabled:opacity-30">
                      {savingSnapshot ? '…' : '↓ SAVE GRAPH'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          {error && <div className="mt-1 text-red-400 text-xs">{error}</div>}
        </div>
      </div>
      </TopBarPortal>

      {/* Intel panel (slide-down) */}
      {showIntel && (
        <div className="border-b border-terminal-border bg-terminal-panel flex-shrink-0" style={{ maxHeight: 280 }}>
          <div className="flex border-b border-terminal-border">
            {(['defectors', 'influence', 'employers', 'snapshots'] as const).map(t => (
              <button key={t} onClick={() => setIntelTab(t)}
                className={`px-3 py-1.5 text-xs uppercase tracking-wider border-r border-terminal-border transition-colors ${intelTab === t ? 'bg-terminal-accent text-terminal-bg font-bold' : 'text-terminal-muted hover:text-terminal-text'}`}>
                {t === 'defectors' ? '⇄ DEFECTORS' : t === 'influence' ? '★ INFLUENCE' : t === 'employers' ? '🏢 EMPLOYERS' : '📌 SNAPSHOTS'}
              </button>
            ))}
            <button onClick={() => setShowIntel(false)} className="ml-auto px-3 text-terminal-muted hover:text-terminal-text text-xs">✕</button>
          </div>
          <div className="overflow-auto" style={{ maxHeight: 234 }}>

            {/* Defectors */}
            {intelTab === 'defectors' && (
              <div className="p-2">
                <div className="text-terminal-muted text-xs mb-2">Donors who changed party alignment between election cycles (orange ring in graph)</div>
                {defectors.length === 0 ? (
                  <div className="text-terminal-muted text-xs px-2">No defectors tracked yet — run a crawl to populate.</div>
                ) : (
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-terminal-border">
                      <th className="px-2 py-1 text-left text-terminal-muted font-normal">DONOR</th>
                      <th className="px-2 py-1 text-left text-terminal-muted font-normal">ST</th>
                      <th className="px-2 py-1 text-left text-terminal-muted font-normal">FROM → TO</th>
                      <th className="px-2 py-1 text-left text-terminal-muted font-normal">CYCLES</th>
                    </tr></thead>
                    <tbody>
                      {defectors.slice(0, 50).map((d, i) => (
                        <tr key={i} className="border-b border-terminal-border hover:bg-terminal-bg">
                          <td className="px-2 py-1">
                            <button onClick={() => navigate(`/donors/profile?name=${encodeURIComponent(d.contributor_name)}&state=${d.contributor_state}`)}
                              className="text-terminal-accent hover:underline text-left">{d.contributor_name}</button>
                          </td>
                          <td className="px-2 py-1 text-terminal-muted">{d.contributor_state}</td>
                          <td className="px-2 py-1">
                            <span style={{ color: PARTY_COLOR[d.party_from] }}>{d.party_from}</span>
                            <span className="text-terminal-muted mx-1">→</span>
                            <span style={{ color: PARTY_COLOR[d.party_to] }}>{d.party_to}</span>
                          </td>
                          <td className="px-2 py-1 text-terminal-muted">{d.cycle_from}→{d.cycle_to}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Influence */}
            {intelTab === 'influence' && (
              <div className="p-2">
                <div className="text-terminal-muted text-xs mb-2">Donors ranked by network reach — unique committees funded × dollar volume</div>
                {influencers.length === 0 ? (
                  <div className="text-terminal-muted text-xs px-2">No influence data yet — run a crawl to compute scores.</div>
                ) : (
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-terminal-border">
                      <th className="px-2 py-1 text-left text-terminal-muted font-normal">#</th>
                      <th className="px-2 py-1 text-left text-terminal-muted font-normal">DONOR</th>
                      <th className="px-2 py-1 text-left text-terminal-muted font-normal">PARTY</th>
                      <th className="px-2 py-1 text-left text-terminal-muted font-normal">CMTES</th>
                      <th className="px-2 py-1 text-left text-terminal-muted font-normal">SCORE</th>
                      <th className="px-2 py-1 text-left text-terminal-muted font-normal">DEM $</th>
                      <th className="px-2 py-1 text-left text-terminal-muted font-normal">REP $</th>
                    </tr></thead>
                    <tbody>
                      {influencers.slice(0, 30).map((inf, i) => (
                        <tr key={i} className="border-b border-terminal-border hover:bg-terminal-bg">
                          <td className="px-2 py-1 text-terminal-muted">{i + 1}</td>
                          <td className="px-2 py-1">
                            <button onClick={() => navigate(`/donors/profile?name=${encodeURIComponent(inf.contributor_name)}&state=${inf.contributor_state}`)}
                              className="text-terminal-accent hover:underline">{inf.contributor_name}</button>
                          </td>
                          <td className="px-2 py-1"><PartyBadge party={inf.party as any} /></td>
                          <td className="px-2 py-1 text-terminal-text font-bold">{inf.unique_committees}</td>
                          <td className="px-2 py-1 text-terminal-muted">{inf.influence_score?.toFixed(2)}</td>
                          <td className="px-2 py-1 text-blue-400">{inf.dem_total > 0 ? fmt(inf.dem_total) : '—'}</td>
                          <td className="px-2 py-1 text-red-400">{inf.rep_total > 0 ? fmt(inf.rep_total) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Employer clusters */}
            {intelTab === 'employers' && (
              <div className="p-2">
                <div className="flex gap-2 mb-2">
                  <input className="input-field text-xs flex-1" placeholder="Search employer name…"
                    value={employerQuery} onChange={e => setEmployerQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && searchEmployerClusters()} />
                  <button onClick={searchEmployerClusters} className="btn-primary text-xs px-2 py-0.5">FIND</button>
                  {employerQuery && <button onClick={() => { setEmployerQuery(''); fetch('/api/network/employer-clusters').then(r => r.json()).then(d => setEmployerClusters(d.results ?? [])) }} className="text-terminal-muted text-xs hover:text-terminal-text px-1">✕</button>}
                </div>
                {employerClusters.length === 0 ? (
                  <div className="text-terminal-muted text-xs px-2">No employer data yet — run a crawl to build employer→PAC index.</div>
                ) : (
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-terminal-border">
                      <th className="px-2 py-1 text-left text-terminal-muted font-normal">EMPLOYER</th>
                      <th className="px-2 py-1 text-left text-terminal-muted font-normal">COMMITTEE</th>
                      <th className="px-2 py-1 text-left text-terminal-muted font-normal">PARTY</th>
                      <th className="px-2 py-1 text-left text-terminal-muted font-normal">TOTAL</th>
                      <th className="px-2 py-1 text-left text-terminal-muted font-normal">DONORS</th>
                    </tr></thead>
                    <tbody>
                      {employerClusters.slice(0, 40).map((ec, i) => (
                        <tr key={i} className="border-b border-terminal-border hover:bg-terminal-bg">
                          <td className="px-2 py-1 text-terminal-text font-medium max-w-xs truncate">{ec.employer}</td>
                          <td className="px-2 py-1 text-terminal-muted truncate max-w-xs">{ec.committee_name ?? '—'}</td>
                          <td className="px-2 py-1">{ec.party ? <PartyBadge party={ec.party as any} /> : '—'}</td>
                          <td className="px-2 py-1 text-terminal-green font-bold">{ec.total_amount != null ? fmt(ec.total_amount) : ec.total != null ? fmt(ec.total) : '—'}</td>
                          <td className="px-2 py-1 text-terminal-muted">{ec.donor_count ?? ec.donors ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Snapshots */}
            {intelTab === 'snapshots' && (
              <div className="p-2">
                <div className="text-terminal-muted text-xs mb-2">Saved graph states — use "↓ SAVE GRAPH" above to snapshot the current network</div>
                {snapshots.length === 0 ? (
                  <div className="text-terminal-muted text-xs px-2">No snapshots saved yet.</div>
                ) : (
                  <div className="space-y-1">
                    {snapshots.map(s => (
                      <div key={s.id} className="flex items-center gap-2 px-2 py-1.5 border border-terminal-border hover:bg-terminal-bg">
                        <div className="flex-1 min-w-0">
                          <div className="text-terminal-accent text-xs font-bold">{s.name}</div>
                          <div className="text-terminal-muted text-xs">{s.description} · {s.node_count} nodes · {s.created_at.slice(0, 10)}</div>
                        </div>
                        <button onClick={() => loadSnapshot(s.id)}
                          className="text-xs border border-terminal-border px-2 py-0.5 text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent">
                          LOAD
                        </button>
                        <button onClick={() => deleteSnapshot(s.id)}
                          className="text-xs text-terminal-border hover:text-red-400 px-1">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Graph canvas + sidebar */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        <div ref={containerRef} className="flex-1 relative overflow-hidden">
          <canvas ref={canvasRef} className="block w-full h-full"
            onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}
            onMouseLeave={() => { isDragging.current = false; hoveredRef.current = null; setTooltip(null) }}
            onWheel={onWheel}
          />
          {!stats && !loading && (
            <div className="absolute inset-0 flex items-center justify-center text-terminal-muted text-xs pointer-events-none">
              {mode === 'search'
                ? 'Search by employer or ZIP to visualize donor–committee connections'
                : 'Add 2+ committees above and click VISUALIZE to find shared donors'}
            </div>
          )}
          {tooltip && (() => {
            const tipW = 240
            const tipX = tooltip.x + 14 + tipW > window.innerWidth ? tooltip.x - tipW - 6 : tooltip.x + 14
            const tipY = Math.max(6, Math.min(tooltip.y - 10, window.innerHeight - 200))
            return (
            <div className="fixed z-50 bg-terminal-panel border border-terminal-border px-3 py-2 text-xs pointer-events-none shadow-lg" style={{ left: tipX, top: tipY, maxWidth: tipW }}>
              <div className="text-terminal-accent font-bold leading-snug">{tooltip.node.name}</div>
              {tooltip.node.type === 'committee' ? (
                <>
                  <div className="text-terminal-muted mt-0.5">Committee · <span className={tooltip.node.party === 'REP' ? 'text-red-400' : tooltip.node.party === 'DEM' ? 'text-blue-400' : 'text-terminal-muted'}>{tooltip.node.party ?? 'Unknown'}</span></div>
                  {tooltip.node.amount > 0 && <div className="text-terminal-green mt-0.5">{fmt(tooltip.node.amount)} raised</div>}
                  <div className="mt-1 border-t border-terminal-border pt-1">
                    {isExpanded(tooltip.node)
                      ? <span className="text-terminal-green">✓ Expanded · <span className="text-terminal-accent">click to open committee →</span></span>
                      : <span className="text-terminal-accent">Click to expand donors + candidates →</span>}
                  </div>
                </>
              ) : tooltip.node.type === 'candidate' ? (
                <>
                  <div className="text-terminal-muted mt-0.5">★ Candidate · <span className={tooltip.node.party === 'REP' ? 'text-red-400' : tooltip.node.party === 'DEM' ? 'text-blue-400' : 'text-terminal-muted'}>{tooltip.node.party ?? 'Unknown'}</span>{tooltip.node.office ? ` · ${tooltip.node.office}` : ''}</div>
                  {tooltip.node.cycle && <div className="text-terminal-muted">Cycle {tooltip.node.cycle}</div>}
                  <div className="text-terminal-accent mt-1">Click to search donor profiles →</div>
                </>
              ) : (
                <>
                  <div className="text-terminal-muted mt-0.5">
                    Donor · <span className={tooltip.node.party === 'REP' ? 'text-red-400' : tooltip.node.party === 'DEM' ? 'text-blue-400' : 'text-terminal-muted'}>{tooltip.node.party ?? 'Unknown'}</span>
                    {tooltip.node.state ? ` · ${tooltip.node.city ? tooltip.node.city + ', ' : ''}${tooltip.node.state}` : ''}
                  </div>
                  <div className="text-terminal-green font-bold mt-0.5">{fmt(tooltip.node.amount)}</div>
                  {(tooltip.node.sharedCount ?? 0) > 1 && (
                    <div className="text-terminal-accent mt-0.5">◎ Gave to {tooltip.node.sharedCount} committees</div>
                  )}
                  {tooltip.node.isDefector && (
                    <div className="text-orange-400 mt-0.5">⇄ Party switch: {tooltip.node.defectorFrom} → {tooltip.node.defectorTo}</div>
                  )}
                  {(tooltip.node.influenceScore ?? 0) > 0 && (
                    <div className="text-yellow-400 mt-0.5">★ Influence score: {tooltip.node.influenceScore?.toFixed(2)}</div>
                  )}
                  <div className="text-terminal-muted mt-1 border-t border-terminal-border pt-1">Click to open profile →</div>
                </>
              )}
            </div>
            )
          })()}

          {/* VERA */}
          <div className="absolute bottom-4 right-4 z-20 flex flex-col items-end gap-2">
            {veraOpen && (
              <div className="w-72 bg-terminal-panel border border-terminal-border shadow-xl text-xs">
                <div className="flex items-center justify-between px-3 py-2 border-b border-terminal-border">
                  <span className="text-terminal-accent font-bold tracking-wider uppercase">VERA · Network Guide</span>
                  <button onClick={() => setVeraOpen(false)} className="text-terminal-muted hover:text-terminal-text leading-none">✕</button>
                </div>
                <div className="px-3 py-3">
                  <div className="text-terminal-text font-bold mb-1.5">{VERA_TIPS[veraTipIdx].title}</div>
                  <div className="text-terminal-muted leading-relaxed">{VERA_TIPS[veraTipIdx].body}</div>
                </div>
                <div className="flex items-center justify-between px-3 py-2 border-t border-terminal-border">
                  <button onClick={() => setVeraTipIdx(i => (i - 1 + VERA_TIPS.length) % VERA_TIPS.length)}
                    className="text-terminal-muted hover:text-terminal-accent transition-colors px-2 py-1 border border-terminal-border hover:border-terminal-accent">← Prev</button>
                  <span className="text-terminal-muted">{veraTipIdx + 1} / {VERA_TIPS.length}</span>
                  <button onClick={() => setVeraTipIdx(i => (i + 1) % VERA_TIPS.length)}
                    className="text-terminal-muted hover:text-terminal-accent transition-colors px-2 py-1 border border-terminal-border hover:border-terminal-accent">Next →</button>
                </div>
              </div>
            )}
            <button onClick={() => { if (!veraOpen) setVeraTipIdx(Math.floor(Math.random() * VERA_TIPS.length)); setVeraOpen(v => !v) }}
              className="relative flex items-center justify-center" style={{ width: 40, height: 40 }} title="VERA — Network Guide">
              {stats && <span className="absolute inset-0 rounded-full border-2 border-terminal-accent animate-pulse" />}
              <span className="relative z-10 w-10 h-10 rounded-full bg-terminal-panel border border-terminal-border flex items-center justify-center text-lg shadow-lg hover:border-terminal-accent transition-colors">📊</span>
            </button>
          </div>
        </div>

        {/* PAC Rankings Sidebar */}
        {committeeSidebar.length > 0 && (
          <div className="w-56 border-l border-terminal-border bg-terminal-panel flex flex-col flex-shrink-0 overflow-hidden">
            <div className="px-3 py-2 border-b border-terminal-border flex-shrink-0">
              <div className="text-terminal-accent text-xs font-bold tracking-widest">TOP PACS / COMMITTEES</div>
              <div className="text-terminal-muted text-xs mt-0.5">by total received</div>
            </div>
            <div className="flex-1 overflow-auto">
              {committeeSidebar.map((c, i) => (
                <div key={c.id} className="px-3 py-2 border-b border-terminal-border hover:bg-terminal-bg transition-colors">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-terminal-muted text-xs w-4 flex-shrink-0">{i + 1}</span>
                    <PartyBadge party={c.party as any} />
                  </div>
                  <div className="text-terminal-text text-xs leading-snug mb-1 pl-5">{c.name}</div>
                  <div className="flex justify-between pl-5 text-xs">
                    <span className="text-terminal-green font-bold">{fmt(c.total)}</span>
                    <span className="text-terminal-muted">{c.donors} donor{c.donors !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
