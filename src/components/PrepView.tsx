/** Renders an interview prep sheet: "## " section heads, "### " questions, "- " bullets. */
export default function PrepView({ text }: { text: string }) {
  const nodes: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flush = (key: string) => {
    if (bullets.length) { nodes.push(<ul key={key} className="list-disc pl-5 space-y-1 mb-3 text-sm">{bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>); bullets = []; }
  };
  text.split('\n').forEach((raw, i) => {
    const l = raw.trim();
    if (!l) return;
    if (l.startsWith('## ')) { flush(`f${i}`); nodes.push(<h3 key={i} className="label mt-6 mb-2 pb-1 border-b border-sky text-sm">{l.slice(3)}</h3>); }
    else if (l.startsWith('### ')) { flush(`f${i}`); nodes.push(<p key={i} className="font-semibold text-navy mt-3 mb-1">{l.slice(4)}</p>); }
    else if (/^[-•*]\s+/.test(l)) bullets.push(l.replace(/^[-•*]\s+/, ''));
    else { flush(`f${i}`); nodes.push(<p key={i} className="text-sm mb-2">{l}</p>); }
  });
  flush('end');
  return <div>{nodes}</div>;
}
