import { useState, useEffect } from 'react'

/* ── Responsive sidebar toggle ─────────────────────────── */
export function useSidebar() {
    const [open, setOpen] = useState(false)
    const toggle = () => setOpen(o => !o)
    const close  = () => setOpen(false)

    useEffect(() => {
        if (open) document.body.style.overflow = 'hidden'
        else      document.body.style.overflow = ''
        return () => { document.body.style.overflow = '' }
    }, [open])

    return { open, toggle, close }
}

/* ── Hamburger button ──────────────────────────────────── */
export function Hamburger({ onClick }) {
    return (
        <button className="sf-hamburger" onClick={onClick} aria-label="Open menu">
            <span /><span /><span />
        </button>
    )
}

/* ── Overlay ───────────────────────────────────────────── */
export function Overlay({ open, onClick }) {
    return <div className={`sf-overlay${open ? ' open' : ''}`} onClick={onClick} />
}