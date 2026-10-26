export function graphNodesInOrder(nodes, edges) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const indegree = new Map(nodes.map(node => [node.id, 0]));
  const outgoing = new Map(nodes.map(node => [node.id, []]));
  edges.forEach(([from, to]) => {
    if (!byId.has(from) || !byId.has(to)) return;
    outgoing.get(from).push(to);
    indegree.set(to, indegree.get(to) + 1);
  });
  const queue = nodes.filter(node => indegree.get(node.id) === 0);
  const ordered = [];
  while (queue.length) {
    const current = queue.shift();
    ordered.push(current);
    for (const id of outgoing.get(current.id)) {
      indegree.set(id, indegree.get(id) - 1);
      if (indegree.get(id) === 0) queue.push(byId.get(id));
    }
  }
  nodes.forEach(node => { if (!ordered.includes(node)) ordered.push(node); });
  return ordered;
}

export function findAvailableNodePosition(nodes, edges, { width, height, nodeWidth = 215, nodeHeight = 90, gapX = 62, gapY = 54 }) {
  if (!nodes.length) return { x: 8, y: 14 };
  const terminal = graphNodesInOrder(nodes, edges).at(-1) || nodes.at(-1);
  const terminalPosition = terminal?.position || { x: 50, y: 40 };
  const stepX = (nodeWidth + gapX) / width * 100;
  const stepY = (nodeHeight + gapY) / height * 100;
  const maxX = Math.max(100, ...nodes.map(node => Number(node.position?.x || 0) + nodeWidth / width * 100 + stepX));
  const maxY = Math.max(100, ...nodes.map(node => Number(node.position?.y || 0) + nodeHeight / height * 100 + stepY));
  const candidates = [];
  for (let y = 6; y < maxY + stepY; y += stepY) {
    for (let x = 4; x < maxX + stepX; x += stepX) {
      const overlaps = nodes.filter(node => {
        const other = node.position || { x: 50, y: 40 };
        const dx = Math.abs(x - other.x) * width / 100;
        const dy = Math.abs(y - other.y) * height / 100;
        return dx < nodeWidth + gapX * 0.75 && dy < nodeHeight + gapY * 0.75;
      }).length;
      const distance = Math.hypot((x - terminalPosition.x) * width / 100, (y - terminalPosition.y) * height / 100);
      candidates.push({ position: { x, y }, score: overlaps * 100000 + distance });
    }
  }
  return candidates.sort((left, right) => left.score - right.score)[0]?.position || { x: 8, y: 14 };
}

export function arrangeNodes(nodes, edges, { width, height, nodeWidth = 215, nodeHeight = 90, gapX = 64, gapY = 58 }) {
  const order = graphNodesInOrder(nodes, edges);
  const incoming = new Map(nodes.map(node => [node.id, []]));
  edges.forEach(([from, to]) => { if (incoming.has(to) && incoming.has(from)) incoming.get(to).push(from); });
  const level = new Map();
  for (const node of order) level.set(node.id, incoming.get(node.id).length ? Math.max(...incoming.get(node.id).map(id => level.get(id) || 0)) + 1 : 0);
  const columns = new Map();
  order.forEach(node => {
    const rank = level.get(node.id) || 0;
    if (!columns.has(rank)) columns.set(rank, []);
    columns.get(rank).push(node);
  });
  const startX = 48;
  const startY = 62;
  for (const [rank, column] of columns) column.forEach((node, row) => {
    node.position = { x: (startX + rank * (nodeWidth + gapX)) / width * 100, y: (startY + row * (nodeHeight + gapY)) / height * 100 };
  });
  return nodes;
}
