export function createCanvasNavigation({ canvas, viewport, onZoomChange = () => {} }) {
  let zoom = 100;
  let panX = 0;
  let panY = 0;
  let drag = null;

  function apply() {
    canvas.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${zoom / 100})`;
    onZoomChange(zoom);
  }

  function setZoom(value, anchor = null) {
    const next = Math.min(200, Math.max(40, Math.round(value / 5) * 5));
    if (anchor) {
      const rect = viewport.getBoundingClientRect();
      const x = anchor.clientX - rect.left;
      const y = anchor.clientY - rect.top;
      const ratio = next / zoom;
      panX = x - (x - panX) * ratio;
      panY = y - (y - panY) * ratio;
    }
    zoom = next;
    apply();
  }

  function fit(nodes = [...canvas.querySelectorAll('.flow-node')]) {
    if (!nodes.length) { panX = 0; panY = 0; setZoom(100); return; }
    const bounds = viewport.getBoundingClientRect();
    const padding = 58;
    const minX = Math.min(...nodes.map(node => node.offsetLeft));
    const minY = Math.min(...nodes.map(node => node.offsetTop));
    const maxX = Math.max(...nodes.map(node => node.offsetLeft + node.offsetWidth));
    const maxY = Math.max(...nodes.map(node => node.offsetTop + node.offsetHeight));
    const contentWidth = Math.max(1, maxX - minX);
    const contentHeight = Math.max(1, maxY - minY);
    zoom = Math.min(200, Math.max(40, Math.floor(Math.min((bounds.width - padding * 2) / contentWidth, (bounds.height - padding * 2) / contentHeight) * 100)));
    panX = (bounds.width - contentWidth * zoom / 100) / 2 - minX * zoom / 100;
    panY = (bounds.height - contentHeight * zoom / 100) / 2 - minY * zoom / 100;
    apply();
  }

  viewport.addEventListener('wheel', event => {
    if (event.ctrlKey || event.metaKey || Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      event.preventDefault();
      setZoom(zoom + (event.deltaY < 0 ? 5 : -5), event);
    } else {
      panX -= event.deltaX;
      apply();
    }
  }, { passive: false });

  viewport.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('.flow-node,.canvas-toolbar,.run-toast,.add-menu,.add-node-tail,.minimap')) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, panX, panY };
    viewport.classList.add('canvas-panning');
    viewport.setPointerCapture(event.pointerId);
  });
  viewport.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    panX = drag.panX + event.clientX - drag.x;
    panY = drag.panY + event.clientY - drag.y;
    apply();
  });
  const endPan = event => {
    if (!drag || event.pointerId !== drag.id) return;
    drag = null;
    viewport.classList.remove('canvas-panning');
  };
  viewport.addEventListener('pointerup', endPan);
  viewport.addEventListener('pointercancel', endPan);

  return { setZoom, fit, getZoom: () => zoom };
}
