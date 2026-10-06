import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { StoryProjectCredential } from '../creation/story-preview';
import type { PreviewArtwork } from './PageSpread';

type Region = { x: number; y: number; width: number; height: number };
const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('This image could not be opened.')); image.src = src;
});

/** Blend inward only: pixels outside the selected rectangle are never touched. */
function featherPatch(canvas: HTMLCanvasElement, amount: number) {
  const context = canvas.getContext('2d')!, w = canvas.width, h = canvas.height;
  context.globalCompositeOperation = 'destination-in';
  const edge = Math.max(1, Math.min(w, h) * amount);
  for (const horizontal of [true, false]) {
    const length = horizontal ? w : h;
    const mask = context.createLinearGradient(0, 0, horizontal ? w : 0, horizontal ? 0 : h);
    mask.addColorStop(0, 'transparent'); mask.addColorStop(edge / length, '#000');
    mask.addColorStop(1 - edge / length, '#000'); mask.addColorStop(1, 'transparent');
    context.fillStyle = mask; context.fillRect(0, 0, w, h);
  }
}

/** Local photo-layer correction. Original pixels outside the selection are retained. */
export default function IllustrationEditor({ artwork, project, onAccept, onClose }: {
  artwork: PreviewArtwork; project?: StoryProjectCredential; onAccept: (art: PreviewArtwork) => Promise<void>; onClose: () => void;
}) {
  const localSample = import.meta.env.DEV && !project;
  const aiAvailable = localSample || project?.entitlement === 'PAID';
  const dialog = useRef<HTMLDialogElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [mode, setMode] = useState<'ai' | 'photo'>('ai');
  const [region, setRegion] = useState<Region | null>(null);
  const [instruction, setInstruction] = useState('');
  const [photo, setPhoto] = useState('');
  const [candidate, setCandidate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [scale, setScale] = useState(1);
  const [offsetX, setOffsetX] = useState(50);
  const [offsetY, setOffsetY] = useState(50);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo); }, [photo]);
  function point(event: PointerEvent) {
    const rect = surface.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
  }
  function select(event: PointerEvent) {
    if (busy || !start.current) return;
    const end = point(event), begin = start.current;
    setRegion({ x: Math.min(begin.x, end.x), y: Math.min(begin.y, end.y), width: Math.abs(end.x - begin.x), height: Math.abs(end.y - begin.y) });
    setCandidate('');
  }
  async function preview() {
    if (!region || region.width < .02 || region.height < .02) { setError('Select a larger area first.'); return; }
    if (mode === 'photo' && !photo) { setError('Choose a photo to place in the selected area.'); return; }
    if (mode === 'ai' && !aiAvailable) { setError('AI edits open with a purchased personal book. You can try local photo compositing on this sample.'); return; }
    setBusy(true); setError(''); setCandidate('');
    try {
      const original = await loadImage(artwork.src);
      const source = photo ? await loadImage(photo) : undefined;
      const canvas = document.createElement('canvas'); canvas.width = original.naturalWidth; canvas.height = original.naturalHeight;
      const context = canvas.getContext('2d')!; context.drawImage(original, 0, 0);
      const x = Math.round(region.x * canvas.width), y = Math.round(region.y * canvas.height);
      const w = Math.round(region.width * canvas.width), h = Math.round(region.height * canvas.height);
      if (mode === 'ai') {
        const inputCanvas = document.createElement('canvas');
        // Bound request size while keeping the input aspect ratio.
        const factor = Math.min(1, 1280 / Math.max(original.naturalWidth, original.naturalHeight));
        inputCanvas.width = Math.round(original.naturalWidth * factor); inputCanvas.height = Math.round(original.naturalHeight * factor);
        inputCanvas.getContext('2d')!.drawImage(original, 0, 0, inputCanvas.width, inputCanvas.height);
        const mask = document.createElement('canvas'); mask.width = inputCanvas.width; mask.height = inputCanvas.height;
        const mc = mask.getContext('2d')!; mc.fillStyle = '#000'; mc.fillRect(0, 0, mask.width, mask.height);
        mc.fillStyle = '#fff'; mc.fillRect(region.x * mask.width, region.y * mask.height, region.width * mask.width, region.height * mask.height);
        let reference: string | undefined;
        if (source) {
          const rc = document.createElement('canvas'), ratio = Math.min(1, 1024 / Math.max(source.naturalWidth, source.naturalHeight));
          rc.width = Math.round(source.naturalWidth * ratio); rc.height = Math.round(source.naturalHeight * ratio);
          rc.getContext('2d')!.drawImage(source, 0, 0, rc.width, rc.height); reference = rc.toDataURL('image/jpeg', .85);
        }
        const response = await fetch('/api/edit-illustration', { signal: AbortSignal.timeout(200_000), method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source: inputCanvas.toDataURL('image/jpeg', .9), mask: mask.toDataURL('image/png'), ...(reference ? { reference } : {}), instruction, ...(project ? { projectId: project.projectId, revisionId: project.revisionId, ownerToken: project.ownerToken } : {}), requestId: crypto.randomUUID() }) });
        if (!response.ok) { const result = await response.json(); throw new Error(result.error ?? 'The edit could not be prepared.'); }
        const url = URL.createObjectURL(await response.blob());
        try {
          const generated = await loadImage(url);
          if (Math.abs((generated.naturalWidth / generated.naturalHeight) / (original.naturalWidth / original.naturalHeight) - 1) > .02) throw new Error("The edit changed the image framing. Your original is unchanged; please try again.");
          const patch = document.createElement('canvas'); patch.width = w; patch.height = h;
          patch.getContext('2d')!.drawImage(generated, region.x * generated.naturalWidth, region.y * generated.naturalHeight, region.width * generated.naturalWidth, region.height * generated.naturalHeight, 0, 0, w, h);
          featherPatch(patch, .22);
          context.drawImage(patch, x, y);
          setCandidate(canvas.toDataURL('image/png'));
        } finally { URL.revokeObjectURL(url); }
        return;
      }
      if (!source) throw new Error('Choose a photo first.');
      const patch = document.createElement('canvas'); patch.width = w; patch.height = h;
      const ctx = patch.getContext('2d')!;
      const fit = Math.max(w / source.naturalWidth, h / source.naturalHeight) * scale;
      const dw = source.naturalWidth * fit, dh = source.naturalHeight * fit;
      ctx.drawImage(source, (w - dw) * offsetX / 100, (h - dh) * offsetY / 100, dw, dh);
      featherPatch(patch, .08);
      context.drawImage(patch, x, y);
      setCandidate(canvas.toDataURL('image/png'));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The preview could not be prepared.'); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="flo-illustration-editor" aria-labelledby="illustration-editor-title" onCancel={(e) => { e.preventDefault(); onClose(); }} onKeyDown={(e) => e.stopPropagation()}>
    <header><div><p className="flo-kicker">A little closer to them</p><h2 id="illustration-editor-title">Edit illustration</h2></div><button type="button" onClick={onClose} aria-label="Close illustration editor">×</button></header>
    <p className="flo-edit-intro">Select an area, describe your change or place a photo, then compare versions. Your original stays safe until you choose a version. Edits currently update this device preview, not the printed book.</p>
    <fieldset className="flo-edit-fields" disabled={busy}><div className="flo-edit-grid">
      <div>
        <div className="flo-edit-surface" ref={surface} onPointerDown={(e) => { if (busy) return; start.current = point(e); e.currentTarget.setPointerCapture(e.pointerId); setCandidate(''); }} onPointerMove={select} onPointerUp={(e) => { select(e); start.current = null; }} onPointerCancel={() => { start.current = null; }}>
          <img src={artwork.src} alt="Original illustration. Drag to select an area." draggable={false} />
          {region && <div className="flo-edit-selection" style={{ left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%` }} />}
        </div>
        <button type="button" onClick={() => { setRegion({ x: .25, y: .15, width: .5, height: .45 }); setCandidate(''); }}>Select centre area</button>
        {region && <fieldset className="flo-edit-region"><legend>Adjust selected area</legend>{(['x', 'y', 'width', 'height'] as const).map((key) => <label key={key}>{key}<input aria-label={`Selection ${key}`} type="range" min="0" max={key === 'width' ? 1 - region.x : key === 'height' ? 1 - region.y : key === 'x' ? 1 - region.width : 1 - region.height} step="0.01" value={region[key]} onChange={(e) => { setRegion({ ...region, [key]: Number(e.target.value) }); setCandidate(''); }} /></label>)}</fieldset>}
      </div>
      <div className="flo-edit-controls">
        <div className="flo-reader-tabs" role="group" aria-label="Editing method"><button type="button" aria-pressed={mode === 'ai'} onClick={() => { setMode('ai'); setCandidate(''); }}>Describe a change</button><button type="button" aria-pressed={mode === 'photo'} onClick={() => { setMode('photo'); setCandidate(''); }}>Manual photo overlay</button></div>
        <label>What would you like to change?<textarea maxLength={400} value={instruction} onChange={(e) => { setInstruction(e.target.value); setCandidate(''); }} placeholder="For example: keep the smile and bring the face closer to the photo." /></label>
        <label>{mode === 'ai' ? 'Identity reference photo (optional)' : 'Photo for the selected area'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { const file = e.target.files?.[0]; if (file) { setPhoto(URL.createObjectURL(file)); setCandidate(''); } }} /></label>
        <p className="flo-create-hint">{mode === 'photo' ? 'This manually overlays a photo; it does not redraw the face or follow your description. Crop and position carefully, then inspect the preview before accepting. Photos stay in your browser.' : 'Google Gemini will receive this illustration, the selected area, your description and any reference photo. Only the selected area is copied into the result.'}</p>
        {photo && mode === 'photo' && <><img className="flo-edit-reference" src={photo} alt="Your selected photo" />{[['Zoom', scale, setScale, 1, 8], ['Horizontal position', offsetX, setOffsetX, 0, 100], ['Vertical position', offsetY, setOffsetY, 0, 100]].map(([label, value, setter, min, max]) => <label key={String(label)}>{String(label)}<input type="range" min={Number(min)} max={Number(max)} step="0.05" value={Number(value)} onChange={(e) => { (setter as (n: number) => void)(Number(e.target.value)); setCandidate(''); }} /></label>)}</>}
        <button type="button" className="flo-btn flo-btn-primary" disabled={busy || !region || (mode === 'photo' ? !photo : instruction.trim().length < 3 || !aiAvailable)} onClick={() => void preview()}>{busy ? 'Preparing preview…' : 'Preview before / after'}</button>
        {mode === 'ai' && localSample && <p className="flo-create-hint">Local sample editor · Gemini prepares a preview; your original is kept.</p>}
        {mode === 'ai' && !aiAvailable && <p className="flo-create-hint">AI editing opens with your purchased personal book. Try photo compositing on this catalogue sample.</p>}
        {error && <p role="alert">{error}</p>}
      </div>
    </div>
    </fieldset>
    {candidate && <section aria-label="Before and after comparison" className="flo-edit-comparison"><figure><figcaption>Before</figcaption><img src={artwork.src} alt="Before the edit" /></figure><figure><figcaption>After</figcaption><img src={candidate} alt="After the edit" /></figure></section>}
    <footer><button type="button" onClick={onClose}>Keep original</button><button type="button" className="flo-btn flo-btn-primary" disabled={!candidate || busy} onClick={async () => { setBusy(true); setError(''); try { await onAccept({ ...artwork, src: candidate, generated: true }); } catch { setError('Your edit could not be saved on this device. Please try again.'); } finally { setBusy(false); } }}>Use this version</button></footer>
  </dialog>;
}
