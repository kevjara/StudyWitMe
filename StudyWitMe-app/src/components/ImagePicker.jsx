//this is a componenet that allows you to implement a Pixabay image search

import { useEffect, useState } from "react";

export default function ImagePicker({ open, onClose, onSelect }) {
    const [q,setQ] =useState("space satellite");
    const [page, setPage]= useState(1);
    const [loading,setLoading] =useState(false);
    const [results,setResults] =useState([]);
    const [err,setErr] =useState("");
    async function search(p = 1){
        try {
            setLoading(true); setErr("");
            const r = await fetch(`/pixabay-search?q=${encodeURIComponent(q)}&page=${p}`);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const data = await r.json();
            setResults(data.hits || []);
            setPage(p);
        } catch (e) {
            setErr("Search failed. Try again.");
        } finally { setLoading(false); }
    }
    useEffect(()=>{ if (open) search(1); }, [open]);
    if (!open) return null;
    return (
        <div className="modalOverlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <h3>Find an Image</h3>
                <label>Search
                    <input value={q} onChange={e => setQ(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && search(1)} />
                </label>
                <div className="modalActions">
                    <button onClick={() => search(1)}>Search</button>
                    <button onClick={onClose}>Close</button>
                </div>
                {loading && <p className="status">Searching…</p>}
                {err && <p className="status" style={{ color: "#c0392b" }}>{err}</p>}
                <div style={{
                    marginTop: 10, display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(110px,1fr))",
                    gap: 10, maxHeight: 360, overflowY: "auto"
                }}>
                    {results.map(img => (
                        <button key={img.id} onClick={() => onSelect(img)}
                            style={{ border: "1px solid #ddd", borderRadius: 8, overflow: "hidden", background: "white" }}>
                            <img src={img.previewURL} alt={img.tags} style={{ width: "100%", display: "block" }} />
                            <div style={{ fontSize: 12, padding: "6px 8px", textAlign: "center" }}>Select</div>
                        </button>
                    ))}
                </div>
                <div className="modalActions" style={{ marginTop: 12 }}>
                    <button disabled={page <= 1 || loading} onClick={() => search(page - 1)}>Prev</button>
                    <button disabled={loading} onClick={() => search(page + 1)}>Next</button>
                </div>
            </div>
        </div>
    );
}