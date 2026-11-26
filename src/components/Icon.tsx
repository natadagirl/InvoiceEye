const paths = {
 person:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-2a8 8 0 0 1 16 0v2',
 logout:'M10 4H4v16h6 M9 12h12m-5-5 5 5-5 5',
 bell:'M4 17h16c-2-2-2-4-2-8a6 6 0 0 0-12 0c0 4 0 6-2 8z M9 20q3 4 6 0',
 send:'M3 3l19 9-19 9 4-9z M7 12h14',plus:'M12 4v16M4 12h16',
 dashboard:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
 invoices:'M5 3h11l3 3v15l-3-2-3 2-3-2-3 2-2-1z M8 8h7 M8 12h8 M8 16h5',
 tracker:'M3 18l6-7 4 3 8-10 M15 4h6v6', insights:'M12 3l2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3z M20 2v4 M18 4h4',
 settings:'M4 6h6m4 0h6M4 12h10m4 0h2M4 18h2m4 0h10 M10 3v6m4 0v6m-8 0v6',
 calendar:'M3 6h18v15H3z M7 3v5m10-5v5M3 11h18', wallet:'M3 6h16v3H4a2 2 0 0 1 0-4l12-2v3 M3 8v12h18V9H4 M21 13h-6v4h6',
 box:'M3 7l9-5 9 5v11l-9 5-9-5z M3 7l9 5 9-5 M12 12v10 M8 5l9 5',
 alert:'M10.5 4.5a1.7 1.7 0 0 1 3 0l8 14a1.7 1.7 0 0 1-1.5 2.5H4a1.7 1.7 0 0 1-1.5-2.5z M12 9v5m0 2v1',
 chevron:'M8 10l4 4 4-4',menu:'M3 6h18M3 12h18M3 18h18', flask:'M9 3h6m-5 0v6L4 19a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2L14 9V3 M7 15h10',
 store:'M4 10v10h16V10 M2 9l3-6h14l3 6q-2 5-5 1-3 4-5 0-3 4-5 0-3 4-5-1z M9 20v-6h5v6',
 tomato:'M12 8C4 2 1 13 6 19q6 5 12-1c5-7 0-14-6-10z M12 9l-4-5 4 2 3-4-1 5 4-1',
 butter:'M3 12l5-6 12 2v8l-5 4-12-2z M3 12l12 2 5-6m-5 6v6',
 chicken:'M8 14c-3-6 3-13 9-10 7 4 1 14-6 13l-4 4q-4 2-4-2-2-3 2-3z',
 doc:'M5 2h9l5 5v15H5z M14 2v6h5 M8 12h8m-8 4h7', search:'M16 16l5 5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
 close:'M5 5l14 14M19 5L5 19', eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',right:'M9 5l7 7-7 7'
}
export type IconName=keyof typeof paths
export function Icon({name,size=20}:{name:IconName;size?:number}){return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>}
