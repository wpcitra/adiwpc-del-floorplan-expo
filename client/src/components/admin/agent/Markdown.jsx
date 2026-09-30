import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

// Small Markdown renderer for the AI agent's answers: headings, lists, code blocks, tables, quotes, bold / italic /
// inline code / links. Builds React elements only (never innerHTML), so text from the model cannot inject markup.

function CodeBlock({ lang, code }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch (e) { /* clipboard blocked */ }
  };
  return (
    <div className="my-2 rounded-xl overflow-hidden border border-slate-800 bg-slate-950">
      <div className="flex items-center justify-between px-3 py-1 bg-slate-900 text-[10px] text-slate-400 font-mono">
        <span>{lang || 'kode'}</span>
        <button type="button" onClick={copy} className="flex items-center gap-1 hover:text-white cursor-pointer" title="Salin kode">
          {copied ? <Check size={11} /> : <Copy size={11} />} {copied ? 'Tersalin' : 'Salin'}
        </button>
      </div>
      <pre className="p-3 text-[11.5px] leading-relaxed text-slate-100 overflow-x-auto whitespace-pre"><code>{code}</code></pre>
    </div>
  );
}

// Inline: `code`, **bold**, *italic*, [text](https://...)
function inline(text, keyBase = 'i') {
  const out = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\[[^\]]+\]\((https?:\/\/[^\s)]+)\))/g;
  let last = 0;
  let m;
  let n = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${keyBase}-${n++}`;
    if (m[1]) out.push(<code key={k} className="px-1 py-0.5 rounded bg-slate-100 text-[0.92em] font-mono text-rose-700 break-words">{m[1].slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={k} className="font-semibold text-slate-900">{inline(m[2].slice(2, -2), k)}</strong>);
    else if (m[3]) out.push(<em key={k}>{m[3].slice(1, -1)}</em>);
    else if (m[4]) out.push(<a key={k} href={m[5]} target="_blank" rel="noopener noreferrer" className="text-indigo-700 underline break-all">{m[4].slice(1, m[4].indexOf(']'))}</a>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const splitRow = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());

export default function Markdown({ text }) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    // fenced code
    const fence = line.match(/^\s*```\s*([\w.+-]*)\s*$/);
    if (fence) {
      const code = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) code.push(lines[i++]);
      i++;
      blocks.push(<CodeBlock key={key++} lang={fence[1]} code={code.join('\n')} />);
      continue;
    }
    // table: header row + separator row
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] || '')) {
      const head = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(splitRow(lines[i++]));
      blocks.push(
        <div key={key++} className="my-2 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-left text-[12px]">
            <thead className="bg-slate-50"><tr>{head.map((h, j) => <th key={j} className="px-2.5 py-1.5 font-semibold text-slate-700 border-b border-slate-200">{inline(h, `h${j}`)}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">{rows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci} className="px-2.5 py-1.5 align-top text-slate-700">{inline(c, `c${ri}-${ci}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const size = ['text-base', 'text-[15px]', 'text-sm', 'text-sm'][heading[1].length - 1];
      blocks.push(<div key={key++} className={`${size} font-bold text-slate-900 mt-3 mb-1`}>{inline(heading[2], `hd${key}`)}</div>);
      i++;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items = [];
      while (i < lines.length && (ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*]\s+/).test(lines[i])) {
        let item = lines[i].replace(ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*]\s+/, '');
        i++;
        // continuation lines (indented)
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*]|\d+[.)])\s+/.test(lines[i])) item += ` ${lines[i++].trim()}`;
        items.push(item);
      }
      const Tag = ordered ? 'ol' : 'ul';
      blocks.push(
        <Tag key={key++} className={`my-1.5 pl-5 space-y-1 ${ordered ? 'list-decimal' : 'list-disc'} marker:text-slate-400`}>
          {items.map((it, j) => <li key={j}>{inline(it, `li${key}-${j}`)}</li>)}
        </Tag>
      );
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      const quote = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ''));
      blocks.push(<blockquote key={key++} className="my-2 border-l-4 border-slate-300 pl-3 text-slate-600">{inline(quote.join(' '), `q${key}`)}</blockquote>);
      continue;
    }
    if (!line.trim()) { i++; continue; }
    const para = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !/^\s*(```|#{1,4}\s|[-*]\s|\d+[.)]\s|>|\|)/.test(lines[i])) para.push(lines[i++]);
    blocks.push(<p key={key++} className="my-1.5 whitespace-pre-wrap break-words">{inline(para.join('\n'), `p${key}`)}</p>);
  }
  return <div className="text-[13px] leading-relaxed text-slate-800">{blocks}</div>;
}
